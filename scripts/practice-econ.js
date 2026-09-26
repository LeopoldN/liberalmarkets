(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const svg = $('map'), world = $('map-world'), select = $('country-select');
  const ns = 'http://www.w3.org/2000/svg';
  const mobileView = matchMedia('(max-width: 600px)');
  let desktopTheme = 'dark';
  try { desktopTheme = localStorage.getItem('trade-games:theme') === 'light' ? 'light' : 'dark'; } catch {}
  const colors = ['#899077','#a39b79','#8a9e97','#a18b7c','#81927e','#b0a389','#8195a0','#99947c','#a18e96','#a7ab8c','#859a8c','#a99a83','#8d8c9b'];
  // Map colors from the supplied HOI4 palette (not color_ui). Keys are ISO3.
  // SOV → Russia; CHI → Taiwan; PRC → China. Historical-only tags are omitted.
  const countryColors = {
    DEU: '#666057', // GER
    GBR: '#c9385d', // ENG
    RUS: '#7d0d18', // SOV
    SWE: '#2484f7', // SWE
    FRA: '#3971e4', // FRA
    LUX: '#41afb3', // LUX
    BEL: '#c1ab08', // BEL
    NLD: '#cb8a4a', // HOL
    CZE: '#36a79c', // CZE
    POL: '#c55c6a', // POL
    AUT: '#c2c6d7', // AUS
    LTU: '#dbdb77', // LIT
    EST: '#3287af', // EST
    LVA: '#4b4dba', // LAT
    ESP: '#f2cd5e', // SPR
    ITA: '#437f3f', // ITA
    ROU: '#d7c448', // ROM
    CHE: '#e00505', // SWI
    TUR: '#abbe98', // TUR
    GRC: '#5db5e3', // GRE
    ALB: '#952d66', // ALB
    NOR: '#6f4747', // NOR
    DNK: '#99745d', // DEN
    BGR: '#339b00', // BUL
    PRT: '#277446', // POR
    FIN: '#cdd4e4', // FIN
    IRL: '#509f5a', // IRE
    HUN: '#f97e62', // HUN
    AFG: '#40a0a7', // AFG
    ARG: '#919dec', // ARG
    AUS: '#398f61', // AST
    BTN: '#ac7a58', // BHU
    BOL: '#cca66c', // BOL
    BRA: '#4c913f', // BRA
    CAN: '#773027', // CAN
    TWN: '#dae65c', // CHI
    CHL: '#9b656b', // CHL
    COL: '#debb5b', // COL
    CRI: '#98802b', // COS
    ECU: '#f99262', // ECU
    SLV: '#9882bf', // ELS
    ETH: '#9882bf', // ETH
    GTM: '#483170', // GUA
    HND: '#809141', // HON
    IRQ: '#b27263', // IRQ
    JPN: '#ffc9b3', // JAP
    LBR: '#9882bf', // LIB
    MEX: '#689853', // MEX
    NPL: '#9882bf', // NEP
    NIC: '#92b3bf', // NIC
    NZL: '#9882bf', // NZL
    PAN: '#9882bf', // PAN
    IRN: '#477161', // PER
    PHL: '#9882bf', // PHI
    PER: '#c4bdcc', // PRU
    ZAF: '#9882bf', // SAF
    SAU: '#abbe98', // SAU
    THA: '#abbe98', // SIA
    URY: '#abbe98', // URG
    VEN: '#abbe98', // VEN
    USA: '#1485ed', // USA
    MNG: '#6c8c2a', // MON
    PRY: '#3971e4', // PAR
    CUB: '#8c41a6', // CUB
    DOM: '#9882bf', // DOM
    HTI: '#ae7171', // HAI
    YEM: '#9b656b', // YEM
    OMN: '#9b656b', // OMA
    SVK: '#9ea1bc', // SLO
    IND: '#aa0a0a', // RAJ
    HRV: '#e646b4', // CRO
    CHN: '#f50c37', // PRC
    LBY: '#c8b45a', // LBA
    EGY: '#e6e646', // EGY
    PSE: '#aa7d50', // PAL
    LBN: '#82963c', // LEB
    JOR: '#6f374e', // JOR
    SYR: '#646496', // SYR
    SRB: '#a06e6e', // SER
    ISL: '#647daf', // ICE
    UKR: '#0050e6', // UKR
    AZE: '#459731', // AZR
    GEO: '#ff9696', // GEO
    ARM: '#b066b4', // ARM
    LAO: '#b06688', // LAO
    IDN: '#809e76', // INS
    VNM: '#e6df32', // VIN
    KHM: '#644796', // CAM
    MYS: '#d5a979', // MAL
    MNE: '#4d5a69', // MNT
    AGO: '#258c3d', // ANG
    COD: '#989fd1', // COG
    MOZ: '#703e5a', // MZB
    KEN: '#91670e', // KEN
    ZWE: '#0707ef', // ZIM
    BWA: '#0b8470', // BOT
    PAK: '#152642', // PAK
    BLR: '#b4dcbe', // BLR
  };
  let mode='game', savedGame=null;
  const regionPaths=new Map();
  const regionResults=new Map();
  let game = null, round = null, profiles = [], roundNumber = 0, solved = 0, roundDone = false;
  let countries = [], selected = null, scale = 1, tx = 0, ty = 0, drag = null, labels = true;
  const make = (tag, attrs, parent) => { const el = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,v)); parent.append(el); return el; };
  const project = ([lon, lat]) => [(lon + 180) * 4, (90 - lat) * 4];
  let viewWidth = 1440, viewHeight = 720;
  const minScale = () => Math.max(1, viewWidth / 1440);
  let renderFrame = 0, labelTimer = 0;
  function update() {
    scale = Math.max(minScale(), scale);
    // Horizontal translation is unbounded; the renderer wraps repeated world tiles.
    ty = Math.max(viewHeight - 720*scale, Math.min(0, ty));
    // Input can arrive faster than the display refreshes (including twice per pinch).
    // Clamp latitude synchronously; paint only the latest state per frame.
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      const period=1440*scale;
      const wrappedX=((tx % period)+period)%period-period;
      world.setAttribute('transform', `translate(${wrappedX} ${ty}) scale(${scale})`);
      $('zoom-out').disabled = scale <= minScale();
      $('zoom-in').disabled = scale === 10;
      const nextView = `${scale}:${svg.getScreenCTM().a}:${mobileView.matches || labels}`;
      if (nextView !== labelView) {
        clearTimeout(labelTimer);
        // Keep the existing labels during the gesture; refine their fit once it settles.
        labelTimer = setTimeout(updateLabels, 120);
      }
    });
  }
  // Reject a label rectangle if any coastline, border, or hole enters it.
  // Checking only its corners would miss narrow bays and concave borders.
  function segmentEntersBox(a, b, box) {
    let low = 0, high = 1;
    for (let axis = 0; axis < 2; axis++) {
      const min = axis ? box.y : box.x;
      const max = min + (axis ? box.h : box.w);
      const delta = b[axis] - a[axis];
      if (delta === 0) { if (a[axis] < min || a[axis] > max) return false; }
      else {
        const t1 = (min - a[axis]) / delta, t2 = (max - a[axis]) / delta;
        low = Math.max(low, Math.min(t1, t2));
        high = Math.min(high, Math.max(t1, t2));
        if (low > high) return false;
      }
    }
    return true;
  }
  let labelView = '';
  function updateLabels() {
    const pixelsPerUnit = svg.getScreenCTM().a;
    const showLabels = mobileView.matches || labels;
    const view = `${scale}:${pixelsPerUnit}:${showLabels}`;
    if (view === labelView) return;
    labelView = view;
    const ordered = [...countries].sort((a,b) => a.rank-b.rank);
    // Batch writes, then reads: alternating these for every country forced repeated layout.
    for (const c of ordered) {
      c.label.style.display = showLabels ? '' : 'none';
      if (!showLabels) continue;
      c.labelSize = Math.max(10, c.fontSize) / (scale * pixelsPerUnit);
      c.label.setAttribute('font-size', c.labelSize);
      c.label.style.letterSpacing = `${c.labelSize * .12}px`;
    }
    if (!showLabels) return;
    const boundsList = ordered.map(c => {
      const box = c.label.getBBox(), pad = c.labelSize * .18;
      return {x:box.x-pad,y:box.y-pad,w:box.width+2*pad,h:box.height+2*pad};
    });
    const occupied = [];
    const visible = ordered.map((c,index) => {
      const bounds = boundsList[index];
      const center = new DOMPoint(bounds.x+bounds.w/2, bounds.y+bounds.h/2);
      const fits = c.path.isPointInFill(center) && !c.rings.some(ring =>
        ring.some((point, i) => segmentEntersBox(point, ring[(i+1)%ring.length], bounds)));
      const overlaps = occupied.some(b => bounds.x < b.x+b.w && bounds.x+bounds.w > b.x && bounds.y < b.y+b.h && bounds.y+bounds.h > b.y);
      if (fits && !overlaps) occupied.push(bounds);
      return fits && !overlaps;
    });
    ordered.forEach((c,index) => { c.label.style.display = visible[index] ? '' : 'none'; });
  }

  new ResizeObserver(() => {
    const bounds=svg.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const centerX=(viewWidth/2-tx)/scale, centerY=(viewHeight/2-ty)/scale;
    viewWidth=720*bounds.width/bounds.height;
    svg.setAttribute('viewBox', `0 0 ${viewWidth} ${viewHeight}`);
    tx=viewWidth/2-centerX*scale; ty=viewHeight/2-centerY*scale;
    update();
  }).observe(svg);

  function zoom(factor, x = viewWidth/2, y = viewHeight/2) { const next = Math.max(minScale(), Math.min(10, scale * factor)); tx = x - (x-tx)*next/scale; ty = y - (y-ty)*next/scale; scale = next; update(); }
  const pulseTimers=new Map();
  function clearPulses() {
    for(const [path,timer] of pulseTimers){clearTimeout(timer);path.classList.remove('country-pulse-a','country-pulse-b');}
    pulseTimers.clear();
  }
  function pulseCountry(country,color='#fff0b2') {
    const path=country.path;
    clearTimeout(pulseTimers.get(path));
    const next=path.classList.contains('country-pulse-a')?'country-pulse-b':'country-pulse-a';
    path.classList.remove('country-pulse-a','country-pulse-b');
    path.style.setProperty('--pulse-color',color);
    path.classList.add(next);
    pulseTimers.set(path,setTimeout(()=>{path.classList.remove(next);pulseTimers.delete(path);},2400));
  }
  function pulseProfile(profile,color) {
    countries.filter(c=>profile?.mapIds.includes(c.properties.ADM0_A3)).forEach(c=>pulseCountry(c,color));
  }
  function choose(index, focus = false) {
    if (mode==='game' && roundDone) return;
    selected?.path.classList.remove('selected');
    selected = countries[index] || null;
    if (!selected) return;
    selected.path.classList.add('selected');
    pulseCountry(selected);
    const profile = profiles.find(c => c.mapIds.includes(selected.properties.ADM0_A3));
    if (mode==='explore' && profile) {
      select.value=profile.iso3; renderProfile(profile); $('round-status').textContent=''; return;
    }
    if (!profile || !game?.countries.some(c=>c.iso3===profile.iso3 && c.region===round.region)) {
      select.value = '';
      $('submit-guess').disabled = true;
      if (!roundDone) $('round-status').textContent = `Choose a country in ${round.region}.`;
      return;
    }
    select.value = profile.iso3;
    $('submit-guess').disabled = roundDone;
    const p = selected.properties;
    if (focus) { const [x,y] = project([p.LABEL_X,p.LABEL_Y]); scale = 3; tx = viewWidth/2-x*scale; ty=viewHeight/2-y*scale; update(); }
  }
  function point(e) { const p = new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse()); return [p.x,p.y]; }
  const pointers=new Map();
  let pinch=null;
  const pinchPoints=()=>{const [a,b]=[...pointers.values()];return {x:(a[0]+b[0])/2,y:(a[1]+b[1])/2,d:Math.hypot(a[0]-b[0],a[1]-b[1])};};
  svg.addEventListener('pointerdown', e => {
    if(e.button!==0) return;
    const [x,y]=point(e); pointers.set(e.pointerId,[x,y]); svg.setPointerCapture(e.pointerId);
    if(pointers.size===1) drag={id:e.pointerId,x,y,tx,ty,target:e.target,moved:false};
    else {drag=null;pinch=pinchPoints();}
    svg.classList.add('dragging');
  });
  svg.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId)) return;
    const [x,y]=point(e);pointers.set(e.pointerId,[x,y]);
    if(pointers.size>=2){const next=pinchPoints();if(pinch?.d){zoom(next.d/pinch.d,pinch.x,pinch.y);tx+=next.x-pinch.x;ty+=next.y-pinch.y;update();}pinch=next;return;}
    if(!drag) return;
    if(Math.hypot(x-drag.x,y-drag.y)>4) drag.moved=true;
    tx=drag.tx+x-drag.x;ty=drag.ty+y-drag.y;update();
  });
  function pickCountry(x,y) {
    // SVG <use> retargets events to the instance, so hit-test in canonical map coordinates.
    const px=(((x-tx)/scale)%1440+1440)%1440, py=(y-ty)/scale;
    const point=new DOMPoint(px,py);
    const index=countries.findIndex(c=>{
      const b=c.bounds;
      return px>=b.x && px<=b.x+b.width && py>=b.y && py<=b.y+b.height && c.path.isPointInFill(point);
    });
    if(index>=0) choose(index);
  }
  function endPointer(e){
    if(!pointers.has(e.pointerId)) return;
    if(e.type==='pointerup' && drag && !drag.moved) pickCountry(...point(e));
    pointers.delete(e.pointerId);pinch=null;drag=null;
    if(pointers.size===1){const [id,[x,y]]=[...pointers.entries()][0];drag={id,x,y,tx,ty,moved:true};}
    if(!pointers.size) svg.classList.remove('dragging');
  }
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>svg.addEventListener(type,endPointer));
  svg.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(-e.deltaY*.0015), ...point(e)); }, {passive:false});
  svg.addEventListener('keydown', e => { if (['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key)) e.preventDefault(); else return; if (e.key==='+' || e.key==='=') zoom(1.3); else if(e.key==='-') zoom(1/1.3); else if(e.key==='Home') reset(); else { tx+=e.key==='ArrowLeft'?60:e.key==='ArrowRight'?-60:0; ty+=e.key==='ArrowUp'?60:e.key==='ArrowDown'?-60:0; update(); } });
  function reset() { scale=minScale(); tx=viewWidth/2-760*scale; ty=viewHeight/2-320*scale; update(); }
  $('zoom-in').onclick=()=>zoom(1.4); $('zoom-out').onclick=()=>zoom(1/1.4); $('reset-map').onclick=reset;
  select.onchange=()=>{
    const profile=profiles.find(c=>c.iso3===select.value);
    selected?.path.classList.remove('selected'); selected=null;
    if (profile) {
      const index=countries.findIndex(c=>profile.mapIds.includes(c.properties.ADM0_A3));
      if (index>=0) choose(index);
      else if(mode==='explore') {renderProfile(profile); $('round-status').textContent='';}
    }
    $('submit-guess').disabled=!profile || roundDone;
  };
  $('labels-toggle').onclick=()=>{ if(mobileView.matches) return; labels=!labels; $('labels-toggle').setAttribute('aria-pressed',labels); $('labels-toggle').textContent=`Labels ${labels?'on':'off'}`; update(); };
  function theme() {
    const dark=mobileView.matches || desktopTheme==='dark';
    document.documentElement.dataset.theme=dark?'dark':'light';
    $('theme-toggle').textContent=dark?'Dark':'Light';
    $('theme-toggle').setAttribute('aria-pressed',dark);
    $('theme-toggle').setAttribute('aria-label','Dark mode');
    document.querySelector('meta[name="theme-color"]').content=dark?'#151515':'#ffffff';
  }
  $('theme-toggle').onclick=()=>{
    if(mobileView.matches) return;
    desktopTheme=desktopTheme==='dark'?'light':'dark';
    try{localStorage.setItem('trade-games:theme',desktopTheme);}catch{}
    theme();
  };
  mobileView.addEventListener('change',()=>{theme();update();});
  theme();
  async function load() {
    $('map-message').textContent='Bringing the world into view…';
    try {
      const [data, profileData, regionData] = await Promise.all(['assets/geo/ne_50m_admin_0_countries.geojson','data/trade-game/practice-econ.json','assets/geo/practice-econ-regions.geojson'].map(async url=>{
        const response=await fetch(url);
        if (!response.ok) throw new Error(`Unable to load ${url}`);
        return response.json();
      }));
      regionPaths.clear();
      for(const feature of regionData.features) {
        const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
        regionPaths.set(feature.properties.region,polygons.map(polygon=>polygon.map(ring=>ring.map((coord,i)=>`${i?'L':'M'}${project(coord).map(n=>n.toFixed(2)).join(',')}`).join('')+'Z').join('')).join(''));
      }
      profiles=profileData.countries;
      game=PracticeEcon.createGame(profiles);
      $('region-select').replaceChildren(...game.regions.map(region=>new Option(region,region)));
      $('region-select').disabled=false;
      $('countries').replaceChildren(); $('country-labels').replaceChildren();
      $('data-coverage').textContent=`${profiles.length} country and territory profiles; ${game.countries.length} playable. No minimum GDP or export size. Every round shows goods exports and top three exports. Countries without both export facts are excluded from rounds.`;
      const features=data.features.filter(f=>['Polygon','MultiPolygon'].includes(f.geometry?.type) && f.properties.ADM0_A3!=='ATA').sort((a,b)=>a.properties.NAME.localeCompare(b.properties.NAME));
      countries=features.map((f,index)=>{
        const p=f.properties, polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
        const d=polygons.map(polygon=>polygon.map(ring=>ring.map((coord,i)=>`${i?'L':'M'}${project(coord).map(n=>n.toFixed(2)).join(',')}`).join('')+'Z').join('')).join('');
        const path=make('path',{d,fill:countryColors[p.ISO_A3_EH] || countryColors[p.ISO_A3] || countryColors[p.ADM0_A3] || colors[(p.MAPCOLOR13-1+13)%13],class:'country','data-index':index,'fill-rule':'evenodd'},$('countries'));
        make('title',{},path).textContent=p.NAME_LONG || p.NAME;
        const [x,y]=project([p.LABEL_X,p.LABEL_Y]);
        const label=make('text',{x,y,class:'country-label',style:'display:none','font-size':p.LABELRANK<=2?11:p.LABELRANK<=4?8:5},$('country-labels'));
        label.textContent=p.NAME.toUpperCase();
        return {path,label,rings:polygons.flatMap(polygon=>polygon.map(ring=>ring.map(coord=>project(coord).map(n=>Number(n.toFixed(2)))))),properties:p,rank:p.LABELRANK,fontSize:p.LABELRANK<=2?11:p.LABELRANK<=4?8:5};
      });
      countries.forEach(c=>{c.bounds=c.path.getBBox();});
      $('mode-game').disabled=false; $('mode-explore').disabled=false; select.disabled=false; $('map-message').hidden=true; $('retry-data').hidden=true; labelView=''; update(); nextRound();
    } catch(error) {
      $('map-message').textContent='The map could not be loaded. Please try again.';
      const retry=document.createElement('button'); retry.textContent='Retry'; retry.onclick=load; $('map-message').append(retry);
      $('round-status').textContent='Country facts could not load. Please retry.'; $('retry-data').hidden=false;
      console.error(error);
    }
  }
  function renderFact(fact, parent) {
    const wrapper=document.createElement('div'); wrapper.className='fact';
    const term=document.createElement('dt'); term.textContent=fact.label;
    const value=document.createElement('dd'); value.textContent=fact.value;
    if (fact.note) { const note=document.createElement('small'); note.textContent=fact.note; value.append(note); }
    wrapper.append(term,value); parent.append(wrapper);
  }
  function populatePicker() {
    const pool=mode==='explore'?profiles:game.countries.filter(c=>c.region===round.region);
    select.replaceChildren(new Option(mode==='explore'?'Select a country…':`Choose in ${round.region}…`,''));
    pool.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(c=>select.add(new Option(c.name,c.iso3)));
  }
  function renderProfile(profile) {
    const heading=document.createElement('h2'); heading.textContent=profile.name;
    const list=document.createElement('dl');
    PracticeEcon.facts(profile).forEach(fact=>renderFact(fact,list));
    const missingLabels={gdp:'Total GDP',exports:'Goods exports',topExports:'Top three exports',population:'Population',region:'Subregion',capitals:'Capital'};
    profile.missing.forEach(key=>renderFact({label:missingLabels[key],value:'Unavailable',note:''},list));
    const details=document.createElement('details'); details.className='profile-details';
    details.open=mode==='explore' || !mobileView.matches;
    const summary=document.createElement('summary');
    const cue=document.createElement('span'); cue.className='profile-cue'; cue.textContent='Facts';
    summary.append(heading,cue);details.append(summary,list);
    $('answer-profile').replaceChildren(details); $('answer-profile').hidden=false;
  }
  function updateRegionOutline() {
    const d=mode==='game' && round ? regionPaths.get(round.region) || '' : '';
    $('region-outline').setAttribute('d',d);
    $('region-outline-shadow').setAttribute('d',d);
  }
  function paintResults() {
    for(const country of countries) {
      country.path.classList.remove('result-first','result-later','result-revealed');
      const result=regionResults.get(country.properties.ADM0_A3);
      if(mode==='game' && result) country.path.classList.add(`result-${result}`);
    }
  }
  function renderRound() {
    $('region-select').value=round.region;
    updateRegionOutline();
    document.querySelector('.round-heading h1').textContent=round.region;
    $('round-score').textContent=`Country ${round.regionIndex} / ${round.regionTotal} · ${solved} solved`;
    populatePicker();
    select.disabled=roundDone; $('submit-guess').disabled=true;
    $('reveal-answer').disabled=false; $('reveal-answer').hidden=roundDone; $('next-round').hidden=!roundDone;
    $('answer-profile').hidden=!roundDone;
    $('round-clues').hidden=roundDone; $('round-clues').replaceChildren();
    for(const fact of round.clues){const list=document.createElement('dl');renderFact(fact,list);$('round-clues').append(list);}
    if(roundDone) renderProfile(round.country);
  }
  function focusRegion(region) {
    const points=game.countries.filter(c=>c.region===region).map(c=>project([c.longitude,c.latitude]));
    if(!points.length) return;
    // Cut at the largest empty longitude gap so Pacific regions straddling
    // the date line are centered together, rather than on the opposite hemisphere.
    const xs=points.map(p=>((p[0]%1440)+1440)%1440).sort((a,b)=>a-b);
    let gap=-1,start=xs[0];
    xs.forEach((x,i)=>{const next=xs[(i+1)%xs.length]+(i===xs.length-1?1440:0);if(next-x>gap){gap=next-x;start=next%1440;}});
    const width=1440-gap;
    const ys=points.map(p=>p[1]), top=Math.min(...ys), bottom=Math.max(...ys);
    scale=Math.max(minScale(),Math.min(5,viewWidth*.78/(width+80),viewHeight*.65/(bottom-top+80)));
    tx=viewWidth/2-(start+width/2)*scale;
    ty=viewHeight*.53-(top+bottom)/2*scale;
    update();
  }
  function nextRound() {
    clearPulses();
    const previousRegion=round?.region;
    round=game.next(); roundNumber++; roundDone=false;
    if(previousRegion!==round.region) regionResults.clear();
    paintResults();
    selected?.path.classList.remove('selected'); selected=null;
    countries.forEach(c=>c.path.classList.remove('answer'));
    renderRound(); $('round-status').textContent='';
    if(previousRegion!==round.region) focusRegion(round.region);
  }
  function setMode(next) {
    if(!game || next===mode) return;
    clearPulses();
    if(next==='explore') savedGame={code:select.value,status:$('round-status').textContent,scale,tx,ty};
    mode=next;
    paintResults();
    $('game-settings').hidden=mode==='explore';
    $('game-settings').open=false;
    updateRegionOutline();
    $('mode-game').setAttribute('aria-pressed',mode==='game');
    $('mode-explore').setAttribute('aria-pressed',mode==='explore');
    document.querySelector('.guess-actions').hidden=mode==='explore';
    document.querySelector('label[for="country-select"]').textContent=mode==='explore'?'Explore a country':'Your guess';
    selected?.path.classList.remove('selected'); selected=null;
    countries.forEach(c=>c.path.classList.remove('answer'));
    if(mode==='explore') {
      document.querySelector('.round-heading h1').textContent='Explore';
      $('round-score').textContent='Country profiles';
      $('round-clues').hidden=true; $('answer-profile').hidden=true;
      $('round-status').textContent='Select a country to see its facts.';
      populatePicker();select.disabled=false;
    } else {
      renderRound(); select.value=savedGame.code; $('round-status').textContent=savedGame.status;
      if(!roundDone && select.value) select.onchange();
      ({scale,tx,ty}=savedGame);update();
    }
  }
  $('mode-game').onclick=()=>setMode('game');
  $('mode-explore').onclick=()=>setMode('explore');
  function finish(correct, attempts=0) {
    roundDone=true; if(correct) solved++;
    const result=correct?(attempts===1?'first':'later'):'revealed';
    round.country.mapIds.forEach(id=>regionResults.set(id,result));
    paintResults();
    clearPulses();
    pulseProfile(round.country,correct?(attempts===1?'#a1f0b6':'#ffe58c'):'#ffaaa0');
    $('round-clues').hidden=true;
    $('round-status').textContent=correct ? `Correct · ${attempts} ${attempts===1?'guess':'guesses'}` : 'Answer revealed';
    $('round-score').textContent=`Country ${round.regionIndex} / ${round.regionTotal} · ${solved} solved`;
    $('submit-guess').disabled=true; select.disabled=true;
    $('reveal-answer').hidden=true; $('next-round').hidden=false;
    selected?.path.classList.remove('selected'); selected=null;
    renderProfile(round.country);
    $('next-round').focus({preventScroll:true});
  }
  $('guess-form').onsubmit=e=>{
    e.preventDefault(); if (!game || roundDone || mode!=='game') return;
    const result=game.guess(select.value);
    if(result.status==='correct') finish(true,result.attempts);
    else if(result.status==='wrong') {
      const profile=profiles.find(c=>c.iso3===select.value);
      pulseProfile(profile,'#ffaaa0');
      $('round-status').textContent=`Not ${profile.name}. Try another country, or reveal the answer.`;
    }
    else if(result.status==='duplicate') $('round-status').textContent='You already tried that country. Choose another.';
    else if(result.status==='invalid') $('round-status').textContent='Choose a country first.';
  };
  $('reveal-answer').onclick=()=>{if(game && !roundDone && mode==='game') {game.reveal(); finish(false);} };
  $('next-round').onclick=()=>{nextRound(); select.focus({preventScroll:true});};
  $('region-select').onchange=()=>{
    if(!game || mode!=='game' || $('region-select').value===round.region) return;
    game.selectRegion($('region-select').value);
    nextRound(); $('game-settings').open=false;
  };
  $('retry-data').onclick=load;
  load();
})();
