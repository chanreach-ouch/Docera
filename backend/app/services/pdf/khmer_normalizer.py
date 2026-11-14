"""
Khmer Unicode Normalization & Legacy Visual Order Repair Service
Mirrors frontend khmerNormalizer.ts for backend HarfBuzz shaping fidelity.
"""
import re
import unicodedata

LEGACY_REPLACEMENTS = [
    # 1. Exact compound words & vocabulary from Cambodian documents
    (re.compile(r"គយើងខ្ញុំ"), "យើងខ្ញុំ"),
    (re.compile(r"គយើង"), "យើង"),
    (re.compile(r"គលោក|គោក"), "លោក"),
    (re.compile(r"ជុំនាន់"), "ជំនាន់"),
    (re.compile(r"ឆ្្ុំណា"), "ឆ្នាំណា"),
    (re.compile(r"ឆ្្ុំ"), "ឆ្នាំ"),
    (re.compile(r"ប្ររ់ប្រង"), "គ្រប់គ្រង"),
    (re.compile(r"រណគនយ្យ"), "គណនេយ្យ"),
    (re.compile(r"ហិរញ្ញវតថញ"), "ហិរញ្ញវត្ថុ"),
    (re.compile(r"កនញង"), "ក្នុង"),
    (re.compile(r"ររិរទ"), "បរិបទ"),
    (re.compile(r"សិក្ាគនេះ"), "សិក្សានេះ"),
    (re.compile(r"សិក្ា"), "សិក្សា"),
    (re.compile(r"ប្ាវប្ជាវ"), "ស្រាវជ្រាវ"),
    (re.compile(r"តប្មូវការ"), "តម្រូវការ"),
    (re.compile(r"អរ់រំ"), "អប់រំ"),
    (re.compile(r"គរៀរច្ុំ"), "រៀបចំ"),
    (re.compile(r"ទរៀបចំ"), "រៀបចំ"),
    (re.compile(r"ារណា"), "សារណា"),
    (re.compile(r"សតីអុំពី"), "ស្ដីអំពី"),
    (re.compile(r"វិភារ"), "វិភាគ"),
    (re.compile(r"កិតតិយស"), "កិត្តិយស"),
    (re.compile(r"គសនើសុុំ"), "ស្នើសុំ"),
    (re.compile(r"គោកប្រធានាខា"), "លោកប្រធានសាខា"),
    (re.compile(r"ប្រធានាខា"), "ប្រធានសាខា"),
    (re.compile(r"ច្គមលើយ"), "ចម្លើយ"),
    (re.compile(r"សុំណួរ"), "សំណួរ"),
    (re.compile(r"ដដល"), "ដែល"),
    (re.compile(r"ខាងគប្កាម"), "ខាងក្រោម"),
    (re.compile(r"គប្កាយ|គប្កាម"), "ក្រោយ"),
    (re.compile(r"គនេះ"), "នេះ"),
    (re.compile(r"គដើម្បី"), "ដើម្បី"),
    (re.compile(r"គប្រើប្បាស់"), "ប្រើប្រាស់"),
    (re.compile(r"គប្រើ"), "ប្រើ"),
    (re.compile(r"ដដក"), "ដែក"),
    (re.compile(r"ឯកសារគោង"), "ឯកសារយោង"),
    (re.compile(r"គោង"), "យោង"),
    (re.compile(r"ដត"), "តែ"),
    (re.compile(r"តប្មូវ"), "តម្រូវ"),
    (re.compile(r"ដលលង"), "ថ្លែង"),
    (re.compile(r"អុំណររុណ"), "អំណរគុណ"),
    (re.compile(r"ច្ុំគ\s*េះ"), "ចំពោះ"),
    (re.compile(r"ក[ដត]ីអនុគប្\s*ោ\s*េះ"), "ក្ដីអនុគ្រោះ"),
    (re.compile(r"អនុគប្\s*ោ\s*េះ"), "អនុគ្រោះ"),
    (re.compile(r"គប្\s*ោ\s*េះ"), "គ្រោះ"),
    (re.compile(r"ក[ដត]ី"), "ក្ដី"),
    (re.compile(r"លអ(?=[\s.,!?]|$)"), "ល្អ"),
    (re.compile(r"លអៗ"), "ល្អៗ"),
    (re.compile(r"គពលគវោ"), "ពេលវេលា"),
    (re.compile(r"តនមល"), "តម្លៃ"),
    (re.compile(r"ររស់"), "របស់"),
    (re.compile(r"អនុាសន៍"), "អនុសាសន៍"),
    (re.compile(r"ោុំប្ទ"), "គាំទ្រ"),
    (re.compile(r"ដុំគណើរការ"), "ដំណើរការ"),
    (re.compile(r"ផ្សែងយល់"), "ស្វែងយល់"),
    (re.compile(r"ផ្សែង"), "ស្វែង"),
    (re.compile(r"ធនាគា\b"), "ធនាគារ"),
    (re.compile(r"ហ្\s*ែ\s*ីលីព|ហ្ែីលីព|ហវីលីព"), "ហ្វឺលីព"),
    (re.compile(r"ហ្\s*ែ\s*ី|ហ្ែី"), "ហ្វឺ"),
    (re.compile(r"ហ្ិរញ្ញវត្ថុ"), "ហិរញ្ញវត្ថុ"),
    (re.compile(r"ភី?អិលសុ[\s\u17BB\u17B8\u17CA]*"), "ភីអិលស៊ី"),
    (re.compile(r"ភី?អិលស[ី៊ី]+"), "ភីអិលស៊ី"),
    (re.compile(r"គតើ"), "តើ"),
    (re.compile(r"ធនាោរ"), "ធនាគារ"),
    (re.compile(r"ប្តូវបាន"), "ត្រូវបាន"),
    (re.compile(r"ប្តូវ"), "ត្រូវ"),
    (re.compile(r"រគងកើត"), "បង្កើត"),
    (re.compile(r"គ ើង|គឡើង"), "ឡើង"),
    (re.compile(r"គៅ"), "ទៅ"),
    (re.compile(r"ច្កខញវិស័យ"), "ចក្ខុវិស័យ"),
    (re.compile(r"គរសកកមម"), "បេសកកម្ម"),
    (re.compile(r"អវីខលេះ"), "អ្វីខ្លះ"),
    (re.compile(r"គហើយ"), "ហើយ"),
    (re.compile(r"យុទធាស្តសត"), "យុទ្ធសាស្ត្រ"),
    (re.compile(r"យុទធ"), "យុទ្ធ"),
    (re.compile(r"ាស្តសត|ស្តសត"), "សាស្ត្រ"),
    (re.compile(r"ោ\s*្ងដូច្គមតច្|ោ\s*្ងដូច្|ដូច្គមតច្"), "យ៉ាងដូចម្ដេច"),
    (re.compile(r"ដូច្"), "ដូច"),
    (re.compile(r"សគប្មច្"), "សម្រេច"),
    (re.compile(r"ទុំងគនាេះ"), "ទាំងនោះ"),
    (re.compile(r"ផ្ល្កសញ្ញ្រ|ផ្ល្កសញ្ញា"), "ផ្លាកសញ្ញា"),
    (re.compile(r"អតថន័យ"), "អត្ថន័យ"),
    (re.compile(r"ប្រភពគដើម"), "ប្រភពដើម"),
    (re.compile(r"រច្នាសមព័នធ"), "រចនាសម្ព័ន្ធ"),
    (re.compile(r"ចាត់តាុំង"), "ចាត់តាំង"),
    (re.compile(r"រុរគលិក"), "បុគ្គលិក"),
    (re.compile(r"រច្ចញរ្បនន"), "បច្ចុប្បន្ន"),
    (re.compile(r"ផ្លិតផ្ល"), "ផលិតផល"),
    (re.compile(r"គសវាកមម"), "សេវាកម្ម"),
    (re.compile(r"សប្មារ់"), "សម្រាប់"),
    (re.compile(r"អតិលិជន"), "អតិថិជន"),
    (re.compile(r"រិទរញ្ជី"), "បិទបញ្ជី"),
    (re.compile(r"កុំណត់"), "កំណត់"),
    (re.compile(r"ដររណា"), "បែបណា"),
    (re.compile(r"ប្រចាុំ"), "ប្រចាំ"),
    (re.compile(r"ប្តីមាស"), "ត្រីមាស"),
    (re.compile(r"សមាសធាតុ"), "សមាសធាតុ"),
    (re.compile(r"សុំខាន់"), "សំខាន់"),
    (re.compile(r"ប្បាក់"), "ប្រាក់"),
    (re.compile(r"ច្ុំគណញ"), "ចំណេញ"),
    (re.compile(r"ដញកដាច្់"), "ចែកដាច់"),
    (re.compile(r"រគវៀង"), "រវាង"),
    (re.compile(r"ច្ុំណូល"), "ចំណូល"),
    (re.compile(r"គដាយ"), "ដោយ"),
    (re.compile(r"ដផ្អក"), "ផ្អែក"),
    (re.compile(r"វិធីាស្តសត"), "វិធីសាស្ត្រ"),
    (re.compile(r"ជុំហាន"), "ជំហាន"),
    (re.compile(r"ដតមួយ"), "តែមួយ"),
    (re.compile(r"គប្ច្ើន"), "ច្រើន"),
    (re.compile(r"ដញក"), "ចែក"),
    (re.compile(r"ប្ទព្យ"), "ទ្រព្យ"),
    (re.compile(r"ខលី"), "ខ្លី"),
    (re.compile(r"ដវង"), "វែង"),
    (re.compile(r"រុំណុល"), "បំណុល"),
    (re.compile(r"ដដរឬគទ"), "ដែរឬទេ"),
    (re.compile(r"គទ\b"), "ទេ"),
    (re.compile(r"គហតុអវី"), "ហេតុអ្វី"),
    (re.compile(r"លុំហូរាច្់ប្បាក់"), "លំហូរសាច់ប្រាក់"),
    (re.compile(r"សកមមភាព"), "សកម្មភាព"),
    (re.compile(r"ប្រតិរតតិការ"), "ប្រតិបត្តិការ"),
    (re.compile(r"គប្ជើសគរើស"), "ជ្រើសរើស"),
    (re.compile(r"ផ្ទ្ល់"), "ផ្ទាល់"),
    (re.compile(r"ប្រគោល"), "ប្រយោល"),
    (re.compile(r"ដខ្សរគដក"), "ខ្សែដេក"),
    (re.compile(r"វាស់ដវង"), "វាស់វែង"),
    (re.compile(r"រើកច្គប្មើន"), "រីកចម្រើន"),
    (re.compile(r"លយច្ុេះ"), "ថយចុះ"),
    (re.compile(r"រគញ្ញើ"), "បញ្ញើ"),
    (re.compile(r"ច្ុងគប្កាយ"), "ចុងក្រោយ"),
    (re.compile(r"ដខ្សរឈរ"), "ខ្សែឈរ"),
    (re.compile(r"ឆលញេះរញ្្្ុំង"), "ឆ្លុះបញ្ចាំង"),
    (re.compile(r"សមាសភារ"), "សមាសភាព"),
    (re.compile(r"ជាងគរ"), "ជាងគេ"),
    (re.compile(r"ច្ុំណាយ"), "ចំណាយ"),
    (re.compile(r"គោងតាម"), "យោងតាម"),
    (re.compile(r"ឬាច្់ប្បាក់"), "សាច់ប្រាក់"),
    (re.compile(r"ងាយប្សួល"), "ងាយស្រួល"),
    (re.compile(r"សមតថភាព"), "សមត្ថភាព"),
    (re.compile(r"ទូទត់"), "ទូទាត់"),
    (re.compile(r"គឆលើយតរ"), "ឆ្លើយតប"),
    (re.compile(r"ដកប្បាក់"), "ដកប្រាក់"),
    (re.compile(r"កប្មិត"), "កម្រិត"),
    (re.compile(r"គដើមទុន"), "ដើមទុន"),
    (re.compile(r"អរ្បររមា"), "អប្បបរមា"),
    (re.compile(r"រវិវតត"), "ការវិវត្ត"),
    (re.compile(r"សថិត"), "ស្ថិត"),
    (re.compile(r"សុវតថិភាព"), "សុវត្ថិភាព"),
    (re.compile(r"រទរ្បញ្ញតតិ"), "បទប្បញ្ញត្តិ"),
    (re.compile(r"កមពញជា"), "កម្ពុជា"),
    (re.compile(r"អប្តា"), "អត្រា"),
    (re.compile(r"ផ្លច្ុំគណញ"), "ផលចំណេញ"),
    (re.compile(r"រងាហ្ញ"), "បង្ហាញ"),
    (re.compile(r"រុណភាព"), "គុណភាព"),
    (re.compile(r"កមចីខូច្"), "កម្ចីខូច"),
    (re.compile(r"កុំ\s*ញង"), "កំឡុង"),
    (re.compile(r"កុំពុង"), "កំពុង"),
    (re.compile(r"អនក"), "អ្នក"),
    (re.compile(r"លទធផ្ល"), "លទ្ធផល"),
    (re.compile(r"រនលឹេះ"), "គន្លឹះ"),
    (re.compile(r"ច្ុំណុច្"), "ចំណុច"),
    (re.compile(r"ខាល្ុំង"), "ខ្លាំង"),
    (re.compile(r"គខ្ាយ"), "ខ្សោយ"),
    (re.compile(r"គធវើ"), "ធ្វើ"),
    (re.compile(r"គសច្កតី"), "សេចក្ដី"),
    (re.compile(r"សគប្មច្ច្ិតត"), "សម្រេចចិត្ត"),
    (re.compile(r"ដផ្នការ"), "ផែនការ"),
    (re.compile(r"អាជីវកមម"), "អាជីវកម្ម"),
    (re.compile(r"រនតរនាទ្រ់"), "បន្តបន្ទាប់"),
    (re.compile(r"ភីលីព"), "ហ្វីលីព"),
    (re.compile(r"គោរល់"), "យោបល់"),
    (re.compile(r"រគងកើន"), "បង្កើន"),
    (re.compile(r"ពប្ងីក"), "ពង្រីក"),
    (re.compile(r"ប្រកួតប្រដជង"), "ប្រកួតប្រជែង"),
    (re.compile(r"កាន់ដត"), "កាន់តែ"),
    (re.compile(r"ប្រគសើរ"), "ប្រសើរ"),
    (re.compile(r"ដលមគទៀត"), "ថែមទៀត"),
    (re.compile(r"ប្រសិទធភាព"), "ប្រសិទ្ធភាព"),

    # 2. Visual prefix គ (key 'c' in Limon which represented visual left vowel េ / ើ / ោ)
    (re.compile(r"គ([ក-អ])ើ"), r"\1ើ"),
    (re.compile(r"គ([ក-អ])(េ[ះ]?|ោ|ៅ)"), r"\1\2"),
    (re.compile(r"គ([ក-អ])(្រ|្ល|្យ|្ន|្ម|្ង)"), r"\1\2"),

    # 3. Visual prefix ដ (key 'd' in Limon which represented visual left vowel ែ)
    (re.compile(r"ដ([ក-អ])្([ក-អ])ក"), r"\1្\2ែក"),
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
    norm = re.sub(r"\u17B8{2,}", "\u17B8", norm)
    norm = re.sub(r"\u17BB{2,}", "\u17BB", norm)

    # Repair illegal coeng before upper vowels: \u17D2\u17C2\u17B8 (្ែី) -> \u17D2\u179C\u17BA (្វឺ)
    norm = norm.replace("\u17D2\u17C2\u17B8", "\u17D2\u179C\u17BA")
    norm = norm.replace("\u17D2\u17C2", "\u17D2\u179C\u17C2")
    norm = re.sub(r"\u17D2\s+", "", norm)
    norm = re.sub(r"\u17D2(?=[^\u1780-\u17A2]|$)", "", norm)

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
