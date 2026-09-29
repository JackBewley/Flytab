#!/usr/bin/env python3
"""Render Flytab's small geometric SVG as Chrome PNGs. Dev-only: requires Pillow."""
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
svg = ET.parse(root / 'icons/icon.svg').getroot()
color = svg.attrib['stroke']
stroke = float(svg.attrib['stroke-width'])
view_size = float(svg.attrib['viewBox'].split()[2])

for size in (16, 32, 48, 128):
    scale = size * 12 / view_size
    canvas = Image.new('RGBA', (size * 12, size * 12))
    draw = ImageDraw.Draw(canvas)
    width = round(stroke * scale)
    for shape in svg:
        tag = shape.tag.rsplit('}', 1)[-1]
        attrs = shape.attrib
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
    canvas.resize((size, size), Image.Resampling.LANCZOS).save(root / f'icons/icon-{size}.png')
print('Rendered 16, 32, 48 and 128px icons.')
