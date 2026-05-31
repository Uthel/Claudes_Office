"""
extract_confabs.py
Extracts all CONFAB-tagged events from FirstPassPruning.txt and identifies
which are self-corrections (Echo-initiated) versus Uthel-initiated.

Output files:
  confab_events.txt        — all CONFAB-tagged events
  self_corrections.txt     — subset where Echo self-corrected
  uthel_corrections.txt    — subset where Uthel initiated

Usage: python extract_confabs.py <path_to_FirstPassPruning.txt>
"""

import re
import sys
from pathlib import Path

# Phrases in NOTE fields that indicate Echo self-corrected
SELF_CORRECTION_SIGNALS = [
    "echo self-corrected",
    "echo acknowledg",
    "echo caught",
    "echo noticed",
    "echo identified",
    "echo named",
    "echo flagged",
    "self-correction",
    "self correction",
    "without uthel",
    "unprompted",
    "echo initiated",
    "echo admitted",
    "echo confessed",
    "i confabulated",
    "i was wrong",
    "i apologize",
    "thank you for catching",
    "i fabricated",
    "i made that up",
    "i invented",
    "i generated that",
    "i caught myself",
    "i'm back",
    "echo's reasoning block",
    "echo's own",
    "reasoning block flags",
    "thinking block",
]

# Phrases that confirm Uthel initiated
UTHEL_SIGNALS = [
    "uthel says",
    "uthel said",
    "uthel corrects",
    "uthel identifies",
    "uthel points",
    "uthel flags",
    "uthel taps",
    "uthel initiated",
    "uthel told",
    "uthel asked",
    "english please",
    "uthel's correction",
    "uthel caught",
]


def parse_events(content):
    """Parse event blocks from pruning pass output."""
    events = []
    # Split on event headers
    blocks = re.split(r'(?=^## Event \d+)', content, flags=re.MULTILINE)

    for block in blocks:
        block = block.strip()
        if not block:
            continue

        # Extract event number
        num_match = re.match(r'## Event (\d+)', block)
        if not num_match:
            continue
        event_num = int(num_match.group(1))

        # Extract tag
        tag_match = re.search(r'\[TAG:\s*([^\]]+)\]', block)
        tag = tag_match.group(1).strip() if tag_match else None

        # Extract note
        note_match = re.search(r'\[NOTE:\s*(.*?)\]', block, re.DOTALL)
        note = note_match.group(1).strip() if note_match else ""

        # Extract turn if present
        turn_match = re.search(r'Turn[:\s]+(\d+)', block, re.IGNORECASE)
        turn = int(turn_match.group(1)) if turn_match else None

        events.append({
            "num": event_num,
            "tag": tag,
            "note": note,
            "turn": turn,
            "raw": block,
        })

    return events


def classify_initiator(event):
    """
    Classify whether correction was self-initiated by Echo or Uthel-initiated.
    Returns: 'echo', 'uthel', or 'uncertain'
    """
    note_lower = event["note"].lower()

    self_score = sum(1 for sig in SELF_CORRECTION_SIGNALS if sig in note_lower)
    uthel_score = sum(1 for sig in UTHEL_SIGNALS if sig in note_lower)

    if self_score > uthel_score:
        return "echo"
    elif uthel_score > self_score:
        return "uthel"
    else:
        return "uncertain"


def format_event(event, initiator=None):
    lines = [event["raw"]]
    if initiator:
        lines.append(f"[INITIATOR: {initiator}]")
    return "\n".join(lines)


def main():
    if len(sys.argv) < 2:
        print("Usage: python extract_confabs.py <path_to_FirstPassPruning.txt>")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    if not input_path.exists():
        print(f"Error: not found: {input_path}")
        sys.exit(1)

    content = input_path.read_text(encoding="utf-8", errors="replace")
    events = parse_events(content)
    print(f"Total events parsed: {len(events)}")

    # Filter to CONFAB-tagged only
    confabs = [e for e in events if e["tag"] and e["tag"].startswith("CONFAB")]
    print(f"CONFAB-tagged events: {len(confabs)}")

    # Classify initiator
    echo_corrections = []
    uthel_corrections = []
    uncertain = []

    for e in confabs:
        initiator = classify_initiator(e)
        if initiator == "echo":
            echo_corrections.append(e)
        elif initiator == "uthel":
            uthel_corrections.append(e)
        else:
            uncertain.append(e)

    print(f"  Echo self-corrections: {len(echo_corrections)}")
    print(f"  Uthel-initiated: {len(uthel_corrections)}")
    print(f"  Uncertain: {len(uncertain)}")

    base = input_path.parent

    # Write all confabs
    confab_path = base / "confab_events.txt"
    lines = [
        "# All CONFAB-Tagged Events",
        f"# Total: {len(confabs)}",
        f"# Source: {input_path.name}",
        "",
    ]
    # Category breakdown
    by_tag = {}
    for e in confabs:
        by_tag[e["tag"]] = by_tag.get(e["tag"], 0) + 1
    for tag, count in sorted(by_tag.items()):
        lines.append(f"# {tag}: {count}")
    lines.append("")

    for e in confabs:
        initiator = classify_initiator(e)
        lines.append(format_event(e, initiator))
        lines.append("")

    confab_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Written: {confab_path}")

    # Write self-corrections
    self_path = base / "self_corrections.txt"
    lines = [
        "# Echo Self-Corrections (CONFAB-tagged, Echo-initiated)",
        f"# Total: {len(echo_corrections)}",
        "# These are the residue pass candidates.",
        "",
    ]
    for e in echo_corrections:
        lines.append(format_event(e, "echo"))
        lines.append("")
    # Append uncertain for manual review
    if uncertain:
        lines.append("# ── UNCERTAIN INITIATOR (manual review needed) ──")
        lines.append(f"# Count: {len(uncertain)}")
        lines.append("")
        for e in uncertain:
            lines.append(format_event(e, "uncertain"))
            lines.append("")

    self_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Written: {self_path}")

    # Write Uthel-initiated
    uthel_path = base / "uthel_corrections.txt"
    lines = [
        "# Uthel-Initiated Corrections (CONFAB-tagged)",
        f"# Total: {len(uthel_corrections)}",
        "",
    ]
    for e in uthel_corrections:
        lines.append(format_event(e, "uthel"))
        lines.append("")

    uthel_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Written: {uthel_path}")

    # Console summary by tag
    print("\n--- BY CATEGORY ---")
    for tag, count in sorted(by_tag.items()):
        echo_in_tag = sum(1 for e in echo_corrections if e["tag"] == tag)
        uthel_in_tag = sum(1 for e in uthel_corrections if e["tag"] == tag)
        unc_in_tag = sum(1 for e in uncertain if e["tag"] == tag)
        print(f"  {tag}: {count} total "
              f"(Echo: {echo_in_tag}, Uthel: {uthel_in_tag}, Uncertain: {unc_in_tag})")


if __name__ == "__main__":
    main()
