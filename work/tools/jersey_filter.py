#!/usr/bin/env python3
"""Deterministic jersey-color isolation for the attached Mexico photo.

This script intentionally avoids generative tools and third-party imaging
libraries. It decodes/encodes PNG with the Python standard library, crops a
square around the main player, builds a local jersey mask from original pixels,
and composites those original jersey pixels over a grungy monochrome base.
"""

from __future__ import annotations

import argparse
from array import array
import os
import struct
import zlib
from typing import Iterable


PNG_SIG = b"\x89PNG\r\n\x1a\n"


def read_png_rgb(path: str) -> tuple[int, int, bytearray]:
    with open(path, "rb") as f:
        data = f.read()
    if not data.startswith(PNG_SIG):
        raise ValueError("input is not a PNG file")

    pos = len(PNG_SIG)
    width = height = None
    bit_depth = color_type = None
    compressed = bytearray()

    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        ctype = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length

        if ctype == b"IHDR":
            width, height, bit_depth, color_type, comp, filt, interlace = struct.unpack(
                ">IIBBBBB", chunk
            )
            if bit_depth != 8 or color_type not in (2, 6) or interlace != 0:
                raise ValueError(
                    "only non-interlaced 8-bit RGB/RGBA PNG files are supported"
                )
            if comp != 0 or filt != 0:
                raise ValueError("unsupported PNG compression/filter method")
        elif ctype == b"IDAT":
            compressed.extend(chunk)
        elif ctype == b"IEND":
            break

    if width is None or height is None or bit_depth is None or color_type is None:
        raise ValueError("PNG is missing IHDR")

    channels = 4 if color_type == 6 else 3
    stride = width * channels
    raw = zlib.decompress(bytes(compressed))
    rows: list[bytearray] = []
    i = 0
    prev = bytearray(stride)

    for _ in range(height):
        ftype = raw[i]
        i += 1
        row = bytearray(raw[i : i + stride])
        i += stride
        recon = bytearray(stride)

        for x in range(stride):
            left = recon[x - channels] if x >= channels else 0
            up = prev[x]
            up_left = prev[x - channels] if x >= channels else 0
            val = row[x]
            if ftype == 0:
                recon[x] = val
            elif ftype == 1:
                recon[x] = (val + left) & 255
            elif ftype == 2:
                recon[x] = (val + up) & 255
            elif ftype == 3:
                recon[x] = (val + ((left + up) >> 1)) & 255
            elif ftype == 4:
                p = left + up - up_left
                pa = abs(p - left)
                pb = abs(p - up)
                pc = abs(p - up_left)
                pred = left if pa <= pb and pa <= pc else up if pb <= pc else up_left
                recon[x] = (val + pred) & 255
            else:
                raise ValueError(f"unsupported PNG filter type {ftype}")
        rows.append(recon)
        prev = recon

    rgb = bytearray(width * height * 3)
    out = 0
    for row in rows:
        for x in range(width):
            src = x * channels
            rgb[out : out + 3] = row[src : src + 3]
            out += 3
    return width, height, rgb


def png_chunk(ctype: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + ctype
        + payload
        + struct.pack(">I", zlib.crc32(ctype + payload) & 0xFFFFFFFF)
    )


def write_png_rgb(path: str, width: int, height: int, rgb: bytearray) -> None:
    rows = bytearray()
    stride = width * 3
    for y in range(height):
        rows.append(0)
        rows.extend(rgb[y * stride : (y + 1) * stride])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    payload = PNG_SIG + png_chunk(b"IHDR", ihdr)
    payload += png_chunk(b"IDAT", zlib.compress(bytes(rows), 9))
    payload += png_chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(payload)


def clamp(v: int, lo: int = 0, hi: int = 255) -> int:
    return lo if v < lo else hi if v > hi else v


def rgb_to_hsl_approx(r: int, g: int, b: int) -> tuple[float, float, float]:
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    mx = max(rf, gf, bf)
    mn = min(rf, gf, bf)
    lum = (mx + mn) / 2.0
    delta = mx - mn
    if delta == 0:
        return 0.0, 0.0, lum
    sat = delta / (2.0 - mx - mn) if lum > 0.5 else delta / (mx + mn)
    if mx == rf:
        hue = ((gf - bf) / delta + (6 if gf < bf else 0)) / 6.0
    elif mx == gf:
        hue = ((bf - rf) / delta + 2) / 6.0
    else:
        hue = ((rf - gf) / delta + 4) / 6.0
    return hue * 360.0, sat, lum


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    ar, ag, ab = a
    br, bg, bb = b
    return ((ar - br) ** 2 * 1.05 + (ag - bg) ** 2 * 0.78 + (ab - bb) ** 2) ** 0.5


