export const SCALE = 220;
// Keep the normal pace separate so the temporary testing boost is easy to remove.
export const BASE_SHIP_SPEED = 14;
export const SHIP_SPEED = BASE_SHIP_SPEED * 3.5;
export const VESSELS = {
  raft: { bow: 9, stern: 9, halfWidth: 6.5 },
  trader: { bow: 20, stern: 13, halfWidth: 7 },
};
export const SAVE_KEY = "liberal-markets:trade-winds:v1";
export const GOODS = [
  {
    id: "rum",
    name: "Rum barrels",
    unit: "barrel",
    base: 38,
    color: "#b97739",
    description:
      "Oak-aged island rum. Distilled cheaply in Jamaica; sought after on the mainland.",
  },
  {
    id: "sugar",
    name: "Raw sugar",
    unit: "crate",
    base: 26,
    color: "#eee0b2",
    description:
      "Golden cane sugar from the island mills. Northern ports pay a sweet premium.",
  },
  {
    id: "tobacco",
    name: "Tobacco",
    unit: "bale",
    base: 46,
    color: "#78854c",
    description:
      "Fragrant Cuban leaf, bundled for the long crossing. A valuable export from Havana.",
  },
  {
    id: "coffee",
    name: "Coffee beans",
    unit: "sack",
    base: 42,
    color: "#714c35",
    description:
      "Highland coffee from the northern Andes. Island merchants are eager buyers.",
  },
  {
    id: "cotton",
    name: "Cotton cloth",
    unit: "roll",
    base: 32,
    color: "#e1dbbe",
    description:
      "Durable cloth from the north. Essential to the sailmakers of the southern islands.",
  },
  {
    id: "timber",
    name: "Hardwood",
    unit: "bundle",
    base: 24,
    color: "#ae774a",
    description:
      "Dense tropical timber from Central America. Shipyards across the sea need it.",
  },
  {
    id: "cacao",
    name: "Cacao",
    unit: "sack",
    base: 48,
    color: "#96583b",
    description:
      "Rich cacao grown on the Venezuelan coast. A luxury in the northern Caribbean.",
  },
  {
    id: "spices",
    name: "Island spices",
    unit: "crate",
    base: 58,
    color: "#c88038",
    description:
      "Aromatic spices from the Lesser Antilles, prized in the great western ports.",
  },
];
export const PORTS = [
  {
    id: "royal",
    name: "Port Royal",
    region: "Jamaica",
    lon: -76.84,
    lat: 17.91,
    merchant: "Elias Beckett",
    exports: ["rum", "sugar"],
    imports: ["timber", "coffee"],
    color: 0xdfaa70,
  },
  {
    id: "havana",
    name: "Havana",
    region: "Cuba",
    lon: -82.37,
    lat: 23.15,
    merchant: "Isabel Valdés",
    exports: ["tobacco", "sugar"],
    imports: ["cacao", "spices"],
    color: 0xe4c281,
  },
  {
    id: "santiago",
    name: "Santiago",
    region: "Cuba",
    lon: -75.87,
    lat: 19.96,
    merchant: "Tomás Herrera",
    exports: ["tobacco", "sugar"],
    imports: ["coffee", "timber"],
    color: 0xd6a77a,
  },
  {
    id: "nassau",
    name: "Nassau",
    region: "The Bahamas",
    lon: -77.35,
    lat: 25.08,
    merchant: "Arthur Finch",
    exports: ["rum"],
    imports: ["coffee", "cacao", "timber"],
    color: 0xe4c9a1,
  },
  {
    id: "keywest",
    name: "Key West",
    region: "Florida",
    lon: -81.8,
    lat: 24.55,
    merchant: "Clara Whitmore",
    exports: ["cotton"],
    imports: ["sugar", "rum", "cacao"],
    color: 0xe9dab3,
  },
  {
    id: "staugustine",
    name: "St. Augustine",
    region: "Florida",
    lon: -81.3,
    lat: 29.89,
    merchant: "Samuel Reed",
    exports: ["cotton", "timber"],
    imports: ["sugar", "tobacco", "spices"],
    color: 0xdcc294,
  },
  {
    id: "veracruz",
    name: "Veracruz",
    region: "Mexico",
    lon: -96.13,
    lat: 19.19,
    merchant: "Inés Navarro",
    exports: ["coffee", "cotton"],
    imports: ["spices", "rum"],
    color: 0xdaab7b,
  },
  {
    id: "campeche",
    name: "Campeche",
    region: "Mexico",
    lon: -90.55,
    lat: 19.84,
    merchant: "Diego Mendoza",
    exports: ["timber", "sugar"],
    imports: ["tobacco", "spices"],
    color: 0xe5bc88,
  },
  {
    id: "belize",
    name: "Belize Town",
    region: "Central America",
    lon: -88.19,
    lat: 17.49,
    merchant: "Joseph Flowers",
    exports: ["timber"],
    imports: ["cotton", "tobacco"],
    color: 0xd4bb8f,
  },
  {
    id: "portobelo",
    name: "Portobelo",
    region: "Panama",
    lon: -79.65,
    lat: 9.56,
    merchant: "Lucía Castillo",
    exports: ["timber", "coffee"],
    imports: ["cotton", "rum"],
    color: 0xe0b48c,
  },
  {
    id: "cartagena",
    name: "Cartagena",
    region: "New Granada",
    lon: -75.55,
    lat: 10.4,
    merchant: "Mateo Duarte",
    exports: ["coffee", "cacao"],
    imports: ["rum", "cotton"],
    color: 0xe8c17d,
  },
  {
    id: "laguaira",
    name: "La Guaira",
    region: "Venezuela",
    lon: -66.93,
    lat: 10.61,
    merchant: "Rafael Rojas",
    exports: ["cacao", "coffee"],
    imports: ["tobacco", "cotton"],
    color: 0xdba773,
  },
  {
    id: "santodomingo",
    name: "Santo Domingo",
    region: "Hispaniola",
    lon: -69.88,
    lat: 18.46,
    merchant: "Ana Rosario",
    exports: ["sugar", "tobacco"],
    imports: ["timber", "spices"],
    color: 0xe0b781,
  },
  {
    id: "sanjuan",
    name: "San Juan",
    region: "Puerto Rico",
    lon: -66.12,
    lat: 18.47,
    merchant: "Sofía Rivera",
    exports: ["sugar", "coffee"],
    imports: ["cotton", "timber"],
    color: 0xe5cbb0,
  },
  {
    id: "bridgetown",
    name: "Bridgetown",
    region: "Barbados",
    lon: -59.62,
    lat: 13.1,
    merchant: "Benjamin Clarke",
    exports: ["spices", "rum"],
    imports: ["coffee", "cotton"],
    color: 0xe8bb91,
  },
  {
    id: "stgeorges",
    name: "St. George’s",
    region: "Grenada",
    lon: -61.75,
    lat: 12.05,
    merchant: "Rose Baptiste",
    exports: ["spices", "cacao"],
    imports: ["cotton", "tobacco"],
    color: 0xd8aa82,
  },
];
export const toWorld = (lon, lat) => ({
  x: (lon + 80) * SCALE,
  z: (22 - lat) * SCALE,
});
export const toGeo = (x, z) => ({ lon: x / SCALE - 80, lat: 22 - z / SCALE });
export function prices(port, good) {
  const factor = port.exports.includes(good.id)
    ? 0.62
    : port.imports.includes(good.id)
      ? 1.55
      : 1.04;
  return {
    buy: Math.round(good.base * factor),
    sell: Math.round(good.base * factor * 0.82),
  };
}
export const cargoCount = (state) =>
  Object.values(state.cargo).reduce((a, b) => a + b, 0);
