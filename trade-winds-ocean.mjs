// Stylized Caribbean/Atlantic boundary in geographic coordinates. Kept in one
// table so the CPU buoyancy, encounters and GPU water agree at every location.
const EDGE = [
  [-82, 29],
  [-80, 25],
  [-76, 23],
  [-70, 20.7],
  [-65, 19.3],
  [-62, 18],
  [-60, 10],
];
const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function atlanticWeight(x, z) {
  const lon = x / 220 - 80,
    lat = 22 - z / 220;
  let edge = EDGE[0][1];
  for (let i = 1; i < EDGE.length; i++) {
    const [a, y] = EDGE[i - 1],
      [b, v] = EDGE[i];
    edge += (v - y) * Math.max(0, Math.min(1, (lon - a) / (b - a)));
  }
  return smooth(-82, -80.8, lon) * smooth(-0.5, 0.5, lat - edge);
}
export function waveHeight(x, z, time) {
  const ocean = atlanticWeight(x, z);
  const swell =
    Math.sin(x * 0.036 + z * 0.021 - time * 0.85) * 0.34 +
    Math.sin(z * 0.057 - x * 0.014 + time * 0.61) * 0.23;
  const rough =
    Math.sin(x * 0.015 + z * 0.023 - time * 1.55) * 1.8 +
    Math.sin(z * 0.044 - x * 0.028 + time * 1.19) * 0.8;
  return (
    Math.floor((swell + 0.6) * 5) * 0.18 - 0.8 + ocean * (swell * 1.8 + rough)
  );
}
const f = (n) => Number(n).toFixed(4);
export const OCEAN_GLSL = `
  float atlantic(vec2 p) {
    float lon = p.x / 220. - 80., lat = 22. - p.y / 220.;
    float edge = ${f(EDGE[0][1])};
    ${EDGE.slice(1)
      .map(([b, v], i) => {
        const [a, y] = EDGE[i];
        return `edge += ${f(v - y)} * clamp((lon - (${f(a)})) / ${f(b - a)}, 0., 1.);`;
      })
      .join("\n")}
    return smoothstep(-82., -80.8, lon) * smoothstep(-.5, .5, lat - edge);
  }
  float seaHeight(vec2 p, float time) {
    float swell = sin(p.x * .036 + p.y * .021 - time * .85) * .34
      + sin(p.y * .057 - p.x * .014 + time * .61) * .23;
    float rough = sin(p.x * .015 + p.y * .023 - time * 1.55) * 1.8
      + sin(p.y * .044 - p.x * .028 + time * 1.19) * .8;
    return floor((swell + .6) * 5.) * .18 - .8 + atlantic(p) * (swell * 1.8 + rough);
  }`;
