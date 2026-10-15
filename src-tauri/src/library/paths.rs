//! Canonical file identity. Windows paths are case-insensitive and may arrive with
//! or without the `\\?\` verbatim prefix, mixed separators or trailing slashes; the
//! path *key* normalises all of that so one file is only ever indexed once.

use std::path::{Path, PathBuf};

/// Strip the verbatim prefix `canonicalize` adds on Windows so paths stay readable
/// and usable by APIs that reject verbatim paths.
pub fn simplify(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{rest}"))
    } else if let Some(rest) = s.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path.to_path_buf()
    }
}

/// Canonical display path; falls back to the given path if it cannot be resolved
/// (e.g. the drive is currently disconnected).
pub fn canonical(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).map(|p| simplify(&p)).unwrap_or_else(|_| simplify(path))
}

pub fn key(path: &Path) -> String {
    let s = simplify(path).to_string_lossy().replace('/', "\\");
    let s = if s.len() > 3 { s.trim_end_matches('\\').to_string() } else { s };
    if cfg!(windows) { s.to_lowercase() } else { s }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_normalise_prefix_separators_and_case() {
        let a = key(Path::new(r"\\?\D:\Music\Album\01.flac"));
        let b = key(Path::new("D:/Music/Album/01.flac"));
        assert_eq!(a, b);
        if cfg!(windows) {
            assert_eq!(key(Path::new(r"d:\MUSIC\album\01.FLAC")), a);
        }
        assert_eq!(key(Path::new(r"D:\Music\")), key(Path::new(r"D:\Music")));
    }

    #[test]
    fn unc_verbatim_paths_are_simplified() {
        assert_eq!(simplify(Path::new(r"\\?\UNC\nas\share\a.mp3")), PathBuf::from(r"\\nas\share\a.mp3"));
    }
}
