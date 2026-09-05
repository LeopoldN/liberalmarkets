import test from "node:test";
import assert from "node:assert/strict";
import { buoyancyHeight, waveHeight } from "../trade-winds-ocean.mjs";
import { toWorld } from "../trade-winds-engine.mjs";

test("a turning vessel crosses voxel wave steps without snapping vertically", () => {
  const origin = toWorld(-76, 16);
  let previous,
    steppedJumps = 0;
  // A full-speed circular route crosses many water-height boundaries.
  for (let i = 0; i < 2400; i++) {
    const t = i / 120,
      angle = t * 1.15;
    const x = origin.x + Math.sin(angle) * 42;
    const z = origin.z + Math.cos(angle) * 42;
    const smooth = buoyancyHeight(x, z, t),
      voxel = waveHeight(x, z, t);
    if (previous) {
      assert.ok(Math.abs(smooth - previous.smooth) < 0.01);
      if (Math.abs(voxel - previous.voxel) > 0.17) steppedJumps++;
    }
    previous = { smooth, voxel };
  }
  assert.ok(steppedJumps > 20, "route must exercise the old snapping behavior");
});

test("smooth buoyancy retains Atlantic swell and stays close to the visible sea", () => {
  for (const [lon, lat] of [
    [-76, 16],
    [-70, 20.7],
    [-67, 26],
  ]) {
    const { x, z } = toWorld(lon, lat);
    for (let i = 0; i < 1000; i++) {
      const t = i / 60;
      const smooth = buoyancyHeight(x + t * 25, z, t);
      const voxel = waveHeight(x + t * 25, z, t);
      assert.ok(Math.abs(smooth - voxel) <= 0.090000001);
    }
  }
});
