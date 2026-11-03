/* =====================================================================
   geo-utils.js — small, dependency-light helpers (needs d3 for geoArea)
   Exposed as window.GeoUtils
   ===================================================================== */
(function () {
  "use strict";

  const TAU = Math.PI * 2;

  /** Spherical area of a single ring treated as its own polygon. */
  function ringArea(ring) {
    return d3.geoArea({ type: "Polygon", coordinates: [ring] });
  }

  /** Close a ring if the author forgot to repeat the first vertex. */
  function closeRing(ring) {
    if (!ring || ring.length < 3) return ring;
    const a = ring[0], b = ring[ring.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) return ring.concat([a.slice()]);
    return ring;
  }

  /**
   * Normalise a polygon's rings to D3's spherical winding convention:
   * exterior ring encloses the small area (< hemisphere), holes enclose the
   * large complement. This fixes the classic "fills the whole globe" bug that
   * occurs with RFC 7946 (counter-clockwise) or hand-drawn polygons.
   */
  function fixPolygon(rings) {
    return rings
      .map(closeRing)
      .filter((r) => r && r.length >= 4)
      .map((ring, i) => {
        const big = ringArea(ring) > TAU;
        // exterior (i === 0) must be small; holes must be "big"
        if ((i === 0 && big) || (i > 0 && !big)) return ring.slice().reverse();
        return ring;
      });
  }

  /** Return a winding-normalised copy of any GeoJSON geometry / feature / collection. */
  function rewind(obj) {
    if (!obj) return obj;
    switch (obj.type) {
      case "FeatureCollection":
        return Object.assign({}, obj, { features: obj.features.map(rewind) });
      case "Feature":
        return Object.assign({}, obj, { geometry: rewind(obj.geometry) });
      case "GeometryCollection":
        return Object.assign({}, obj, { geometries: obj.geometries.map(rewind) });
      case "Polygon":
        return { type: "Polygon", coordinates: fixPolygon(obj.coordinates) };
      case "MultiPolygon":
        return {
          type: "MultiPolygon",
          coordinates: obj.coordinates.map(fixPolygon).filter((p) => p.length),
        };
      default:
        return obj;
    }
  }

  /** Accept a bare geometry, a Feature or a FeatureCollection; return a geometry-ish object D3 can draw. */
  function asDrawable(g) {
    if (!g) return null;
    if (typeof g === "string") {
      try { g = JSON.parse(g); } catch (e) { return null; }
    }
    if (!g.type) return null;
    return rewind(g);
  }

  /** Largest polygon (by spherical area) of a Polygon / MultiPolygon geometry. */
  function largestPolygon(geom) {
    if (!geom) return null;
    if (geom.type === "Feature") return largestPolygon(geom.geometry);
    if (geom.type === "Polygon") return geom;
    if (geom.type === "MultiPolygon") {
      let best = null, bestA = -1;
      for (const p of geom.coordinates) {
        const a = d3.geoArea({ type: "Polygon", coordinates: p });
        if (a > bestA) { bestA = a; best = p; }
      }
      return best ? { type: "Polygon", coordinates: best } : null;
    }
    if (geom.type === "FeatureCollection") {
      let best = null, bestA = -1;
      for (const f of geom.features) {
        const p = largestPolygon(f.geometry);
        const a = p ? d3.geoArea(p) : -1;
        if (a > bestA) { bestA = a; best = p; }
      }
      return best;
    }
    return null;
  }

  /* ---------------- formatting ---------------- */

  function fmtYear(y) {
    if (y === null || y === undefined || isNaN(y)) return "—";
    y = Math.round(y);
    if (y < 0) return `${-y} BCE`;
    return `${y} CE`;
  }

  function fmtRange(a, b) {
    if (a === undefined || a === null) return "—";
    if (b === undefined || b === null || a === b) return fmtYear(a);
    return `${fmtYear(a)} – ${fmtYear(b)}`;
  }

  function pad(n, w) { return String(n).padStart(w, "0"); }

  function dms(v, isLat) {
    const hemi = isLat ? (v >= 0 ? "N" : "S") : (v >= 0 ? "E" : "W");
    v = Math.abs(v);
    let d = Math.floor(v);
    let m = Math.floor((v - d) * 60);
    let s = Math.round(((v - d) * 60 - m) * 60);
    if (s === 60) { s = 0; m += 1; }
    if (m === 60) { m = 0; d += 1; }
    return `${pad(d, isLat ? 2 : 3)}°${pad(m, 2)}′${pad(s, 2)}″${hemi}`;
  }

  /** Military Date-Time Group, e.g. 031542Z NOV 26 */
  function dtg(date) {
    const M = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    return `${pad(date.getUTCDate(), 2)}${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCSeconds(), 2)}Z ${M[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(2)}`;
  }

  /* ---------------- UTM / MGRS (WGS84) ---------------- */

  function toUTM(lon, lat) {
    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
    const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const zone = Math.floor((lon + 180) / 6) + 1;
    const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
    const phi = lat * Math.PI / 180, lam = lon * Math.PI / 180;
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    const T = Math.tan(phi) ** 2;
    const C = ep2 * Math.cos(phi) ** 2;
    const A = Math.cos(phi) * (lam - lon0);
    const e4 = e2 * e2, e6 = e4 * e2;
    const M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
      - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
      + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi)
      - (35 * e6 / 3072) * Math.sin(6 * phi));
    const E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
    let Nn = k0 * (M + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
    if (lat < 0) Nn += 10000000;
    return { zone, E, N: Nn };
  }

  function mgrs(lon, lat) {
    if (lat < -80 || lat > 84) return "—";
    const u = toUTM(lon, lat);
    const bands = "CDEFGHJKLMNPQRSTUVWX";
    const band = bands[Math.min(19, Math.floor((lat + 80) / 8))];
    const colSets = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"];
    const rows = "ABCDEFGHJKLMNPQRSTUV";
    const col = colSets[(u.zone - 1) % 3][Math.floor(u.E / 100000) - 1] || "?";
    const rowIdx = (Math.floor(u.N / 100000) + (u.zone % 2 === 0 ? 5 : 0)) % 20;
    const row = rows[rowIdx];
    const e = pad(Math.floor(u.E % 100000), 5);
    const n = pad(Math.floor(u.N % 100000), 5);
    return `${u.zone}${band} ${col}${row} ${e} ${n}`;
  }

  window.GeoUtils = { rewind, asDrawable, largestPolygon, fmtYear, fmtRange, dms, dtg, mgrs, toUTM };
})();
