"""Packs PNG frames into a Windows ICO container (PNG payloads, supported by all current browsers)."""
import struct, sys

def png_size(data: bytes):
    # IHDR width/height live at bytes 16..24 of a PNG.
    w, h = struct.unpack(">II", data[16:24])
    return w, h

def main():
    out, *frames = sys.argv[1:]
    payloads = [open(f, "rb").read() for f in frames]
    header = struct.pack("<HHH", 0, 1, len(payloads))
    offset = 6 + 16 * len(payloads)
    entries = b""
    for data in payloads:
        w, h = png_size(data)
        entries += struct.pack("<BBBBHHII", w % 256, h % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    with open(out, "wb") as f:
        f.write(header + entries + b"".join(payloads))

main()
