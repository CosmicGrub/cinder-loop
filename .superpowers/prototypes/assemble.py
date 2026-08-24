#!/usr/bin/env python3
"""
assemble.py — stitches captured move segments + title cards into one video.

Throwaway tool, not part of the game or its test suite. Reads
segments.json (written by capture-moveset.js), builds a title card per
segment with Pillow (matching the real game's own palette — the same hex
values 90-settings.js's own CSS already established: background #0d0b10,
ink #e8d8b0, dim #8b8194, accent #ff9a5c), crops each captured frame down
to the action (the raw 934x384 capture leaves the character small against
a debug HUD/hint bar it doesn't need for this reel) and upscales with
nearest-neighbor to match the game's own `image-rendering: pixelated`
choice, not blur it away — then encodes with ffmpeg.
"""
import json
import os
import shutil
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "segments.json")
BUILD_DIR = os.path.join(HERE, "build")
OUT_MP4 = os.path.join(HERE, "cinder-loop-moveset.mp4")

BG = (13, 11, 16)
INK = (232, 216, 176)
DIM = (139, 129, 148)
ACCENT = (255, 154, 92)
GOLD = (255, 209, 102)
BORDER = (68, 58, 82)

SRC_W, SRC_H = 934, 384  # the raw captured screenshot size
# Crop out the top debug HUD (fps/tick/hitstop readout — not for a player-
# facing reel) while keeping the bottom control-hint bar (genuinely useful
# in a tutorial clip), and narrow the width to bring the small 22px figure
# closer to camera.
CROP = (117, 34, 817, 384)  # (left, top, right, bottom)
CROP_W, CROP_H = CROP[2] - CROP[0], CROP[3] - CROP[1]
OUT_W, OUT_H = 1280, 640
FPS = 25  # matches the capture script's actual ~40ms native sampling interval
TITLE_CARD_SECONDS = 1.1


def font(size):
    candidates = [
        "consola.ttf", "Consolas.ttf",
        "C:\\Windows\\Fonts\\consola.ttf",
        "C:\\Windows\\Fonts\\cour.ttf",
        "cour.ttf",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except Exception:
            continue
    return ImageFont.load_default()


def process_frame(src_path):
    """Crop to the action, upscale with nearest-neighbor (never blur the
    game's own deliberately pixelated look), pad to the output canvas."""
    im = Image.open(src_path).convert("RGB")
    im = im.crop(CROP)
    im = im.resize((OUT_W, OUT_H), Image.NEAREST)
    return im


def make_title_card(caption, index, total):
    img = Image.new("RGB", (OUT_W, OUT_H), BG)
    d = ImageDraw.Draw(img)
    kicker = f"CINDER LOOP  \u00b7  MOVESET  ({index}/{total})"
    d.text((70, OUT_H // 2 - 90), kicker, fill=DIM, font=font(18))
    d.text((70, OUT_H // 2 - 56), caption, fill=ACCENT, font=font(46))
    d.line([(70, OUT_H // 2 + 20), (OUT_W - 70, OUT_H // 2 + 20)], fill=BORDER, width=2)
    d.text((70, OUT_H // 2 + 36), "real gameplay \u2014 real key input, real sim ticks",
            fill=DIM, font=font(15))
    return img


def main():
    if not os.path.exists(MANIFEST):
        print("no segments.json — run capture-moveset.js first", file=sys.stderr)
        sys.exit(1)
    with open(MANIFEST, "r", encoding="utf-8") as f:
        segments = json.load(f)

    shutil.rmtree(BUILD_DIR, ignore_errors=True)
    os.makedirs(BUILD_DIR, exist_ok=True)

    seq = 0
    for i, seg in enumerate(segments, 1):
        card = make_title_card(seg["caption"], i, len(segments))
        for _ in range(int(TITLE_CARD_SECONDS * FPS)):
            card.save(os.path.join(BUILD_DIR, f"{seq:05d}.png"))
            seq += 1

        frame_dir = os.path.join(HERE, seg["dir"])
        files = sorted(f for f in os.listdir(frame_dir) if f.endswith(".png"))
        last_processed = None
        for fn in files:
            im = process_frame(os.path.join(frame_dir, fn))
            im.save(os.path.join(BUILD_DIR, f"{seq:05d}.png"))
            last_processed = im
            seq += 1
        # hold the last real frame briefly so a move doesn't feel clipped
        if last_processed is not None:
            for _ in range(int(0.35 * FPS)):
                last_processed.save(os.path.join(BUILD_DIR, f"{seq:05d}.png"))
                seq += 1

    print(f"assembled {seq} frames ({OUT_W}x{OUT_H} @ {FPS}fps), encoding...")
    subprocess.run([
        "ffmpeg", "-y", "-framerate", str(FPS),
        "-i", os.path.join(BUILD_DIR, "%05d.png"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        OUT_MP4
    ], check=True)
    print("wrote", OUT_MP4)


if __name__ == "__main__":
    main()
