import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PORTS } from "../trade-winds-engine.mjs";
const layout = JSON.parse(
  fs.readFileSync(
    new URL("../assets/trade-winds/chart-layout.json", import.meta.url),
  ),
);
const buffer = fs.readFileSync(
  new URL(
    "../assets/trade-winds/models/west-indies-chart.glb",
    import.meta.url,
  ),
);
const gltf = JSON.parse(
  buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString(),
);
test("Blender export retains all functional port anchors at the shared geographic coordinates", () => {
  assert.equal(buffer.toString("ascii", 0, 4), "glTF");
  assert.match(gltf.asset.generator, /Blender/);
  assert.equal(layout.ports.length, PORTS.length);
  for (const port of PORTS) {
    const entry = layout.ports.find((p) => p.id === port.id);
    assert.equal(entry.lon, port.lon);
    assert.equal(entry.lat, port.lat);
    const anchor = gltf.nodes.find((n) => n.name === `port_${port.id}`);
    assert.ok(anchor, port.id);
    assert.equal(anchor.extras.port_id, port.id);
    const x =
      ((port.lon - layout.bounds.west) /
        (layout.bounds.east - layout.bounds.west) -
        0.5) *
      layout.width;
    const z =
      -(
        (port.lat - layout.bounds.south) /
          (layout.bounds.north - layout.bounds.south) -
        0.5
      ) * layout.depth;
    assert.ok(
      Math.abs(anchor.translation[0] - x) < 0.00001,
      `${port.id} east-west alignment`,
    );
    assert.ok(
      Math.abs(anchor.translation[2] - z) < 0.00001,
      `${port.id} north-south alignment`,
    );
  }
});
test("chart keeps the ship independent and exported geometry within its rendering budget", () => {
  for (const name of [
    "chart_ship",
    "Raised coastline",
    "Tiled Caribbean water",
    "Carved oak frame",
    "Harbor lantern",
  ])
    assert.ok(
      gltf.nodes.find((n) => n.name === name),
      name,
    );
  const triangles = gltf.meshes
    .flatMap((m) => m.primitives)
    .reduce((sum, p) => sum + gltf.accessors[p.indices].count / 3, 0);
  assert.ok(triangles < 180000, `${triangles} triangles`);
  assert.ok(buffer.length < 8 * 1024 * 1024);
});
