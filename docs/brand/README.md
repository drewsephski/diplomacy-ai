# Seven Powers emblem

Created with the built-in image-generation tool on November 11, 2026. The user approved the seven-point faceted gold compass design and requested a transparent or seamlessly blended background for the page.

The seven rays represent the seven independent powers around one contested center. The emblem is an original game identity, not a historical national or military insignia.

## Generated masters

- `public/brand/seven-powers-mark.png`: 1254 × 1254 RGBA, transparent outside the emblem; approved in-page master.
- `public/brand/seven-powers-app.png`: 1254 × 1254 RGB, navy-backed app tile.

Prompt direction: seven broad, evenly spaced, faceted antique-gold compass rays surrounding a small dark-navy heptagonal center; a premium 1901 Diplomacy game; no letters, numeral, outer border, or unrelated decoration. The in-page master requested actual transparency. A second image-generation pass made the navy-backed tile. No further redesign was requested after approval.

## Use and exports

Use `seven-powers-mark-256.png` for the header, loading screen, and History empty state. It preserves transparency rather than placing a navy square over the page. Do not stretch its square aspect ratio. Country crests and the map's directional compass retain their separate functions.

Browser/app exports are `app-16.png`, `app-32.png`, `app-48.png`, `app-180.png`, `app-192.png`, and `app-512.png`. `public/favicon.ico` contains 16, 32, and 48 pixel frames. The SVG icon is a wrapper around the generated artwork, not a separately drawn vector master. The manifest uses the 192 and 512 pixel exports with purpose `any`; these are not claimed as maskable-safe variants.

`tests/browser/brand.spec.ts` checks icon routes and dimensions, ICO frames, manifest routes, transparent corners, and responsive header sizing. Browser captures in this directory show the mark composited on dark and light backgrounds. The artwork's central navy opening remains part of the emblem; only the surrounding background is transparent.
