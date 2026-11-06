#!/usr/bin/env python3
"""Regenerate the Play Store listing graphics from the brand art.

    public/logob_transp_ffc107.png        amber mark -> store/icon-512.png
    assets/brand-originals/logo_text.png  wordmark   -> store/feature-graphic-1024x500.png

Play's rules for these two files: the icon is 512x512, 32-bit PNG (alpha
allowed, at most 1 MB); the feature graphic is 1024x500, JPEG or 24-bit PNG
with no alpha. Deriving both here means the listing cannot drift away from the
launcher icons the app installs with.

    python3 scripts/generate-store-assets.py           # write the assets
    python3 scripts/generate-store-assets.py --check   # fail if they drifted
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "store"
MARK = ROOT / "public" / "logob_transp_ffc107.png"
WORDMARK = ROOT / "assets" / "brand-originals" / "logo_text.png"

BLACK = (0, 0, 0, 255)

ICON = (512, 512)
ICON_SCALE = 0.78  # mark size, same proportion as the launcher icon

FEATURE = (1024, 500)
FEATURE_SCALE = 0.80  # of the banner's shorter side


def load(path: Path) -> Image.Image:
    if not path.exists():
        sys.exit(f"missing source art: {path.relative_to(ROOT)}")
    return Image.open(path).convert("RGBA")


def fitted(art: Image.Image, size: tuple[int, int], scale: float) -> Image.Image:
    """Centre [art] on a black canvas of [size], scaled to [scale] of the short side."""
    canvas = Image.new("RGBA", size, BLACK)
    target = int(min(size) * scale)
    ratio = min(target / art.width, target / art.height)
    resized = art.resize(
        (max(1, int(art.width * ratio)), max(1, int(art.height * ratio))),
        Image.LANCZOS,
    )
    canvas.alpha_composite(
        resized, ((size[0] - resized.width) // 2, (size[1] - resized.height) // 2)
    )
    return canvas


def render() -> dict[Path, bytes]:
    mark = load(MARK)
    mark = mark.crop(mark.getbbox())
    wordmark = load(WORDMARK)
    wordmark = wordmark.crop(wordmark.getbbox())

    def encode(image: Image.Image, mode: str) -> bytes:
        buffer = io.BytesIO()
        image.convert(mode).save(buffer, format="PNG")
        return buffer.getvalue()

    return {
        # 32-bit PNG, alpha allowed: the mark on the app's black ground.
        OUT / "icon-512.png": encode(fitted(mark, ICON, ICON_SCALE), "RGBA"),
        # 24-bit PNG, no alpha: Play rejects a transparent feature graphic.
        OUT / "feature-graphic-1024x500.png": encode(
            fitted(wordmark, FEATURE, FEATURE_SCALE), "RGB"
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="write nothing; exit non-zero if an asset differs from the brand art",
    )
    args = parser.parse_args()

    assets = render()

    if args.check:
        stale = [
            path
            for path, data in assets.items()
            if not path.exists() or path.read_bytes() != data
        ]
        if stale:
            print("stale store assets — run scripts/generate-store-assets.py:", file=sys.stderr)
            for path in stale:
                print(f"  {path.relative_to(ROOT)}", file=sys.stderr)
            return 1
        print(f"Store assets are up to date ({len(assets)} files)")
        return 0

    written = 0
    for path, data in assets.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and path.read_bytes() == data:
            continue
        path.write_bytes(data)
        written += 1

    print(f"wrote {written} of {len(assets)} store assets ({len(assets) - written} unchanged)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