export function newState(position) {
  return {
    version: 1,
    vessel: "raft",
    x: position.x,
    z: position.z,
    heading: Math.PI,
    coins: 650,
    health: 100,
    cargo: Object.fromEntries(GOODS.map((g) => [g.id, 0])),
    capacity: 40,
    elapsed: 0,
    visited: ["royal"],
    profit: 0,
    target: null,
  };
}
export function transact(state, port, goodId, mode, quantity) {
  const good = GOODS.find((g) => g.id === goodId);
  if (
    !good ||
    !["buy", "sell"].includes(mode) ||
    !Number.isInteger(quantity) ||
    quantity < 1
  )
    return { ok: false, message: "Choose a quantity first." };
  const price = prices(port, good)[mode],
    total = price * quantity;
  if (mode === "buy") {
    if (total > state.coins)
      return { ok: false, message: "You do not have enough gold." };
    if (cargoCount(state) + quantity > state.capacity)
      return {
        ok: false,
        message: "Your hold is full. Sell cargo to make room.",
      };
    state.coins -= total;
    state.cargo[goodId] += quantity;
  } else {
    if (state.cargo[goodId] < quantity)
      return { ok: false, message: "You do not have that much cargo." };
    state.coins += total;
    state.cargo[goodId] -= quantity;
  }
  return {
    ok: true,
    message: `${mode === "buy" ? "Bought" : "Sold"} ${quantity} ${good.name.toLowerCase()} for ${total} gold.`,
  };
}
export function parseSave(raw) {
  try {
    const s = JSON.parse(raw);
    if (
      s.version !== 1 ||
      !Number.isFinite(s.x) ||
      !Number.isFinite(s.z) ||
      s.x < -5500 ||
      s.x > 4800 ||
      s.z < -2500 ||
      s.z > 3550 ||
      !Number.isFinite(s.heading) ||
      !Number.isInteger(s.coins) ||
      s.coins < 0 ||
      s.coins > 1e9 ||
      !Number.isFinite(s.health) ||
      s.health <= 0 ||
      s.health > 100 ||
      s.capacity !== 40 ||
      !Number.isFinite(s.elapsed) ||
      s.elapsed < 0
    )
      return null;
    if (
      !s.cargo ||
      GOODS.some(
        (g) => !Number.isInteger(s.cargo[g.id]) || s.cargo[g.id] < 0,
      ) ||
      Object.keys(s.cargo).length !== GOODS.length ||
      cargoCount(s) > 40
    )
      return null;
    if (
      !Array.isArray(s.visited) ||
      s.visited.some((id) => !PORTS.some((p) => p.id === id))
    )
      return null;
    // Saves from before rafts were introduced keep their original trading ship.
    if (s.vessel === undefined) s.vessel = "trader";
    if (!Object.hasOwn(VESSELS, s.vessel)) return null;
    s.target = PORTS.some((p) => p.id === s.target) ? s.target : null;
    return s;
  } catch {
    return null;
  }
}
export function pointInPolygon(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = ring[i],
      [c, d] = ring[j];
    if (b > y !== d > y && x < ((c - a) * (y - b)) / (d - b) + a)
      inside = !inside;
  }
  return inside;
}
