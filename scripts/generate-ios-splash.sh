#!/usr/bin/env bash
# Generates iOS PWA launch screens (apple-touch-startup-image) for one app: the app icon centred
# on a solid background. iOS ignores the manifest's background_color, so without these the
# installed app launches on a white screen. Needs rsvg-convert and ImageMagick 7
# (`brew install librsvg imagemagick`).
#
# Usage: scripts/generate-ios-splash.sh <app-dir> <bg-colour> <icon> [icon-width-%] [corner-radius-%]
#   icon            SVG or PNG, relative to <app-dir>
#   icon-width-%    icon width as a percentage of the screen width (default 40)
#   corner-radius-% rounds a square PNG icon into an app-icon tile (default 0, no rounding)
# Writes <app-dir>/static/icons/splash/*.png and prints the <link> tags for src/app.html.
set -euo pipefail

app=$1 bg=$2 icon=$3 pct=${4:-40} radius=${5:-0}
cd "$app"
out=static/icons/splash

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

render_icon() {
	if [[ $icon == *.svg ]]; then
		rsvg-convert -w "$1" -h "$1" "$icon" -o "$2"
	else
		magick "$icon" -resize "${1}x${1}" "$2"
	fi
	if ((radius > 0)); then
		local r=$(($1 * radius / 100))
		magick -size "${1}x${1}" xc:none -fill white -draw "roundrectangle 0,0,$(($1 - 1)),$(($1 - 1)),$r,$r" "$tmp/mask.png"
		magick "$2" -alpha set "$tmp/mask.png" -compose DstIn -composite "$2"
	fi
}

# Portrait only (the manifests lock orientation): CSS width, height, pixel ratio.
devices=(
	'440 956 3' '402 874 3' '430 932 3' '393 852 3' '428 926 3' '390 844 3' '375 812 3'
	'414 896 3' '414 896 2' '414 736 3' '375 667 2' '320 568 2'
	'1024 1366 2' '834 1194 2' '820 1180 2' '834 1112 2' '810 1080 2' '768 1024 2' '744 1133 2'
)
mkdir -p "$out"
rm -f "$out"/*.png
for d in "${devices[@]}"; do
	read -r w h r <<<"$d"
	pw=$((w * r)) ph=$((h * r))
	file="apple-splash-${pw}x${ph}.png"
	render_icon $((pw * pct / 100)) "$tmp/splash-icon.png"
	magick -size "${pw}x${ph}" "xc:$bg" "$tmp/splash-icon.png" -gravity center -composite -depth 8 -strip "$out/$file"
	printf '\t\t<link rel="apple-touch-startup-image" href="%%sveltekit.assets%%/icons/splash/%s" media="(device-width: %spx) and (device-height: %spx) and (-webkit-device-pixel-ratio: %s) and (orientation: portrait)" />\n' \
		"$file" "$w" "$h" "$r"
done
