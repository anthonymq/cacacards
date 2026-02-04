#!/usr/bin/env python3
"""Fetch Arcmage 'Rebirth' set from aminduna.arcmage.org deck export API.

- Downloads card WEBP images into: public/arcmage/rebirth/cards/<guid>.webp
- Writes metadata to: src/data/rebirth.json

Requires: python3, requests

Usage:
  python3 scripts/fetch_rebirth.py
"""

import os
import re
import json
from pathlib import Path

import requests

BASE = "https://aminduna.arcmage.org"
DECK_GUID = "2e852216-450b-4b2f-add3-e5126197e149"  # Set 1 - Rebirth (full set)

OUT_IMG = Path("public/arcmage/rebirth/cards")
OUT_JSON = Path("src/data/rebirth.json")


def safe_guid(g: str) -> str:
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", g or ""):
        raise ValueError(f"unexpected guid: {g}")
    return g.lower()


def main() -> int:
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)

    deck = requests.get(f"{BASE}/api/decks/{DECK_GUID}", timeout=30).json()

    cards = []
    for dc in deck.get("deckCards", []):
        c = (dc or {}).get("card") or {}
        guid = safe_guid(c.get("guid"))
        name = c.get("name")
        typ = (c.get("type") or {}).get("name") or c.get("subType")
        sub_type = c.get("subType")
        faction = (c.get("faction") or {}).get("name")
        cost = c.get("cost")
        loyalty = c.get("loyalty")
        attack = c.get("attack")
        defense = c.get("defense")
        rule_text = c.get("ruleText")
        artist = c.get("artist")
        artwork_licensor = c.get("artworkLicensor")

        # Prefer webp if available
        webp_path = c.get("webp")
        if not webp_path:
            # fallback to jpeg
            webp_path = c.get("jpeg")

        if not webp_path:
            # some cards might be missing exports; skip image
            local_rel = None
        else:
            url = webp_path if webp_path.startswith("http") else f"{BASE}{webp_path}"
            ext = ".webp" if "/card.webp" in url or url.endswith(".webp") else ".jpg"
            out_file = OUT_IMG / f"{guid}{ext}"
            # IMPORTANT: On GitHub Pages, the app is served under /<repo>/.
            # Use a *relative* URL so it works both locally and on Pages.
            local_rel = f"arcmage/rebirth/cards/{out_file.name}"

            if not out_file.exists() or out_file.stat().st_size == 0:
                r = requests.get(url, timeout=60)
                r.raise_for_status()
                out_file.write_bytes(r.content)

        cards.append(
            {
                "guid": guid,
                "name": name,
                "type": typ,
                "subType": sub_type,
                "faction": faction,
                "cost": cost,
                "loyalty": loyalty,
                "attack": attack,
                "defense": defense,
                "ruleText": rule_text,
                "artist": artist,
                "artworkLicensor": artwork_licensor,
                "image": local_rel,
            }
        )

    # sort stable
    cards.sort(key=lambda x: (x.get("faction") or "", x.get("name") or ""))

    payload = {
        "source": {
            "deckGuid": DECK_GUID,
            "deckName": deck.get("name"),
            "base": BASE,
            "license": "https://arcmage.org/license/",
        },
        "cards": cards,
    }

    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_JSON} ({len(cards)} cards)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
