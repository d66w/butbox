from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "icons"
OUTPUT.mkdir(exist_ok=True)


def draw_icon(size: int) -> Image.Image:
    scale = size / 128
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def box(coords, radius, fill):
        draw.rounded_rectangle(tuple(round(value * scale) for value in coords), radius=round(radius * scale), fill=fill)

    box((4, 4, 124, 124), 31, "#176B43")
    box((25, 24, 103, 48), 7, "#FFFFFF")
    box((25, 54, 103, 78), 7, "#DDF2E6")
    box((25, 84, 103, 108), 7, "#FFFFFF")
    box((34, 31, 58, 40), 4, "#176B43")
    box((34, 61, 69, 70), 4, "#176B43")
    box((34, 91, 52, 100), 4, "#176B43")
    return image


for icon_size in (16, 32, 48, 128):
    draw_icon(icon_size).save(OUTPUT / f"icon-{icon_size}.png", optimize=True)
