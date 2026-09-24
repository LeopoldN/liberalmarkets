import { TradingPostScene } from './trade-winds-market-scene.mjs?v=clean-harbor-1';
import { BelizeTownScene } from './trade-winds-belize-scene.mjs';

export function townBackgroundKind(port) { return port.id === 'belize' ? 'belize' : 'trading-post'; }

// Cache one renderer per backdrop, with exactly one active animation loop.
export class TownBackground {
  constructor(container, options) { this.container = container; this.options = options; this.scenes = new Map(); }
  start(port, options) {
    this.active?.stop();
    for (const scene of this.scenes.values()) {
      if (scene.setVisible) scene.setVisible(false);
      else scene.renderer.domElement.style.display = 'none';
    }
    const kind = townBackgroundKind(port);
    if (!this.scenes.has(kind)) this.scenes.set(kind, kind === 'belize'
      ? new BelizeTownScene(this.container)
      : new TradingPostScene(this.container, this.options));
    this.active = this.scenes.get(kind);
    if (this.active.setVisible) this.active.setVisible(true);
    else this.active.renderer.domElement.style.display = 'block';
    return this.active.start(port, options);
  }
  stop() { this.active?.stop(); }
  acknowledge() { this.active?.acknowledge(); }
}
