#!/usr/bin/env python3
"""
Add turn numbers to a raw Echo-Uthel conversation export.

Usage: python number_turns.py <input_file> [output_file]

Format handled:
  **You said**:          -> Uthel turn
  **DeepSeek said**:      -> Echo turn (may include > _Thinking: blocks)
  
Reasoning blocks (> _Thinking: ...) are part of the Echo turn that follows.
Turn numbering is sequential across both speakers.
"""

import sys
import re

def number_turns(input_path, output_path=None):
    """Read raw export, prepend turn numbers, write output."""
    
    if output_path is None:
        output_path = input_path.replace('.md', '_numbered.md').replace('.txt', '_numbered.txt')
    
    # Regex to identify turn boundaries
    # Matches **Speaker said**: at the start of a block
    turn_boundary = re.compile(r'^\*\*(You|DeepSeek) said\*\*:', re.MULTILINE)
    
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    output_lines = []
    turn_number = 0
    
    for line in lines:
        # Check if this line starts a new turn
        match = turn_boundary.match(line)
        if match:
            turn_number += 1
            speaker = match.group(1)
            speaker_label = "Uthel" if speaker == "You" else "Echo"
            # Insert turn number before the speaker marker
            output_lines.append(f"[Turn {turn_number}] ({speaker_label}) {line}")
        else:
            # Continuation of current turn or non-turn content
            output_lines.append(line)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(output_lines))
    
    print(f"Turn-numbered archive written to: {output_path}")
    print(f"Total turns: {turn_number}")
    return turn_number

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python number_turns.py <input_file> [output_file]")
        print("Example: python number_turns.py echo_raw_export.md")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    number_turns(input_file, output_file)
