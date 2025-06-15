#!/usr/bin/env python3
"""
Pre-compute the Wordle feedback table.

Run once:
    $ python precompute.py
"""

import json
import numpy as np
from pathlib import Path

# ---------------------------------------------------------------------------
# 1.  Locate folders (works on Windows, macOS, Linux)
# ---------------------------------------------------------------------------

BASE_DIR  = Path(__file__).resolve().parent     # folder that holds precompute.py
DATA_DIR  = BASE_DIR / "data"
CACHE_DIR = BASE_DIR / "cache"
CACHE_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# 2.  Load word lists
# ---------------------------------------------------------------------------

solutions = [(DATA_DIR / "solutions.txt").read_text().strip().upper().split()]
guesses   = [(DATA_DIR / "guesses.txt").read_text().strip().upper().split()]

# Flatten the two lists (needed because .split() inside [] produces nested list)
solutions = solutions[0]
guesses   = guesses[0]

S = len(solutions)
G = len(guesses)
print(f"Loaded {S} solutions and {G} allowed guesses.")

# ---------------------------------------------------------------------------
# 3.  Feedback encoder:  (guess, answer) → int 0–242
# ---------------------------------------------------------------------------

def feedback_code(guess: str, answer: str) -> int:
    code      = 0
    power_of3 = 1   # 3⁰, 3¹, …

    answer_letters = list(answer)   # we’ll cross-off matched letters
    colours        = [0] * 5        # 2 = green, 1 = yellow, 0 = gray

    # Pass 1: mark greens
    for i, (g, a) in enumerate(zip(guess, answer)):
        if g == a:
            colours[i] = 2
            answer_letters[i] = None

    # Pass 2: mark yellows
    for i, g in enumerate(guess):
        if colours[i] == 0 and g in answer_letters:
            colours[i] = 1
            answer_letters[answer_letters.index(g)] = None

    # Encode little-endian base-3
    for trit in colours:
        code += trit * power_of3
        power_of3 *= 3

    return code

# ---------------------------------------------------------------------------
# 4.  Build the G × S array
# ---------------------------------------------------------------------------

print("Building pattern matrix …")
pattern = np.empty((G, S), dtype=np.uint8)

for gi, g in enumerate(guesses):
    for si, s in enumerate(solutions):
        pattern[gi, si] = feedback_code(g, s)
    if gi % 1000 == 0:
        print(f"  {gi:>5}/{G} rows done", end="\r")

print("\nSaving …")
np.save(CACHE_DIR / "pattern.npy", pattern, allow_pickle=False)

meta = {
    "solutions": solutions,
    "guesses":   guesses,
    "dtype":     "uint8"
}
(CACHE_DIR / "meta.json").write_text(json.dumps(meta, indent=2))

print("Done ✔  Table is in cache/")
