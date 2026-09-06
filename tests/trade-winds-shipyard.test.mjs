import test from 'node:test';
import assert from 'node:assert/strict';
import { PORTS, newState, parseSave, transact } from '../trade-winds-engine.mjs';
import { SHIPS, selectShip } from '../trade-winds-shipyard.mjs';

const belize = PORTS.find(port => port.id === 'belize');
const fresh = () => newState({ x: 0, z: 0 });

test('the starter raft is owned and not for sale; the sloop costs 5,000 gold', () => {
  assert.deepEqual(fresh().ownedVessels, ['raft']);
  assert.equal(SHIPS.find(ship => ship.id === 'raft').price, null);
  assert.equal(SHIPS.find(ship => ship.id === 'trader').price, 5000);
});

test('buying a sloop equips it once and keeps cargo, hull, and ownership through saves', () => {
  const state = fresh();
  state.coins = 5100;
  state.health = 62;
  state.cargo.rum = 12;
  const before = structuredClone(state);
  assert.equal(selectShip(state, belize, 'trader').purchased, true);
  assert.deepEqual(state, { ...before, coins: 100, vessel: 'trader', capacity: 80, ownedVessels: ['raft', 'trader'] });
  assert.equal(selectShip(state, belize, 'trader').ok, false);
  assert.equal(state.coins, 100);
  assert.deepEqual(parseSave(JSON.stringify(state)), state);
  assert.equal(selectShip(state, belize, 'raft').purchased, false);
  assert.equal(state.vessel, 'raft');
  assert.equal(selectShip(state, belize, 'trader').purchased, false);
  assert.equal(state.coins, 100);
  assert.equal(state.health, 62);
  assert.deepEqual(state.cargo, before.cargo);
});

test('insufficient gold, other ports, unknown ships and raft purchase failures never mutate the voyage', () => {
  for (const [port, id] of [[belize, 'trader'], [PORTS[0], 'trader'], [belize, 'frigate']]) {
    const state = fresh();
    if (port !== belize) state.coins = 9000;
    const before = structuredClone(state);
    assert.equal(selectShip(state, port, id).ok, false);
    assert.deepEqual(state, before);
  }
  const state = fresh();
  state.vessel = 'trader'; state.ownedVessels = ['trader'];
  const before = structuredClone(state);
  assert.equal(selectShip(state, belize, 'raft').ok, false);
  assert.deepEqual(state, before);
});

test('Belize rejects cargo trading while ordinary markets continue to work', () => {
  const state = fresh();
  state.cargo.rum = 1;
  const before = structuredClone(state);
  for (const mode of ['buy', 'sell']) assert.equal(transact(state, belize, 'rum', mode, 1).ok, false);
  assert.deepEqual(state, before);
  assert.equal(transact(state, PORTS[0], 'rum', 'sell', 1).ok, true);
});

test('old saves retain their current vessel and malformed ownership is rejected', () => {
  for (const vessel of ['raft', 'trader', undefined]) {
    const old = fresh();
    delete old.ownedVessels;
    if (vessel) old.vessel = vessel;
    else delete old.vessel;
    const restored = parseSave(JSON.stringify(old));
    assert.equal(restored.capacity, vessel === 'raft' ? 40 : 80);
    assert.deepEqual(restored.ownedVessels, vessel === 'raft' ? ['raft'] : ['raft', 'trader']);
  }
  for (const ownedVessels of [null, 'raft', [], ['trader'], ['raft', 'raft'], ['raft', 'frigate']])
    assert.equal(parseSave(JSON.stringify({ ...fresh(), ownedVessels })), null);
  assert.equal(parseSave(JSON.stringify({ ...fresh(), vessel: 'trader' })), null);
});

test('sloops hold 80 cargo and cannot transfer an oversized load to the raft', () => {
  const state = fresh();
  state.coins = 20000;
  assert.equal(selectShip(state, belize, 'trader').ok, true);
  assert.equal(state.capacity, 80);
  assert.equal(transact(state, PORTS[0], 'rum', 'buy', 80).ok, true);
  assert.equal(transact(state, PORTS[0], 'rum', 'buy', 1).ok, false);
  assert.deepEqual(parseSave(JSON.stringify(state)), state);
  const before = structuredClone(state);
  assert.equal(selectShip(state, belize, 'raft').ok, false);
  assert.deepEqual(state, before, 'switching never loses cargo');
  assert.equal(transact(state, PORTS[0], 'rum', 'sell', 40).ok, true);
  assert.equal(selectShip(state, belize, 'raft').ok, true);
  assert.equal(state.capacity, 40);
  assert.equal(state.cargo.rum, 40);
  assert.deepEqual(parseSave(JSON.stringify(state)), state);
});
