# Third-party attribution

## Diplomacy adjudicator

- Source: https://github.com/diplomacy/diplomacy
- Package: `diplomacy==1.1.2`
- License: GNU Affero General Public License, version 3. Full upstream text: [AGPL-3.0](licenses/diplomacy-AGPL-3.0.txt).
- The engine runs unchanged in a Python subprocess. `engine/bridge.py` is the application adapter. Upstream authors retain their rights.

## Standard map geometry

- Shipped artifact: `src/map-data.json`.
- Source: `diplomacy/maps/svg/standard.svg` in the pinned engine package.
- Original attribution: “Detailed Standard Map”; SVG by **Zach DelProposto**; background cartography attributed to **J. Fatula III**; “Copyright jDip - GPL License.”
- Extraction: `scripts/extract_map.py` retains the province path geometry and location/supply-center coordinates, normalizes sea abbreviations to the engine, and omits original raster and UI elements. Rendering, colors, interactions, labels, and unit markers are implemented by this app.
- Upstream map source: https://github.com/diplomacy/diplomacy/blob/master/diplomacy/maps/svg/standard.svg
- GPL v3 reference text: [GPL-3.0](licenses/GPL-3.0.txt). The original map notice itself says GPL without specifying a version; preserve and review that notice when distributing derivatives.

## Interface dependencies

- React, Vite, TypeScript, Express, Zod, AI SDK, OpenRouter AI SDK provider, and Playwright retain their respective package licenses.
- Lucide icons: ISC license; see the installed package.
- Inter and Cormorant Garamond fonts: SIL Open Font License 1.1, distributed through Fontsource. Fonts are served locally, without external font requests.
- Generated visual concept: `docs/design-concept.png`, created with the built-in image generation tool. It is a design reference, not an interactive screen or a map source.

The project is local and private by default. It has not been assigned a new blanket repository license; third-party licenses remain applicable. No trademark affiliation with Diplomacy’s publishers is claimed.
