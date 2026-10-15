"""Generate an original, royalty-free test library for RYLORA development.

Synthesises short pieces of music with numpy, paints abstract cover art with
Pillow, and uses ffmpeg to encode MP3 / FLAC / OGG / M4A / WAV files with real
tags and embedded covers. Every artist, album and title is fictional.

Usage:  python scripts/generate-test-media.py [output-dir]
Default output: ./test-media (git-ignored).
"""

from __future__ import annotations

import math
import random
import shutil
import subprocess
import sys
import tempfile
import wave
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RATE = 44_100


# ------------------------------------------------------------------ synthesis

def note_freq(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def envelope(n: int, attack: float, release: float) -> np.ndarray:
    env = np.ones(n)
    a = max(1, int(attack * RATE))
    r = max(1, int(release * RATE))
    env[:a] = np.linspace(0, 1, a)
    env[-r:] *= np.linspace(1, 0, r)
    return env


def tone(freq: float, dur: float, timbre: str, amp: float) -> np.ndarray:
    n = int(dur * RATE)
    t = np.arange(n) / RATE
    if timbre == "pad":
        sig = sum(np.sin(2 * np.pi * freq * k * t + k) / k**1.6 for k in range(1, 6))
        sig *= 1 + 0.08 * np.sin(2 * np.pi * 0.3 * t)
        env = envelope(n, min(0.8, dur / 3), min(1.2, dur / 2))
    elif timbre == "pluck":
        sig = sum(np.sin(2 * np.pi * freq * k * t) * math.exp(-k * 0.6) for k in range(1, 7))
        env = np.exp(-t * 3.2) * envelope(n, 0.004, 0.05)
    elif timbre == "bass":
        sig = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t)
        env = envelope(n, 0.01, 0.12) * np.exp(-t * 0.8)
    else:  # bell
        sig = np.sin(2 * np.pi * freq * t) + 0.4 * np.sin(2 * np.pi * freq * 2.76 * t)
        env = np.exp(-t * 1.6) * envelope(n, 0.002, 0.2)
    return sig * env * amp


def drum(kind: str) -> np.ndarray:
    if kind == "kick":
        n = int(0.35 * RATE)
        t = np.arange(n) / RATE
        f = 120 * np.exp(-t * 18) + 45
        return np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.exp(-t * 9) * 0.9
    if kind == "snare":
        n = int(0.2 * RATE)
        t = np.arange(n) / RATE
        return (np.random.uniform(-1, 1, n) * 0.6 + np.sin(2 * np.pi * 190 * t) * 0.3) * np.exp(-t * 22)
    n = int(0.06 * RATE)
    t = np.arange(n) / RATE
    noise = np.random.uniform(-1, 1, n)
    hp = np.diff(noise, prepend=0)
    return hp * np.exp(-t * 60) * 0.25


def mix_in(buf: np.ndarray, sig: np.ndarray, start: float, pan: float = 0.0) -> None:
    i = int(start * RATE)
    j = min(len(buf), i + len(sig))
    if i >= len(buf):
        return
    s = sig[: j - i]
    left, right = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)
    buf[i:j, 0] += s * left
    buf[i:j, 1] += s * right


SCALES = {"minor": [0, 2, 3, 5, 7, 8, 10], "major": [0, 2, 4, 5, 7, 9, 11], "dorian": [0, 2, 3, 5, 7, 9, 10]}


