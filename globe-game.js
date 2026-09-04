(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let globe, countries = [], selected = null, hovered = null;
  let puzzle, gameState, storageKey, tileOrder = [], picked = [];
  const rankNames = ['1st', '2nd', '3rd', '4th'];
  const pairColors = ['#70ae79', '#d0aa43', '#6da0d7', '#a77dd0'];
  let featuresByCode = new Map(), waveSources = [];
  const gameOver = () => gameState && (gameState.solved.length === 4 || gameState.wrong.length >= 4);
  const solvedCodes = () => new Set(puzzle.pairs.filter(p => gameState.solved.includes(p.rank)).flatMap(p => [p.source.iso3, p.partner.iso3]));
  function featureColor(feature) {
    const code = feature.__gameISO;
    if (puzzle) {
      const pair = puzzle.pairs.find(p => (gameState.solved.includes(p.rank) || gameOver()) && [p.source.iso3, p.partner.iso3].includes(code));
      if (pair) return pairColors[pair.rank - 1];
      if (picked.includes(code)) return dark() ? '#ffffff' : '#202b34';
      if (puzzle.deck.some(c => c.iso3 === code)) return dark() ? '#bdc9c6' : '#536963';
    }
    return dark() ? '#465853' : '#afb8b4';
  }
  function initGame(data) {
    const codes = new Set(data.countries.flatMap(c => [c.iso3, ...c.partners.map(p => p.iso3)]));
    for (const feature of countries) {
      const p = feature.properties;
      const code = [p.ISO_A3, p.ISO_A3_EH, p.ADM0_A3].find(code => codes.has(code));
      if (code) { feature.__gameISO = code; featuresByCode.set(code, feature); }
    }
    const date = new Date().toISOString().slice(0,10);
    puzzle = TradePairs.buildPuzzle(data.countries, date, new Set(featuresByCode.keys()));
    storageKey = `trade-pairs:v1:${date}`;
    const signature = puzzle.pairs.map(p => p.key).join('|');
    gameState = {signature, solved: [], wrong: []};
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      const ranks = new Set(saved?.solved);
      const deckCodes = new Set(puzzle.deck.map(c => c.iso3));
      if (saved?.signature === signature && Array.isArray(saved.solved) && Array.isArray(saved.wrong)
        && saved.solved.every(r => Number.isInteger(r) && r >= 1 && r <= 4) && ranks.size === saved.solved.length
        && saved.wrong.length <= 4 && new Set(saved.wrong).size === saved.wrong.length
        && saved.wrong.every(key => typeof key === 'string' && key.split(':').length === 2 && key.split(':').every(c => deckCodes.has(c)) && !puzzle.pairs.some(p => p.key === key))) gameState = saved;
    } catch {}
    tileOrder = puzzle.deck.map(c => c.iso3);
    $('puzzle-date').textContent = new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'});
  }
  function saveGame() { try { localStorage.setItem(storageKey, JSON.stringify(gameState)); } catch {} }
  function renderGame(message) {
    const focusCode = document.activeElement?.dataset?.code;
    const solved = solvedCodes();
    $('country-tiles').replaceChildren();
    for (const code of tileOrder) {
      if (solved.has(code) || gameOver()) continue;
      const country = puzzle.deck.find(c => c.iso3 === code);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'country-tile';
      button.textContent = country.name; button.dataset.code = code;
      button.setAttribute('aria-pressed', String(picked.includes(code)));
      button.onclick = () => toggleCountry(code);
      $('country-tiles').append(button);
    }
    $('solved-pairs').replaceChildren();
    for (const pair of puzzle.pairs) {
      if (!gameState.solved.includes(pair.rank) && !gameOver()) continue;
      const row = document.createElement('article'); row.className = `solved-pair rank-${pair.rank}`;
      const title = document.createElement('strong'); title.textContent = `${pair.source.name} + ${pair.partner.name}`;
      const detail = document.createElement('span');
      detail.textContent = `${pair.partner.name} is ${pair.source.name}’s ${rankNames[pair.rank - 1]} trading partner · ${(pair.partner.share * 100).toFixed(1)}% of goods trade${gameState.solved.includes(pair.rank) ? '' : ' · Revealed'}`;
      row.append(title,detail); $('solved-pairs').append(row);
    }
    $('pairs-progress').textContent = `${gameState.solved.length} / 4 pairs`;
    $('mistakes-left').textContent = `${4 - gameState.wrong.length} mistakes remaining`;
    $('match').disabled = picked.length !== 2 || gameOver();
    $('clear').disabled = !picked.length || gameOver();
    $('shuffle').disabled = gameOver();
    $('share').hidden = !gameOver();
    $('match').hidden = $('clear').hidden = $('shuffle').hidden = gameOver();
    $('selection-status').textContent = message || (gameOver() ? (gameState.solved.length === 4 ? 'All four pairs found. See you tomorrow.' : 'No mistakes remaining. Here are today’s pairs.') : picked.length ? `${picked.length} of 2 selected` : 'Select two countries that belong together.');
    if (focusCode) $('country-tiles').querySelector(`[data-code="${focusCode}"]`)?.focus({preventScroll:true});
    recolor();
    if (globe) globe.labelsData(puzzle.deck.map(c => featuresByCode.get(c.iso3)).filter(f => countrySpan(f) < 2));
  }
  function toggleCountry(code) {
    if (!puzzle || gameOver() || solvedCodes().has(code) || !tileOrder.includes(code)) return;
    if (picked.includes(code)) picked = picked.filter(c => c !== code);
    else if (picked.length < 2) picked.push(code);
    else { $('selection-status').textContent = 'Deselect a country before choosing another.'; return; }
    window.TradePairsAudio?.play('click');
    renderGame();
  }
  function matchPair() {
    if (picked.length !== 2 || gameOver()) return;
    const key = TradePairs.pairKey(...picked);
    const pair = puzzle.pairs.find(p => p.key === key);
    if (!pair) {
      if (gameState.wrong.includes(key)) { renderGame('You already tried that pair. No extra mistake used.'); return; }
      gameState.wrong.push(key); picked = []; saveGame();
      window.TradePairsAudio?.play('wrong');
      renderGame(gameOver() ? undefined : 'That pair doesn’t fit today’s solution. Try another combination.');
      return;
    }
    gameState.solved.push(pair.rank); picked = []; saveGame();
    window.TradePairsAudio?.play(gameState.solved.length === 4 ? 'win' : 'match');
    selected = featuresByCode.get(pair.source.iso3);
    waveSources = [selected, featuresByCode.get(pair.partner.iso3)];
    renderGame(gameOver() ? undefined : `${rankNames[pair.rank - 1]} trading partner — matched.`);
    rotate(false);
    globe.pointOfView({lat: Number(selected.properties.LABEL_Y), lng: Number(selected.properties.LABEL_X), altitude: 1.95}, reducedMotion.matches ? 0 : 700);
    startWave();
  }
  $('match').onclick = matchPair;
  $('clear').onclick = () => { window.TradePairsAudio?.play('click'); picked = []; renderGame(); };
  $('shuffle').onclick = () => {
    window.TradePairsAudio?.play('click');
    for (let i = tileOrder.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tileOrder[i], tileOrder[j]] = [tileOrder[j], tileOrder[i]]; }
    renderGame();
  };
  $('share').onclick = async () => {
    const swatches = ['🟩','🟨','🟦','🟪'];
    const result = `Trade Pairs · ${puzzle.date}\n${puzzle.pairs.map(p => gameState.solved.includes(p.rank) ? swatches[p.rank-1] : '⬜').join('')}\n${gameState.solved.length}/4 pairs · ${gameState.wrong.length}/4 mistakes\nhttps://liberal.markets/trade-pairs.html`;
    try { await navigator.clipboard.writeText(result); $('selection-status').textContent = 'Result copied.'; }
    catch { $('selection-status').textContent = result; }
  };
  // The bundled globe renderer merges each country's 12-segment dots into one mesh.
  // Give every vertex of a dot the same border distance and radial direction,
  // so the wave lifts whole dots without stretching them or rebuilding geometry.
  const wave = { value: -1 };
  const waveColor = { value: null };
  let waveFrame = 0, waveGeneration = 0;
  function stopWave() {
    cancelAnimationFrame(waveFrame);
    waveGeneration++;
    wave.value = -1;
  }
  function borderSamples(feature) {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const samples = [];
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (const coordinate of ring) {
          const v = globe.getCoords(coordinate[1], coordinate[0], 0);
          const length = Math.hypot(v.x, v.y, v.z);
          samples.push([v.x / length, v.y / length, v.z / length]);
        }
      }
    }
    const step = Math.max(1, Math.ceil(samples.length / 1200));
    return samples.filter((_, i) => i % step === 0);
  }
  function startWave() {
    stopWave();
    if (!selected || reducedMotion.matches) return;
    const generation = waveGeneration;
    // Allow the globe layer to apply the selection before attaching attributes.
    waveFrame = requestAnimationFrame(() => {
      waveFrame = requestAnimationFrame(() => {
        if (generation !== waveGeneration) return;
        const border = (waveSources.length ? waveSources : [selected]).flatMap(borderSamples);
        globe.scene().traverse(mesh => {
          if (mesh.__globeObjType !== 'hexPolygon') return;
          const geometry = mesh.geometry;
          const position = geometry.getAttribute('position');
          if (!position) return;
          const distances = new Float32Array(position.count);
          const directions = new Float32Array(position.count * 3);
          const isSelected = (waveSources.length ? waveSources : [selected]).some(f => mesh === f.__threeObj);
          const verticesPerDot = 14; // CircleGeometry: centre + 12 segments + closing vertex.
          for (let i = 0; i < position.count; i += verticesPerDot) {
            const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
            const radius = Math.hypot(x, y, z);
            const nx = x / radius, ny = y / radius, nz = z / radius;
            let nearest = -1;
            if (!isSelected) {
              for (const b of border) nearest = Math.max(nearest, nx * b[0] + ny * b[1] + nz * b[2]);
            }
            const distance = isSelected ? -10 : Math.acos(Math.max(-1, Math.min(1, nearest)));
            for (let j = i; j < Math.min(i + verticesPerDot, position.count); j++) {
              distances[j] = distance;
              directions[j * 3] = nx;
              directions[j * 3 + 1] = ny;
              directions[j * 3 + 2] = nz;
            }
          }
          geometry.setAttribute('waveDistance', new position.constructor(distances, 1));
          geometry.setAttribute('waveDirection', new position.constructor(directions, 3));
          if (!mesh.material.userData.borderWave) {
            mesh.material.userData.borderWave = true;
            mesh.material.onBeforeCompile = shader => {
              shader.uniforms.waveTravel = wave;
              shader.uniforms.waveColor = waveColor;
              shader.vertexShader = 'uniform float waveTravel; attribute float waveDistance; attribute vec3 waveDirection; varying float waveEdge;\n' + shader.vertexShader;
              shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
                #include <begin_vertex>
                float behindFront = waveTravel - waveDistance;
                waveEdge = 0.0;
                if (waveTravel >= 0.0 && waveDistance >= 0.0 && behindFront >= 0.0 && behindFront <= 0.42) {
                  float lift = sin(behindFront / 0.42 * 3.14159265);
                  transformed += waveDirection * (1.5 * lift * lift);
                  waveEdge = smoothstep(0.0, 0.025, behindFront) * (1.0 - smoothstep(0.055, 0.12, behindFront));
                }
              `);
              shader.fragmentShader = 'uniform vec3 waveColor; varying float waveEdge;\n' + shader.fragmentShader;
              shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
                #include <color_fragment>
                diffuseColor.rgb = mix(diffuseColor.rgb, waveColor, waveEdge);
              `);
            };
            mesh.material.customProgramCacheKey = () => 'country-border-wave-v2';
            mesh.material.needsUpdate = true;
          }
          // Shader displacement extends beyond the original geometry bounds.
          mesh.frustumCulled = false;
        });
        const started = performance.now();
        function animate(now) {
          if (generation !== waveGeneration) return;
          const progress = (now - started) / 12000;
          if (progress >= 1) { wave.value = -1; return; }
          wave.value = progress * (Math.PI + 0.42);
          waveFrame = requestAnimationFrame(animate);
        }
        waveFrame = requestAnimationFrame(animate);
      });
    });
  }
  function countrySpan(feature) {
    const { LABEL_X: longitude, LABEL_Y: latitude } = feature.properties;
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    let span = 0;
    for (const polygon of polygons) for (const [lng, lat] of polygon[0]) {
      const deltaLng = Math.abs(((lng - longitude + 540) % 360) - 180);
      span = Math.max(span, Math.abs(lat - latitude) * 2, deltaLng * Math.cos(latitude * Math.PI / 180) * 2);
    }
    return Math.max(0.01, span);
  }
  function countryResolution(feature) {
    // Spend the extra detail on small countries instead of tessellating the
    // whole planet at the resolution needed for a city-state.
    if (feature.properties.NAME === 'Antarctica') return 3;
    const resolution = Math.max(4, Math.min(8, Math.ceil(4 + Math.log(4 / countrySpan(feature)) / Math.log(Math.sqrt(7)))));
    return resolution;
  }
  const dark = () => document.documentElement.dataset.theme === 'dark';
  function hoverCountry(feature) {
    feature = feature?.source || feature;
    if (puzzle && (!tileOrder.includes(feature?.__gameISO) || solvedCodes().has(feature?.__gameISO) || gameOver())) feature = null;
    if (hovered === feature) return;
    hovered = feature || null;
    $('globe').style.cursor = hovered ? 'pointer' : 'grab';
    globe.polygonCapColor(f => f.source === hovered ? (dark() ? 'rgba(185,190,195,0.18)' : 'rgba(70,78,88,0.14)') : 'rgba(0,0,0,0)');
  }
  function clickCountry(feature) {
    feature = feature?.source || feature;
    if (!feature) return;
    toggleCountry(feature.__gameISO);
  }
  function recolor() {
    if (!globe) return;
    const material = globe.globeMaterial();
    if (!waveColor.value) waveColor.value = material.color.clone();
    const wavePair = puzzle?.pairs.find(p => p.source.iso3 === selected?.__gameISO && gameState.solved.includes(p.rank));
    waveColor.value.set(wavePair ? pairColors[wavePair.rank - 1] : (dark() ? '#a6e4bf' : '#175cd3'));
    material.color.set(dark() ? '#090c0c' : '#edf0f3');
    material.emissive.set(dark() ? '#010202' : '#292c30');
    material.shininess = 0;
    globe.polygonCapColor(f => f.source === hovered ? (dark() ? 'rgba(185,190,195,0.18)' : 'rgba(70,78,88,0.14)') : 'rgba(0,0,0,0)');
    globe.hexPolygonColor(featureColor)
      .hexPolygonAltitude(0.003)
      .labelColor(() => dark() ? '#a6e4bf' : '#175cd3');
  }
  function syncTheme() {
    $('theme-toggle').textContent = dark() ? 'Dark' : 'Light';
    $('theme-toggle').setAttribute('aria-pressed', String(dark()));
    document.querySelector('meta[name="theme-color"]').content = dark() ? '#151515' : '#ffffff';
    recolor();
  }
  $('theme-toggle').onclick = () => {
    document.documentElement.dataset.theme = dark() ? 'light' : 'dark';
    try { localStorage.setItem('trade-games:theme', document.documentElement.dataset.theme); } catch {}
    syncTheme();
  };
  syncTheme();
  $('open-help').onclick = () => $('help-dialog').showModal();
  $('close-help').onclick = $('start-exploring').onclick = () => $('help-dialog').close();
  function rotate(value) {
    if (globe) globe.controls().autoRotate = value;
    $('rotation').setAttribute('aria-pressed', String(value));
    $('rotation').textContent = value ? 'Pause rotation' : 'Resume rotation';
  }
  $('rotation').onclick = () => { if (globe) rotate(!globe.controls().autoRotate); };
  $('reset').onclick = () => {
    if (!globe) return;
    globe.pointOfView({lat: 20, lng: 10, altitude: 1.95}, reducedMotion.matches ? 0 : 700);
    rotate(!reducedMotion.matches);
  };
  function initFlights(capitals) {
    // Decorative routes use only today's eight countries, independent of the answers.
    const destinations = puzzle.deck.map(c => capitals[c.iso3]).filter(Boolean);
    if (destinations.length < 2) return;
    let template;
    globe.scene().traverse(object => {
      if (!template && object.isMesh && object.geometry?.getAttribute('position')) template = object;
    });
    if (!template) return;
    const Attribute = template.geometry.getAttribute('position').constructor;
    function geometryFor(vertices) {
      const geometry = template.geometry.clone();
      geometry.setIndex(null);
      for (const key of Object.keys(geometry.attributes)) geometry.deleteAttribute(key);
      geometry.setAttribute('position', new Attribute(new Float32Array(vertices), 3));
      geometry.computeVertexNormals(); geometry.computeBoundingSphere();
      return geometry;
    }
    const planeGeometry = geometryFor([
      0,1.1,0, -.13,-.8,0, .13,-.8,0,
      -.95,-.18,0, .95,-.18,0, 0,.38,0,
      -.4,-.8,0, .4,-.8,0, 0,-.35,0
    ]);
    const dotVertices = [];
    for (let i=0; i<8; i++) {
      const a=i*Math.PI/4, b=(i+1)*Math.PI/4;
      dotVertices.push(0,0,0, Math.cos(a)*.13,Math.sin(a)*.13,0, Math.cos(b)*.13,Math.sin(b)*.13,0);
    }
    const trailGeometry = geometryFor(dotVertices);
    const materials = Array.from({length:19}, (_,i) => {
      const material = globe.globeMaterial().clone();
      material.side = 2; material.transparent = true; material.depthWrite = false;
      material.opacity = i === 0 ? 1 : .65 * (1 - i/19);
      return material;
    });
    function makeMesh(geometry, material) {
      const mesh = new template.constructor(geometry,material);
      mesh.raycast = () => {};
      globe.scene().add(mesh);
      return mesh;
    }
    const vector = () => globe.camera().position.clone();
    const toVector = capital => {
      const p=globe.getCoords(capital.lat,capital.lng,0);
      return vector().set(p.x,p.y,p.z).normalize();
    };
    function nextLeg(flight) {
      const options = destinations.filter(c => c !== flight.to && c !== flight.from);
      flight.from = flight.to;
      flight.to = options[Math.floor(Math.random()*options.length)] || destinations.find(c => c !== flight.from);
      flight.a = toVector(flight.from); flight.b = toVector(flight.to);
      flight.angle = Math.acos(Math.max(-1,Math.min(1,flight.a.dot(flight.b))));
      flight.duration = (4000 + flight.angle * 3000) / 2;
      flight.elapsed = 0;
    }
    function position(flight,t,out) {
      t=Math.max(0,Math.min(1,t));
      const angle=flight.angle, sin=Math.sin(angle);
      if (Math.abs(sin)<0.00001) out.copy(flight.a).lerp(flight.b,t).normalize();
      else out.copy(flight.a).multiplyScalar(Math.sin((1-t)*angle)/sin).addScaledVector(flight.b,Math.sin(t*angle)/sin);
      return out.multiplyScalar(100 * (1.008 + Math.sin(Math.PI*t)*.14));
    }
    const flights = Array.from({length:destinations.length},(_,i) => {
      const flight={to:destinations[i%destinations.length],mesh:makeMesh(planeGeometry,materials[0]),trails:materials.slice(1).map(m=>makeMesh(trailGeometry,m))};
      nextLeg(flight);
      return flight;
    });
    const ahead=vector(),up=vector(),forward=vector(),right=vector();
    const basis=flights[0].mesh.matrix.clone();
    let last=0,theme;
    function animate(now) {
      requestAnimationFrame(animate);
      const delta=last ? Math.min(50,now-last) : 0; last=now;
      if (theme !== dark()) {
        theme=dark();
        for (const material of materials) {
          material.color.set(theme?'#ffe0a8':'#965519');
          material.emissive.set(theme?'#ae7130':'#422008');
          material.emissiveIntensity=.8;
        }
      }
      if (document.hidden) return;
      for (const flight of flights) {
        if (!reducedMotion.matches) flight.elapsed+=delta;
        if (flight.elapsed>flight.duration+150) nextLeg(flight);
        const t=Math.min(1,flight.elapsed/flight.duration);
        position(flight,t,flight.mesh.position);
        position(flight,Math.min(1,t+.002),ahead);
        if (t < 1) {
          up.copy(flight.mesh.position).normalize();
          forward.copy(ahead).sub(flight.mesh.position).normalize();
          right.crossVectors(forward,up).normalize();
          up.crossVectors(right,forward).normalize();
          basis.makeBasis(right,forward,up);
          flight.mesh.quaternion.setFromRotationMatrix(basis);
        }
        flight.mesh.scale.setScalar(Math.min(2,Math.max(.12,globe.camera().position.distanceTo(flight.mesh.position)*.012)));
        flight.trails.forEach((dot,i) => {
          const trailT=t-(i+1)*.004;
          dot.visible=trailT>=0;
          if (!dot.visible) return;
          position(flight,trailT,dot.position);
          dot.quaternion.copy(globe.camera().quaternion);
        });
      }
    }
    requestAnimationFrame(animate);
  }
  async function init() {
    try {
      const [response, tradeResponse] = await Promise.all([fetch('assets/geo/ne_50m_admin_0_countries.geojson'), fetch('data/trade-game/truddies.json')]);
      if (!response.ok || !tradeResponse.ok) throw new Error('Game data unavailable');
      countries = (await response.json()).features.filter(f => ['Polygon', 'MultiPolygon'].includes(f.geometry?.type)).sort((a,b) => a.properties.NAME.localeCompare(b.properties.NAME));
      initGame(await tradeResponse.json());
      const container = $('globe');
      globe = window.Globe()(container).width(container.clientWidth).height(container.clientHeight)
        .backgroundColor('rgba(0,0,0,0)').showAtmosphere(false)
        // Keep the hit surface above the sphere even between triangle corners.
        // Coarse caps cut through the sphere and leave holes in country picking.
        .polygonsData(countries.map(f => ({ type: f.type, geometry: f.geometry, properties: f.properties, source: f })))
        .polygonAltitude(0.002).polygonCapCurvatureResolution(1)
        .polygonCapColor(() => 'rgba(0,0,0,0)').polygonSideColor(() => 'rgba(0,0,0,0)')
        .polygonsTransitionDuration(0)
        .onPolygonHover(hoverCountry).onPolygonClick(clickCountry)
        .hexPolygonsData(countries).hexPolygonResolution(countryResolution).hexPolygonMargin(0.22)
        .hexPolygonUseDots(true).hexPolygonCurvatureResolution(4)
        .hexPolygonDotResolution(12)
        .hexPolygonsTransitionDuration(0)
        .labelsData([]).labelLat(f => Number(f.properties.LABEL_Y)).labelLng(f => Number(f.properties.LABEL_X))
        .labelText(f => f.properties.NAME).labelSize(0.12).labelDotRadius(0.035)
        .labelAltitude(0.009).labelResolution(2);
      const controls = globe.controls();
      controls.enablePan = false; controls.enableZoom = true; controls.enableDamping = true;
      controls.minDistance = 105; controls.maxDistance = 400; controls.autoRotateSpeed = 0.42;
      controls.addEventListener('start', () => rotate(false));
      globe.pointOfView({lat: 20, lng: 10, altitude: 1.95}, 0);
      recolor(); rotate(!reducedMotion.matches);
      // Flight assets are optional and never block the game.
      fetch('assets/geo/capitals.json').then(r => r.ok ? r.json() : null)
        .then(data => { if (data) requestAnimationFrame(() => initFlights(data.capitals)); })
        .catch(error => console.warn('Flight decoration unavailable:', error));
      // Country polygons handle picking across the gaps between dots. Some
      // tiny countries have an empty hex mesh, which Three cannot raycast.
      const expectedPolygons = countries.reduce((count, f) => count + (f.geometry.type === 'Polygon' ? 1 : f.geometry.coordinates.length), 0);
      function preparePicking() {
        let hexCount = 0, polygonCount = 0;
        globe.scene().traverse(object => {
          if (object.__globeObjType === 'polygon') polygonCount++;
          if (object.__globeObjType === 'hexPolygon') {
            hexCount++;
            object.raycast = () => {};
          } else if (object.geometry && !object.userData.safePicking) {
            const raycast = object.raycast;
            object.raycast = function (...args) {
              if (!this.visible || !this.geometry?.getAttribute('position')) return;
              return raycast.apply(this, args);
            };
            object.userData.safePicking = true;
          }
        });
        // Layers build asynchronously; keep checking until every mesh exists.
        if (hexCount < countries.length || polygonCount < expectedPolygons) requestAnimationFrame(preparePicking);
      }
      requestAnimationFrame(preparePicking);
      renderGame();
      $('globe-loading').hidden = true;
      new ResizeObserver(() => globe.width(container.clientWidth).height(container.clientHeight)).observe(container);
      reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { rotate(false); stopWave(); } });
    } catch (error) {
      $('globe-loading').hidden = false;
      $('globe-loading').textContent = 'The game couldn’t load. Please refresh to try again.';
      $('selection-status').textContent = 'Game data is unavailable. Please refresh to retry.';
      $('rotation').disabled = $('reset').disabled = true;
      console.error('Trade Pairs:', error);
    }
  }
  init();
})();
