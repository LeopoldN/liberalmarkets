const test=require('node:test');
const assert=require('node:assert/strict');
const data=require('../data/trade-game/practice-econ.json');
const {facts,createGame}=require('../scripts/practice-econ-engine.js');

test('profiles cover every mapped territory and all independent countries are playable',()=>{
  const geo=JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname,'../assets/geo/ne_50m_admin_0_countries.geojson'),'utf8'));
  assert.equal(new Set(data.countries.map(c=>c.iso3)).size,data.countries.length);
  for(const f of geo.features) assert.ok(data.countries.some(c=>c.mapIds.includes(f.properties.ADM0_A3)), f.properties.NAME);
  for(const c of data.countries) {
    if(c.independent) assert.ok(c.playable,c.name);
    for(const key of ['gdp','population','exports']) if(c[key]) {assert.ok(c[key].value>0);assert.ok(c[key].year<=2024);assert.ok(data.meta.sources[c[key].source]);}
    if(c.topExports.length) {assert.ok(c.exports.value>=c.topExports.reduce((n,p)=>n+p.value,0));assert.ok(c.topExports.every(p=>/^\d{4}$/.test(p.code)));assert.deepEqual(c.topExports.map(p=>p.value),c.topExports.map(p=>p.value).sort((a,b)=>b-a));}
  }
});
test('all countries cycle without repeats and clues never rely on unavailable facts',()=>{
  const game=createGame(data.countries,()=>.42), seen=new Set();let last;
  for(let i=0;i<game.countries.length;i++) {
    const round=game.next();assert.equal(round.clues.length,2);assert.deepEqual(round.clues.map(f=>f.key),['exports','topExports']);
    assert.ok(!seen.has(round.country.iso3)); seen.add(round.country.iso3);last=round.country.iso3;
    const matches=game.countries.filter(c=>round.clues.every(f=>facts(c).some(g=>f.key===g.key && f.value===g.value && f.note===g.note)));
    assert.deepEqual(matches.map(c=>c.iso3),[round.country.iso3]);
    for(const f of round.clues) { assert.ok(!round.country.missing.includes(f.key)); assert.notEqual(f.key,'region'); }
  }
  assert.notEqual(game.next().country.iso3,last);
});
test('wrong, duplicate, invalid, correct and reveal transitions',()=>{
  const game=createGame(data.countries,()=>.5);const round=game.next();const wrong=game.countries.find(c=>c.iso3!==round.country.iso3 && c.region===round.region);
  assert.equal(game.guess('').status,'invalid');assert.equal(game.guess(wrong.iso3).status,'wrong');assert.equal(game.guess(wrong.iso3).status,'duplicate');assert.deepEqual(game.guess(round.country.iso3),{status:'correct',attempts:2});assert.equal(game.guess(round.country.iso3).status,'finished');game.next();game.reveal();assert.equal(game.guess(wrong.iso3).status,'finished');
});
test('specific export products and corrected capitals are included',()=>{
 const lookup=code=>data.countries.find(c=>c.iso3===code);
 assert.equal(lookup('BWA').topExports[0].name,'Diamonds');assert.equal(lookup('SAU').topExports[0].name,'Crude oil');assert.equal(lookup('GNQ').capitals[0],'Ciudad de la Paz');assert.equal(lookup('KAZ').capitals[0],'Astana');assert.equal(lookup('VAT').gdp,null);
});

test('regions are exhausted before advancing and each world cycle includes every country',()=>{
 const game=createGame(data.countries,()=>.42);
 for(let cycle=0;cycle<2;cycle++) {
  const seen=new Set(), finished=new Set();let previous=null,count=0;
  for(let i=0;i<game.countries.length;i++) {
   const r=game.next();
   if(r.region!==previous){if(previous)finished.add(previous);assert.ok(!finished.has(r.region));previous=r.region;count=0;}
   assert.equal(r.regionIndex,++count);
   assert.equal(r.regionTotal,game.countries.filter(c=>c.region===r.region).length);
   assert.ok(!seen.has(r.country.iso3));seen.add(r.country.iso3);
   const outside=game.countries.find(c=>c.region!==r.region);
   assert.equal(game.guess(outside.iso3).status,'invalid');
  }
  assert.equal(seen.size,game.countries.length);
 }
});

test('selecting a subregion starts its full country set and then continues elsewhere',()=>{
 const game=createGame(data.countries,()=>.42);
 game.next();game.selectRegion('Western Europe');
 const expected=game.countries.filter(c=>c.region==='Western Europe');const seen=new Set();
 for(let i=0;i<expected.length;i++){
  const round=game.next();assert.equal(round.region,'Western Europe');assert.equal(round.regionIndex,i+1);seen.add(round.country.iso3);
 }
 assert.equal(seen.size,expected.length);assert.notEqual(game.next().region,'Western Europe');
 assert.throws(()=>game.selectRegion('Not a region'),/Unknown subregion/);
});
