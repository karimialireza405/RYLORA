//! Library-side cleanup of tags written by Persian download sites. Promotional
//! domains, Telegram handles and site names are removed, Windows-1256 mojibake is
//! decoded and Arabic Yeh/Kaf are normalised in Persian text. Audio files are
//! never modified; turning the preference off re-indexes the original values.

/// Bump when the rules change so existing libraries are re-indexed once.
pub const VERSION: u32 = 1;

/// Site names that appear in tags as advertising, compared after [`normalize_key`].
const PROMOTIONAL_NAMES: &[&str] = &[
    "irnm",
    "musicdel",
    "musicfa",
    "upmusic",
    "upmusics",
    "nex1music",
    "ahangify",
    "mihanmusic",
    "mybia4music",
    "bia4music",
    "ganja2music",
    "melovaz",
    "tak3da",
    "taktaraneh",
    "delnava",
    "musicema",
    "rozmusic",
    "nicmusic",
    "موزیکدل",
    "موزیکفا",
    "آپموزیک",
    "نکسوانموزیک",
    "آهنگیفای",
    "میهنموزیک",
    "بیاتوموزیک",
    "ملوواز",
    "تکترانه",
    "دلنوا",
    "موزیکما",
    "رزموزیک",
    "نیکموزیک",
];

/// Endings that make a bare "name.tld" token a website. Rarer endings ("love.me") only count
/// with an explicit `www.` or scheme so ordinary titles survive.
const TLDS: &[&str] = &["com", "org", "net", "ir", "info", "biz", "xyz"];

const SEPARATORS: &[&str] = &["-", "–", "—", "|", "•", "·", ":", "/", "_", "~", "+", ","];
const BRACKETS: &[(char, char)] = &[('(', ')'), ('[', ']'), ('{', '}'), ('«', '»'), ('【', '】')];

/// Full cleanup of one tag value. May return an empty string when the value was only an advert.
pub fn tag_value(raw: &str) -> String {
    normalize_persian(&strip_promotions(&repair_encoding(raw)))
}

/// Decode text whose Windows-1256 bytes were read as Latin-1 ("ÚáíÑÖÇ" → "علیرضا").
pub fn repair_encoding(raw: &str) -> String {
    if raw.chars().any(|c| c as u32 > 0xFF) {
        return raw.to_string();
    }
    let high = raw.chars().filter(|&c| c as u32 >= 0x80).count();
    if high < 2 {
        return raw.to_string();
    }
    let bytes: Vec<u8> = raw.chars().map(|c| c as u32 as u8).collect();
    let (decoded, _, had_errors) = encoding_rs::WINDOWS_1256.decode(&bytes);
    let letters = decoded.chars().filter(|&c| is_arabic_letter(c)).count();
    if had_errors || letters < 2 || letters * 10 < high * 6 {
        return raw.to_string();
    }
    decoded.into_owned()
}

/// Persian text often carries Arabic Yeh/Kaf from old keyboards and encodings. Only strings
/// that are evidently Persian are changed, so Arabic titles keep their orthography.
pub fn normalize_persian(text: &str) -> String {
    let persian = text.chars().any(|c| matches!(c, 'پ' | 'چ' | 'ژ' | 'گ' | 'ی' | 'ک'));
    if !persian {
        return text.to_string();
    }
    text.chars()
        .map(|c| match c {
            'ي' | 'ى' => 'ی',
            'ك' => 'ک',
            other => other,
        })
        .collect()
}

/// Remove URLs, bare domains, Telegram handles and known site names, then tidy the
/// separators and brackets they leave behind.
pub fn strip_promotions(text: &str) -> String {
    let tokens: Vec<&str> = text.split_whitespace().collect();
    let mut keep = vec![true; tokens.len()];
    let mut i = 0;
    while i < tokens.len() {
        // Multi-word names first ("Music Fa", "آپ موزیک").
        let span = (1..=3)
            .rev()
            .find(|&n| {
                i + n <= tokens.len()
                    && [tokens[i], tokens[i + n - 1]].iter().all(|t| t.chars().any(char::is_alphanumeric))
                    && is_promotional_name(&tokens[i..i + n].join(""))
            });
        let span = span.or_else(|| is_promotional_token(tokens[i]).then_some(1));
        match span {
            Some(n) => {
                keep[i..i + n].iter_mut().for_each(|k| *k = false);
                i += n;
            }
            None => i += 1,
        }
    }
    if keep.iter().all(|&k| k) {
        return tidy(&tokens.join(" "));
    }
    let kept: Vec<&str> = tokens.iter().zip(&keep).filter(|(_, &k)| k).map(|(t, _)| *t).collect();
    tidy(&kept.join(" "))
}

fn is_promotional_token(token: &str) -> bool {
    let core = strip_wrapping(token);
    if core.is_empty() {
        return false;
    }
    if let Some(handle) = core.strip_prefix('@') {
        return handle.len() >= 3 && handle.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    }
    is_domain(core) || is_promotional_name(core)
}

fn is_promotional_name(text: &str) -> bool {
    let key = normalize_key(text);
    if key.is_empty() {
        return false;
    }
    PROMOTIONAL_NAMES.iter().any(|name| {
        key == *name
            || TLDS.iter().any(|tld| key.strip_suffix(tld).is_some_and(|rest| rest == *name))
    })
}

