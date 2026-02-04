import React, { useMemo, useState } from 'react'
import {
  createInitialState,
  nextPhase,
  playResource,
  canPlayResource,
  canChooseDrawResourceOption,
  chooseDrawResourceOption,
  playCreatureToCity,
  canPlayCardToCity,
  moveCreature,
  resolveAttack,
} from './engine/arcmage.js'

function Pill({ children }) {
  return <span className="pill">{children}</span>
}

function CardImage({ src, alt }) {
  if (!src) return null
  return (
    <img
      src={src}
      alt={alt}
      style={{ width: '100%', borderRadius: 10, marginTop: 8, border: '1px solid #394265' }}
      loading="lazy"
    />
  )
}

function HandCard({ card, onClick, disabled, label }) {
  return (
    <div className={['card', disabled ? 'danger' : ''].join(' ').trim()}>
      <div className="cardTitle">{card.name}</div>
      <div className="cardMeta">
        <span>{card.type}</span>
        <span>Cost {String(card.cost ?? '')}</span>
      </div>
      <CardImage src={card.image} alt={card.name} />
      <div className="cardText" style={{ whiteSpace: 'pre-wrap' }}>{card.ruleText || ''}</div>
      <div className="cardBtnRow">
        <button onClick={onClick} disabled={disabled}>
          {label}
        </button>
      </div>
    </div>
  )
}

function Creature({ cr, onClick, label }) {
  return (
    <div className={['card', cr.marked ? 'danger' : ''].join(' ').trim()}>
      <div className="cardTitle">{cr.name}</div>
      <div className="cardMeta">
        <span>{cr.atk}/{cr.def}</span>
        <span>{cr.marked ? 'marked' : 'unmarked'}</span>
      </div>
      <CardImage src={cr.card?.image} alt={cr.name} />
      {onClick ? (
        <div className="cardBtnRow">
          <button onClick={onClick}>{label}</button>
        </div>
      ) : null}
    </div>
  )
}

