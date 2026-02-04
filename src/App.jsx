import React, { useMemo, useState } from 'react'
import {
  createGameState,
  playCard,
  selectAttacker,
  attack,
  endTurn,
  canPlayCard,
} from './game.js'

function ManaBadge({ p }) {
  return <span className="pill">Mana: {p.mana}/{p.maxMana}</span>
}

function HealthBadge({ p }) {
  return <span className="pill">HP: {p.health}</span>
}

function Card({ card, onClick, disabled, selected, danger, actionLabel }) {
  const cls = ['card', selected ? 'selected' : '', danger ? 'danger' : ''].join(' ').trim()
  return (
    <div className={cls}>
      <div className="cardTitle">{card.name}</div>
      <div className="cardMeta">
        <span>Cost {card.cost}</span>
        <span>{card.atk}/{card.hp}</span>
      </div>

      {card.image ? (
        <img
          src={card.image}
          alt={card.name}
          style={{ width: '100%', borderRadius: 10, marginTop: 8, border: '1px solid #394265' }}
          loading="lazy"
        />
      ) : null}

      <div className="cardText">{card.text || ''}</div>
      {onClick && (
        <div className="cardBtnRow">
          <button onClick={onClick} disabled={disabled}>
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  )
}

function Board({ title, player, isEnemy, state, setState }) {
  const selectedId = state.selectedAttackerId
  const canSelect = !isEnemy && state.current === 'player'

  return (
    <div className="board">
      <div className="boardTitle">
        <div>{title}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <HealthBadge p={player} />
          <ManaBadge p={player} />
          <span className="pill">Deck: {player.deck.length}</span>
          <span className="pill">Hand: {player.hand.length}</span>
          <span className="pill">Board: {player.board.length}/7</span>
        </div>
      </div>

      <div className="lanes">
        {player.board.map((m) => {
          const isSelected = selectedId === m.id
          const actionDisabled = isEnemy ? false : (m.summoningSick || m.exhausted || state.current !== 'player')

          return (
            <Card
              key={m.id}
              card={m}
              selected={isSelected}
              danger={isEnemy && selectedId}
              actionLabel={isEnemy ? 'Target' : (isSelected ? 'Selected' : 'Attack')}
              onClick={() => {
                if (isEnemy) {
                  setState((prev) => {
                    const s = structuredClone(prev)
                    attack(s, { kind: 'minion', id: m.id })
                    return s
                  })
                  return
                }
                if (!canSelect) return
                setState((prev) => {
                  const s = structuredClone(prev)
                  selectAttacker(s, m.id)
                  return s
                })
              }}
              disabled={actionDisabled}
            />
          )
        })}
      </div>

      {isEnemy && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              setState((prev) => {
                const s = structuredClone(prev)
                attack(s, { kind: 'face' })
                return s
              })
            }}
            disabled={!state.selectedAttackerId || state.gameOver || state.current !== 'player'}
          >
            Attack face
          </button>
          <div className="footerHint">
            Tip: Select your attacker (your board), then click an enemy minion or “Attack face”.
          </div>
        </div>
      )}
    </div>
  )
}

function Hand({ state, setState }) {
  const p = state.player
  return (
    <div className="board">
      <div className="boardTitle">
        <div>Your hand</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="pill">Play minions by spending mana</span>
        </div>
      </div>

      <div className="lanes">
        {p.hand.map((c) => {
          const playable = canPlayCard(state, 'player', c)
          return (
            <Card
              key={c.id}
              card={c}
              actionLabel="Play"
              onClick={() => {
                setState((prev) => {
                  const s = structuredClone(prev)
                  playCard(s, 'player', c.id)
                  return s
                })
              }}
              disabled={!playable}
            />
          )
        })}
      </div>

      <div className="footerHint">
        Rules MVP: 20 HP • mana +1 per turn (max 10) • minions can’t attack the turn they’re played.
      </div>
    </div>
  )
}

export default function App() {
  const initial = useMemo(() => createGameState(), [])
  const [state, setState] = useState(initial)

  const banner = (() => {
    if (state.gameOver) {
      if (state.winner === 'player') return 'You win.'
      if (state.winner === 'enemy') return 'You lose.'
      return 'Draw.'
    }
    return `Turn ${state.turn} — ${state.current === 'player' ? 'Your' : 'Enemy'} turn`
  })()

  return (
    <div className="container">
      <div className="header">
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>CacaCards</div>
          <div style={{ opacity: 0.8, fontSize: 12 }}>
            A tiny browser card game MVP inspired by arcmage.org — using Rebirth set creature cards (simplified rules)
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="badge">{banner}</span>
          <button
            onClick={() => {
              setState((prev) => {
                const s = structuredClone(prev)
                endTurn(s)
                return s
              })
            }}
            disabled={state.gameOver || state.current !== 'player'}
          >
            End turn
          </button>
          <button onClick={() => setState(createGameState())}>New game</button>
        </div>
      </div>

      <div className="row">
        <Board title="Enemy" player={state.enemy} isEnemy={true} state={state} setState={setState} />
        <Board title="You" player={state.player} isEnemy={false} state={state} setState={setState} />
        <Hand state={state} setState={setState} />

        <div className="toast">
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Log</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {state.log.slice(0, 8).map((l, i) => (
              <div key={i} style={{ opacity: i === 0 ? 1 : 0.85 }}>{l}</div>
            ))}
          </div>
        </div>

        <div className="footerHint">
          Disclaimer: not affiliated with arcmage.org — this is a small MVP. Rebirth assets: see <code>public/arcmage/rebirth/LICENSE.md</code>.
        </div>
      </div>
    </div>
  )
}
