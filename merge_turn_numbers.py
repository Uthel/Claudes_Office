"""
merge_turn_numbers.py
Merges turn numbers from correction_events.txt into confab_events.txt.

correction_events.txt has "Turn position: NNN" for each event.
confab_events.txt has event numbers but turn numbers were culled during pruning.

This script builds a lookup table from correction_events.txt (event number -> turn),
then inserts [TURN: NNN] into each matching event block in confab_events.txt.

Events not found in correction_events.txt get [TURN: NOT_FOUND] for manual lookup.

Usage: python merge_turn_numbers.py <correction_events.txt> <confab_events.txt>
Output: confab_events_with_turns.txt (in same directory as confab_events.txt)
"""

import re
import sys
from pathlib import Path


def parse_correction_turns(content):
    """
    Build a dict of {event_number: turn_position} from correction_events.txt.
    """
    turns = {}
    current_event = None

    for line in content.splitlines():
        # Event header
        m = re.match(r'^## Event (\d+)', line.strip())
        if m:
            current_event = int(m.group(1))
            continue

        # Turn position line
        m = re.match(r'^Turn position:\s*(\d+)', line.strip())
        if m and current_event is not None:
            turns[current_event] = int(m.group(1))

    return turns


def parse_confab_blocks(content):
    """
    Split confab_events.txt into a list of (event_number, block_text) tuples.
    Preserves header lines before the first event block.
    """
    header_lines = []
    blocks = []
    current_num = None
    current_lines = []

    for line in content.splitlines(keepends=True):
        m = re.match(r'^## Event (\d+)', line.strip())
        if m:
            if current_num is not None:
                blocks.append((current_num, "".join(current_lines)))
            elif current_lines:
                header_lines = current_lines[:]
            current_num = int(m.group(1))
            current_lines = [line]
        else:
            current_lines.append(line)

    # Last block
    if current_num is not None:
        blocks.append((current_num, "".join(current_lines)))

    return header_lines, blocks


def insert_turn(block_text, turn):
    """
    Insert [TURN: NNN] after the [TAG: ...] line in a block.
    If no TAG line found, insert after the ## Event header.
    """
    turn_line = f"[TURN: {turn}]\n"

    # Try to insert after [TAG: ...]
    tag_match = re.search(r'(\[TAG:[^\]]+\]\n?)', block_text)
    if tag_match:
        insert_pos = tag_match.end()
        # Don't insert if already present
        if '[TURN:' not in block_text:
            return block_text[:insert_pos] + turn_line + block_text[insert_pos:]
        return block_text

    # Fallback: insert after ## Event header line
    header_match = re.search(r'(## Event \d+\n?)', block_text)
    if header_match:
        insert_pos = header_match.end()
        if '[TURN:' not in block_text:
            return block_text[:insert_pos] + turn_line + block_text[insert_pos:]

    return block_text


def main():
    if len(sys.argv) < 3:
        print("Usage: python merge_turn_numbers.py <correction_events.txt> <confab_events.txt>")
        sys.exit(1)

    correction_path = Path(sys.argv[1])
    confab_path = Path(sys.argv[2])

    for p in [correction_path, confab_path]:
        if not p.exists():
            print(f"Error: not found: {p}")
            sys.exit(1)

    print(f"Reading correction events: {correction_path}")
    correction_content = correction_path.read_text(encoding="utf-8", errors="replace")
    turn_lookup = parse_correction_turns(correction_content)
    print(f"  Found turn numbers for {len(turn_lookup)} events")

    print(f"Reading confab events: {confab_path}")
    confab_content = confab_path.read_text(encoding="utf-8", errors="replace")
    header_lines, blocks = parse_confab_blocks(confab_content)
    print(f"  Found {len(blocks)} event blocks")

    # Merge
    matched = 0
    not_found = []
    output_blocks = []

    for event_num, block_text in blocks:
        if event_num in turn_lookup:
            turn = turn_lookup[event_num]
            merged = insert_turn(block_text, turn)
            output_blocks.append(merged)
            matched += 1
        else:
            merged = insert_turn(block_text, "NOT_FOUND")
            output_blocks.append(merged)
            not_found.append(event_num)

    print(f"  Matched: {matched}")
    print(f"  Not found: {len(not_found)}")
    if not_found:
        print(f"  Missing event numbers: {not_found}")

    # Write output
    output_path = confab_path.parent / "confab_events_with_turns.txt"
    output_lines = "".join(header_lines)
    output_lines += "\n".join(output_blocks)
    output_path.write_text(output_lines, encoding="utf-8")
    print(f"Written: {output_path}")

    # Summary
    print(f"\n--- SUMMARY ---")
    print(f"Total confab events: {len(blocks)}")
    print(f"Turn numbers inserted: {matched}")
    print(f"NOT_FOUND (manual lookup needed): {len(not_found)}")
    if not_found:
        print(f"Events needing manual turn lookup: {not_found}")


if __name__ == "__main__":
    main()
