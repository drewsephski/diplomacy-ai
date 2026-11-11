"""Writes the project icon SVG around the derived PNG (embedded as data, not redrawn)."""
import base64, sys

png, *outs = sys.argv[1:]
data = base64.b64encode(open(png, "rb").read()).decode()
svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 192 192" width="192" height="192">'
    f'<image width="192" height="192" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,{data}" xlink:href="data:image/png;base64,{data}"/>'
    "</svg>\n"
)
for out in outs:
    open(out, "w").write(svg)
