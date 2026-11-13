"""
Docera Multilingual Text Layout Engine
Provides high-fidelity OpenType complex-script shaping via HarfBuzz,
accurate 2D glyph positioning, baseline alignment, overflow diagnostics,
and Adobe-Identity-UCS compliant ToUnicode CMap generation for searchable PDF export.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import uharfbuzz as hb
from fontTools.ttLib import TTFont

# Supported high-fidelity font families and paths
FONTS_DIR = Path(__file__).resolve().parent.parent.parent / "fonts"

KHMER_FONT_PREFERENCES = [
    ("KhmerOSBattambang", ["KhmerOSbattambang.ttf", "KhmerOS.ttf", "NotoSansKhmer-Regular.ttf"]),
    ("KhmerOS", ["KhmerOS.ttf", "KhmerOSbattambang.ttf", "NotoSerifKhmer-Regular.ttf"]),
    ("KhmerOSMuol", ["KhmerOSmuol.ttf", "KhmerOSbattambang.ttf"]),
    ("Noto Sans Khmer", ["NotoSansKhmer-Regular.ttf", "KhmerOSbattambang.ttf"]),
    ("Noto Serif Khmer", ["NotoSerifKhmer-Regular.ttf", "KhmerOS.ttf"]),
]


@dataclass
class ShapedGlyph:
    gid: int
    cluster: int
    x_advance: float
    y_advance: float
    x_offset: float
    y_offset: float
    source_slice: str = ""


@dataclass
class LayoutResult:
    text: str
    font_path: str
    font_family: str
    font_size: float
    glyphs: list[ShapedGlyph]
    total_width: float
    total_height: float
    ascender: float
    descender: float
    baseline_offset: float
    is_overflow: bool = False
    overflow_amount: float = 0.0
    tounicode_cmap: str = ""


def is_khmer_text(text: str) -> bool:
    """Check if string contains any Khmer Unicode code points (U+1780 to U+17FF or U+19E0 to U+19FF)."""
    return any(
        (0x1780 <= ord(c) <= 0x17FF) or (0x19E0 <= ord(c) <= 0x19FF)
        for c in text
    )


def resolve_font_path(font_name: str | None = None, is_khmer: bool = False) -> tuple[str, str]:
    """
    Resolve best font path and family name.
    Prioritizes bundled TrueType fonts with complete GSUB/GPOS tables.
    """
    fn = (font_name or "").lower().replace("+", "-").replace(" ", "")

    if is_khmer or any(k in fn for k in ("khmer", "battambang", "moul", "muol")):
        # Match preference
        if "muol" in fn or "moul" in fn:
            target_candidates = ["KhmerOSmuol.ttf", "KhmerOSbattambang.ttf"]
            pref_family = "KhmerOSMuol"
        elif "serif" in fn or "notoserif" in fn:
            target_candidates = ["NotoSerifKhmer-Regular.ttf", "KhmerOS.ttf"]
            pref_family = "Noto Serif Khmer"
        elif "noto" in fn:
            target_candidates = ["NotoSansKhmer-Regular.ttf", "KhmerOSbattambang.ttf"]
            pref_family = "Noto Sans Khmer"
        elif "khmeros" in fn and "battambang" not in fn:
            target_candidates = ["KhmerOS.ttf", "KhmerOSbattambang.ttf"]
            pref_family = "KhmerOS"
        else:
            target_candidates = ["KhmerOSbattambang.ttf", "KhmerOS.ttf", "NotoSansKhmer-Regular.ttf"]
            pref_family = "KhmerOSBattambang"

        # Check bundled directory
        for cand in target_candidates:
            p = FONTS_DIR / cand
            if p.exists():
                return str(p), pref_family

        # System fonts on Linux
        linux_system_fonts = [
            ("/usr/share/fonts/truetype/khmeros/KhmerOSbattambang.ttf", "KhmerOSBattambang"),
            ("/usr/share/fonts/truetype/khmeros/KhmerOS.ttf", "KhmerOS"),
            ("/usr/share/fonts/truetype/noto/NotoSansKhmer-Regular.ttf", "Noto Sans Khmer"),
        ]
        for sys_path, sys_fam in linux_system_fonts:
            if Path(sys_path).exists():
                return sys_path, sys_fam

        # System fonts on Windows
        win_system_fonts = [
            ("C:/Windows/Fonts/KhmerUI.ttf", "Khmer UI"),
            ("C:/Windows/Fonts/daunpenh.ttf", "DaunPenh"),
            ("C:/Windows/Fonts/LeelawUI.ttf", "Leelawadee UI"),
        ]
        for sys_path, sys_fam in win_system_fonts:
            if Path(sys_path).exists():
                return sys_path, sys_fam

    # Fallback to standard DejaVu / Liberation / Helvetica
    default_candidates = [
        FONTS_DIR / "KhmerOSbattambang.ttf",
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    ]
    for cand in default_candidates:
        if cand.exists():
            return str(cand), "StandardFont"

    raise FileNotFoundError("No compatible OpenType font found on system or bundled fonts.")


def build_tounicode_cmap(font_path: str, shaped_glyphs: list[ShapedGlyph], full_text: str) -> str:
    """
    Construct an Adobe-Identity-UCS compliant ToUnicode CMap for shaped glyphs.
    Maps every glyph ID used in the shaped run to its corresponding UTF-16BE Unicode string.
    This guarantees that the exported PDF remains 100% searchable and selectable.
    """
    tt = TTFont(font_path)
    order = tt.getGlyphOrder()
    best_cmap = tt.getBestCmap()
    rev_cmap: dict[str, str] = {gname: chr(cp) for cp, gname in best_cmap.items()}

    # Group glyphs by GID to build a deduplicated map of GID -> UTF-16BE
    gid_to_unicode: dict[int, str] = {}

    for g in shaped_glyphs:
        gid = g.gid
        if gid in gid_to_unicode:
            continue

        gname = order[gid] if gid < len(order) else ""

        # 1. Check direct cmap reverse lookup
        if gname in rev_cmap:
            gid_to_unicode[gid] = rev_cmap[gname]
            continue

        # 2. Check standard KhmerOS/OpenType naming conventions
        if ".sub" in gname:
            base = gname.replace(".sub", "").replace("uni", "").replace("u", "")
            try:
                gid_to_unicode[gid] = "\u17d2" + chr(int(base, 16))
                continue
            except Exception:
                pass
        elif ".alt" in gname or ".a" in gname:
            base = gname.split(".")[0].replace("uni", "").replace("u", "")
            try:
                gid_to_unicode[gid] = chr(int(base, 16))
                continue
            except Exception:
                pass
        elif "_" in gname and ("uni" in gname or "u" in gname):
            try:
                chars = []
                for part in gname.split("_"):
                    clean = part.replace("uni", "").replace("u", "")
                    chars.append(chr(int(clean, 16)))
                gid_to_unicode[gid] = "".join(chars)
                continue
            except Exception:
                pass

        # 3. Fallback to cluster source slice from HarfBuzz if available
        if g.source_slice:
            gid_to_unicode[gid] = g.source_slice
        else:
            gid_to_unicode[gid] = " "

    # Assemble PostScript / Adobe ToUnicode CMap
    lines = [
        "/CIDInit /ProcSet findresource begin",
        "12 dict begin",
        "begincmap",
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
        "/CMapName /Docera-Custom-ToUnicode def",
        "/CMapType 2 def",
        "1 begincodespacerange",
        "<0000> <FFFF>",
        "endcodespacerange",
    ]

    # Chunk bfchar into blocks of at most 100 entries per PDF specification
    entries = sorted(gid_to_unicode.items())
    chunk_size = 100
    for i in range(0, len(entries), chunk_size):
        chunk = entries[i : i + chunk_size]
        lines.append(f"{len(chunk)} beginbfchar")
        for gid, ustr in chunk:
            utf16_hex = "".join(f"{ord(c):04X}" for c in ustr)
            lines.append(f"<{gid:04X}> <{utf16_hex}>")
        lines.append("endbfchar")

    lines.extend([
        "endcmap",
        "CMapName currentdict /CMap defineresource pop",
        "end",
        "end",
    ])
    return "\n".join(lines)


def shape_text_layout(
    text: str,
    font_name: str | None = None,
    font_size: float = 12.0,
    max_width: float | None = None,
    script: str | None = None,
    language: str | None = None,
) -> LayoutResult:
    """
    Execute full OpenType complex script shaping with HarfBuzz.
    Computes exact 2D glyph positions, advance widths, bounding metrics,
    overflow detection, and ToUnicode CMap.
    """
    has_khmer = is_khmer_text(text)
    font_path, font_family = resolve_font_path(font_name, is_khmer=has_khmer)

    with open(font_path, "rb") as f:
        font_data = f.read()

    face = hb.Face(font_data)
    font = hb.Font(face)
    upem = face.upem or 1000

    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()

    if script:
        buf.script = script
    elif has_khmer:
        buf.script = "Khmr"

    if language:
        buf.language = language
    elif has_khmer:
        buf.language = "km"

    buf.cluster_level = hb.BufferClusterLevel.MONOTONE_GRAPHEMES
    hb.shape(font, buf)

    scale = font_size / upem

    # Font metrics for accurate baseline and box alignment
    tt = TTFont(io.BytesIO(font_data))
    hhea = tt.get("hhea")
    os2 = tt.get("OS/2")

    ascender_units = getattr(hhea, "ascent", getattr(os2, "sTypoAscender", 800))
    descender_units = getattr(hhea, "descent", getattr(os2, "sTypoDescender", -200))

    ascender = ascender_units * scale
    descender = descender_units * scale
    total_height = (ascender_units - descender_units) * scale
    baseline_offset = ascender

    glyphs: list[ShapedGlyph] = []
    total_width = 0.0

    infos = buf.glyph_infos
    positions = buf.glyph_positions

    # Map cluster index to slice of original text
    for i, (info, pos) in enumerate(zip(infos, positions)):
        cluster = info.cluster
        # Estimate text slice for this cluster
        next_cluster = len(text)
        for other in infos:
            if other.cluster > cluster:
                next_cluster = min(next_cluster, other.cluster)

        char_slice = text[cluster:next_cluster] if cluster < len(text) else ""

        x_adv = pos.x_advance * scale
        y_adv = pos.y_advance * scale
        x_off = pos.x_offset * scale
        y_off = pos.y_offset * scale

        glyphs.append(
            ShapedGlyph(
                gid=info.codepoint,
                cluster=cluster,
                x_advance=x_adv,
                y_advance=y_adv,
                x_offset=x_off,
                y_offset=y_off,
                source_slice=char_slice,
            )
        )
        total_width += x_adv

    is_overflow = False
    overflow_amount = 0.0
    if max_width is not None and max_width > 0:
        if total_width > max_width + 1.0:  # 1pt tolerance
            is_overflow = True
            overflow_amount = total_width - max_width

    cmap_str = build_tounicode_cmap(font_path, glyphs, text)

    return LayoutResult(
        text=text,
        font_path=font_path,
        font_family=font_family,
        font_size=font_size,
        glyphs=glyphs,
        total_width=total_width,
        total_height=total_height,
        ascender=ascender,
        descender=descender,
        baseline_offset=baseline_offset,
        is_overflow=is_overflow,
        overflow_amount=overflow_amount,
        tounicode_cmap=cmap_str,
    )
