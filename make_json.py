"""
make_json.py – convert guesses.txt & solutions.txt → data/*.json
Run once:
    py make_json.py
"""

import json, pathlib, sys

BASE = pathlib.Path(__file__).resolve().parent
DATA = BASE / "data"
DATA.mkdir(exist_ok=True)

for name in ("guesses", "solutions"):
    txt_path  = BASE / f"{name}.txt"
    json_path = DATA / f"{name}.json"

    if not txt_path.exists():
        sys.exit(f"❌  {txt_path} not found")

    words = [w.strip().upper() for w in txt_path.read_text().splitlines() if w.strip()]
    json_path.write_text(json.dumps(words))
    print(f"✔ wrote {len(words):,} words → {json_path.relative_to(BASE)}")