def compose(seed: int, seconds: float, bpm: int, root: int, mode: str, style: str) -> np.ndarray:
    rng = random.Random(seed)
    np.random.seed(seed)
    beat = 60 / bpm
    bar = beat * 4
    buf = np.zeros((int((seconds + 2) * RATE), 2))
    scale = SCALES[mode]
    progression = rng.choice([[0, 5, 3, 4], [0, 3, 4, 3], [0, 4, 5, 3], [5, 3, 0, 4]])
    bars = int(seconds / bar)
    for b in range(bars):
        degree = progression[b % 4]
        chord = [root + scale[(degree + k) % 7] + 12 * ((degree + k) // 7) for k in (0, 2, 4)]
        t0 = b * bar
        for m in chord:
            mix_in(buf, tone(note_freq(m), bar * 1.05, "pad", 0.09), t0, rng.uniform(-0.4, 0.4))
        mix_in(buf, tone(note_freq(chord[0] - 24), bar * 0.95, "bass", 0.32), t0)
        if style != "ambient" or b % 2:
            for s in range(8):
                if rng.random() < (0.75 if style == "pulse" else 0.45):
                    m = chord[rng.randrange(3)] + 12 + rng.choice([0, 0, 12])
                    voice = "bell" if style == "ambient" else "pluck"
                    mix_in(buf, tone(note_freq(m), beat * 1.5, voice, 0.13), t0 + s * beat / 2, rng.uniform(-0.7, 0.7))
        if style in ("pulse", "groove") and b >= 2:
            for q in range(4):
                if q % 2 == 0:
                    mix_in(buf, drum("kick"), t0 + q * beat)
                else:
                    mix_in(buf, drum("snare"), t0 + q * beat, 0.1)
                for h in range(2):
                    mix_in(buf, drum("hat"), t0 + q * beat + h * beat / 2, 0.35)
    buf = buf[: int(seconds * RATE)]
    fade = int(2.5 * RATE)
    buf[-fade:] *= np.linspace(1, 0, fade)[:, None]
    buf[: int(0.05 * RATE)] *= np.linspace(0, 1, int(0.05 * RATE))[:, None]
    peak = np.max(np.abs(buf)) or 1
    return np.tanh(buf / peak * 1.4) * 0.85


def write_wav(path: Path, audio: np.ndarray) -> None:
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())


# ------------------------------------------------------------------ cover art

def paint_cover(path: Path, seed: int, palette: list[tuple[int, int, int]], motif: str) -> None:
    rng = random.Random(seed)
    size = 1200
    img = Image.new("RGB", (size, size), palette[0])
    grad = Image.linear_gradient("L").resize((size, size)).rotate(rng.choice([0, 45, 90, 135]))
    img = Image.composite(Image.new("RGB", (size, size), palette[1]), img, grad)
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if motif == "orbs":
        for _ in range(5):
            r = rng.randint(140, 420)
            x, y = rng.randint(0, size), rng.randint(0, size)
            c = rng.choice(palette[1:])
            d.ellipse((x - r, y - r, x + r, y + r), fill=c + (rng.randint(90, 170),))
        layer = layer.filter(ImageFilter.GaussianBlur(60))
    elif motif == "rings":
        cx, cy = size * rng.uniform(0.35, 0.65), size * rng.uniform(0.35, 0.65)
        for k in range(14, 0, -1):
            r = k * 46
            d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=palette[2 + k % 2] + (200,), width=10)
        layer = layer.filter(ImageFilter.GaussianBlur(2))
    elif motif == "horizon":
        for k in range(28):
            y = size * 0.45 + k * k * 0.9
            d.rectangle((0, y, size, y + 5 + k * 0.6), fill=palette[2] + (150,))
        d.ellipse((size * 0.3, size * 0.12, size * 0.7, size * 0.52), fill=palette[3] + (255,))
    else:  # shards
        for _ in range(9):
            pts = [(rng.randint(-200, size + 200), rng.randint(-200, size + 200)) for _ in range(3)]
            d.polygon(pts, fill=rng.choice(palette[1:]) + (rng.randint(70, 150),))
        layer = layer.filter(ImageFilter.GaussianBlur(3))
    img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
    grain = Image.effect_noise((size, size), 18).convert("RGB")
    img = Image.blend(img, grain, 0.04)
    img.save(path, "JPEG", quality=92)


# ------------------------------------------------------------------ catalogue

@dataclass
class Album:
    artist: str
    title: str
    year: int
    genre: str
    fmt: str
    palette: list[tuple[int, int, int]]
    motif: str | None
    tracks: list[tuple[str, float, str]] = field(default_factory=list)
    album_artist: str | None = None


CATALOGUE = [
    Album("Aurel Vane", "Night Tide", 2024, "Electronic", "flac",
          [(10, 14, 40), (40, 60, 160), (110, 90, 230), (230, 200, 255)], "orbs",
          [("Low Light", 48, "ambient"), ("Night Tide", 62, "pulse"), ("Salt & Static", 41, "groove"),
           ("Undertow", 236, "pulse"), ("Harbour Lamps", 37, "ambient")]),
    Album("Mira Solenne", "Glass Cathedral", 2023, "Ambient", "mp3",
          [(18, 30, 34), (40, 120, 120), (200, 230, 210), (250, 210, 150)], "rings",
          [("Vespers", 44, "ambient"), ("Clerestory", 52, "groove"), ("Stained", 39, "pulse"),
           ("Nave", 47, "ambient")]),
    Album("Kestrel Lines", "Low Orbit", 2025, "Synthwave", "m4a",
          [(30, 8, 30), (180, 40, 90), (250, 120, 60), (255, 220, 120)], "horizon",
          [("Perigee", 40, "pulse"), ("Telemetry", 46, "groove"), ("Re-entry", 38, "pulse")]),
    Album("Orin & The Hollow", "Paper Suns", 2022, "Indie", "ogg",
          [(30, 26, 20), (120, 90, 50), (220, 180, 120), (250, 240, 220)], None,
          [("Kindling", 36, "groove"), ("Paper Suns", 43, "pulse"), ("Ash Garden", 40, "ambient")]),
    Album("سایه‌ها", "نوای شب", 2021, "World", "mp3",
          [(20, 12, 10), (120, 50, 30), (230, 150, 70), (250, 230, 190)], "shards",
          [("ماه نو", 42, "ambient"), ("کوچه‌باغ", 45, "groove")]),
    Album("Various Artists", "Northern Lights Sampler", 2025, "Electronic", "mp3",
          [(6, 20, 26), (20, 120, 110), (90, 220, 170), (200, 255, 230)], "orbs",
          [("Aurora (Kestrel Lines)", 38, "pulse"), ("Polar Drift (Mira Solenne)", 41, "ambient")],
          album_artist="Various Artists"),
]


