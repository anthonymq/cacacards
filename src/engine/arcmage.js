// Core Arcmage rules engine (1v1) — first pass.
// Implements the *core* turn structure, resources, cities/army, movement and combat
// as described on https://arcmage.org/rules/
//
// NOT YET IMPLEMENTED (will come next): event stack reactions, magic/enchantments effects,
// card-text ability parser/keywords, devotion/tactics effects, prerequisites/targets.

import rebirth from '../data/rebirth.json'

export const PHASES = /** @type {const} */ ([
  'unmark',
  'draw_resource',
  'tactics',
  'play_1',
  'attack',
  'play_2',
  'discard',
])

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function nint(v, fallback = 0) {
  const n = Number.parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : fallback
}

function isType(card, t) {
  return String(card.type || '').toLowerCase() === String(t).toLowerCase()
}

export function buildRebirthDeck45() {
  // Deterministic starter deck from Rebirth full set:
  // - 3 cities
  // - rest from other types, unique cards (<= 1 copy each)
  const all = rebirth.cards || []
  const cities = all.filter((c) => isType(c, 'city'))
  const nonCities = all.filter((c) => !isType(c, 'city'))

  const pick3 = cities.slice(0, 3)
  const rest = nonCities.slice(0, 42)

  // If not enough non-cities (unlikely), top up with remaining cities
  const deck = [...pick3, ...rest]
  while (deck.length < 45) {
    deck.push(cities[deck.length % cities.length])
  }

  return deck.map((c) => ({ ...c }))
}

export function createInitialState() {
  const deckA = buildRebirthDeck45()
  const deckB = buildRebirthDeck45()

  const mkPlayer = (name, deck) => {
    const cities = deck.filter((c) => isType(c, 'city')).slice(0, 3)
    const main = deck.filter((c) => !cities.some((x) => x.guid === c.guid))

    return {
      name,
      // resources: { [faction]: { cards: [{id, marked}] } }
      resources: {},
      resourcesPlayedThisTurn: 0,
      // Kingdom: cities in play
      kingdom: [], // [{ card, id, currentDefense, residents: [creatureId], devoted: Set(residentId) }]
      // Army: creatures in army
      army: [], // creature instances
      // Residents live inside city.residents
      deck: shuffle(main).map((c) => ({ ...c, id: uid('deck') })),
      hand: [],
      graveyard: [],
      // city pile (unbuilt cities)
      cityPile: shuffle(cities).map((c) => ({ ...c, id: uid('city') })),
    }
  }

  const state = {
    ruleset: 'arcmage.org/rules',
    turn: 1,
    current: 'player', // 'player' | 'enemy'
    phase: 'unmark',
    log: ['Game start'],
    gameOver: false,
    winner: null,
    // combat selection
    selectedAttackerId: null,
    selectedDefenderCityId: null,
    player: mkPlayer('You', deckA),
    enemy: mkPlayer('Enemy', deckB),
  }

  // Setup per rules: each draws 7
  for (let i = 0; i < 7; i++) {
    drawCard(state, 'player')
    drawCard(state, 'enemy')
  }

  // Each starts with 1 city in play (players pick from city pile; we auto-pick top)
  foundInitialCity(state, 'player')
  foundInitialCity(state, 'enemy')

  return state
}

export function drawCard(state, who) {
  const p = state[who]
  const card = p.deck.shift()
  if (!card) {
    // Deck empty and forced to draw -> defeat per rules
    state.gameOver = true
    state.winner = who === 'player' ? 'enemy' : 'player'
    state.log.unshift(`${p.name} tries to draw from empty deck and is defeated.`)
    return
  }
  p.hand.push({ ...card, id: uid('h') })
}

function ensureFactionResource(p, faction) {
  if (!p.resources[faction]) p.resources[faction] = { cards: [] }
  return p.resources[faction]
}

export function canPlayResource(state, who) {
  if (state.gameOver) return false
  if (state.current !== who) return false
  if (state.phase !== 'draw_resource') return false
  const p = state[who]
  return p.resourcesPlayedThisTurn < 2 && p.hand.length > 0
}

