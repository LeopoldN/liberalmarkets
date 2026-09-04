const assert = require('node:assert/strict');
const fs = require('node:fs');
const engine = require(process.cwd() + '/trade-pairs-engine.js');
const data = JSON.parse(fs.readFileSync('data/trade-game/truddies.json'));
const geo = JSON.parse(fs.readFileSync('assets/geo/ne_50m_admin_0_countries.geojson'));
const available = new Set(geo.features.flatMap(f => [f.properties.ISO_A3, f.properties.ISO_A3_EH, f.properties.ADM0_A3]));
const candidates = engine.candidatesFor(data.countries, available);
for (let day=0;day<60;day++) {
 const date = new Date(Date.UTC(2026,8,4+day)).toISOString().slice(0,10);
 const p=engine.buildPuzzle(data.countries,date,available);
 assert.equal(new Set(p.deck.map(c=>c.iso3)).size,8);
 assert.deepEqual(p.pairs.map(p=>p.rank),[1,2,3,4]);
 assert.equal(engine.solutionCount(p.deck.map(c=>c.iso3),candidates),1);
 for (const pair of p.pairs) assert.equal(pair.source.partners[pair.rank-1].iso3,pair.partner.iso3);
 assert.deepEqual(engine.buildPuzzle(data.countries,date,available),p);
}
console.log('60 daily puzzles: eight unique countries, correct ranks, one solution, deterministic generation.');
