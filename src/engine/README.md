# Arcmage engine (WIP)

This folder is a rules-first rewrite towards **ArcMage 1:1**.

Source of truth for the core rules:
- https://arcmage.org/rules/

Status:
- Implemented: turn phases scaffold, resource cards, cities/kingdom + army, movement (with city move limit), core combat vs city.
- Not yet: event stack reactions, magic/enchantments, card text parsing (keywords/effects), city devotion/tactics effects, loyalty/X costs, targeting.

Design notes:
- Keep the engine **pure** (state in/state out) and UI as a thin layer.
- We’ll add a proper effect system before implementing card text.
