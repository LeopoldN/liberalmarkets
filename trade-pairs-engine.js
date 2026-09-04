/* Daily puzzle generation shared by the browser and validation script. */
(function (root) {
  'use strict';
  function randomFor(text) {
    let value = 2166136261;
    for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
    return () => {
      value += 0x6D2B79F5;
      let x = Math.imul(value ^ (value >>> 15), value | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(list, random) {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  const pairKey = (a, b) => [a, b].sort().join(':');
  function solutionCount(deck, candidates) {
    const allowed = new Set(deck);
    const options = candidates.map(list => list.filter(p => allowed.has(p.source.iso3) && allowed.has(p.partner.iso3)));
    let count = 0;
    function visit(rank, used) {
      if (rank === 4) { count++; return; }
      for (const p of options[rank]) {
        if (count > 1) return;
        if (used.has(p.source.iso3) || used.has(p.partner.iso3)) continue;
        visit(rank + 1, new Set([...used, p.source.iso3, p.partner.iso3]));
      }
    }
    visit(0, new Set());
    return count;
  }
  function candidatesFor(countries, available) {
    const lists = [[], [], [], []], seen = lists.map(() => new Set());
    for (const source of [...countries].sort((a,b) => a.iso3.localeCompare(b.iso3))) {
      if (!available.has(source.iso3)) continue;
      source.partners.slice(0, 4).forEach((partner, rank) => {
        const key = pairKey(source.iso3, partner.iso3);
        if (source.iso3 === partner.iso3 || !available.has(partner.iso3) || seen[rank].has(key)) return;
        seen[rank].add(key);
        lists[rank].push({rank: rank + 1, source, partner, key});
      });
    }
    return lists;
  }
  function buildPuzzle(countries, date, available) {
    const random = randomFor(`trade-pairs-v1:2024:${date}`);
    const candidates = candidatesFor(countries, available);
    for (let attempt = 0; attempt < 5000; attempt++) {
      const pairs = [], used = new Set();
      for (let rank = 0; rank < 4; rank++) {
        const options = candidates[rank].filter(p => !used.has(p.source.iso3) && !used.has(p.partner.iso3));
        if (!options.length) break;
        const pair = options[Math.floor(random() * options.length)];
        pairs.push(pair); used.add(pair.source.iso3); used.add(pair.partner.iso3);
      }
      if (pairs.length === 4 && solutionCount([...used], candidates) === 1) {
        const countriesByCode = new Map();
        for (const pair of pairs) for (const country of [pair.source, pair.partner]) countriesByCode.set(country.iso3, country);
        return {date, pairs, deck: shuffled([...countriesByCode.values()], random)};
      }
    }
    throw new Error('Unable to generate an unambiguous puzzle.');
  }
  const api = {buildPuzzle, candidatesFor, solutionCount, pairKey};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TradePairs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
