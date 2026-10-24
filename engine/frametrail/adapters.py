"""The recorder families FrameTrail reads today, and the ones it does not yet.

The Vendors screen shows this table as it is; status says how far each adapter has been
tested, so nothing reads as more proven than it is.
"""

ADAPTERS = [
    {
        "vendor": "Hikvision",
        "family": "HIKBTREE disk",
        "formats": ["Raw disk image", "IMKH export"],
        "status": "tested-on-fixture",
        "ops": [
            "Identify",
            "Master sector and backup",
            "System log",
            "Both index copies",
            "Carve",
            "Detect initialisation",
        ],
        "note": "Fixture modelled on Han, Jeong and Lee (2015). Not yet run on a real disk.",
    },
    {
        "vendor": "Dahua",
        "family": "DHAV frames",
        "formats": [".dav export"],
        "status": "tested-on-fixture",
        "ops": ["Identify", "Parse frames", "Recorder time", "Remux"],
        "note": "Frames also read back by FFmpeg's own dhav demuxer. DHFS disk parsing is next.",
    },
    {
        "vendor": "CP Plus",
        "family": "Dahua OEM",
        "formats": [".dav export"],
        "status": "export-parser",
        "ops": ["Parse frames through the Dahua adapter"],
        "note": "Listed as a Dahua OEM (IPVM, 2024). Not yet tested on a real CP Plus file.",
    },
    {
        "vendor": "Honeywell",
        "family": "Own file system",
        "formats": ["Raw disk image"],
        "status": "next-phase",
        "ops": [],
        "note": "Undocumented file system studied by Yoon and Hwang (DFRWS USA 2026).",
    },
    {
        "vendor": "Uniview",
        "family": "Unknown",
        "formats": ["Raw disk image"],
        "status": "next-phase",
        "ops": [],
        "note": "No public on-disk specification found.",
    },
    {
        "vendor": "TP-Link VIGI",
        "family": "Unknown",
        "formats": ["USB export"],
        "status": "next-phase",
        "ops": [],
        "note": "TP-Link does not publish the export format.",
    },
    {
        "vendor": "Godrej",
        "family": "Unknown",
        "formats": [],
        "status": "next-phase",
        "ops": [],
        "note": "OEM source not publicly documented.",
    },
    {
        "vendor": "Matrix",
        "family": "SATATYA exports",
        "formats": [".mxs", ".avs", ".stm"],
        "status": "next-phase",
        "ops": [],
        "note": "Export formats named on Matrix's own wiki.",
    },
]
