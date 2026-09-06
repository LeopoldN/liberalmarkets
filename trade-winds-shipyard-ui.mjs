import * as THREE from './assets/vendor/three.module.js';
import { createVessel, animateVessel, disposeModel } from './trade-winds-models.mjs?v=island-post-1';
import { SHIPS } from './trade-winds-shipyard.mjs?v=cargo-80';

const waveIcon = `<svg viewBox="0 0 32 28" aria-hidden="true"><path d="M2 12c5 0 5-7 10-7s4 7 9 7c3 0 4-2 6-4M2 23c5 0 5-6 10-6s5 6 10 6c3 0 5-2 7-4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
const cargoIcon = `<svg viewBox="0 0 32 30" aria-hidden="true"><path d="m3 7 12-5 14 5v17l-13 5-13-5Z" fill="currentColor"/><path d="m3 7 13 5 13-5M16 12v17M9 5l13 5v8M10 10v7" fill="none" stroke="#f3e6c5" stroke-width="1.5"/></svg>`;
const goldIcon = `<svg class="ship-gold" viewBox="0 0 36 36" aria-hidden="true"><defs><linearGradient id="ship-gold-shine"><stop stop-color="#ae7018"/><stop offset=".28" stop-color="#ffdb68"/><stop offset=".55" stop-color="#e8b335"/><stop offset="1" stop-color="#a66a16"/></linearGradient></defs><g fill="url(#ship-gold-shine)" stroke="#b78220" stroke-width=".6"><path d="M17 6h14v21c0 5-14 5-14 0Z"/><path d="M3 19h14v12c0 5-14 5-14 0Z"/></g><g fill="none" stroke="#ffdf7b" stroke-width="1"><path d="M17 12q7 5 14 0M17 17q7 5 14 0M17 22q7 5 14 0M17 27q7 5 14 0M3 24q7 5 14 0M3 29q7 5 14 0"/></g><g fill="#f4c654" stroke="#ffdf7b"><ellipse cx="24" cy="6" rx="7" ry="3"/><ellipse cx="10" cy="19" rx="7" ry="3"/></g></svg>`;

let portraits;
// Render the actual shared models once to still images. No extra animation loop
// or persistent WebGL context is needed for the catalogue.
function shipPortraits() {
  if (portraits) return portraits;
  const images = new Map();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(720, 480);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x527279, 2.4));
  const sun = new THREE.DirectionalLight(0xffe0b0, 3);
  sun.position.set(-40, 70, 40);
  scene.add(sun);
  try {
    for (const ship of SHIPS) {
      const model = createVessel(ship.id);
      scene.add(model);
      try {
        animateVessel(model, 1.5);
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model);
        const center = bounds.getCenter(new THREE.Vector3());
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 1000);
        camera.position.copy(center).add(new THREE.Vector3(70, 45, 85));
        camera.lookAt(center);
        camera.updateMatrixWorld(true);
        // Fit every corner in camera space so tall sails and projecting oars fit.
        const projected = new THREE.Box3();
        for (const x of [bounds.min.x, bounds.max.x])
          for (const y of [bounds.min.y, bounds.max.y])
            for (const z of [bounds.min.z, bounds.max.z])
              projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
        const size = projected.getSize(new THREE.Vector3());
        const height = Math.max(size.y, size.x / 1.5) * 1.08;
        camera.top = height / 2; camera.bottom = -height / 2;
        camera.right = height * .75; camera.left = -height * .75;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        // Trim the empty projected bounding-box corners, giving each model the
        // same generous presence on its catalogue plate without clipping sails.
        const canvas = document.createElement('canvas');
        canvas.width = 720; canvas.height = 480;
        const context = canvas.getContext('2d');
        context.drawImage(renderer.domElement, 0, 0);
        const pixels = context.getImageData(0, 0, 720, 480).data;
        let left = 720, right = 0, top = 480, bottom = 0;
        for (let y = 0; y < 480; y++) for (let x = 0; x < 720; x++) {
          if (pixels[(y * 720 + x) * 4 + 3] < 8) continue;
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        if (right >= left && bottom >= top) {
          const width = right - left + 1, height = bottom - top + 1;
          const scale = Math.min(660 / width, 438 / height);
          context.clearRect(0, 0, 720, 480);
          context.drawImage(renderer.domElement, left, top, width, height,
            (720 - width * scale) / 2, (480 - height * scale) / 2, width * scale, height * scale);
        }
        images.set(ship.id, canvas.toDataURL('image/png'));
      } finally { scene.remove(model); disposeModel(model); }
    }
    portraits = images;
    return images;
  } finally { renderer.dispose(); renderer.forceContextLoss(); }
}

export class ShipyardUI {
  constructor(container, onSelect, onLeave) {
    this.container = container;
    container.addEventListener('click', event => {
      if (event.target.closest('[data-leave-shipyard]')) { onLeave(); return; }
      const button = event.target.closest('button[data-ship]');
      if (button && !button.disabled) onSelect(button.dataset.ship);
    });
  }

  render(state, message = '') {
    const focus = this.container.contains(document.activeElement)
      ? document.activeElement.dataset.ship : null;
    this.container.innerHTML = `
      <header class="shipyard-heading">
        <h3 id="shipyard-title">Upgrade your ship.</h3>
        <span class="fleet-count">${state.ownedVessels.length} / ${SHIPS.length}<small>ships owned</small></span>
        <button class="shipyard-close" data-leave-shipyard aria-label="Leave shipyard">×</button>
      </header>
      <div class="shipyard-fleet">${SHIPS.map(ship => {
        const owned = state.ownedVessels.includes(ship.id), current = state.vessel === ship.id;
        const shortfall = !owned ? Math.max(0, ship.price - state.coins) : 0;
        return `<article class="ship-card ${current ? 'is-current' : ''}" aria-labelledby="ship-name-${ship.id}">
          <span class="ship-status">${current ? 'Currently sailing' : owned ? 'In your fleet' : 'Available to buy'}</span>
          <div class="ship-portrait"><img alt="${ship.name} — in-game model" width="720" height="480" data-portrait="${ship.id}"></div>
          <div class="ship-card-copy"><h4 id="ship-name-${ship.id}">${ship.name}</h4>
            <p class="ship-description">${ship.description}</p>
            <div class="ship-specs"><span>${waveIcon}${ship.pace}</span><span>${cargoIcon}${ship.capacity} cargo</span></div>
          </div>
          <div class="ship-card-purchase"><div class="ship-price">${ship.price === null ? 'Starter vessel' : `${goldIcon} ${ship.price.toLocaleString()} <small>gold</small>`}<span>${ship.price === null ? 'Not for sale' : owned ? 'Purchased · yours to keep' : 'One-time purchase'}</span></div>
            <button class="ship-action" data-ship="${ship.id}" data-kind="${current ? 'current' : owned ? 'switch' : 'purchase'}" aria-describedby="ship-help-${ship.id}" ${shortfall ? `title="${shortfall.toLocaleString()} more gold needed"` : ''} ${current || shortfall ? 'disabled' : ''}>${current ? 'Current ship' : owned ? 'Switch to this ship' : `Buy sloop - ${ship.price.toLocaleString()} gold`}</button>
            <span class="ship-help" id="ship-help-${ship.id}">${shortfall ? `${shortfall.toLocaleString()} more gold needed. ` : ''}Keep every ship you buy. Switch here for free; cargo and hull condition carry over.</span>
          </div>
        </article>`;
      }).join('')}</div>
      <p id="shipyard-message" role="status" aria-live="polite" tabindex="-1"></p>`;
    this.container.querySelector('#shipyard-message').textContent = message;
    const images = shipPortraits();
    for (const img of this.container.querySelectorAll('[data-portrait]')) img.src = images.get(img.dataset.portrait);
    if (focus) {
      const button = this.container.querySelector(`[data-ship="${focus}"]`);
      (button?.disabled ? this.container.querySelector('#shipyard-message') : button)?.focus({ preventScroll: true });
    }
  }
}
