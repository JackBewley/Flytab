#!/usr/bin/env python3
"""Render Flytab's layered geometric SVG as Chrome PNGs. Dev-only: Pillow."""
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
svg = ET.parse(root / 'icons/icon.svg').getroot()
view_size = float(svg.attrib['viewBox'].split()[2])

for size, dark in [(size, dark) for dark in (False, True) for size in (16, 32, 48, 128)]:
    scale = size * 12 / view_size
    canvas = Image.new('RGBA', (size * 12, size * 12))
    draw = ImageDraw.Draw(canvas)

    def render(element, inherited):
        attrs = {**inherited, **element.attrib}
        tag = element.tag.rsplit('}', 1)[-1]
        if tag in ('svg', 'g'):
            for child in element:
                render(child, attrs)
            return
        color = '#e8eaed' if dark else attrs['stroke']
        stroke = float(attrs['stroke-width'])
        width = round(stroke * scale)
        if tag == 'rect':
            x, y, w, h = (float(attrs[k]) for k in ('x', 'y', 'width', 'height'))
            half = stroke / 2
            box = tuple(n * scale for n in (x-half, y-half, x+w+half, y+h+half))
            draw.rounded_rectangle(box, radius=(float(attrs.get('rx', 0))+half)*scale, outline=color, width=width)
        elif tag in ('line', 'polyline'):
            if tag == 'line':
                points = [(float(attrs['x1']), float(attrs['y1'])), (float(attrs['x2']), float(attrs['y2']))]
            else:
                points = [tuple(map(float, point.split(','))) for point in attrs['points'].split()]
            points = [(x*scale, y*scale) for x, y in points]
            draw.line(points, fill=color, width=width, joint='curve')
            for x, y in points:
                radius = width / 2
                draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=color)
        else:
            raise ValueError(f'Unsupported icon geometry: {tag}')

    render(svg, {})
    suffix = '-dark' if dark else ''
    canvas.resize((size, size), Image.Resampling.LANCZOS).save(root / f'icons/icon{suffix}-{size}.png')
print('Rendered light-toolbar and dark-toolbar icons at 16, 32, 48 and 128px.')
