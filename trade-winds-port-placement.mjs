// Match the voxel coast, not just the geographic point. Local +Z faces the sea.
export function findHarborPosition(ref, tileLand, { compact = false, cell = 10 } = {}) {
  const ix = Math.floor(ref.x / cell), iz = Math.floor(ref.z / cell);
  const directions = [[0, 1], [1, 0], [-1, 0], [0, -1]];
  const halfWidth = compact ? 1 : 5, depth = compact ? 1 : 6;
  for (const radius of [15, 30, 60]) {
    let best = null, bestScore = Infinity;
    for (let a = -radius; a <= radius; a++) {
      for (let b = -radius; b <= radius; b++) {
        const tx = ix + a, tz = iz + b;
        if (!tileLand(tx, tz)) continue;
        for (const [dx, dz] of directions) {
          if (tileLand(tx + dx, tz + dz)) continue;
          // The entire pier centerline must be clear. Beyond its first cell,
          // reserve a three-cell-wide approach for hulls and the departure point.
          let clear = true;
          for (let forward = 1; forward <= 12 && clear; forward++) {
            const width = forward === 1 ? 0 : 1;
            for (let side = -width; side <= width; side++) {
              if (tileLand(tx + dx * forward + dz * side, tz + dz * forward - dx * side)) {
                clear = false;
                break;
              }
            }
          }
          if (!clear) continue;
          let supported = 0;
          for (let back = 1; back <= depth; back++) {
            for (let side = -halfWidth; side <= halfWidth; side++) {
              if (tileLand(tx - dx * back + dz * side, tz - dz * back - dx * side)) supported++;
            }
          }
          const x = (tx + .5) * cell, z = (tz + .5) * cell;
          const support = supported / ((halfWidth * 2 + 1) * depth);
          // Prefer coast running across the back of the buildings. A nearby
          // shoreline corner should not win just because its direction came first.
          const score = Math.hypot(x - ref.x, z - ref.z) + (1 - support) * (compact ? 15 : 120);
          if (score >= bestScore) continue;
          bestScore = score;
          best = {
            land: { x, z }, normal: { x: dx, z: dz },
            x: x + dx * 55, z: z + dz * 55,
          };
        }
      }
    }
    if (best) return best;
  }
  throw new Error(`No navigable harbor near ${ref.x}, ${ref.z}`);
}

export function harborGroundContains(port, x, z, footprint, padding = 0) {
  const dx = x - port.land.x, dz = z - port.land.z;
  const across = dx * port.normal.z - dz * port.normal.x;
  const forward = dx * port.normal.x + dz * port.normal.z;
  return Math.abs(across) <= footprint.halfWidth + padding &&
    forward >= footprint.back - padding && forward <= footprint.front + padding;
}
