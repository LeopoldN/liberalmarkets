"""Build complete country profiles. Run: python3 scripts/build-practice-econ-data.py
Use --cache-dir PATH to reuse downloaded source snapshots; --refresh to fetch anew.
"""
import argparse
import collections
import datetime
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
YEAR = 2024
URLS = {
    'trade': 'https://api-v2.oec.world/tesseract/data.jsonrecords?cube=trade_i_baci_a_92&drilldowns=Exporter%20Country,HS4&include=Year:2024&locale=en&parents=true&measures=Trade%20Value',
    'gdp': 'https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?date=2000:2024&format=json&per_page=20000',
    'population': 'https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?date=2015:2024&format=json&per_page=20000',
    'imf': 'https://www.imf.org/external/datamapper/api/v1/NGDPD/2024',
    'identity': 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json',
}
CODES = {'UNK': 'XKX', 'KOS': 'XKX'}
PRODUCT_NAMES = {'2709': 'Crude oil', '2710': 'Refined petroleum', '2711': 'Petroleum gas', '3004': 'Packaged medicines', '8708': 'Vehicle parts', '8802': 'Aircraft and spacecraft', '8803': 'Aircraft parts', '7102': 'Diamonds', '2201': 'Water', '8542': 'Integrated circuits', '3901': 'Ethylene polymers'}
CAPITAL_FIXES = {
    'GNQ': (['Ciudad de la Paz'], 'https://www.minfopressyculturage.com/editorial-del-mipc-ciudad-de-la-paz-nuevo-corazon-institucional-de-guinea-ecuatorial/'),
    'LKA': (['Sri Jayewardenepura Kotte'], 'https://www.mfa.gov.lk/national-profile-and-geography'),
}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache-dir', type=Path, default=Path(tempfile.gettempdir()) / 'practice-econ-source')
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    raw = {}
    for key, url in URLS.items():
        file = args.cache_dir / f'{key}.json'
        if args.refresh or not file.exists():
            subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error', '--retry', '3', '--max-time', '180', url, '-o', str(file)], check=True)
        raw[key] = json.loads(file.read_text())
    assert isinstance(raw['identity'], list) and len(raw['identity']) > 240
    assert len(raw['trade']['data']) == raw['trade']['page']['total'], 'Paginated trade response'
    geo = json.loads((ROOT / 'assets/geo/ne_50m_admin_0_countries.geojson').read_text())['features']
    countries = {}
    for c in raw['identity']:
        code = CODES.get(c['cca3'], c['cca3'])
        countries[code] = dict(iso3=code, name=c['name']['common'], aliases=list(set(c['altSpellings'] + [c['name']['official']])), independent=bool(c.get('independent')), mapIds=[], region=c['subregion'] or None, capitals=c['capital'], latitude=c['latlng'][0], longitude=c['latlng'][1], capitalSource='identity')
    geo_by_code = {}
    for f in geo:
        p = f['properties']
        code = CODES.get(p['ADM0_A3'], p['ISO_A3_EH'] if p['ISO_A3_EH'] != '-99' else p['ADM0_A3'])
        if code not in countries:
            countries[code] = dict(iso3=code, name=p['NAME_LONG'], aliases=[p['NAME']], independent=False, mapIds=[], region=p['SUBREGION'], capitals=[], latitude=p['LABEL_Y'], longitude=p['LABEL_X'], capitalSource=None)
        countries[code]['mapIds'].append(p['ADM0_A3'])
        geo_by_code[code] = p
    metrics = {}
    for key in ['gdp', 'population']:
        assert raw[key][0]['pages'] == 1
        lookup = {}
        for row in raw[key][1]:
            code = row['countryiso3code']
            if row['value'] and (code not in lookup or int(row['date']) > lookup[code]['year']):
                lookup[code] = dict(value=round(row['value']), year=int(row['date']), source='worldBank')
        metrics[key] = lookup
    trade = collections.defaultdict(list)
    for row in raw['trade']['data']:
        code = CODES.get(row['Exporter Country ID'][-3:].upper(), row['Exporter Country ID'][-3:].upper())
        product = str(int(row['HS4 ID']) % 10000).zfill(4)
        if row['Trade Value'] > 0:
            trade[code].append(dict(code=product, name=PRODUCT_NAMES.get(product, row['HS4']), sourceName=row['HS4'], value=round(row['Trade Value'])))
    for code, c in countries.items():
        p = geo_by_code.get(code, {})
        c['gdp'] = metrics['gdp'].get(code)
        c['population'] = metrics['population'].get(code)
        # Natural Earth's GDP mixes nominal and PPP figures; never use it for GDP.
        imf_value = raw['imf']['values']['NGDPD'].get(code, {}).get(str(YEAR))
        if not c['gdp'] and imf_value and imf_value > 0:
            c['gdp'] = dict(value=round(imf_value*1000000000), year=YEAR, source='imf', estimated=True)
        # Older population estimates retain their own years and attribution.
        for field, value, year in [('population', p.get('POP_EST'), p.get('POP_YEAR'))]:
            if not c[field] and value and value > 0 and year and year > 0:
                c[field] = dict(value=round(value), year=year, source='naturalEarth', estimated=True)
        products = sorted(trade.get(code, []), key=lambda r: -r['value'])
        c['exports'] = dict(value=sum(r['value'] for r in products), year=YEAR, source='baci', scope='goods') if products else None
        c['topExports'] = products[:3]
        c['exportsYear'] = YEAR if products else None
        if code in CAPITAL_FIXES:
            c['capitals'], c['capitalSource'] = CAPITAL_FIXES[code]
        if code == 'PSE':
            c['capitalLabel'] = 'Administrative centre'
        c['missing'] = [key for key in ['gdp', 'population', 'exports', 'region', 'capitals'] if not c[key]]
        if len(c['topExports']) < 3:
            c['missing'].append('topExports')
        # Include small states and inhabited territories, with no trade-size cutoff.
        c['playable'] = bool(c['region'] and c['capitals'] and (c['independent'] or (c['population'] and c['population']['value'] > 0)))
    output = ROOT / 'data/trade-game/practice-econ.json'
    items = sorted(countries.values(), key=lambda c: c['name'])
    sources = {
        'baci': dict(name='CEPII BACI via OEC', url='https://oec.world/en/resources/datasets', license='CC BY 4.0', request=URLS['trade']),
        'worldBank': dict(name='World Bank WDI', url='https://data.worldbank.org', license='CC BY 4.0', requests={k: URLS[k] for k in ['gdp','population']}),
        'naturalEarth': dict(name='Natural Earth map estimates', url='https://www.naturalearthdata.com/', license='Public domain'),
        'imf': dict(name='IMF World Economic Outlook, NGDPD', url='https://www.imf.org/external/datamapper/NGDPD@WEO', request=URLS['imf']),
        'identity': dict(name='mledoze/countries', url='https://github.com/mledoze/countries', license='ODbL 1.0', request=URLS['identity']),
    }
    payload = dict(meta=dict(year=YEAR, generatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), classification='HS 1992, 4-digit products', countryCount=len(items), playableCount=sum(c['playable'] for c in items), sources=sources, license='ODbL 1.0; source attribution retained', missingPolicy='Missing values are null; missing clues are never sampled. No sovereign-country totals are copied into dependent territories.'), countries=items)
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':'))+'\n')
    print(f'Wrote {len(items)} profiles; {payload["meta"]["playableCount"]} playable.')
    print('Coverage:', {key:sum(key not in c['missing'] for c in items) for key in ['gdp','population','exports','topExports','region','capitals']})

if __name__ == '__main__':
    main()
