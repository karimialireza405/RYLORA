//! Local library discovery and indexing.

pub mod paths;
pub mod scanner;
pub mod watcher;

/// Extensions RYLORA indexes. Each one is decoded by the bundled symphonia build and
/// has been exercised with real files (see docs/development/setup.md).
pub const SUPPORTED_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "ogg", "oga", "m4a"];

pub fn is_supported(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| SUPPORTED_EXTENSIONS.iter().any(|s| s.eq_ignore_ascii_case(e)))
}