export function playResource(state, who, handCardId, chosenFaction) {
  if (!canPlayResource(state, who)) return
  const p = state[who]
  const idx = p.hand.findIndex((c) => c.id === handCardId)
  if (idx < 0) return
  const c = p.hand[idx]
  p.hand.splice(idx, 1)

  const r = ensureFactionResource(p, chosenFaction)
  r.cards.push({ id: uid('res'), sourceGuid: c.guid, marked: false })
  p.resourcesPlayedThisTurn += 1
  state.log.unshift(`${p.name} plays a resource for ${chosenFaction}.`)
}

export function availableResources(p, faction) {
  const r = p.resources[faction]
  if (!r) return 0
  return r.cards.filter((x) => !x.marked).length
}

export function markResources(p, faction, n) {
  const r = p.resources[faction]
  if (!r) return false
  const unmarked = r.cards.filter((x) => !x.marked)
  if (unmarked.length < n) return false
  for (let i = 0; i < n; i++) unmarked[i].marked = true
  return true
}

export function unmarkAll(state, who) {
  const p = state[who]
  // Unmark resource cards
  for (const f of Object.keys(p.resources)) {
    for (const rc of p.resources[f].cards) rc.marked = false
  }
  // Unmark creatures: we represent by booleans
  for (const cr of p.army) cr.marked = false
  for (const city of p.kingdom) {
    for (const res of city.residents) res.marked = false
    // devotion resets each turn; we don't implement city effects yet
    city.devotedIds = new Set()
  }
  p.resourcesPlayedThisTurn = 0
}

function cityDefenseBase(card) {
  // City defensive strength is not explicitly documented as a field name;
  // in Aminduna API cities use "defense" similarly.
  return Math.max(1, nint(card.defense, 1))
}

export function foundInitialCity(state, who) {
  const p = state[who]
  const c = p.cityPile.shift()
  if (!c) {
    // No cities? illegal deck; treat as loss
    state.gameOver = true
    state.winner = who === 'player' ? 'enemy' : 'player'
    state.log.unshift(`${p.name} has no cities to found and is defeated.`)
    return
  }
  p.kingdom.push({
    id: uid('cityinplay'),
    card: c,
    currentDefense: cityDefenseBase(c),
    residents: [],
    devotedIds: new Set(),
    movedThisTurn: false,
  })
  state.log.unshift(`${p.name} founds city ${c.name}.`)
}

export function skipTurnToFoundCity(state, who) {
  // Per rules: skip an entire turn to place one unused city into play.
  if (state.gameOver) return
  if (state.current !== who) return
  const p = state[who]
  if (p.cityPile.length === 0) return
  // only allow at start of turn (unmark phase) for now
  if (state.phase !== 'unmark') return

  const c = p.cityPile.shift()
  p.kingdom.push({
    id: uid('cityinplay'),
    card: c,
    currentDefense: cityDefenseBase(c),
    residents: [],
    devotedIds: new Set(),
    movedThisTurn: false,
  })
  state.log.unshift(`${p.name} skips the turn to found city ${c.name}.`)

  // end turn immediately
  endTurn(state)
}

function creatureAtk(card) {
  return Math.max(0, nint(card.attack, 0))
}
function creatureDef(card) {
  return Math.max(1, nint(card.defense, 1))
}

function buildCreatureInstance(card) {
  return {
    id: uid('cr'),
    card,
    name: card.name,
    faction: card.faction,
    atk: creatureAtk(card),
    def: creatureDef(card),
    marked: false,
    // damage is per-turn (resets end of turn)
    damage: 0,
  }
}

export function canPlayCardToCity(state, who, handCardId, cityId) {
  if (state.gameOver) return false
  if (state.current !== who) return false
  if (!(state.phase === 'play_1' || state.phase === 'play_2')) return false
  const p = state[who]
  const card = p.hand.find((c) => c.id === handCardId)
  if (!card) return false
  if (!isType(card, 'creature')) return false

  const city = p.kingdom.find((c) => c.id === cityId)
  if (!city) return false

  // Resource payment (simplified): pay total cost from any factions for now.
  const cost = nint(card.cost, 0)
  if (cost <= 0) return false

  const totalAvailable = Object.keys(p.resources).reduce((acc, f) => acc + availableResources(p, f), 0)
  if (totalAvailable < cost) return false

  return true
}

