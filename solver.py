#!/usr/bin/env python3
"""
Entropy Wordle solver.

Run either in simulation mode
    $ python solver.py --secret CIGAR

or interactive “enter colours yourself” mode
    $ python solver.py

Options
-------
--hard          obey previous clues when choosing test guesses
--secret WORD   play autonomously against SECRET
"""

from __future__ import annotations
import argparse
import sys
import numpy as np
from utils import load_cache, text_to_code, colourise, distinct_letter_count


# ---------------------------------------------------------------------------
# 1.  Command-line arguments
# ---------------------------------------------------------------------------

ap = argparse.ArgumentParser()
ap.add_argument("--hard", action="store_true", help="enforce hard-mode guesses")
ap.add_argument("--secret", metavar="WORD", help="play automatically vs WORD")
args = ap.parse_args()

pattern, GUESS_WORDS, SOL_WORDS = load_cache()
G, S = pattern.shape
print(f"Cache loaded  (guesses {G}  |  solutions {S})")

# fast lookup maps
GUESS_INDEX = {w: i for i, w in enumerate(GUESS_WORDS)}
SOL_INDEX   = {w: i for i, w in enumerate(SOL_WORDS)}

# candidate mask  –  True bit means “still possible”
candidates = np.ones(S, dtype=bool)

# keep track of hard-mode constraints
greens  = [None] * 5             # fixed letters
yellows = [set() for _ in range(5)]
known_excludes = set()

# convenience buffers
all_guess_indices = np.arange(G, dtype=int)

def legal_in_hard_mode(word: str) -> bool:
    """Return True if WORD obeys current green/yellow requirements."""
    if not args.hard:
        return True

    for i, g in enumerate(greens):
        if g and word[i] != g:
            return False
    for i, ys in enumerate(yellows):
        if word[i] in ys:
            return False
    for ys in yellows:
        if not ys.issubset(word):
            return False
    if known_excludes.intersection(word):
        # a letter marked gray everywhere must not appear again
        return False
    return True


# ---------------------------------------------------------------------------
# 2.  One game loop
# ---------------------------------------------------------------------------

turn = 1
while True:
    remaining = np.count_nonzero(candidates)
    if remaining == 0:
        sys.exit("No solutions satisfy the feedback you entered.")

    # Shortcut: solved
    if remaining == 1:
        answer = SOL_WORDS[int(np.flatnonzero(candidates)[0])]
        print(f"\nSolved! The word is {answer}.")
        break

    # Select which pool of guesses to score
    if remaining < 50:
        pool_indices = np.flatnonzero([w in SOL_INDEX for w in GUESS_WORDS])
        pool_indices = [GUESS_INDEX[SOL_WORDS[i]] for i in np.flatnonzero(candidates)]
    else:
        pool_indices = all_guess_indices

    best_score   = np.inf
    best_indices = []

    cand_indices = np.flatnonzero(candidates)
    submatrix    = pattern[:, cand_indices]     # lazy slice, still mmap

    # Vectorised scoring
    for gi in pool_indices:
        counts = np.bincount(submatrix[gi], minlength=243)
        score  = (counts * counts).sum()        # Σ n²
        if score < best_score:
            best_score   = score
            best_indices = [gi]
        elif score == best_score:
            best_indices.append(gi)

    # Tie-break: maximise distinct letters, fall back to lexical
    best_indices.sort(key=lambda ix: (-distinct_letter_count(GUESS_WORDS[ix]), GUESS_WORDS[ix]))
    guess_idx  = best_indices[0]
    guess_word = GUESS_WORDS[guess_idx]

    print(f"\nTurn {turn} — suggested guess: {guess_word}")
    turn += 1

    # If we are in autonomous mode ------------------------------------------
    if args.secret:
        secret = args.secret.upper()
        if secret not in SOL_INDEX:
            sys.exit("Secret word must be a valid *solution* word.")
        feedback = pattern[guess_idx, SOL_INDEX[secret]]
        print(colourise(guess_word, feedback))
        code = feedback
    # Otherwise ask the user to type colours --------------------------------
    else:
        user = input("Enter feedback (e.g. GYBBG or 21010): ")
        code = text_to_code(user)

    # Update candidate mask
    ok = (pattern[guess_idx] == code)
    candidates &= ok

    # Record hard-mode constraints
    base3 = []
    tmp   = code
    for _ in range(5):
        tmp, trit = divmod(tmp, 3)
        base3.append(trit)
    for i, trit in enumerate(base3):
        letter = guess_word[i]
        if trit == 2:                           # green
            greens[i] = letter
        elif trit == 1:                         # yellow
            yellows[i].add(letter)
        elif trit == 0 and letter not in greens and all(letter not in ys for ys in yellows):
            known_excludes.add(letter)
