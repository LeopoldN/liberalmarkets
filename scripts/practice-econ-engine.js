/* Shared browser/Node rules for unlimited two-clue rounds. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PracticeEcon = api;
})(globalThis, () => {
  'use strict';
  const number = value => new Intl.NumberFormat('en', {notation:'compact', maximumSignificantDigits:3}).format(value);
  function facts(country) {
    const result = [];
    const metric = (key, label, money) => {
      const data = country[key];
      if (data?.value > 0) result.push({key, label, value:`${money?'$':''}${number(data.value)}`, note:`${data.year} · ${money?'current US$':'people'}${data.estimated?' · estimate':''}`, source:data.source});
    };
    metric('gdp', 'Total GDP', true);
    metric('exports', 'Goods exports', true);
    if (country.topExports?.length === 3) result.push({key:'topExports',label:'Top three exports',value:country.topExports.map(p=>p.name).join(' · '), note:`${country.exportsYear} · ranked by export value`,source:'baci'});
    metric('population','Population',false);
    if (country.region) result.push({key:'region',label:'Subregion',value:country.region,note:'',source:'identity'});
    if (country.capitals?.length) result.push({key:'capitals',label:country.capitalLabel || (country.capitals.length>1?'Capitals':'Capital'),value:country.capitals.join(' · '),note:'',source:country.capitalSource});
    return result;
  }
  const signature = fact => `${fact.key}:${fact.value}:${fact.note}`;
  function createGame(countries, random = Math.random) {
    const pool = countries.filter(c=>c.playable && c.exports?.value > 0 && c.topExports?.length === 3);
    // Compare the facts as displayed, so rounded numbers cannot create unfair rounds.
    // Game rounds currently use only the two export facts; profiles retain all facts.
    const options = pool.map(country => ({country, facts:facts(country).filter(f=>f.key==='exports' || f.key==='topExports')}));
    const rounds = options.map(entry => {
      const pairs = [];
      for (let i=0;i<entry.facts.length;i++) for(let j=i+1;j<entry.facts.length;j++) {
        const pair=[entry.facts[i],entry.facts[j]];
        if (!options.some(other=>other!==entry && pair.every(f=>other.facts.some(g=>signature(f)===signature(g))))) pairs.push(pair);
      }
      return {country:entry.country,pairs};
    }).filter(entry=>entry.pairs.length);
    if (!rounds.length) throw new Error('No countries have two distinct usable clues.');
    const regions = [...new Set(rounds.map(r=>r.country.region))];
    const shuffle = items => {
      const result=items.slice();
      for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
      return result;
    };
    let regionBag=[], bag=[], activeRegion=null, regionTotal=0, current=null, guesses=new Set(), done=false;
    function next() {
      if (!bag.length) {
        if (!regionBag.length) {
          regionBag=shuffle(regions);
          if(regionBag.length>1 && regionBag[regionBag.length-1]===activeRegion) [regionBag[0],regionBag[regionBag.length-1]]=[regionBag[regionBag.length-1],regionBag[0]];
        }
        activeRegion=regionBag.pop();
        bag=shuffle(rounds.filter(r=>r.country.region===activeRegion));
        regionTotal=bag.length;
      }
      const entry=bag.pop();
      current={country:entry.country,clues:entry.pairs[Math.floor(random()*entry.pairs.length)],region:activeRegion,regionIndex:regionTotal-bag.length,regionTotal};
      guesses=new Set(); done=false;
      return current;
    }
    function selectRegion(region) {
      if (!regions.includes(region)) throw new Error('Unknown subregion');
      if (region===activeRegion) return;
      if (!regionBag.length) regionBag=shuffle(regions);
      regionBag=regionBag.filter(name=>name!==region);
      activeRegion=region;
      bag=shuffle(rounds.filter(r=>r.country.region===region));
      regionTotal=bag.length;
      current=null;guesses=new Set();done=false;
    }
    function guess(code) {
      if (!current || done) return {status:'finished'};
      if (!pool.some(c=>c.iso3===code && c.region===activeRegion)) return {status:'invalid'};
      if (guesses.has(code)) return {status:'duplicate'};
      guesses.add(code); done=code===current.country.iso3;
      return {status:done?'correct':'wrong',attempts:guesses.size};
    }
    function reveal() { done=true; return current?.country; }
    return {next,guess,reveal,selectRegion,regions:regions.slice().sort(),countries:rounds.map(r=>r.country)};
  }
  return {facts,createGame};
});