export function payGenericCost(state, who, cost) {
  // For now, generic payment. Loyalty rules TODO.
  const p = state[who]
  let remaining = cost
  for (const f of Object.keys(p.resources)) {
    if (remaining <= 0) break
    const can = availableResources(p, f)
    const use = Math.min(can, remaining)
    if (use > 0) {
      markResources(p, f, use)
      remaining -= use
    }
  }
  return remaining === 0
}

export function playCreatureToCity(state, who, handCardId, cityId) {
  if (!canPlayCardToCity(state, who, handCardId, cityId)) return
  const p = state[who]
  const idx = p.hand.findIndex((c) => c.id === handCardId)
  const card = p.hand[idx]

  const cost = nint(card.cost, 0)
  if (!payGenericCost(state, who, cost)) return

  p.hand.splice(idx, 1)
  const inst = buildCreatureInstance(card)

  const city = p.kingdom.find((c) => c.id === cityId)
  city.residents.push(inst)
  state.log.unshift(`${p.name} plays creature ${card.name} into ${city.card.name}.`)
}

export function canMoveCreature(state, who, from, to, creatureId) {
  if (state.gameOver) return false
  if (state.current !== who) return false
  if (!(state.phase === 'play_1' || state.phase === 'play_2')) return false
  const p = state[who]

  // Find creature and origin
  let creature = null
  let originCity = null

  if (from.kind === 'army') {
    creature = p.army.find((c) => c.id === creatureId)
  } else if (from.kind === 'city') {
    originCity = p.kingdom.find((c) => c.id === from.cityId)
    if (!originCity) return false
    creature = originCity.residents.find((c) => c.id === creatureId)
  }
  if (!creature) return false
  if (creature.marked) return false

  // City move limitation: a given city may be involved only once per turn
  const involvedCityIds = new Set(p.kingdom.filter((c) => c.movedThisTurn).map((c) => c.id))
  if (from.kind === 'city' && involvedCityIds.has(from.cityId)) return false
  if (to.kind === 'city' && involvedCityIds.has(to.cityId)) return false

  // Resolve destination exists
  if (to.kind === 'army') return true
  if (to.kind === 'city') {
    const dest = p.kingdom.find((c) => c.id === to.cityId)
    return Boolean(dest)
  }
  return false
}

export function moveCreature(state, who, from, to, creatureId) {
  if (!canMoveCreature(state, who, from, to, creatureId)) return
  const p = state[who]

  let creature = null

  if (from.kind === 'army') {
    const idx = p.army.findIndex((c) => c.id === creatureId)
    creature = p.army[idx]
    p.army.splice(idx, 1)
  } else {
    const origin = p.kingdom.find((c) => c.id === from.cityId)
    const idx = origin.residents.findIndex((c) => c.id === creatureId)
    creature = origin.residents[idx]
    origin.residents.splice(idx, 1)
    origin.movedThisTurn = true
  }

  creature.marked = true // movement marks the creature

  if (to.kind === 'army') {
    p.army.push(creature)
    state.log.unshift(`${p.name} moves ${creature.name} to the Army.`)
  } else {
    const dest = p.kingdom.find((c) => c.id === to.cityId)
    dest.residents.push(creature)
    dest.movedThisTurn = true
    state.log.unshift(`${p.name} moves ${creature.name} to ${dest.card.name}.`)
  }
}

export function canAttackCity(state, who, attackerIds, targetCityId) {
  if (state.gameOver) return false
  if (state.current !== who) return false
  if (state.phase !== 'attack') return false

  const atkP = state[who]
  const defWho = who === 'player' ? 'enemy' : 'player'
  const defP = state[defWho]

  if (!defP.kingdom.some((c) => c.id === targetCityId)) return false

  const attackers = attackerIds.map((id) => atkP.army.find((c) => c.id === id)).filter(Boolean)
  if (attackers.length === 0) return false
  if (attackers.some((c) => c.marked)) return false

  // Only one attack per attack phase (handled by UI; here just allow)
  return true
}

