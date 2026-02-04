import deckEmpire from './6776ddb8-3ce0-470b-8d2c-afb26bd29359.json'
import deckGaian from './b9c3f75d-8aaa-437a-b0dd-3d973edb3083.json'

export const DECKS = [
  {
    id: 'brothers-in-arms',
    name: deckEmpire.source.deckName || 'Brothers in Arms',
    guid: deckEmpire.source.deckGuid,
    data: deckEmpire,
  },
  {
    id: 'gaian-love-for-life',
    name: deckGaian.source.deckName || 'Gaian Love for Life',
    guid: deckGaian.source.deckGuid,
    data: deckGaian,
  },
]
