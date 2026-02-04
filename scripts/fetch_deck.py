#!/usr/bin/env python3
"""Fetch an ArcMage deck from aminduna.arcmage.org and make it playable locally.

- Downloads missing card images (WEBP) into: public/arcmage/cards/<guid>.webp
- Writes deck JSON into: src/data/decks/<deckGuid>.json

Notes:
- Uses relative image URLs so GitHub Pages base path works.
- Source deck endpoint: https://aminduna.arcmage.org/api/decks/<guid>

Usage:
  python3 scripts/fetch_deck.py <deck-guid>

Example:
  python3 scripts/fetch_deck.py 6776ddb8-3ce0-470b-8d2c-afb26bd29359
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import requests

BASE = "https://aminduna.arcmage.org"

OUT_IMG = Path("public/arcmage/cards")
OUT_DECKS = Path("src/data/decks")


def safe_guid(g: str) -> str:
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", g or ""):
        raise SystemExit(f"unexpected guid: {g}")
    return g.lower()


def get_json(url: str) -> dict:
    r = requests.get(url, timeout=45)
    r.raise_for_status()
    return r.json()


def download(url: str, out: Path) -> None:
    if out.exists() and out.stat().st_size > 0:
        return
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    out.write_bytes(r.content)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__.strip())
        return 2

    deck_guid = safe_guid(argv[1])

    OUT_IMG.mkdir(parents=True, exist_ok=True)
    OUT_DECKS.mkdir(parents=True, exist_ok=True)

    deck = get_json(f"{BASE}/api/decks/{deck_guid}")

    cards = []
    for dc in deck.get("deckCards", []) or []:
        qty = int((dc or {}).get("quantity") or 1)
        c = (dc or {}).get("card") or {}
        guid = safe_guid(c.get("guid"))

        # Ensure we have full stats/rules fields: fetch card detail
        detail = get_json(f"{BASE}/api/Cards/{guid}")

        webp_path = detail.get("webp") or detail.get("jpeg")
        if webp_path:
            url = webp_path if webp_path.startswith("http") else f"{BASE}{webp_path}"
            ext = ".webp" if url.endswith(".webp") else ".jpg"
            out_file = OUT_IMG / f"{guid}{ext}"
            download(url, out_file)
            image_rel = f"arcmage/cards/{out_file.name}"
        else:
            image_rel = None

        cards.append(
            {
                "guid": guid,
                "name": detail.get("name"),
                "type": (detail.get("type") or {}).get("name") or detail.get("subType"),
                "subType": detail.get("subType"),
                "faction": (detail.get("faction") or {}).get("name"),
                "cost": detail.get("cost"),
                "loyalty": detail.get("loyalty"),
                "attack": detail.get("attack"),
                "defense": detail.get("defense"),
                "ruleText": detail.get("ruleText"),
                "artist": detail.get("artist"),
                "artworkLicensor": detail.get("artworkLicensor"),
                "image": image_rel,
                "quantity": qty,
            }
        )

    payload = {
        "source": {
            "deckGuid": deck_guid,
            "deckName": deck.get("name"),
            "base": BASE,
            "license": "https://arcmage.org/license/",
        },
        "cards": cards,
    }

    out_path = OUT_DECKS / f"{deck_guid}.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path} ({len(cards)} unique cards; with quantities)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