export function resolveAttack(state, who, attackerIds, targetCityId) {
  if (!canAttackCity(state, who, attackerIds, targetCityId)) return

  const atkP = state[who]
  const defWho = who === 'player' ? 'enemy' : 'player'
  const defP = state[defWho]

  const targetCity = defP.kingdom.find((c) => c.id === targetCityId)

  const attackers = attackerIds.map((id) => atkP.army.find((c) => c.id === id)).filter(Boolean)
  // mark attackers after event window (events not implemented yet)
  for (const a of attackers) a.marked = true

  // Defender assignment not interactive yet: simple auto-assign for now.
  // Defenders can come from defending army + attacked city's residents, unmarked only.
  const availableDef = [...defP.army, ...targetCity.residents].filter((c) => !c.marked)

  // Greedy assignment: one defender per attacker if possible.
  const assignments = new Map() // attackerId -> [defenders]
  for (const a of attackers) assignments.set(a.id, [])

  let di = 0
  for (const a of attackers) {
    if (di >= availableDef.length) break
    assignments.get(a.id).push(availableDef[di])
    di += 1
  }

  // Resolve each attacker battle in declared order (as provided)
  for (const a of attackers) {
    const defs = assignments.get(a.id) || []

    if (defs.length === 0) {
      // unblocked -> city takes damage equal to ATK
      targetCity.currentDefense -= a.atk
      state.log.unshift(`${atkP.name}'s ${a.name} hits ${targetCity.card.name} for ${a.atk}.`)
      continue
    }

    // simultaneous: attacker takes sum(def atk)
    const dmgToAttacker = defs.reduce((s, d) => s + d.atk, 0)
    a.damage += dmgToAttacker

    // attacker deals its ATK; for now: distribute all to first defender
    defs[0].damage += a.atk

    state.log.unshift(`${atkP.name}'s ${a.name} battles ${defs.map((d) => d.name).join(', ')}.`)
  }

  // Cleanup: dead creatures to owner graveyard, attachments ignored
  cleanupDeaths(state)

  // City destruction check
  if (targetCity.currentDefense <= 0) {
    destroyCity(state, defWho, targetCity.id)
  }

  checkWin(state)
}

function removeCreatureFromZones(p, creatureId) {
  // remove from army
  const ai = p.army.findIndex((c) => c.id === creatureId)
  if (ai >= 0) return p.army.splice(ai, 1)[0]
  // remove from cities
  for (const city of p.kingdom) {
    const ci = city.residents.findIndex((c) => c.id === creatureId)
    if (ci >= 0) return city.residents.splice(ci, 1)[0]
  }
  return null
}

export function cleanupDeaths(state) {
  for (const who of ['player', 'enemy']) {
    const p = state[who]
    const allCreatures = [...p.army]
    for (const city of p.kingdom) allCreatures.push(...city.residents)

    for (const cr of allCreatures) {
      if (cr.damage >= cr.def) {
        removeCreatureFromZones(p, cr.id)
        p.graveyard.push(cr.card)
        state.log.unshift(`${p.name}'s ${cr.name} dies.`)
      }
    }
  }
}

export function destroyCity(state, who, cityId) {
  const p = state[who]
  const idx = p.kingdom.findIndex((c) => c.id === cityId)
  if (idx < 0) return
  const city = p.kingdom[idx]
  p.kingdom.splice(idx, 1)
  p.graveyard.push(city.card)

  // Unmarked residents must be moved to another city or army.
  // Marked residents return to owner's hand.
  const unmarked = city.residents.filter((r) => !r.marked)
  const marked = city.residents.filter((r) => r.marked)

  for (const r of marked) {
    // to hand as card
    p.hand.push({ ...r.card, id: uid('h') })
  }

  // Move all unmarked to army (simplification; rule allows another city or army)
  for (const r of unmarked) {
    p.army.push(r)
  }

  state.log.unshift(`${p.name}'s city ${city.card.name} is destroyed.`)
}

