use tauri::State;

use super::{validate_ids, AppState};
use crate::application::player::{AudioSettings, CrossfadeSettings, PlayerCommand, PlayerSnapshot};
use crate::audio::eq::EqSettings;
use crate::audio::loudness::LevelingSettings;
use crate::domain::models::{RepeatMode, TrackId};
use crate::error::{AppError, AppResult};

#[tauri::command]
pub fn player_state(state: State<'_, AppState>) -> AppResult<PlayerSnapshot> {
    state.player.snapshot().ok_or_else(|| AppError::Unavailable("The player is not responding.".into()))
}

#[tauri::command]
pub fn player_play_tracks(state: State<'_, AppState>, track_ids: Vec<TrackId>, start: usize) -> AppResult<()> {
    validate_ids(&track_ids)?;
    state.player.send(PlayerCommand::PlayTracks { ids: track_ids, start });
    Ok(())
}

#[tauri::command]
pub fn player_toggle(state: State<'_, AppState>) {
    state.player.send(PlayerCommand::TogglePlay);
}

#[tauri::command]
pub fn player_play(state: State<'_, AppState>) {
    state.player.send(PlayerCommand::Play);
}

#[tauri::command]
pub fn player_pause(state: State<'_, AppState>) {
    state.player.send(PlayerCommand::Pause);
}

#[tauri::command]
pub fn player_next(state: State<'_, AppState>) {
    state.player.send(PlayerCommand::Next);
}

#[tauri::command]
pub fn player_previous(state: State<'_, AppState>) {
    state.player.send(PlayerCommand::Previous);
}

#[tauri::command]
pub fn player_seek(state: State<'_, AppState>, position_ms: u64) {
    state.player.send(PlayerCommand::Seek(position_ms));
}

#[tauri::command]
pub fn player_set_volume(state: State<'_, AppState>, volume: f32) -> AppResult<()> {
    if !volume.is_finite() {
        return Err(AppError::Invalid("Volume must be a number.".into()));
    }
    state.player.send(PlayerCommand::SetVolume(volume.clamp(0.0, 1.0)));
    Ok(())
}

#[tauri::command]
pub fn player_set_muted(state: State<'_, AppState>, muted: bool) {
    state.player.send(PlayerCommand::SetMuted(muted));
}

#[tauri::command]
pub fn player_set_shuffle(state: State<'_, AppState>, shuffle: bool) {
    state.player.send(PlayerCommand::SetShuffle(shuffle));
}

#[tauri::command]
pub fn player_set_repeat(state: State<'_, AppState>, repeat: RepeatMode) {
    state.player.send(PlayerCommand::SetRepeat(repeat));
}

#[tauri::command]
pub fn player_play_next(state: State<'_, AppState>, track_ids: Vec<TrackId>) -> AppResult<()> {
    validate_ids(&track_ids)?;
    state.player.send(PlayerCommand::PlayNext(track_ids));
    Ok(())
}

#[tauri::command]
pub fn player_enqueue(state: State<'_, AppState>, track_ids: Vec<TrackId>) -> AppResult<()> {
    validate_ids(&track_ids)?;
    state.player.send(PlayerCommand::Enqueue(track_ids));
    Ok(())
}

#[tauri::command]
pub fn player_remove_from_queue(state: State<'_, AppState>, uid: u64) {
    state.player.send(PlayerCommand::RemoveFromQueue(uid));
}

#[tauri::command]
pub fn player_move_in_queue(state: State<'_, AppState>, uid: u64, to: usize) {
    state.player.send(PlayerCommand::MoveInQueue { uid, to });
}

#[tauri::command]
pub fn player_jump_to(state: State<'_, AppState>, uid: u64) {
    state.player.send(PlayerCommand::JumpTo(uid));
}

#[tauri::command]
pub fn player_clear_queue(state: State<'_, AppState>) {
    state.player.send(PlayerCommand::ClearQueue);
}

#[tauri::command]
pub fn player_set_visualizer(state: State<'_, AppState>, enabled: bool) {
    state.player.send(PlayerCommand::SetVisualizer(enabled));
}

#[tauri::command]
pub fn audio_settings(state: State<'_, AppState>) -> AppResult<AudioSettings> {
    state.player.audio_settings().ok_or_else(|| AppError::Unavailable("The player is not responding.".into()))
}

#[tauri::command]
pub fn audio_set_equalizer(state: State<'_, AppState>, settings: EqSettings) -> AppResult<()> {
    if !settings.preamp_db.is_finite() || settings.gains_db.iter().any(|g| !g.is_finite()) {
        return Err(AppError::Invalid("Equalizer values must be numbers.".into()));
    }
    state.player.send(PlayerCommand::SetEqualizer(settings.sanitized()));
    Ok(())
}

#[tauri::command]
pub fn audio_set_output_device(state: State<'_, AppState>, id: Option<String>) -> AppResult<()> {
    if id.as_ref().is_some_and(|id| id.is_empty() || id.len() > 1024) {
        return Err(AppError::Invalid("Invalid output device.".into()));
    }
    state.player.send(PlayerCommand::SetOutputDevice(id));
    Ok(())
}

#[tauri::command]
pub fn audio_set_leveling(state: State<'_, AppState>, settings: LevelingSettings) -> AppResult<()> {
    state.player.send(PlayerCommand::SetLeveling(settings));
    Ok(())
}

#[tauri::command]
pub fn audio_set_crossfade(state: State<'_, AppState>, settings: CrossfadeSettings) -> AppResult<()> {
    if !settings.seconds.is_finite() {
        return Err(AppError::Invalid("Crossfade length must be a number.".into()));
    }
    state.player.send(PlayerCommand::SetCrossfade(settings.sanitized()));
    Ok(())
}
