//! Embedded cover art: content-addressed caching, resizing and accent extraction.
//!
//! Covers are stored as `<hash>-lg.jpg` (640px) and `<hash>-sm.jpg` (192px) so the
//! UI never decodes full-resolution artwork for thumbnails.

use std::io::Cursor;
use std::path::{Path, PathBuf};

use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView};

pub const LARGE: u32 = 640;
pub const SMALL: u32 = 192;

pub struct ProcessedArtwork {
    pub hash: String,
    pub accent: Option<String>,
}

pub fn hash_bytes(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex()[..32].to_string()
}

pub fn artwork_path(dir: &Path, hash: &str, size: ArtworkSize) -> PathBuf {
    dir.join(format!("{hash}-{}.jpg", size.suffix()))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtworkSize {
    Small,
    Large,
}

impl ArtworkSize {
    pub fn suffix(self) -> &'static str {
        match self {
            ArtworkSize::Small => "sm",
            ArtworkSize::Large => "lg",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "sm" => Some(Self::Small),
            "lg" => Some(Self::Large),
            _ => None,
        }
    }
}

/// Decode, resize, cache to disk and compute the accent colour.
pub fn process(bytes: &[u8], hash: &str, dir: &Path) -> Result<ProcessedArtwork, String> {
    let img = image::load_from_memory(bytes).map_err(|e| e.to_string())?;
    let (w, h) = img.dimensions();
    if w < 16 || h < 16 {
        return Err("artwork too small".into());
    }
    write_jpeg(&img.resize(LARGE, LARGE, FilterType::Lanczos3), &artwork_path(dir, hash, ArtworkSize::Large))?;
    let small = img.resize(SMALL, SMALL, FilterType::Triangle);
    write_jpeg(&small, &artwork_path(dir, hash, ArtworkSize::Small))?;
    let accent = accent_color(&small).map(|[r, g, b]| format!("#{r:02x}{g:02x}{b:02x}"));
    Ok(ProcessedArtwork { hash: hash.to_string(), accent })
}

fn write_jpeg(img: &DynamicImage, path: &Path) -> Result<(), String> {
    let mut buf = Vec::new();
    let rgb = img.to_rgb8();
    JpegEncoder::new_with_quality(Cursor::new(&mut buf), 88)
        .encode_image(&rgb)
        .map_err(|e| e.to_string())?;
    // Write via a temp file so an interrupted scan never leaves a truncated image.
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, &buf).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn rgb_to_hsl(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    if (max - min).abs() < f32::EPSILON {
        return (0.0, 0.0, l);
    }
    let d = max - min;
    let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };
    let h = if max == r {
        ((g - b) / d).rem_euclid(6.0)
    } else if max == g {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    } * 60.0;
    (h, s, l)
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> [u8; 3] {
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h / 60.0).rem_euclid(2.0) - 1.0).abs());
    let m = l - c / 2.0;
    let (r, g, b) = match (h / 60.0) as u32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    [((r + m) * 255.0).round() as u8, ((g + m) * 255.0).round() as u8, ((b + m) * 255.0).round() as u8]
}

/// Pick a characteristic, reasonably vivid colour from the artwork and normalise its
/// lightness/saturation so it reads well as an accent on RYLORA's near-black surfaces.
/// Hue is bucketed into 24 bins weighted by saturation, so a small vivid region can
/// win over a large grey one without a single noisy pixel dominating.
pub fn accent_color(img: &DynamicImage) -> Option<[u8; 3]> {
    const BINS: usize = 24;
    let mut weight = [0f32; BINS];
    let mut sums = [(0f32, 0f32, 0f32); BINS];
    let mut grey_weight = 0f32;
    for (_, _, px) in img.pixels() {
        let [r, g, b, _] = px.0;
        let (h, s, l) = rgb_to_hsl(r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0);
        if !(0.12..=0.9).contains(&l) {
            continue;
        }
        if s < 0.18 {
            grey_weight += 1.0;
            continue;
        }
        let bin = ((h / 360.0) * BINS as f32) as usize % BINS;
        let w = s * (1.0 - (l - 0.5).abs());
        weight[bin] += w;
        sums[bin].0 += h * w;
        sums[bin].1 += s * w;
        sums[bin].2 += l * w;
    }
    let (best, &best_w) = weight.iter().enumerate().max_by(|a, b| a.1.total_cmp(b.1))?;
    if best_w < 1.0 {
        // Essentially monochrome artwork: fall back to a quiet cool grey-blue.
        return if grey_weight > 0.0 { Some(hsl_to_rgb(225.0, 0.14, 0.62)) } else { None };
    }
    let (hs, ss, _) = sums[best];
    let hue = hs / best_w;
    let sat = (ss / best_w).clamp(0.45, 0.85);
    Some(readable_on_obsidian(hue, sat))
}

/// WCAG relative luminance.
fn luminance([r, g, b]: [u8; 3]) -> f32 {
    let lin = |c: u8| {
        let c = c as f32 / 255.0;
        if c <= 0.03928 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) }
    };
    0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/// Lighten (from 0.62) until the colour reaches 4.5:1 against the app background
/// `#080A0F`. Blues and violets need noticeably more lightness than yellows.
fn readable_on_obsidian(hue: f32, sat: f32) -> [u8; 3] {
    let bg = luminance([0x08, 0x0a, 0x0f]);
    let mut l = 0.62;
    loop {
        let c = hsl_to_rgb(hue, sat, l);
        if (luminance(c) + 0.05) / (bg + 0.05) >= 4.6 || l >= 0.9 {
            return c;
        }
        l += 0.02;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};

    #[test]
    fn picks_dominant_vivid_hue() {
        let mut img = RgbImage::from_pixel(32, 32, Rgb([40, 40, 44]));
        for x in 0..32 {
            for y in 0..12 {
                img.put_pixel(x, y, Rgb([220, 60, 40]));
            }
        }
        let [r, g, b] = accent_color(&DynamicImage::ImageRgb8(img)).unwrap();
        assert!(r > g && r > b, "expected a red accent, got {r},{g},{b}");
    }

    #[test]
    fn accents_are_readable_on_obsidian_for_all_hues() {
        let bg = luminance([0x08, 0x0a, 0x0f]);
        for hue in (0..360).step_by(15) {
            let c = readable_on_obsidian(hue as f32, 0.85);
            let ratio = (luminance(c) + 0.05) / (bg + 0.05);
            assert!(ratio >= 4.5, "hue {hue} contrast {ratio:.2}");
        }
    }

    #[test]
    fn monochrome_falls_back_to_neutral() {
        let img = RgbImage::from_pixel(16, 16, Rgb([128, 128, 128]));
        let c = accent_color(&DynamicImage::ImageRgb8(img)).unwrap();
        assert_eq!(c, hsl_to_rgb(225.0, 0.14, 0.62));
    }
}
