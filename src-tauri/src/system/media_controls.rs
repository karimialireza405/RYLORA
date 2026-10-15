//! Windows System Media Transport Controls (SMTC).
//!
//! Connects RYLORA to hardware media keys, the Windows media flyout and the lock
//! screen. Button presses are forwarded to the player thread as ordinary commands;
//! the player pushes state back through [`MediaSession::update`].

use std::path::PathBuf;
use std::time::Duration;

use windows::core::HSTRING;
use windows::Foundation::{TimeSpan, TypedEventHandler, Uri};
use windows::Media::{
    MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls, SystemMediaTransportControlsButton,
    SystemMediaTransportControlsButtonPressedEventArgs, SystemMediaTransportControlsTimelineProperties,
};
use windows::Storage::Streams::RandomAccessStreamReference;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;

use crate::application::player::{MediaSession, PlayerCommand, PlayerHandle, PlayerSnapshot};
use crate::domain::models::PlaybackStatus;

pub struct WindowsMediaControls {
    smtc: SystemMediaTransportControls,
    token: i64,
    shown_track: Option<i64>,
}

/// WinRT `TimeSpan` is in 100 ns ticks.
fn ticks(d: Duration) -> TimeSpan {
    TimeSpan { Duration: (d.as_nanos() / 100) as i64 }
}

impl WindowsMediaControls {
    /// `hwnd` is the main window handle as an integer (independent of the windows-crate
    /// version Tauri uses internally).
    pub fn new(hwnd: isize, player: PlayerHandle) -> windows::core::Result<Self> {
        let interop = windows::core::factory::<SystemMediaTransportControls, ISystemMediaTransportControlsInterop>()?;
        // SAFETY: `GetForWindow` is the documented COM interop entry point for desktop
        // apps; `hwnd` is the live top-level window owned by this process.
        let smtc: SystemMediaTransportControls = unsafe { interop.GetForWindow(HWND(hwnd as *mut core::ffi::c_void)) }?;
        smtc.SetIsEnabled(true)?;
        smtc.SetIsPlayEnabled(true)?;
        smtc.SetIsPauseEnabled(true)?;
        smtc.SetIsNextEnabled(true)?;
        smtc.SetIsPreviousEnabled(true)?;
        smtc.SetIsStopEnabled(true)?;
        smtc.SetPlaybackStatus(MediaPlaybackStatus::Closed)?;

        let handler = TypedEventHandler::<SystemMediaTransportControls, SystemMediaTransportControlsButtonPressedEventArgs>::new(
            move |_, args| {
                let Some(args) = args.as_ref() else { return Ok(()) };
                let command = match args.Button()? {
                    SystemMediaTransportControlsButton::Play => PlayerCommand::Play,
                    SystemMediaTransportControlsButton::Pause | SystemMediaTransportControlsButton::Stop => PlayerCommand::Pause,
                    SystemMediaTransportControlsButton::Next => PlayerCommand::Next,
                    SystemMediaTransportControlsButton::Previous => PlayerCommand::Previous,
                    _ => return Ok(()),
                };
                player.send(command);
                Ok(())
            },
        );
        let token = smtc.ButtonPressed(&handler)?;
        Ok(Self { smtc, token, shown_track: None })
    }

    fn apply(&mut self, s: &PlayerSnapshot, artwork: Option<PathBuf>) -> windows::core::Result<()> {
        let status = match (s.current.is_some(), s.status) {
            (false, _) => MediaPlaybackStatus::Closed,
            (true, PlaybackStatus::Playing) => MediaPlaybackStatus::Playing,
            (true, PlaybackStatus::Loading) => MediaPlaybackStatus::Changing,
            (true, _) => MediaPlaybackStatus::Paused,
        };
        self.smtc.SetPlaybackStatus(status)?;

        let Some(track) = &s.current else {
            if self.shown_track.take().is_some() {
                self.smtc.DisplayUpdater()?.ClearAll()?;
            }
            return Ok(());
        };

        // Metadata and artwork only change with the track.
        if self.shown_track != Some(track.id) {
            let updater = self.smtc.DisplayUpdater()?;
            updater.SetType(MediaPlaybackType::Music)?;
            let props = updater.MusicProperties()?;
            props.SetTitle(&HSTRING::from(track.title.as_str()))?;
            props.SetArtist(&HSTRING::from(track.artist.as_str()))?;
            props.SetAlbumTitle(&HSTRING::from(track.album.as_str()))?;
            props.SetAlbumArtist(&HSTRING::from(track.album_artist.as_str()))?;
            if let Some(n) = track.track_number {
                props.SetTrackNumber(n)?;
            }
            match artwork.filter(|p| p.exists()) {
                Some(path) => {
                    let uri = Uri::CreateUri(&HSTRING::from(format!("file:///{}", path.to_string_lossy().replace('\\', "/"))))?;
                    updater.SetThumbnail(&RandomAccessStreamReference::CreateFromUri(&uri)?)?;
                }
                None => updater.SetThumbnail(None)?,
            }
            updater.Update()?;
            self.shown_track = Some(track.id);
        }

        let timeline = SystemMediaTransportControlsTimelineProperties::new()?;
        let end = Duration::from_millis(s.duration_ms);
        timeline.SetStartTime(ticks(Duration::ZERO))?;
        timeline.SetMinSeekTime(ticks(Duration::ZERO))?;
        timeline.SetEndTime(ticks(end))?;
        timeline.SetMaxSeekTime(ticks(end))?;
        timeline.SetPosition(ticks(Duration::from_millis(s.position_ms.min(s.duration_ms))))?;
        self.smtc.UpdateTimelineProperties(&timeline)?;
        Ok(())
    }
}

impl MediaSession for WindowsMediaControls {
    fn update(&mut self, snapshot: &PlayerSnapshot, artwork: Option<PathBuf>) {
        if let Err(e) = self.apply(snapshot, artwork) {
            log::warn!("media controls update failed: {e}");
        }
    }
}

impl Drop for WindowsMediaControls {
    fn drop(&mut self) {
        let _ = self.smtc.RemoveButtonPressed(self.token);
        let _ = self.smtc.SetIsEnabled(false);
    }
}
