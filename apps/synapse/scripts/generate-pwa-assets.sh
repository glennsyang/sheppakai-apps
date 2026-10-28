#!/usr/bin/env bash
# Regenerates the PWA icons, favicon and iOS launch screens from the SVG sources in
# static/icons/src. Needs rsvg-convert and ImageMagick 7 (`brew install librsvg imagemagick`).
# Prints the apple-touch-startup-image <link> tags for src/app.html.
set -euo pipefail

cd "$(dirname "$0")/.."
src=static/icons/src
out=static/icons
bg='#0a0f1a'

render() { rsvg-convert -w "$2" -h "$2" "$src/$1" -o "$3"; }

render icon.svg 192 "$out/icon-192.png"
render icon.svg 512 "$out/icon-512.png"
render icon.svg 180 "$out/apple-touch-icon.png"
render icon-maskable.svg 512 "$out/icon-maskable-512.png"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
for s in 16 32 48; do render icon.svg "$s" "$tmp/fav-$s.png"; done
magick "$tmp/fav-16.png" "$tmp/fav-32.png" "$tmp/fav-48.png" static/favicon.ico

# iOS launch screens (prints the <link> tags for src/app.html).
../../scripts/generate-ios-splash.sh . "$bg" "$src/icon.svg"
