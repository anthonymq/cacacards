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

export function sampleDecks() {
  const minion = (name, cost, atk, hp, text = '') => ({ type: 'minion', name, cost, atk, hp, text })

  const deckA = [
    minion('Goblin Intern', 1, 1, 1, 'Cheap and cheerful.'),
    minion('Street Rat', 1, 1, 2, 'Harder to remove than it looks.'),
    minion('Arc Spark', 2, 2, 1, 'Glass cannon.'),
    minion('Book Thief', 2, 2, 2, 'Steals tempo, not books.'),
    minion('Shielded Duck', 3, 2, 4, 'Quack. (It tanks.)'),
    minion('Grumpy Golem', 3, 3, 3, 'Midrange staple.'),
    minion('Clockwork Hound', 4, 4, 3, 'Bites once, bites hard.'),
    minion('Arc Adept', 4, 3, 5, 'Value body.'),
    minion('Ogre Accountant', 5, 5, 5, 'Counts damage. Incorrectly.'),
    minion('Big Bad Banana', 6, 7, 6, 'Too much potassium.'),
  ]

  const deckB = [
    minion('Skeleton', 1, 1, 1, 'Spooky.'),
    minion('Candle Wisp', 1, 2, 1, 'Hot take.'),
    minion('Frog Knight', 2, 2, 2, 'Ribbit & rip.'),
    minion('Library Ghoul', 2, 1, 3, 'Lives in comments.'),
    minion('Stone Turtle', 3, 1, 6, 'Wins by not dying.'),
    minion('Wolf', 3, 4, 2, 'Trades up.'),
    minion('Mirror Soldier', 4, 4, 4, 'Fair statline.'),
    minion('Spectral Bear', 4, 5, 3, 'Pushes damage.'),
    minion('Boulder Titan', 5, 6, 5, 'Ends arguments.'),
    minion('Ancient Dragon', 7, 8, 8, 'Game ender.'),
  ]

  // Make them larger by repeating.
  const expand = (base) => {
    const out = []
    for (let i = 0; i < 3; i++) {
      for (const c of base) out.push({ ...c })
    }
    return out
  }

  return { deckA: expand(deckA), deckB: expand(deckB) }
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
