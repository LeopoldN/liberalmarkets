(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let globe, countries = [], selected = null, hovered = null;
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
        const border = borderSamples(selected);
        globe.scene().traverse(mesh => {
          if (mesh.__globeObjType !== 'hexPolygon') return;
          const geometry = mesh.geometry;
          const position = geometry.getAttribute('position');
          if (!position) return;
          const distances = new Float32Array(position.count);
          const directions = new Float32Array(position.count * 3);
          const isSelected = mesh === selected.__threeObj;
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
    if (hovered === feature) return;
    hovered = feature || null;
    $('globe').style.cursor = hovered ? 'pointer' : 'grab';
    globe.polygonCapColor(f => f.source === hovered ? (dark() ? 'rgba(185,190,195,0.18)' : 'rgba(70,78,88,0.14)') : 'rgba(0,0,0,0)');
  }
  function clickCountry(feature) {
    feature = feature?.source || feature;
    if (!feature) return;
    const index = countries.indexOf(feature);
    if (index < 0) return;
    $('country').value = String(index);
    selectCountry(String(index));
  }
  function recolor() {
    if (!globe) return;
    const material = globe.globeMaterial();
    if (!waveColor.value) waveColor.value = material.color.clone();
    waveColor.value.set(dark() ? '#a6e4bf' : '#175cd3');
    material.color.set(dark() ? '#090c0c' : '#edf0f3');
    material.emissive.set(dark() ? '#010202' : '#292c30');
    material.shininess = 0;
    globe.polygonCapColor(f => f.source === hovered ? (dark() ? 'rgba(185,190,195,0.18)' : 'rgba(70,78,88,0.14)') : 'rgba(0,0,0,0)');
    globe.hexPolygonColor(f => f === selected ? (dark() ? '#a6e4bf' : '#175cd3') : (dark() ? '#6d8983' : '#a3adb7'))
      .hexPolygonAltitude(f => f === selected ? 0.006 : 0.003)
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
  function selectCountry(value) {
    stopWave();
    selected = value === '' ? null : countries[Number(value)];
    $('clear').disabled = !selected;
    $('ripple').disabled = !selected || reducedMotion.matches;
    $('selection-status').textContent = selected ? `${selected.properties.NAME} is highlighted. Drag to explore its neighbours.` : 'Select a country to highlight it on the globe.';
    recolor();
    globe.labelsData(selected && countrySpan(selected) < 2 ? [selected] : []);
    if (selected) {
      rotate(false);
      const p = selected.properties;
      globe.pointOfView({lat: Number(p.LABEL_Y), lng: Number(p.LABEL_X), altitude: Math.max(0.08, Math.min(1.8, countrySpan(selected) * 0.045))}, reducedMotion.matches ? 0 : 900);
      startWave();
    }
  }
  $('ripple').onclick = startWave;
  $('country').onchange = event => selectCountry(event.target.value);
  $('clear').onclick = () => { $('country').value = ''; selectCountry(''); };
  $('reset').onclick = () => {
    if (!globe) return;
    $('country').value = ''; selectCountry('');
    globe.pointOfView({lat: 20, lng: 10, altitude: 1.95}, reducedMotion.matches ? 0 : 700);
    rotate(!reducedMotion.matches);
  };
  function initBoats() {
    // Illustrative sea corridors between coastal capitals, not live ship tracks.
    // Intermediate offshore waypoints keep the routes away from land.
    const routes = [
      [[38.69,-9.2],[38.4,-9.6],[42,-10.3],[48,-10],[50,-7],[51,-5.5],[53.3,-6.1]], // Lisbon–Dublin
      [[38.69,-9.2],[38.4,-9.6],[33,-12],[24,-19],[14.9,-23.5]], // Lisbon–Praia
      [[14.9,-23.5],[14.4,-20],[14.5,-17.6],[14.65,-17.4]], // Praia–Dakar
      [[64.15,-22],[63,-23],[58,-18],[52,-12],[50,-8],[50,-5.5],[53.3,-6.1]], // Reykjavik–Dublin
      [[59.85,10.65],[59.1,10.6],[58.3,10.7],[57.5,11.4],[56.2,12.3],[55.7,12.65]], // Oslo–Copenhagen
      [[60.14,24.96],[59.8,25],[59.46,24.77]], // Helsinki–Tallinn
      [[35.89,14.53],[36.2,14.2],[37.3,12],[37.3,10.7],[36.82,10.32]], // Valletta–Tunis
      [[1.2,103.85],[1,104.5],[-1,105.7],[-3,106.7],[-5.5,107],[-6.08,106.87]], // Singapore–Jakarta
      [[35.5,139.85],[35.1,139.8],[34.5,140.4],[30,140],[22,131],[19.5,123.5],[19.5,119],[15,119],[14.5,120.7],[14.58,120.95]], // Tokyo–Manila
      [[-41.29,174.83],[-41.7,175],[-41.7,177],[-39,179],[-32,179],[-24,179],[-18.2,178.5]], // Wellington–Suva
    ];
    const sample = (route, t) => {
      const total = route.length - 1;
      const at = Math.max(0, Math.min(total, t * total));
      const index = Math.min(total - 1, Math.floor(at));
      const a = route[index], b = route[index + 1], mix = at - index;
      return [a[0] + (b[0] - a[0]) * mix, a[1] + (b[1] - a[1]) * mix];
    };
    const dots = routes.flatMap((route, boat) => Array.from({length: 15}, (_, tail) => ({boat, tail, lat: 0, lng: 0})));
    globe.pointsData(dots).pointAltitude(0.002).pointResolution(8)
      .pointRadius(d => d.tail === 0 ? 0.28 : 0.12 * (1 - d.tail / 18))
      .pointColor(d => `rgba(${dark() ? '246,205,134' : '164,92,28'},${d.tail === 0 ? 1 : 0.55 * (1 - d.tail / 15)})`)
      .pointsTransitionDuration(0);
    let last = 0, elapsed = 0;
    function animate(now) {
      requestAnimationFrame(animate);
      if (now - last < 45) return;
      if (last && !reducedMotion.matches && !document.hidden) elapsed += Math.min(now - last, 100);
      last = now;
      for (const dot of dots) {
        // Each boat travels out and back; its trail follows the same corridor.
        const phase = elapsed / (70000 + dot.boat * 4100) + dot.boat / 10 - dot.tail * 0.003;
        const cycle = ((phase % 2) + 2) % 2;
        const [lat, lng] = sample(routes[dot.boat], cycle <= 1 ? cycle : 2 - cycle);
        dot.lat = lat; dot.lng = lng;
        if (dot.__threeObj) dot.__threeObj.raycast = () => {};
      }
      globe.pointLat(d => d.lat).pointLng(d => d.lng);
    }
    requestAnimationFrame(animate);
  }
  async function init() {
    try {
      const response = await fetch('assets/geo/ne_50m_admin_0_countries.geojson');
      if (!response.ok) throw new Error('Map unavailable');
      countries = (await response.json()).features.filter(f => ['Polygon', 'MultiPolygon'].includes(f.geometry?.type)).sort((a,b) => a.properties.NAME.localeCompare(b.properties.NAME));
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
      initBoats();
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
      countries.forEach((f, i) => $('country').add(new Option(f.properties.NAME, String(i))));
      $('country').disabled = false;
      $('globe-loading').hidden = true;
      new ResizeObserver(() => globe.width(container.clientWidth).height(container.clientHeight)).observe(container);
      reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { rotate(false); stopWave(); } $('ripple').disabled = !selected || reducedMotion.matches; });
    } catch (error) {
      $('globe-loading').textContent = 'The globe couldn’t load. Please refresh to try again.';
      $('rotation').disabled = $('reset').disabled = true;
      console.error('Globe preview:', error);
    }
  }
  init();
})();
