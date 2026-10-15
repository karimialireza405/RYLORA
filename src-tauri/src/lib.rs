//! RYLORA backend entry point: wires infrastructure, services and IPC together.

mod application;
mod audio;
mod commands;
mod database;
mod domain;
mod error;
mod events;
mod library;
mod metadata;
mod system;

use tauri::Manager;

use application::library::LibraryService;
use commands::AppState;
use database::Db;

/// Hook the OS media session (media keys, flyout) up to the player. Failure is
/// non-fatal: playback works without it.
fn attach_media_controls(app: &tauri::App, player: &application::player::PlayerHandle) {
    #[cfg(windows)]
    {
        use application::player::{MediaSessionBox, PlayerCommand};
        let Some(window) = app.get_webview_window("main") else { return };
        match window.hwnd() {
            Ok(hwnd) => match system::media_controls::WindowsMediaControls::new(hwnd.0 as isize, player.clone()) {
                Ok(controls) => player.send(PlayerCommand::AttachMediaSession(MediaSessionBox(Box::new(controls)))),
                Err(e) => log::warn!("media controls unavailable: {e}"),
            },
            Err(e) => log::warn!("no window handle for media controls: {e}"),
        }
    }
    #[cfg(not(windows))]
    let _ = (app, player);
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) { log::LevelFilter::Debug } else { log::LevelFilter::Info })
                .level_for("symphonia_core", log::LevelFilter::Warn)
                .level_for("symphonia_bundle_mp3", log::LevelFilter::Warn)
                .level_for("lofty", log::LevelFilter::Warn)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .register_asynchronous_uri_scheme_protocol("artwork", |ctx, request, responder| {
            let dir = ctx.app_handle().state::<AppState>().library.artwork_dir().clone();
            std::thread::spawn(move || responder.respond(system::artwork_protocol::respond(&dir, &request)));
        })
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let artwork_dir = data_dir.join("artwork");
            std::fs::create_dir_all(&artwork_dir)?;
            log::info!("data directory: {}", data_dir.display());

            let db = Db::open(&data_dir.join("rylora.db"))?;
            let player = application::player::spawn(app.handle().clone(), db.clone(), artwork_dir.clone());
            attach_media_controls(app, &player);
            let library = LibraryService::new(app.handle().clone(), db.clone(), player.clone(), artwork_dir);
            let state = AppState { db, player, library };
            if commands::settings::scan_on_startup(&state) {
                state.library.scan();
            }
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::player::player_state,
            commands::player::player_play_tracks,
            commands::player::player_toggle,
            commands::player::player_play,
            commands::player::player_pause,
            commands::player::player_next,
            commands::player::player_previous,
            commands::player::player_seek,
            commands::player::player_set_volume,
            commands::player::player_set_muted,
            commands::player::player_set_shuffle,
            commands::player::player_set_repeat,
            commands::player::player_play_next,
            commands::player::player_enqueue,
            commands::player::player_remove_from_queue,
            commands::player::player_move_in_queue,
            commands::player::player_jump_to,
            commands::player::player_clear_queue,
            commands::player::player_set_visualizer,
            commands::library::library_snapshot,
            commands::library::library_folders,
            commands::library::library_add_folder,
            commands::library::library_remove_folder,
            commands::library::library_rescan,
            commands::library::library_cancel_scan,
            commands::library::library_import_files,
            commands::library::library_set_favorite,
            commands::library::library_recent_plays,
            commands::metadata::library_edit_track,
            commands::library::track_lyrics,
            commands::playlists::playlists_list,
            commands::playlists::playlist_create,
            commands::playlists::playlist_rename,
            commands::playlists::playlist_delete,
            commands::playlists::playlist_entries,
            commands::playlists::playlist_add,
            commands::playlists::playlist_remove,
            commands::playlists::playlist_move,
            commands::settings::settings_get,
            commands::settings::settings_set,
        ])
        .build(tauri::generate_context!())
        .expect("error while building RYLORA")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<AppState>() {
                    state.library.cancel_scan();
                    state.player.shutdown();
                }
            }
        });
}