fn is_domain(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    let without_scheme = lower
        .strip_prefix("https://")
        .or_else(|| lower.strip_prefix("http://"))
        .unwrap_or(&lower);
    let explicit = without_scheme.len() != lower.len() || without_scheme.starts_with("www.");
    let host = without_scheme.trim_start_matches("www.").split('/').next().unwrap_or("");
    let labels: Vec<&str> = host.split('.').collect();
    if labels.len() < 2 || labels.iter().any(|l| l.is_empty()) {
        return false;
    }
    let valid = labels.iter().all(|l| l.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
    let tld = labels.last().copied().unwrap_or("");
    valid && (TLDS.contains(&tld) || (explicit && tld.len() >= 2 && tld.chars().all(|c| c.is_ascii_alphabetic())))
        && labels.iter().rev().skip(1).any(|l| l.chars().any(|c| c.is_ascii_alphabetic()))
}

/// Lower-case, without spaces, punctuation, tatweel or zero-width joiners.
fn normalize_key(text: &str) -> String {
    normalize_persian(text)
        .chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn strip_wrapping(token: &str) -> &str {
    token.trim_matches(|c: char| {
        !(c.is_alphanumeric() || c == '@' || c == '/' || c == '.' || c == '-' || c == '_')
    })
    .trim_end_matches(['.', '/'])
}

/// Remove empty brackets and doubled or dangling separators.
fn tidy(text: &str) -> String {
    let mut out = text.to_string();
    loop {
        let before = out.clone();
        for (open, close) in BRACKETS {
            out = out.replace(&format!("{open}{close}"), "").replace(&format!("{open} {close}"), "");
        }
        let words: Vec<&str> = out.split_whitespace().collect();
        let mut kept: Vec<&str> = Vec::with_capacity(words.len());
        for word in words {
            if SEPARATORS.contains(&word) && kept.last().is_some_and(|w| SEPARATORS.contains(w)) {
                continue;
            }
            kept.push(word);
        }
        while kept.first().is_some_and(|w| SEPARATORS.contains(w)) {
            kept.remove(0);
        }
        while kept.last().is_some_and(|w| SEPARATORS.contains(w)) {
            kept.pop();
        }
        out = kept.join(" ");
        if out == before {
            return out;
        }
    }
}

fn is_arabic_letter(c: char) -> bool {
    matches!(c as u32, 0x0621..=0x064A | 0x067E | 0x0686 | 0x0698 | 0x06A9 | 0x06AF | 0x06CC)
}

/// Download sites often name files with opaque ids ("6727a6efb8a1f").
pub fn looks_like_id(stem: &str) -> bool {
    stem.len() >= 8
        && stem.chars().all(|c| c.is_ascii_alphanumeric())
        && stem.chars().filter(char::is_ascii_digit).count() >= 3
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_domains_handles_and_site_names() {
        assert_eq!(tag_value("Ali Ashabi  www.IRNM.org"), "Ali Ashabi");
        assert_eq!(tag_value("www.IRNM.org"), "");
        assert_eq!(tag_value("Base Akhe موزیکدل"), "Base Akhe");
        assert_eq!(tag_value("موزیکدل"), "");
        assert_eq!(tag_value("Night Tide (Musicdel.ir)"), "Night Tide");
        assert_eq!(tag_value("Song - @nex1music"), "Song");
        assert_eq!(tag_value("Title | https://example.com/track/12"), "Title");
        assert_eq!(tag_value("Lafe Asheghi [ Music Fa ]"), "Lafe Asheghi");
        assert_eq!(tag_value("Hayedeh - Soghati (آپ موزیک)"), "Hayedeh - Soghati");
    }

    #[test]
    fn keeps_ordinary_titles() {
        for title in ["Vol.2", "Love.me", "Live.In.Paris", "Mr. Big", "AC/DC", "Feat. Ali", "The Real Slim Shady", "2:00 AM", "1999", "Beyoncé"] {
            assert_eq!(tag_value(title), title, "{title}");
        }
        assert_eq!(tag_value("Salt & Static"), "Salt & Static");
        assert_eq!(tag_value("Intro - Outro"), "Intro - Outro");
    }

    #[test]
    fn decodes_windows_1256_mojibake() {
        // Windows-1256 has no Persian Yeh; such text carries the Arabic one.
        let (bytes, _, _) = encoding_rs::WINDOWS_1256.encode("پرواز علي");
        let latin1: String = bytes.iter().map(|&b| b as char).collect();
        assert!(latin1.is_ascii() || latin1.chars().all(|c| (c as u32) < 0x100));
        assert_eq!(tag_value(&latin1), "پرواز علی");
        assert_eq!(repair_encoding("Mötley Crüe"), "Mötley Crüe");
        assert_eq!(repair_encoding("Café del Mar"), "Café del Mar");
    }

    #[test]
    fn normalises_arabic_letters_only_in_persian_text() {
        assert_eq!(normalize_persian("كوچه علي"), "کوچه علی");
        assert_eq!(normalize_persian("على الكورنيش"), "على الكورنيش");
    }

    #[test]
    fn recognises_opaque_file_ids() {
        assert!(looks_like_id("6727a6efb8a1f"));
        assert!(!looks_like_id("Night Tide"));
        assert!(!looks_like_id("Interlude"));
    }
}
