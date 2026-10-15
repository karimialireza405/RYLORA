//! `artwork://` URI scheme serving cached cover images.
//!
//! Only `/<32 hex chars>/<sm|lg>` is accepted, so the frontend can read cached
//! artwork without any general filesystem access. On Windows the WebView reaches it
//! at `http://artwork.localhost/<hash>/<size>`.

use std::path::Path;

use tauri::http::{header, Request, Response, StatusCode};

use crate::metadata::artwork::{artwork_path, ArtworkSize};

fn not_found() -> Response<Vec<u8>> {
    Response::builder().status(StatusCode::NOT_FOUND).body(Vec::new()).expect("static response")
}

pub fn respond(artwork_dir: &Path, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let mut parts = request.uri().path().trim_start_matches('/').split('/');
    let (Some(hash), Some(size), None) = (parts.next(), parts.next(), parts.next()) else {
        return not_found();
    };
    if hash.len() != 32 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return not_found();
    }
    let Some(size) = ArtworkSize::parse(size) else { return not_found() };
    match std::fs::read(artwork_path(artwork_dir, hash, size)) {
        Ok(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "image/jpeg")
            // Content-addressed: the bytes for a hash never change.
            .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(bytes)
            .unwrap_or_else(|_| not_found()),
        Err(_) => not_found(),
    }
}
