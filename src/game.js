// Minimal card game engine (client-side). Inspired by the feel of arcmage.org.
// Rules (MVP):
// - 20 health each
// - Mana starts at 1 and increases by 1 at the start of your turn (max 10)
// - Draw 5 initial cards
// - Play minion cards if you can pay cost
// - Combat: choose an attacker then a target (minion or face)
// - Minions can attack once per turn, can't attack the turn they're played

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}

import rebirth from './data/rebirth.json'

function toIntCost(cost) {
  const n = Number.parseInt(String(cost ?? '').replace(/[^0-9]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

function toMvpStats(card) {
  // Rebirth includes many card types; for the MVP we only play "Creature" cards.
  // We don't implement full ArcMage rules yet, so we derive simple stats from cost.
  const c = Math.max(1, Math.min(10, toIntCost(card.cost) || 1))
  return { atk: Math.max(1, Math.round(c)), hp: Math.max(1, Math.round(c + 1)) }
}

function asMinion(card) {
  const { atk, hp } = toMvpStats(card)
  return {
    type: 'minion',
    name: card.name,
    cost: toIntCost(card.cost) || 1,
    atk,
    hp,
    text: `${card.faction} • ${card.type}`,
    image: card.image || null,
    artist: card.artist || null,
    artworkLicensor: card.artworkLicensor || null,
    arcmageGuid: card.guid,
  }
}

function buildRebirthCreaturePool() {
  return (rebirth.cards || []).filter((c) => (c.type || '').toLowerCase() === 'creature')
}

function pickFactions(cards) {
  const seen = new Set()
  const out = []
  for (const c of cards) {
    const f = c.faction || 'Unknown'
    if (!seen.has(f)) {
      seen.add(f)
      out.push(f)
    }
    if (out.length >= 2) break
  }
  if (out.length === 1) out.push(out[0])
  return out
}

function buildDeckFromPool(pool, faction, size = 30) {
  const filtered = pool.filter((c) => (c.faction || '') === faction)
  const base = filtered.length ? filtered : pool
  const out = []
  for (let i = 0; i < size; i++) {
    const c = base[i % base.length]
    out.push(asMinion({ ...c }))
  }
  return out
}

export function sampleDecks() {
  const pool = buildRebirthCreaturePool()

  // Choose two factions for a simple "you vs enemy" setup.
  const [f1, f2] = pickFactions(pool)

  // 30-card decks built from Rebirth creatures (by faction) — playable in our simplified rules.
  const deckA = buildDeckFromPool(pool, f1, 30)
  const deckB = buildDeckFromPool(pool, f2, 30)

  return { deckA, deckB }
}

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function createGameState() {
  const { deckA, deckB } = sampleDecks()

  const mkPlayer = (name, deck) => ({
    name,
    health: 20,
    maxMana: 1,
    mana: 1,
    deck: shuffle(deck).map((c) => ({ ...c, id: uid('c') })),
    hand: [],
    board: [],
  })

  const state = {
    turn: 1,
    current: 'player',
    phase: 'main',
    log: ['Game start'],
    selectedAttackerId: null,
    gameOver: false,
    winner: null,
    player: mkPlayer('You', deckA),
    enemy: mkPlayer('Enemy', deckB),
  }

  // Draw initial hands
  for (let i = 0; i < 5; i++) {
    draw(state, 'player')
    draw(state, 'enemy')
  }

  return state
}

export function draw(state, who) {
  const p = state[who]
  const card = p.deck.shift()
  if (!card) {
    // fatigue: take 1 damage if deck empty
    p.health -= 1
    state.log.unshift(`${p.name} fatigues for 1 (empty deck).`)
    checkGameOver(state)
    return
  }
  p.hand.push({ ...card })
}

export function canPlayCard(state, who, card) {
  const p = state[who]
  if (state.gameOver) return false
  if (state.current !== who) return false
  if (state.phase !== 'main') return false
  if (card.type !== 'minion') return false
  if (p.mana < card.cost) return false
  if (p.board.length >= 7) return false
  return true
}

export function playCard(state, who, cardId) {
  const p = state[who]
  const idx = p.hand.findIndex((c) => c.id === cardId)
  if (idx < 0) return
  const card = p.hand[idx]
  if (!canPlayCard(state, who, card)) return

  p.mana -= card.cost
  p.hand.splice(idx, 1)
  p.board.push({
    ...card,
    summoningSick: true,
    exhausted: true, // cannot attack this turn
  })

  state.log.unshift(`${p.name} plays ${card.name} (${card.cost}).`)
}

export function startTurn(state, who) {
  state.current = who
  state.phase = 'main'
  state.selectedAttackerId = null

  const p = state[who]
  p.maxMana = Math.min(10, p.maxMana + 1)
  p.mana = p.maxMana

  // Ready minions
  for (const m of p.board) {
    m.exhausted = false
    if (m.summoningSick) m.summoningSick = false
  }

  draw(state, who)
  state.log.unshift(`— ${p.name}'s turn (mana ${p.mana}/${p.maxMana}) —`)
  checkGameOver(state)
}

export function endTurn(state) {
  if (state.gameOver) return
  if (state.current !== 'player') return

  // enemy turn
  state.turn += 1
  startTurn(state, 'enemy')
  if (state.gameOver) return

  enemyAI(state)

  // back to player
  state.turn += 1
  startTurn(state, 'player')
}

export function selectAttacker(state, attackerId) {
  if (state.gameOver) return
  if (state.current !== 'player') return

  const attacker = state.player.board.find((m) => m.id === attackerId)
  if (!attacker) return
  if (attacker.summoningSick) return
  if (attacker.exhausted) return

  state.selectedAttackerId = attackerId
}

export function attack(state, target) {
  if (state.gameOver) return
  if (state.current !== 'player') return

  const attacker = state.player.board.find((m) => m.id === state.selectedAttackerId)
  if (!attacker) return
  if (attacker.summoningSick || attacker.exhausted) return

  if (target.kind === 'face') {
    state.enemy.health -= attacker.atk
    attacker.exhausted = true
    state.selectedAttackerId = null
    state.log.unshift(`You hit enemy face for ${attacker.atk}.`)
    checkGameOver(state)
    return
  }

  if (target.kind === 'minion') {
    const defIdx = state.enemy.board.findIndex((m) => m.id === target.id)
    if (defIdx < 0) return
    const defender = state.enemy.board[defIdx]

    // Simultaneous damage
    defender.hp -= attacker.atk
    attacker.hp -= defender.atk

    attacker.exhausted = true
    state.selectedAttackerId = null
    state.log.unshift(`You attack ${defender.name}: ${attacker.atk} ↔ ${defender.atk}.`)

    cleanupDead(state)
    checkGameOver(state)
  }
}

export function cleanupDead(state) {
  const rmDead = (p) => {
    const before = p.board.length
    p.board = p.board.filter((m) => m.hp > 0)
    const died = before - p.board.length
    if (died > 0) state.log.unshift(`${p.name} loses ${died} minion(s).`)
  }
  rmDead(state.player)
  rmDead(state.enemy)
}

export function checkGameOver(state) {
  if (state.gameOver) return
  if (state.player.health <= 0 && state.enemy.health <= 0) {
    state.gameOver = true
    state.winner = 'draw'
    state.log.unshift('Draw game.')
    return
  }
  if (state.player.health <= 0) {
    state.gameOver = true
    state.winner = 'enemy'
    state.log.unshift('You lose.')
    return
  }
  if (state.enemy.health <= 0) {
    state.gameOver = true
    state.winner = 'player'
    state.log.unshift('You win!')
    return
  }
}

function enemyAI(state) {
  const enemy = state.enemy

  // Play as many affordable minions as possible (greedy: cheapest first)
  let played = true
  while (played) {
    played = false
    const playable = enemy.hand
      .filter((c) => c.type === 'minion' && c.cost <= enemy.mana)
      .sort((a, b) => a.cost - b.cost)

    if (playable.length > 0 && enemy.board.length < 7) {
      const c = playable[0]
      enemy.mana -= c.cost
      enemy.hand = enemy.hand.filter((x) => x.id !== c.id)
      enemy.board.push({ ...c, summoningSick: true, exhausted: true })
      state.log.unshift(`Enemy plays ${c.name} (${c.cost}).`)
      played = true
    }
  }

  // Attack: each ready minion attacks face unless a random trade looks better
  for (const m of enemy.board) {
    if (m.summoningSick || m.exhausted) continue

    // 30% chance to trade into a random player minion
    const canTrade = state.player.board.length > 0 && Math.random() < 0.3
    if (canTrade) {
      const tgt = state.player.board[Math.floor(Math.random() * state.player.board.length)]
      tgt.hp -= m.atk
      m.hp -= tgt.atk
      m.exhausted = true
      state.log.unshift(`Enemy attacks ${tgt.name}.`)
      cleanupDead(state)
      checkGameOver(state)
      if (state.gameOver) return
      continue
    }

    state.player.health -= m.atk
    m.exhausted = true
    state.log.unshift(`Enemy hits your face for ${m.atk}.`)
    checkGameOver(state)
    if (state.gameOver) return
  }
}
