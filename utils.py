#!/usr/bin/env python3
"""
Shared helper functions for the Wordle solver.
"""

from __future__ import annotations
import json
import numpy as np
from pathlib import Path

BASE_DIR  = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "cache"


# ---------------------------------------------------------------------------
# 1.  Load cache (pattern matrix + word lists)
# ---------------------------------------------------------------------------

def load_cache():
    """
    Returns
    -------
    pattern : np.ndarray  uint8 [G × S]   feedback codes
    guesses : list[str]                   length G
    solutions : list[str]                 length S
    """
    pattern = np.load(CACHE_DIR / "pattern.npy", mmap_mode="r")
    meta    = json.loads((CACHE_DIR / "meta.json").read_text())
    return pattern, meta["guesses"], meta["solutions"]


# ---------------------------------------------------------------------------
# 2.  Feedback helpers
# ---------------------------------------------------------------------------

def text_to_code(text: str) -> int:
    """
    Convert a 5-character feedback string to the 0-242 integer used inside
    the pattern table.

    Accepts:
        • 'GYBBY'  (G = green, Y = yellow, B/0 = gray)
        • '21010'  (digits 0/1/2)
    """
    text = text.strip().upper().replace(" ", "")
    if len(text) != 5:
        raise ValueError("Feedback must have exactly 5 symbols.")

    trits = []
    for ch in text:
        if ch in "G2":
            trits.append(2)
        elif ch in "Y1":
            trits.append(1)
        elif ch in "B0X.":
            trits.append(0)
        else:
            raise ValueError(f"Bad symbol: {ch!r}")

    # little-endian base-3 → int
    code, power = 0, 1
    for t in trits:
        code += t * power
        power *= 3
    return code


def distinct_letter_count(word: str) -> int:
    return len(set(word))


# ---------------------------------------------------------------------------
# 3.  Pretty printing
# ---------------------------------------------------------------------------

_COLOURS = {2: "\033[1;42m",   # bright green background
            1: "\033[1;43m",   # yellow
            0: "\033[1;47m"}   # white/grey
_RESET  = "\033[0m"


def colourise(word: str, code: int) -> str:
    """Return ANSI-coloured representation of WORD using feedback CODE."""
    out = []
    for _ in range(5):
        code, trit = divmod(code, 3)
        out.append(f"{_COLOURS[trit]} {word[0]} {_RESET}")
        word = word[1:]
    return "".join(out)