# Original placeholder lyrics (written for this project) to exercise the lyrics panel.
LYRICS = {
    "Vespers": (
        "Light through the high glass\n"
        "a colour with no name\n"
        "we hold the quiet\n"
        "and the quiet holds the same"
    ),
}


def encode(src: Path, dst: Path, fmt: str, tags: dict[str, str], cover: Path | None) -> None:
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src)]
    if cover and fmt in ("mp3", "flac", "m4a"):
        cmd += ["-i", str(cover), "-map", "0:a", "-map", "1:v", "-disposition:v", "attached_pic"]
        if fmt == "m4a":
            cmd += ["-c:v", "mjpeg"]
        else:
            cmd += ["-c:v", "copy", "-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)"]
    codec = {"mp3": ["-c:a", "libmp3lame", "-b:a", "256k", "-id3v2_version", "3"],
             "flac": ["-c:a", "flac"],
             "ogg": ["-c:a", "libvorbis", "-q:a", "6"],
             "m4a": ["-c:a", "aac", "-b:a", "256k"],
             "wav": ["-c:a", "pcm_s16le"]}[fmt]
    cmd += codec
    for k, v in tags.items():
        cmd += ["-metadata", f"{k}={v}"]
    cmd.append(str(dst))
    subprocess.run(cmd, check=True)


def safe(name: str) -> str:
    return "".join(c for c in name if c not in '<>:"/\\|?*').strip()


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "test-media").resolve()
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg is required")
    out.mkdir(parents=True, exist_ok=True)
    seed = 7
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp = Path(tmp_dir)
        for album in CATALOGUE:
            folder = out / safe(album.album_artist or album.artist) / safe(album.title)
            folder.mkdir(parents=True, exist_ok=True)
            cover = None
            if album.motif:
                cover = tmp / f"cover-{seed}.jpg"
                paint_cover(cover, seed, album.palette, album.motif)
            for i, (title, seconds, style) in enumerate(album.tracks, start=1):
                seed += 1
                rng = random.Random(seed)
                audio = compose(seed, seconds, rng.choice([84, 96, 104, 118, 124]), rng.choice([45, 48, 50, 52, 55]),
                                rng.choice(list(SCALES)), style)
                wav = tmp / f"t{seed}.wav"
                write_wav(wav, audio)
                artist = album.artist
                if album.album_artist and "(" in title:
                    title, artist = title.split(" (")[0], title.split("(")[1].rstrip(")")
                tags = {"title": title, "artist": artist, "album": album.title, "date": str(album.year),
                        "genre": album.genre, "track": f"{i}/{len(album.tracks)}"}
                if album.album_artist:
                    tags["album_artist"] = album.album_artist
                if title in LYRICS:
                    tags["lyrics"] = LYRICS[title]
                dst = folder / f"{i:02d} - {safe(title)}.{album.fmt}"
                encode(wav, dst, album.fmt, tags, cover)
                print("wrote", dst.relative_to(out))
            seed += 10

        loose = out / "Unsorted"
        loose.mkdir(exist_ok=True)
        wav = tmp / "field.wav"
        write_wav(wav, compose(999, 33, 72, 50, "dorian", "ambient"))
        shutil.copy(wav, loose / "Field Recording 01.wav")
        print("wrote Unsorted/Field Recording 01.wav (untagged)")
        (loose / "Broken Transfer.mp3").write_bytes(random.Random(5).randbytes(48_000))
        print("wrote Unsorted/Broken Transfer.mp3 (corrupt, for error handling)")


if __name__ == "__main__":
    main()
