import { SHIPYARD_PORT_ID, VESSELS, cargoCount } from './trade-winds-engine.mjs?v=cargo-80';

export const SHIPS = Object.freeze([
  { id: 'raft', name: 'Starting raft', price: null, label: 'Your first command',
    description: 'Lashed timber, a faithful sail, and the freedom of the sea.',
    pace: 'Steady sailing', capacity: VESSELS.raft.capacity },
  { id: 'trader', name: 'Trading sloop', price: 5000, label: 'A bigger horizon',
    description: 'A proper merchant vessel, with a tall rig and speed to spare.',
    pace: '54% faster sailing', capacity: VESSELS.trader.capacity },
]);

// Buying also equips the vessel. Owned vessels can be equipped freely at Belize.
// Cargo and hull condition travel with the captain; switching is not a repair.
export function selectShip(state, port, id) {
  const ship = SHIPS.find(ship => ship.id === id);
  if (port?.id !== SHIPYARD_PORT_ID || !ship)
    return { ok: false, message: 'Visit the Belize Town shipyard to change ships.' };
  if (state.vessel === id)
    return { ok: false, message: 'You are already sailing this vessel.' };
  if (cargoCount(state) > ship.capacity)
    return { ok: false, message: `${ship.name} holds ${ship.capacity} cargo. Sell cargo at a trading port before switching.` };
  const owned = state.ownedVessels.includes(id);
  if (!owned && ship.price === null)
    return { ok: false, message: 'The starting raft is not for sale.' };
  if (!owned && state.coins < ship.price)
    return { ok: false, message: `You need ${(ship.price - state.coins).toLocaleString()} more gold.` };
  if (!owned) {
    state.coins -= ship.price;
    state.ownedVessels.push(id);
  }
  state.vessel = id;
  state.capacity = ship.capacity;
  return { ok: true, purchased: !owned,
    message: `${ship.name} ${owned ? 'ready to sail' : 'purchased and ready to sail'}. Your cargo is aboard.` };
}
