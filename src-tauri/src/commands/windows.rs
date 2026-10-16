//! The mini player: a small always-on-top window that stands in for the main one.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_window_state::{StateFlags, WindowExt};

use crate::error::{AppError, AppResult};

pub const MINI_LABEL: &str = "mini";
const MAIN_LABEL: &str = "main";

fn show_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/// Open (or bring back) the mini player and hide the main window.
///
/// Async on purpose: creating a window from a synchronous command deadlocks on Windows
/// (the command runs on the main thread the window creation needs).
#[tauri::command]
pub async fn window_open_mini(app: AppHandle) -> AppResult<()> {
    let mini = match app.get_webview_window(MINI_LABEL) {
        Some(window) => window,
        None => {
            let window = WebviewWindowBuilder::new(&app, MINI_LABEL, WebviewUrl::App("index.html?window=mini".into()))
                .title("RYLORA")
                .inner_size(400.0, 116.0)
                .resizable(false)
                .maximizable(false)
                .decorations(false)
                .shadow(true)
                .always_on_top(true)
                .visible(false)
                .build()
                .map_err(|e| AppError::Unavailable(format!("Couldn't open the mini player: {e}")))?;
            // Reopen where it was last placed; the size is fixed.
            let _ = window.restore_state(StateFlags::POSITION);
            window
        }
    };
    let _ = mini.show();
    let _ = mini.set_focus();
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        let _ = main.hide();
    }
    Ok(())
}

/// Close the mini player and return to the main window.
#[tauri::command]
pub async fn window_close_mini(app: AppHandle) -> AppResult<()> {
    show_main(&app);
    if let Some(mini) = app.get_webview_window(MINI_LABEL) {
        let _ = mini.close();
    }
    Ok(())
}

/// However the mini player goes away (its button, Alt+F4, the taskbar), the main
/// window comes back, so RYLORA is never left running with no window.
pub fn on_mini_closed(app: &AppHandle) {
    show_main(app);
}