export function checkWin(state) {
  if (state.gameOver) return
  const p1 = state.player
  const p2 = state.enemy
  if (p1.kingdom.length === 0) {
    state.gameOver = true
    state.winner = 'enemy'
    state.log.unshift('You have no cities left. Defeat.')
  } else if (p2.kingdom.length === 0) {
    state.gameOver = true
    state.winner = 'player'
    state.log.unshift('Enemy has no cities left. Victory!')
  }
}

export function nextPhase(state) {
  if (state.gameOver) return

  const i = PHASES.indexOf(state.phase)
  const next = PHASES[(i + 1) % PHASES.length]

  // Transition effects
  if (next === 'unmark') {
    // End of turn effects: reset per-turn damage on creatures
    endOfTurnCleanup(state)

    // swap player
    state.current = state.current === 'player' ? 'enemy' : 'player'
    state.turn += 1
  }

  state.phase = next

  if (state.phase === 'unmark') {
    unmarkAll(state, state.current)
  }

  if (state.phase === 'draw_resource') {
    // draw/resource choice (UI/AI). For now: auto draw 1 for human too.
  }

  // AI autoplay if enemy
  if (state.current === 'enemy') {
    runEnemyAI(state)
  }
}

export function endTurn(state) {
  // Advance to next player's unmark
  state.phase = 'discard'
  nextPhase(state)
}

function endOfTurnCleanup(state) {
  for (const who of ['player', 'enemy']) {
    const p = state[who]
    for (const c of p.army) c.damage = 0
    for (const city of p.kingdom) {
      for (const r of city.residents) r.damage = 0
      city.movedThisTurn = false
    }
  }
}

// ---------------- AI (baseline, rule-legal-ish) ----------------

function runEnemyAI(state) {
  if (state.gameOver) return

  const who = 'enemy'
  const p = state.enemy

  // Handle phase-specific actions. Keep it dumb, but legal.
  if (state.phase === 'unmark') {
    // nothing else
    nextPhase(state)
    return
  }

  if (state.phase === 'draw_resource') {
    // Simple choice: draw 1, play 1 resource if possible.
    drawCard(state, who)
    if (p.hand.length > 0 && p.resourcesPlayedThisTurn < 1) {
      // choose faction of first card (or fallback)
      const f = p.hand[0].faction || 'Dark Legion'
      playResource(state, who, p.hand[0].id, f)
    }
    nextPhase(state)
    return
  }

  if (state.phase === 'tactics') {
    // devotion not implemented
    nextPhase(state)
    return
  }

  if (state.phase === 'play_1' || state.phase === 'play_2') {
    // 1) try to play up to 2 resources is not allowed here; only in draw_resource.
    // 2) play creatures into first city if affordable.
    const city = p.kingdom[0]
    if (city) {
      const playable = p.hand.filter((c) => isType(c, 'creature')).sort((a, b) => nint(a.cost) - nint(b.cost))
      for (const c of playable) {
        if (canPlayCardToCity(state, who, c.id, city.id)) {
          playCreatureToCity(state, who, c.id, city.id)
          break
        }
      }

      // move one unmarked resident to army if city not involved yet
      const r = city.residents.find((x) => !x.marked)
      if (r) {
        moveCreature(state, who, { kind: 'city', cityId: city.id }, { kind: 'army' }, r.id)
      }
    }

    nextPhase(state)
    return
  }

  if (state.phase === 'attack') {
    // attack weakest enemy city with all unmarked army creatures
    const enemyCity = state.player.kingdom.slice().sort((a, b) => a.currentDefense - b.currentDefense)[0]
    const attackers = p.army.filter((c) => !c.marked)
    if (enemyCity && attackers.length) {
      resolveAttack(state, who, attackers.map((a) => a.id), enemyCity.id)
    }
    nextPhase(state)
    return
  }

  if (state.phase === 'discard') {
    // enforce hand limit 7
    while (p.hand.length > 7) p.hand.pop()
    nextPhase(state)
  }
}