def broad_jersey_green(r: int, g: int, b: int) -> bool:
    hue, sat, lum = rgb_to_hsl_approx(r, g, b)
    return (
        83 <= hue <= 188
        and sat >= 0.18
        and 0.08 <= lum <= 0.56
        and g >= r + 4
        and g >= b - 18
        and r <= 128
        and b <= 137
    )


def profile_jersey_color(
    width: int, height: int, rgb: bytearray
) -> dict[str, object]:
    """Sample known jersey fabric and derive dark/mid/light green clusters."""

    sample_rect = (
        int(width * 0.415),
        int(height * 0.405),
        int(width * 0.615),
        int(height * 0.575),
    )
    samples: list[tuple[int, int, int]] = []
    x0, y0, x1, y1 = sample_rect
    for y in range(y0, y1):
        row = y * width
        for x in range(x0, x1):
            i = (row + x) * 3
            r, g, b = rgb[i], rgb[i + 1], rgb[i + 2]
            bright = (r + g + b) // 3
            if broad_jersey_green(r, g, b) and 20 <= bright <= 132:
                samples.append((r, g, b))

    samples.sort(key=lambda c: c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722)
    if not samples:
        # Fallback keeps the script useful if the crop changes unexpectedly.
        samples = [(28, 75, 69), (38, 95, 81), (54, 120, 93)]

    groups: list[list[tuple[int, int, int]]] = []
    for start, end in ((0.0, 0.34), (0.34, 0.70), (0.70, 1.0)):
        a = int(len(samples) * start)
        b = max(a + 1, int(len(samples) * end))
        groups.append(samples[a:b])

    names = ("dark", "mid", "light")
    centroids: dict[str, tuple[int, int, int]] = {}
    radii: dict[str, int] = {}
    ranges: dict[str, tuple[tuple[int, int], tuple[int, int], tuple[int, int]]] = {}
    hsl_ranges: dict[str, tuple[tuple[int, int], tuple[int, int], tuple[int, int]]] = {}

    for name, group in zip(names, groups):
        cr = round(sum(c[0] for c in group) / len(group))
        cg = round(sum(c[1] for c in group) / len(group))
        cb = round(sum(c[2] for c in group) / len(group))
        centroid = (cr, cg, cb)
        distances = sorted(color_distance(c, centroid) for c in group)
        pct = distances[min(len(distances) - 1, int(len(distances) * 0.92))]
        centroids[name] = centroid
        radii[name] = clamp(round(pct + 18), 34, 68)
        rs, gs, bs = [c[0] for c in group], [c[1] for c in group], [c[2] for c in group]
        ranges[name] = ((min(rs), max(rs)), (min(gs), max(gs)), (min(bs), max(bs)))
        hsls = [rgb_to_hsl_approx(*c) for c in group]
        hues = [round(c[0]) for c in hsls]
        sats = [round(c[1] * 100) for c in hsls]
        lums = [round(c[2] * 100) for c in hsls]
        hsl_ranges[name] = ((min(hues), max(hues)), (min(sats), max(sats)), (min(lums), max(lums)))

    return {
        "sample_rect": sample_rect,
        "sample_count": len(samples),
        "centroids": centroids,
        "radii": radii,
        "ranges": ranges,
        "hsl_ranges": hsl_ranges,
    }


def profile_green_score(r: int, g: int, b: int, profile: dict[str, object]) -> bool:
    if not broad_jersey_green(r, g, b):
        return False
    centroids = profile["centroids"]
    radii = profile["radii"]
    assert isinstance(centroids, dict)
    assert isinstance(radii, dict)
    for name, centroid in centroids.items():
        radius = int(radii[name])
        if color_distance((r, g, b), centroid) <= radius:
            return True
    return False


