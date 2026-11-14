"""
Khmer Unicode Normalization & Legacy Visual Order Repair Service
Mirrors frontend khmerNormalizer.ts for backend HarfBuzz shaping fidelity.
"""
import re
import unicodedata

LEGACY_REPLACEMENTS = [
    # Specific compound words
    (re.compile(r"គប្រើប្បាស់"), "ប្រើប្រាស់"),
    (re.compile(r"គប្រើ"), "ប្រើ"),
    (re.compile(r"ប្បាស់"), "ប្រាស់"),
    (re.compile(r"គប្កាយ"), "ក្រោយ"),
    (re.compile(r"គនេះ"), "នេះ"),
    (re.compile(r"គតើ"), "តើ"),
    (re.compile(r"គោក"), "លោក"),
    (re.compile(r"គពេល"), "ពេល"),
    (re.compile(r"គលើ"), "លើ"),
    (re.compile(r"គរៀន"), "រៀន"),
    (re.compile(r"ដផ្អក"), "ផ្អែក"),
    (re.compile(r"ឆ្្ុំ"), "ឆ្នាំ"),

    # Double subscript coengs
    (re.compile(r"\u17D2\u17D2"), "\u17D2"),

    # Visual prefix គ
    (re.compile(r"គ([ក-អ])ើ"), r"\1ើ"),
    (re.compile(r"គ([ក-អ])(េ[ះ]?|ោ|ៅ)"), r"\1\2"),
    (re.compile(r"គ([ក-អ])(្រ|្ល|្យ|្ន|្ម|្ង)"), r"\1\2"),

    # Visual prefix ដ
    (re.compile(r"ដ([ក-អ])្([ក-អ])ក"), r"\1្\2ែក"),

    # Common institutional vocabulary
    (re.compile(r"ប្ទព្យ"), "ទ្រព្យ"),
    (re.compile(r"ប្បាក់"), "ប្រាក់"),
    (re.compile(r"ររស់"), "របស់"),
    (re.compile(r"កនញង"), "ក្នុង"),
    (re.compile(r"រគញ្ញើ"), "បញ្ញើ"),
    (re.compile(r"រងាហ្ញ"), "បង្ហាញ"),
    (re.compile(r"វិភារ"), "វិភាគ"),
    (re.compile(r"ទិនន័យ"), "ទិន្នន័យ"),
    (re.compile(r"ហិរញ្ញវតថញ"), "ហិរញ្ញវត្ថុ"),
    (re.compile(r"អនុាសន៍"), "អនុសាសន៍"),
    (re.compile(r"ប្រសិទធភាព"), "ប្រសិទ្ធភាព"),
    (re.compile(r"ោ ្ងដូច្"), "យ៉ាងដូចម្តេច"),
]


def normalize_khmer_unicode(text: str) -> str:
    """Normalize Khmer text to canonical Unicode NFC and clean split vowels."""
    if not text:
        return text

    norm = unicodedata.normalize("NFC", text)

    # Strip errant whitespace before combining vowel marks or diacritics (e.g. 'សុ ី' -> 'ស៊ី')
    norm = re.sub(r"\s+([\u17B6-\u17D3])", r"\1", norm)

    # Fix accidental double/misplaced vowel combinations: u (U+17BB) + ii (U+17B8) -> ii (U+17B8)
    norm = norm.replace("\u17BB\u17B8", "\u17B8")
    norm = norm.replace("\u17B8\u17BB", "\u17B8")

    # De-duplicate coengs
    norm = re.sub(r"\u17D2{2,}", "\u17D2", norm)

    # Split vowels
    norm = norm.replace("\u17C1\u17B6", "\u17C4")  # ោ
    norm = norm.replace("\u17C1\u17B8", "\u17BE")  # ើ
    norm = norm.replace("\u17C1\u17BE", "\u17BE")
    norm = norm.replace("\u17C1\u17C5", "\u17C5")  # ៅ

    return norm


def repair_legacy_khmer(text: str) -> str:
    """Repair Limon/ABC visual keyboard mapping artifacts into standard Unicode."""
    if not text:
        return text

    result = text
    for pattern, replacement in LEGACY_REPLACEMENTS:
        result = pattern.sub(replacement, result)

    return normalize_khmer_unicode(result)