function City({ city, children }) {
  return (
    <div className="board" style={{ marginTop: 12 }}>
      <div className="boardTitle">
        <div>{city.card.name}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pill>Defense: {city.currentDefense}</Pill>
          <Pill>Residents: {city.residents.length}</Pill>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

export default function App() {
  const [seed, setSeed] = useState(1)
  const initial = useMemo(() => createInitialState(), [seed])
  const [state, setState] = useState(initial)

  const you = state.player
  const enemy = state.enemy

  const isYourTurn = state.current === 'player'

  const advance = () => {
    setState((prev) => {
      const s = structuredClone(prev)
      nextPhase(s)
      return s
    })
  }

  return (
    <div className="app">
      <div className="topbar">
        <div>
          <div style={{ fontWeight: 800, letterSpacing: 0.3 }}>CacaCards</div>
          <div style={{ opacity: 0.8, fontSize: 12 }}>
            ArcMage rules (1:1 target) — WIP core engine. Assets: see public/arcmage/rebirth/LICENSE.md
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Pill>Turn {state.turn}</Pill>
          <Pill>Current: {state.current}</Pill>
          <Pill>Phase: {state.phase}</Pill>
          <button onClick={advance} disabled={state.gameOver}>Next phase</button>
          <button onClick={() => setSeed((x) => x + 1)}>New game</button>
        </div>
      </div>

      {isYourTurn && state.phase === 'draw_resource' && !state.gameOver ? (
        <div className="board" style={{ marginTop: 12 }}>
          <div className="boardTitle">
            <div>Draw & Resource</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Pill>Choice: {you.drawResourceChoice || '—'}</Pill>
              <Pill>Resources this turn: {you.resourcesPlayedThisTurn}/{you.resourcesMaxThisTurn}</Pill>
            </div>
          </div>

          {you.drawResourceChoice == null ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => setState((prev) => {
                  const s = structuredClone(prev)
                  chooseDrawResourceOption(s, 'player', 'draw2')
                  return s
                })}
                disabled={!canChooseDrawResourceOption(state, 'player', 'draw2')}
              >
                Draw 2 (no resources)
              </button>
              <button
                onClick={() => setState((prev) => {
                  const s = structuredClone(prev)
                  chooseDrawResourceOption(s, 'player', 'draw1_play1')
                  return s
                })}
                disabled={!canChooseDrawResourceOption(state, 'player', 'draw1_play1')}
              >
                Draw 1 + play 1 resource
              </button>
              <button
                onClick={() => setState((prev) => {
                  const s = structuredClone(prev)
                  chooseDrawResourceOption(s, 'player', 'draw0_play2')
                  return s
                })}
                disabled={!canChooseDrawResourceOption(state, 'player', 'draw0_play2')}
              >
                Draw 0 + play 2 resources
              </button>
              <div className="footerHint">After choosing, click cards in hand to convert them into resources.</div>
            </div>
          ) : (
            <div className="footerHint">Now click cards in hand to convert them into resources (up to the limit).</div>
          )}
        </div>
      ) : null}

      {state.gameOver ? (
        <div className="banner">
          <div style={{ fontWeight: 800 }}>Game Over</div>
          <div>{state.winner === 'player' ? 'You win!' : 'You lose.'}</div>
        </div>
      ) : null}

      <div className="board">
        <div className="boardTitle">
          <div>Enemy</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Pill>Cities: {enemy.kingdom.length}</Pill>
            <Pill>Army: {enemy.army.length}</Pill>
            <Pill>Deck: {enemy.deck.length}</Pill>
            <Pill>Hand: {enemy.hand.length}</Pill>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {enemy.kingdom.map((c) => (
            <div key={c.id} className="pill">{c.card.name} ({c.currentDefense})</div>
          ))}
        </div>
      </div>

      <div className="hand">
        <div className="handTitle">Your hand</div>
        <div className="handCards">
          {you.hand.map((c) => {
            const canRes = canPlayResource(state, 'player')
            const inDR = state.phase === 'draw_resource'
            const label = inDR ? (canRes ? 'Resource' : (you.drawResourceChoice ? 'Limit reached' : 'Choose option')) : 'Play'

            return (
              <HandCard
                key={c.id}
                card={c}
                label={label}
                disabled={!isYourTurn || state.gameOver || (inDR && !canRes)}
                onClick={() => {
                  setState((prev) => {
                    const s = structuredClone(prev)
                    if (s.current !== 'player') return s

                    if (s.phase === 'draw_resource') {
                      if (canPlayResource(s, 'player')) {
                        playResource(s, 'player', c.id, c.faction || 'Dark Legion')
                      }
                      return s
                    }

                    // quick UX: play creature into first city if legal
                    const city = s.player.kingdom[0]
                    if (city && canPlayCardToCity(s, 'player', c.id, city.id)) {
                      playCreatureToCity(s, 'player', c.id, city.id)
                    }
                    return s
                  })
                }}
              />
            )
          })}
        </div>
        <div className="footerHint">
          WIP: click a card in Draw&Resource phase to turn it into a resource (defaults to the card faction).
        </div>
      </div>

      <div className="board">
        <div className="boardTitle">
          <div>You</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Pill>Cities: {you.kingdom.length}</Pill>
            <Pill>Army: {you.army.length}</Pill>
            <Pill>Deck: {you.deck.length}</Pill>
            <Pill>Hand: {you.hand.length}</Pill>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <div className="handTitle">Army</div>
            <div className="lanes">
              {you.army.map((cr) => (
                <Creature key={cr.id} cr={cr} />
              ))}
            </div>

            {state.phase === 'attack' && isYourTurn ? (
              <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={() => {
                    setState((prev) => {
                      const s = structuredClone(prev)
                      const attackers = s.player.army.filter((x) => !x.marked)
                      const target = s.enemy.kingdom[0]
                      if (attackers.length && target) {
                        resolveAttack(s, 'player', attackers.map((a) => a.id), target.id)
                      }
                      return s
                    })
                  }}
                  disabled={you.army.filter((x) => !x.marked).length === 0 || enemy.kingdom.length === 0}
                >
                  Attack enemy city (auto)
                </button>
                <div className="footerHint">(Defender assignment is auto for now.)</div>
              </div>
            ) : null}
          </div>

          <div style={{ flex: 2, minWidth: 360 }}>
            <div className="handTitle">Kingdom</div>
            {you.kingdom.map((city) => (
              <City key={city.id} city={city}>
                {city.residents.map((cr) => (
                  <Creature
                    key={cr.id}
                    cr={cr}
                    label="Move to army"
                    onClick={() => {
                      setState((prev) => {
                        const s = structuredClone(prev)
                        moveCreature(s, 'player', { kind: 'city', cityId: city.id }, { kind: 'army' }, cr.id)
                        return s
                      })
                    }}
                  />
                ))}
              </City>
            ))}
          </div>
        </div>

        <div className="footerHint">
          Target rules: core phases/resources/cities/army/movement/combat from https://arcmage.org/rules/. Next: full draw/resource options, defender assignment UI, loyalty costs, events stack, magic/enchantments.
        </div>
      </div>

      <div className="board">
        <div className="boardTitle">
          <div>Log</div>
        </div>
        <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, opacity: 0.9 }}>
          {state.log.slice(0, 14).map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
