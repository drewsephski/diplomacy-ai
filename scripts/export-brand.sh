#!/usr/bin/env bash
# Derives every brand export from the approved imagegen originals. No redesign: sips resizes
# (aspect kept: square in, square out), and a stdlib script packs the multi-size favicon.ico.
# Originals are never overwritten: public/brand/seven-powers-mark.png and seven-powers-app.png.
set -euo pipefail
cd "$(dirname "$0")/.."
B=public/brand
MARK=$B/seven-powers-mark.png
APP=$B/seven-powers-app.png
[ -f "$MARK" ] && [ -f "$APP" ] || { echo "Missing approved originals in $B" >&2; exit 1; }

# In-page mark keeps transparency. 256px covers 2x retina at header and emblem sizes.
sips -z 256 256 "$MARK" --out "$B/seven-powers-mark-256.png" >/dev/null

# Dark navy app tile (opaque) for browser tab, home screen, and manifest icons.
for s in 16 32 48 180 192 512; do
  sips -z "$s" "$s" "$APP" --out "$B/app-$s.png" >/dev/null
done

python3 scripts/pack-ico.py public/favicon.ico "$B/app-16.png" "$B/app-32.png" "$B/app-48.png"
# Vector wrapper: embeds the 256px tile as PNG data, since the approved art is raster.
python3 scripts/write-icon-svg.py "$B/app-192.png" public/icon.svg assets/icon.svg
echo "brand exports written"
