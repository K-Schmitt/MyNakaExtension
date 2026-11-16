#!/usr/bin/env sh
# Regenerates the extension icons from assets/icon.svg (needs ImageMagick).
set -eu
cd "$(dirname "$0")/.."
mkdir -p src/icons
for size in 16 32 48 128; do
  convert -background none -density 384 assets/icon.svg -resize "${size}x${size}" "src/icons/icon-${size}.png"
done