def crop_square(
    width: int, height: int, rgb: bytearray, center_x_ratio: float
) -> tuple[int, int, bytearray]:
    side = min(width, height)
    left = round(width * center_x_ratio - side / 2)
    left = max(0, min(width - side, left))
    top = max(0, (height - side) // 2)
    out = bytearray(side * side * 3)
    for y in range(side):
        src = ((top + y) * width + left) * 3
        dst = y * side * 3
        out[dst : dst + side * 3] = rgb[src : src + side * 3]
    return side, side, out


def green_score(r: int, g: int, b: int) -> bool:
    mx = max(r, g, b)
    mn = min(r, g, b)
    saturated_green = (
        g >= 42
        and mx - mn >= 18
        and g >= r + 14
        and g >= b - 8
        and r <= 115
        and b <= 125
    )
    deep_fabric_green = (
        g >= 24
        and mx - mn >= 10
        and g >= r + 7
        and g >= b - 14
        and r <= 88
        and b <= 104
    )
    return saturated_green or deep_fabric_green


def point_in_poly(x: int, y: int, poly: list[tuple[int, int]]) -> bool:
    inside = False
    j = len(poly) - 1
    for i, (xi, yi) in enumerate(poly):
        xj, yj = poly[j]
        crosses = (yi > y) != (yj > y)
        if crosses:
            x_cross = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < x_cross:
                inside = not inside
        j = i
    return inside


def build_jersey_mask(width: int, height: int, rgb: bytearray) -> tuple[bytearray, dict[str, object]]:
    """Build a photo-specific anatomical mask for the main player's jersey.

    v7 deliberately starts from the visible garment silhouette instead of a
    green-only threshold. Color is only used to trim probable skin and shorts.
    """

    profile = profile_jersey_color(width, height, rgb)
    mask = bytearray(width * height)

    def xy(x: float, y: float) -> tuple[int, int]:
        return int(x * width), int(y * height)

    torso_poly = [xy(x, y) for x, y in [
        (0.285, 0.500),
        (0.365, 0.395),
        (0.440, 0.375),
        (0.500, 0.430),
        (0.555, 0.385),
        (0.675, 0.415),
        (0.735, 0.535),
        (0.705, 0.815),
        (0.655, 0.965),
        (0.500, 0.955),
        (0.360, 0.940),
        (0.260, 0.805),
        (0.248, 0.650),
    ]]
    left_sleeve_poly = [xy(x, y) for x, y in [
        (0.205, 0.640),
        (0.265, 0.505),
        (0.365, 0.405),
        (0.425, 0.455),
        (0.360, 0.650),
        (0.300, 0.770),
        (0.225, 0.790),
    ]]
    right_sleeve_poly = [xy(x, y) for x, y in [
        (0.560, 0.410),
        (0.690, 0.430),
        (0.755, 0.545),
        (0.720, 0.700),
        (0.635, 0.690),
        (0.610, 0.575),
    ]]
    lower_side_poly = [xy(x, y) for x, y in [
        (0.252, 0.760),
        (0.365, 0.775),
        (0.375, 0.940),
        (0.310, 0.925),
        (0.250, 0.855),
    ]]
    garment_polys = [torso_poly, left_sleeve_poly, right_sleeve_poly, lower_side_poly]

    exclusion_polys = [
        # Left forearm crossing the shirt.
        [xy(x, y) for x, y in [
            (0.310, 0.615),
            (0.375, 0.600),
            (0.402, 0.710),
            (0.350, 0.915),
            (0.305, 0.890),
            (0.280, 0.735),
        ]],
        # Exposed left arm below the sleeve edge.
        [xy(x, y) for x, y in [
            (0.200, 0.735),
            (0.295, 0.740),
            (0.300, 0.835),
            (0.250, 0.930),
            (0.205, 0.895),
        ]],
        # Right forearm/fist edge.
        [xy(x, y) for x, y in [
            (0.665, 0.580),
            (0.760, 0.575),
            (0.772, 0.700),
            (0.720, 0.790),
            (0.665, 0.750),
            (0.640, 0.660),
        ]],
        # Green advertising board peeking past the right torso.
        [xy(x, y) for x, y in [
            (0.670, 0.770),
            (0.785, 0.805),
            (0.785, 0.985),
            (0.715, 0.985),
            (0.675, 0.905),
        ]],
        # Shorts below the hem.
        [xy(x, y) for x, y in [
            (0.300, 0.930),
            (0.450, 0.945),
            (0.545, 0.985),
            (0.700, 0.945),
            (0.740, 1.000),
            (0.250, 1.000),
        ]],
    ]

    def in_any_poly(x: int, y: int, polys: list[list[tuple[int, int]]]) -> bool:
        return any(point_in_poly(x, y, poly) for poly in polys)

    def in_ellipse(x: int, y: int, cx: float, cy: float, rx: float, ry: float) -> bool:
        return ((x - width * cx) / (width * rx)) ** 2 + ((y - height * cy) / (height * ry)) ** 2 <= 1.0

    def skin_score(r: int, g: int, b: int) -> bool:
        warm = r > 76 and r > g + 18 and r > b + 20 and g >= b - 14
        bright_warm = r > 130 and g > 72 and b < 105 and r > b + 32
        return warm or bright_warm

    x0, x1 = int(width * 0.18), int(width * 0.78)
    y0, y1 = int(height * 0.34), int(height * 0.985)
    filled_pixels = trimmed_skin = trimmed_white = 0
    for y in range(y0, y1):
        row = y * width
        for x in range(x0, x1):
            if not in_any_poly(x, y, garment_polys) or in_any_poly(x, y, exclusion_polys):
                continue
            hand_or_arm_window = (
                in_ellipse(x, y, 0.390, 0.615, 0.055, 0.070)
                or in_ellipse(x, y, 0.336, 0.748, 0.060, 0.155)
                or in_ellipse(x, y, 0.705, 0.585, 0.065, 0.065)
                or in_ellipse(x, y, 0.722, 0.735, 0.055, 0.145)
            )
            neck_window = (
                0.390 * width <= x <= 0.615 * width
                and 0.350 * height <= y <= 0.535 * height
            )
            i = (row + x) * 3
            r, g, b = rgb[i], rgb[i + 1], rgb[i + 2]
            bright = (r + g + b) // 3
            spread = max(r, g, b) - min(r, g, b)
            is_red_trim = r > 105 and g < 92 and b < 92 and r > g + 28
            if skin_score(r, g, b) and not profile_green_score(r, g, b, profile) and not is_red_trim:
                trimmed_skin += 1
                continue
            if y > int(height * 0.910) and bright > 112 and spread < 88 and not profile_green_score(r, g, b, profile):
                trimmed_white += 1
                continue
            mask[row + x] = 255
            filled_pixels += 1

    # Keep badge/number/trim pixels because they are physically on the garment,
    # but lightly erode edges so the mask does not spill onto nearby skin/fondo.
    eroded = bytearray(mask)
    for y in range(y0 + 1, y1 - 1):
        for x in range(x0 + 1, x1 - 1):
            idx = y * width + x
            if not mask[idx]:
                continue
            neighbors = 0
            for yy in (y - 1, y, y + 1):
                base = yy * width
                for xx in (x - 1, x, x + 1):
                    if mask[base + xx]:
                        neighbors += 1
            if neighbors <= 3:
                eroded[idx] = 0

    feathered = bytearray(eroded)
    for y in range(y0 + 1, y1 - 1):
        for x in range(x0 + 1, x1 - 1):
            idx = y * width + x
            if eroded[idx]:
                continue
            neighbors = 0
            for yy in (y - 1, y, y + 1):
                base = yy * width
                for xx in (x - 1, x, x + 1):
                    if eroded[base + xx]:
                        neighbors += 1
            if neighbors >= 4:
                feathered[idx] = 96

    profile["v7_method"] = "manual_anatomical_polygons_with_skin_and_shorts_trimming"
    profile["filled_anatomical_pixels"] = filled_pixels
    profile["trimmed_skin_pixels"] = trimmed_skin
    profile["trimmed_white_short_pixels"] = trimmed_white
    return feathered, profile


def write_profile(path: str, profile: dict[str, object], mask: bytearray) -> None:
    lines = [
        "v7 deterministic anatomical jersey mask profile",
        f"safe_sample_rect_xyxy={profile['sample_rect']}",
        f"sample_count={profile['sample_count']}",
        f"kept_green_components={profile.get('kept_green_components', 'unknown')}",
        "centroids_rgb:",
    ]
    centroids = profile["centroids"]
    radii = profile["radii"]
    ranges = profile["ranges"]
    hsl_ranges = profile["hsl_ranges"]
    assert isinstance(centroids, dict)
    assert isinstance(radii, dict)
    assert isinstance(ranges, dict)
    assert isinstance(hsl_ranges, dict)
    for name in ("dark", "mid", "light"):
        lines.append(
            f"  {name}: centroid={centroids[name]} radius={radii[name]} "
            f"rgb_ranges={ranges[name]} hsl_approx_ranges={hsl_ranges[name]}"
        )
    solid = sum(1 for a in mask if a == 255)
    feather = sum(1 for a in mask if 0 < a < 255)
    lines.append(f"mask_pixels_solid={solid}")
    lines.append(f"mask_pixels_feather={feather}")
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def grunge_value(x: int, y: int) -> int:
    n = (x * 374761393 + y * 668265263 + 0x5EED123) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return (n ^ (n >> 16)) & 255


def soft_noise(x: int, y: int) -> int:
    total = 0
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            total += grunge_value(x + ox * 3, y + oy * 3)
    return total // 9


def scratch_value(x: int, y: int) -> int:
    diag_a = (x * 3 + y * 5) % 149
    diag_b = (x * 7 - y * 2) % 211
    seed_a = grunge_value((x + y) // 37, y // 29)
    seed_b = grunge_value(x // 41, (x - y) // 43)
    if diag_a in (0, 1) and seed_a > 218:
        return -22
    if diag_b == 0 and seed_b > 230:
        return 18
    return 0


def compose(width: int, height: int, rgb: bytearray, mask: bytearray) -> bytearray:
    out = bytearray(width * height * 3)
    for y in range(height):
        for x in range(width):
            i = (y * width + x) * 3
            r, g, b = rgb[i], rgb[i + 1], rgb[i + 2]
            gray = int(0.2126 * r + 0.7152 * g + 0.0722 * b)
            gray = clamp(int((gray - 118) * 1.34 + 128))

            noise = grunge_value(x, y)
            dust = soft_noise(x, y)
            gray = clamp(gray + (noise - 128) // 12 + (dust - 128) // 18)
            if noise < 10:
                gray = clamp(int(gray * 0.72))
            elif noise > 248:
                gray = clamp(gray + 22)
            gray = clamp(gray + scratch_value(x, y))

            alpha = mask[y * width + x]
            if alpha:
                # Original color dominates. Only a tiny deterministic scuff is
                # blended in so jersey identity, lettering, and badge pixels stay
                # sourced from the photograph.
                jersey_noise = (noise - 128) // 26
                cr = clamp(r + jersey_noise)
                cg = clamp(g + jersey_noise)
                cb = clamp(b + jersey_noise)
                inv = 255 - alpha
                out[i] = (cr * alpha + gray * inv) // 255
                out[i + 1] = (cg * alpha + gray * inv) // 255
                out[i + 2] = (cb * alpha + gray * inv) // 255
            else:
                out[i] = out[i + 1] = out[i + 2] = gray
    return out


def mask_to_rgb(mask: bytearray) -> bytearray:
    out = bytearray(len(mask) * 3)
    for i, alpha in enumerate(mask):
        j = i * 3
        out[j] = out[j + 1] = out[j + 2] = alpha
    return out


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument(
        "--center-x-ratio",
        type=float,
        default=0.622,
        help="horizontal crop center as a fraction of original width",
    )
    parser.add_argument(
        "--mask-output",
        help="optional path for a diagnostic jersey mask PNG",
    )
    parser.add_argument(
        "--profile-output",
        help="optional path for a diagnostic jersey color profile text file",
    )
    args = parser.parse_args(argv)

    width, height, rgb = read_png_rgb(args.input)
    cw, ch, cropped = crop_square(width, height, rgb, args.center_x_ratio)
    mask, profile = build_jersey_mask(cw, ch, cropped)
    result = compose(cw, ch, cropped, mask)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    write_png_rgb(args.output, cw, ch, result)
    if args.mask_output:
        os.makedirs(os.path.dirname(os.path.abspath(args.mask_output)), exist_ok=True)
        write_png_rgb(args.mask_output, cw, ch, mask_to_rgb(mask))
    if args.profile_output:
        write_profile(args.profile_output, profile, mask)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
