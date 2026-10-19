#!/bin/sh
# Rasterize public/favicon.svg (the source of truth) into the PNG and ICO
# favicons Layout.astro links and the web app manifest's icons
# (manifest.webmanifest). Needs rsvg-convert and ImageMagick
# (brew install librsvg imagemagick). The outputs are committed.
set -eu
cd "$(dirname "$0")/../public"
rsvg-convert -w 48 -h 48 favicon.svg -o favicon-48.png
rsvg-convert -w 96 -h 96 favicon.svg -o favicon-96.png
# The touch icon gets a full-bleed square: iOS rounds the corners itself.
rsvg-convert -w 180 -h 180 -b '#14213c' favicon.svg -o apple-touch-icon.png
rsvg-convert -w 192 -h 192 favicon.svg -o icon-192.png
rsvg-convert -w 512 -h 512 favicon.svg -o icon-512.png
# The maskable icon is full-bleed too: platforms crop it to their own shape,
# and the arrow already sits inside the 80% safe zone.
rsvg-convert -w 512 -h 512 -b '#14213c' favicon.svg -o icon-maskable-512.png
rsvg-convert -w 32 -h 32 favicon.svg -o favicon-32.tmp.png
rsvg-convert -w 16 -h 16 favicon.svg -o favicon-16.tmp.png
magick favicon-16.tmp.png favicon-32.tmp.png favicon-48.png favicon.ico
rm favicon-16.tmp.png favicon-32.tmp.png
echo "✓ public/favicon-48.png favicon-96.png apple-touch-icon.png favicon.ico icon-192.png icon-512.png icon-maskable-512.png"
