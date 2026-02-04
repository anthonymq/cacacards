# cacacards

A tiny browser card game MVP (client-side) inspired by the *feel* of https://arcmage.org/.

## Live (GitHub Pages)
After the PR is merged and Pages is enabled, the game will be available at:

- https://anthonymq.github.io/cacacards/

## Features (MVP)
- Two sample decks
- Draw 5 cards to start
- Mana increases by 1 each turn (max 10)
- Play minion cards (cost / attack / health)
- Simple combat: pick attacker → pick target (minion or face)
- Basic win condition: opponent HP <= 0

## Run locally

```bash
npm install
npm run dev
```

Then open the URL printed by Vite (default: http://localhost:5173).

## Deploy (owner/admin)
1. Merge the PR to `main`
2. GitHub repo → **Settings → Pages**
3. Under **Build and deployment**, set **Source = GitHub Actions**
4. Wait for the **Deploy to GitHub Pages** workflow to finish

## Notes
This is a minimal prototype to iterate on (UI + rules can evolve).
\n\n## Dev\n\nThis PR adds the initial React MVP.\n
