from __future__ import annotations

import io
import struct
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ASSET_DIR = Path(__file__).resolve().parent
SOURCE_PATH = ASSET_DIR / "StarFile-icon-source.jpg"
PNG_PATH = ASSET_DIR / "StarFile-icon.png"
ICO_PATH = ASSET_DIR / "StarFile.ico"
ICON_SIZES = (16, 24, 32, 48, 64, 128, 256)


def build_transparent_source() -> Image.Image:
    source = Image.open(SOURCE_PATH).convert("RGBA")
    width, height = source.size

    alpha = Image.new("L", source.size, 0)
    draw = ImageDraw.Draw(alpha)
    draw.ellipse(
        (
            round(width * 0.100),
            round(height * 0.088),
            round(width * 0.900),
            round(height * 0.892),
        ),
        fill=255,
    )

    # The musical note extends beyond the ring. Preserve its white outline by
    # expanding the nearby non-white artwork before combining it with the ring.
    rgb = source.convert("RGB")
    white = Image.new("RGB", source.size, "white")
    color_distance = ImageChops.difference(rgb, white).convert("L")
    note_art = color_distance.point(lambda value: 255 if value >= 24 else 0)

    note_region = Image.new("L", source.size, 0)
    note_draw = ImageDraw.Draw(note_region)
    note_draw.rectangle(
        (
            round(width * 0.70),
            round(height * 0.44),
            round(width * 0.96),
            round(height * 0.83),
        ),
        fill=255,
    )
    note_art = ImageChops.multiply(note_art, note_region)
    note_outline = note_art.filter(ImageFilter.MaxFilter(55))

    alpha = ImageChops.lighter(alpha, note_outline)
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
    source.putalpha(alpha)
    return source


def render_icon_frame(source: Image.Image, size: int) -> Image.Image:
    frame = source.resize((size, size), Image.Resampling.LANCZOS)
    if size <= 48:
        frame = frame.filter(ImageFilter.UnsharpMask(radius=0.7, percent=125, threshold=2))
    return frame


def write_png_compressed_ico(frames: list[Image.Image]) -> None:
    encoded_frames: list[bytes] = []
    for frame in frames:
        buffer = io.BytesIO()
        frame.save(buffer, format="PNG", optimize=True)
        encoded_frames.append(buffer.getvalue())

    header_size = 6 + 16 * len(frames)
    offset = header_size
    entries: list[bytes] = []
    for frame, encoded in zip(frames, encoded_frames, strict=True):
        size = frame.width
        entries.append(
            struct.pack(
                "<BBBBHHII",
                0 if size == 256 else size,
                0 if size == 256 else size,
                0,
                0,
                1,
                32,
                len(encoded),
                offset,
            )
        )
        offset += len(encoded)

    with ICO_PATH.open("wb") as icon_file:
        icon_file.write(struct.pack("<HHH", 0, 1, len(frames)))
        icon_file.writelines(entries)
        icon_file.writelines(encoded_frames)


def main() -> None:
    transparent_source = build_transparent_source()
    transparent_source.save(PNG_PATH, format="PNG", optimize=True)
    frames = [render_icon_frame(transparent_source, size) for size in ICON_SIZES]
    write_png_compressed_ico(frames)
    print(f"Generated {PNG_PATH.name} and {ICO_PATH.name}")


if __name__ == "__main__":
    main()
