# Practice Econ profiles

`practice-econ.json` contains 253 country/territory profiles, including every feature in the existing Natural Earth map. There is no GDP/export-size cutoff. All independent countries in the country identity source are playable; 233 countries and inhabited territories have enough facts for rounds. Microstates without map polygons remain selectable in the country picker.

## Fields and provenance

- `gdp`: nominal GDP in current US dollars. World Bank `NY.GDP.MKTP.CD`, latest available observation through 2024; IMF WEO `NGDPD` for gaps (billions converted to dollars, marked estimate). Natural Earth GDP is deliberately excluded because it mixes nominal and PPP values.
- `exports`: total merchandise exports, 2024 BACI via OEC. Sum across every HS4 product; services are excluded.
- `topExports`: the three largest HS 1992 four-digit products, descending by value. Product codes and original source names are preserved alongside a small set of readable labels (e.g. crude oil, aircraft parts). No HS2/section-level baskets.
- `population`: World Bank `SP.POP.TOTL`, latest available observation through 2024; dated Natural Earth population estimates for gaps.
- `region`, `capitals`: mledoze/countries identity data. Multiple capitals are retained. Palestine's Ramallah entry is specifically labeled an administrative centre. Verified overrides for Equatorial Guinea and Sri Lanka include primary-source URLs in `capitalSource`.
- `mapIds`: explicit Natural Earth ADM0 identifiers; no sovereign-code joins that would assign parent-country totals to territories. Kosovo codes are normalized to `XKX`.
- `missing`: fields without usable observations; null never means zero. `playable` does not imply all six facts are available.

Current coverage: GDP 213, population 240, exports and top-three products 226, subregion 248, capitals 245. 204 profiles have all six fields. Independent-country gaps: GDP for Eritrea, North Korea and Vatican City; separate exports for Liechtenstein, Monaco and Vatican City. No fabricated estimates fill those gaps. Full profiles show unavailable fields explicitly; rounds sample only available fields.

The identity-derived database is distributed under ODbL 1.0 (`practice-econ.LICENSE.txt`). Original source attribution, request URLs, and applicable source licenses are retained in `meta.sources`. The browser exposes a downloadable copy and attribution under Data & coverage.

## Rebuild

```sh
python3 scripts/build-practice-econ-data.py --refresh
```

Requires Python 3 and curl. Downloads source snapshots into the system temporary directory under `practice-econ-source`; `--cache-dir PATH` selects another directory. Without `--refresh`, cached snapshots are reused. No API calls are made by players; the browser loads the checked-in JSON. Recheck capital overrides and coverage when updating sources.

## Game rules

Each round selects a country from a shuffled bag and samples two different available fact categories. Top-three exports form one clue. Only clue pairs that uniquely identify the country among playable profiles **as displayed, including number rounding**, are eligible. Attempts are unlimited; repeated wrong guesses do not count again. Correct answers or Reveal expose the profile and enable Next country. The bag reshuffles after exhaustion without an immediate repeat. Progress is session-only, with no daily gate.

```sh
node --test tests/practice-econ.test.cjs
```
