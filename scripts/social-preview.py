#!/usr/bin/env python3
"""Render GitHub's 1280x640 social preview from Flytab's vector mark. Dev-only: Pillow.

Pass FONT_DIR to use another directory containing Arial.ttf and Arial Bold.ttf.
"""
from pathlib import Path
import os
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
font_dir = Path(os.environ.get('FONT_DIR', '/System/Library/Fonts/Supplemental'))
scale = 3
canvas = Image.new('RGB', (1280 * scale, 640 * scale), '#233654')
draw = ImageDraw.Draw(canvas)
svg = ET.parse(root / 'icons/icon.svg').getroot()
unit = 144 * scale / float(svg.attrib['viewBox'].split()[2])
origin = (88 * scale, 155 * scale)

def point(x, y):
    return origin[0] + x * unit, origin[1] + y * unit

def render(element, inherited):
    attrs = {**inherited, **element.attrib}
    tag = element.tag.rsplit('}', 1)[-1]
    if tag in ('svg', 'g'):
        for child in element:
            render(child, attrs)
        return
    width = round(float(attrs['stroke-width']) * unit)
    color = '#e8eaed'
    if tag == 'rect':
        x, y, w, h = (float(attrs[k]) for k in ('x', 'y', 'width', 'height'))
        half = float(attrs['stroke-width']) / 2
        draw.rounded_rectangle((*point(x-half, y-half), *point(x+w+half, y+h+half)),
                               radius=(float(attrs.get('rx', 0))+half)*unit,
                               outline=color, width=width)
    elif tag in ('line', 'polyline'):
        if tag == 'line':
            points = [(float(attrs['x1']), float(attrs['y1'])),
                      (float(attrs['x2']), float(attrs['y2']))]
        else:
            points = [tuple(map(float, p.split(','))) for p in attrs['points'].split()]
        points = [point(x, y) for x, y in points]
        draw.line(points, fill=color, width=width, joint='curve')
        for x, y in points:
            r = width / 2
            draw.ellipse((x-r, y-r, x+r, y+r), fill=color)
    else:
        raise ValueError(f'Unsupported icon geometry: {tag}')

render(svg, {})
for text, x, y, size, bold, color in [
    ('Flytab', 268, 168, 96, True, '#ffffff'),
    ('Back to the tab you just left.', 88, 348, 48, False, '#ffffff'),
    ('A lightweight Chrome tab switcher.', 88, 424, 28, False, '#c0d0e8'),
    ('Open source. On-device. No analytics.', 88, 472, 24, False, '#c0d0e8'),
]:
    font = ImageFont.truetype(str(font_dir / ('Arial Bold.ttf' if bold else 'Arial.ttf')), size * scale)
    draw.text((x*scale, y*scale), text, font=font, fill=color)
output = root / 'store/assets/social-1280x640.png'
canvas.resize((1280, 640), Image.Resampling.LANCZOS).save(output)
print(output)
