#!/usr/bin/env python3
"""Regenerate the Android launcher icons and splash art from the web logo.

One logo, two places: the site already ships it, so the APK derives its icons
from the same files instead of keeping hand-made copies in sync.

    public/logob_transp_ffc107.png   amber mark on transparency -> launcher icons
    public/splash-logo.png           white mark on black        -> splash bitmaps

Output goes to android/app/src/main/res/:

    mipmap-*/ic_launcher.png             legacy square icon (48-192 px)
    mipmap-*/ic_launcher_round.png       same, circular-masked
    mipmap-*/ic_launcher_foreground.png  adaptive foreground on a 108dp canvas
    drawable*/splash.png                 launch splash, one per density/rotation
    drawable-xhdpi/tv_banner.png         Android TV home-screen banner (320x180)

The adaptive background stays in values/ic_launcher_background.xml (#000000).

    python3 scripts/generate-android-assets.py           # write the assets
    python3 scripts/generate-android-assets.py --check   # fail if they drifted

Requires Pillow.
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android" / "app" / "src" / "main" / "res"
LOGO = ROOT / "public" / "logob_transp_ffc107.png"
SPLASH_LOGO = ROOT / "public" / "splash-logo.png"

BLACK = (0, 0, 0, 255)
TRANSPARENT = (0, 0, 0, 0)

# Launcher icon size in px, and the matching 108dp adaptive canvas.
ICONS = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}

# Legacy splash bitmaps, by resource directory.
SPLASHES = {
    "drawable": (480, 320),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
}

ICON_SCALE = 0.78  # mark size inside the legacy/round square
FOREGROUND_SCALE = 0.60  # inside the adaptive 108dp canvas (66dp safe zone)
SPLASH_SCALE = 0.45  # of the shorter splash side

# Android TV home-screen banner: fixed 320x180 (xhdpi), no other density is used.
TV_BANNER = (320, 180)
BANNER_SCALE = 0.78  # of the banner's shorter side


def load(path: Path) -> Image.Image:
    if not path.exists():
        sys.exit(f"missing source art: {path.relative_to(ROOT)}")
    return Image.open(path).convert("RGBA")


def fitted(mark: Image.Image, size: tuple[int, int], scale: float, background) -> Image.Image:
    """Centre [mark] inside a [size] canvas, scaled to [scale] of the shorter side."""
    canvas = Image.new("RGBA", size, background)
    target = int(min(size) * scale)
    ratio = min(target / mark.width, target / mark.height)
    resized = mark.resize(
        (max(1, int(mark.width * ratio)), max(1, int(mark.height * ratio))),
        Image.LANCZOS,
    )
    canvas.alpha_composite(
        resized, ((size[0] - resized.width) // 2, (size[1] - resized.height) // 2)
    )
    return canvas


def circular(image: Image.Image) -> Image.Image:
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, image.size[0] - 1, image.size[1] - 1), fill=255)
    out = Image.new("RGBA", image.size, TRANSPARENT)
    out.paste(image, (0, 0), mask)
    return out


def render() -> dict[Path, bytes]:
    """Every asset, encoded, keyed by its path under res/."""
    logo = load(LOGO)
    logo = logo.crop(logo.getbbox())
    splash_mark = load(SPLASH_LOGO)

    assets: dict[Path, bytes] = {}

    def add(path: Path, image: Image.Image) -> None:
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        assets[path] = buffer.getvalue()

    for density, (icon_px, foreground_px) in ICONS.items():
        directory = RES / f"mipmap-{density}"
        icon = fitted(logo, (icon_px, icon_px), ICON_SCALE, BLACK)
        add(directory / "ic_launcher.png", icon)
        add(directory / "ic_launcher_round.png", circular(icon))
        add(
            directory / "ic_launcher_foreground.png",
            fitted(logo, (foreground_px, foreground_px), FOREGROUND_SCALE, TRANSPARENT),
        )

    for directory, size in SPLASHES.items():
        add(RES / directory / "splash.png", fitted(splash_mark, size, SPLASH_SCALE, BLACK))

    # The banner sits on the TV home screen next to posters and video thumbnails:
    # black ground, mark centred with breathing room rather than edge to edge.
    add(
        RES / "drawable-xhdpi" / "tv_banner.png",
        fitted(splash_mark, TV_BANNER, BANNER_SCALE, BLACK),
    )

    return assets


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="write nothing; exit non-zero if an asset differs from the logo",
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
            print("stale Android assets — run scripts/generate-android-assets.py:", file=sys.stderr)
            for path in stale:
                print(f"  {path.relative_to(ROOT)}", file=sys.stderr)
            return 1
        print(f"Android assets are up to date ({len(assets)} files)")
        return 0

    written = 0
    for path, data in assets.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and path.read_bytes() == data:
            continue
        path.write_bytes(data)
        written += 1

    print(f"wrote {written} of {len(assets)} Android assets ({len(assets) - written} unchanged)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
