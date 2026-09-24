import {
  GOODS,
  SHIPYARD_PORT_ID,
  cargoCount,
  prices,
  transact,
} from "./trade-winds-engine.mjs?v=cargo-80";
import { TownBackground } from "./trade-winds-town-background.mjs";
import { ShipyardUI } from "./trade-winds-shipyard-ui.mjs?v=cargo-80";
import { selectShip } from "./trade-winds-shipyard.mjs?v=cargo-80";

export function createMarketUI({
  getState,
  setState,
  sailing,
  keys,
  audio,
  onVesselChange,
  updateHUD,
  saveGame,
  toast,
  updateAudio,
}) {
  const $ = (id) => document.getElementById(id);
  let activePort = null,
    mode = "buy",
    basket = {},
    tradingPost,
    shipyard;

  function enterPort(p) {
    const state = getState();
    activePort = p;
    sailing.stop();
    keys.clear();
    mode = "buy";
    basket = {};
    if (!state.visited.includes(p.id)) state.visited.push(p.id);
    $("port-name").textContent = p.name;
    $("port-region").textContent = p.region;
    $("merchant-name").textContent = p.merchant;
    const isShipyard = p.id === SHIPYARD_PORT_ID;
    $("market").classList.toggle("is-shipyard", isShipyard);
    $("market").querySelector(".trade").hidden = isShipyard;
    $("shipyard").hidden = !isShipyard;
    $("market").querySelector(".post-label").textContent = isShipyard
      ? "Shipyard"
      : "Trading post";
    $("market").querySelector(".merchant-role").textContent = isShipyard
      ? "Master Shipwright"
      : "Local Merchant";
    $("market").querySelector(".merchant-quote").textContent = isShipyard
      ? "“A fine ship opens a wider world, captain. Let’s find your next command.”"
      : "“Fair winds, captain. Let’s make a little gold.”";
    $("market").querySelector(".local-advice").hidden = isShipyard;
    const names = (ids) =>
      ids
        .map((id) => GOODS.find((g) => g.id === id).name.toLowerCase())
        .join(" · ");
    $("export-hint").textContent = names(p.exports);
    $("import-hint").textContent = names(p.imports);
    renderMarket();
    $("trade-message").textContent = "";
    $("market").showModal();
    updateAudio();
    tradingPost ||= new TownBackground($("trading-post-scene"));
    tradingPost.start(p);
    saveGame(true);
  }
  function leavePort() {
    sailing.ignoredPort = activePort.id;
    tradingPost?.stop();
    $("market").close();
    activePort = null;
    updateAudio();
    toast(
      "W / arrows to sail · Click the sea to steer · M for your chart",
      5000,
    );
    saveGame(true);
  }
  function goodIcon(g) {
    let art = "";
    if (g.id === "rum")
      art =
        '<path fill="#76502e" d="M6 2h12v3H6zM4 5h16v16H4zM6 21h12v2H6z"/><path fill="#b77d3e" d="M6 5h10v16H6z"/><path fill="#d49a51" d="M7 5h2v16H7z"/><path fill="#959888" d="M4 7h16v3H4zM4 17h16v3H4z"/>';
    else if (g.id === "sugar")
      art =
        '<path fill="#9b7343" d="M2 15h20v8H2z"/><path fill="#ede5c8" d="M3 13h18v5H3zM6 9h12v5H6zM9 5h6v5H9z"/><path fill="#fff7e1" d="M8 11h5v4H8zM11 7h4v4h-4z"/>';
    else if (g.id === "cotton")
      art =
        '<path fill="#b4b399" d="M2 7h19v13H2z"/><path fill="#eee8ce" d="M3 5h18v12H3z"/><path fill="#fffae0" d="M4 5h16v4H4z"/><path fill="#aaa58c" d="M16 9h4v8h-4z"/>';
    else if (g.id === "timber")
      art =
        '<path fill="#684b2f" d="M1 5h21v16H1z"/><path fill="#a87945" d="M2 5h18v5H2zM2 12h18v6H2z"/><path fill="#ccb077" d="M5 4h2v18H5zM16 4h2v18h-2z"/>';
    else if (g.id === "tobacco")
      art =
        '<path fill="#687440" d="M3 4h18v18H3z"/><path fill="#889853" d="M5 4h5v17H5zM13 4h3v17h-3z"/><path fill="#c6ab73" d="M2 8h20v2H2zM2 17h20v2H2zM11 3h2v20h-2z"/>';
    else if (g.id === "spices")
      art =
        '<path fill="#8e6339" d="M2 12h20v10H2z"/><path fill="#bb6e34" d="M3 9h17v7H3zM6 5h11v8H6zM9 2h4v7H9z"/><path fill="#e4a345" d="M6 9h4v4H6zM11 5h3v4h-3z"/><path fill="#c29658" d="M2 17h20v3H2z"/>';
    else
      art = `<path fill="${g.color}" d="M7 2h10v4H7zM5 6h14v3H5zM3 9h18v12H3zM5 21h14v3H5z"/><path fill="#cfab73" d="M6 5h12v3H6zM5 10h3v9H5z"/><path fill="#513d29" d="M11 12h5v6h-5z"/>`;
    return `<svg class="good-icon" viewBox="0 0 24 26" aria-hidden="true" shape-rendering="crispEdges">${art}</svg>`;
  }
  function renderMarket(message = "") {
    const state = getState();
    $("market-coins").textContent =
      `${state.coins.toLocaleString()} gold aboard`;
    const cost = Math.ceil((100 - state.health) * 1.5);
    $("repair").textContent = cost
      ? `Repair hull · ${cost} gold`
      : "Hull in fine condition";
    $("repair").disabled = cost === 0 || cost > state.coins;
    $("repair").dataset.healthy = String(cost === 0);
    if (activePort.id === SHIPYARD_PORT_ID) {
      shipyard ||= new ShipyardUI(
        $("shipyard"),
        (id) => {
          const state = getState();
          const result = selectShip(state, activePort, id);
          if (result.ok) {
            onVesselChange();
            if (result.purchased) audio.playCoin();
            tradingPost?.acknowledge();
            updateHUD();
            saveGame(true);
          }
          renderMarket(result.message);
        },
        leavePort,
      );
      shipyard.render(state, message);
      return;
    }
    const p = activePort;
    $("buy-tab").setAttribute("aria-selected", String(mode === "buy"));
    $("sell-tab").setAttribute("aria-selected", String(mode === "sell"));
    $("hold").textContent = `${cargoCount(state)} / ${state.capacity}`;
    $("goods-list").innerHTML = GOODS.map(
      (g) =>
        `<div class="goods-row"><span class="goods-name" title="${g.description}">${goodIcon(g)}${g.name}</span><span class="goods-price"><i class="price-coin" aria-hidden="true"></i>${prices(p, g)[mode]}</span><span class="goods-owned">${state.cargo[g.id]}</span><div class="quantity"><button data-good="${g.id}" data-delta="-1" aria-label="Remove one ${g.name}" ${!basket[g.id] ? "disabled" : ""}>−</button><output aria-label="${g.name} quantity">${basket[g.id] || 0}</output><button data-good="${g.id}" data-delta="1" aria-label="Add one ${g.name}" ${canAdd(g) ? "" : "disabled"}>+</button></div></div>`,
    ).join("");
    const total = GOODS.reduce(
        (n, g) => n + (basket[g.id] || 0) * prices(p, g)[mode],
        0,
      ),
      count = Object.values(basket).reduce((a, b) => a + b, 0);
    $("trade-total").innerHTML =
      `${total.toLocaleString()} <small>gold</small>`;
    $("trade-summary").textContent =
      mode === "buy" ? "Total cost" : "Sale proceeds";
    $("confirm-trade").disabled = !count;
    $("confirm-trade").textContent =
      mode === "buy" ? "Confirm purchase" : "Confirm sale";
  }
  function canAdd(g) {
    const state = getState();
    if (mode === "sell") return (basket[g.id] || 0) < state.cargo[g.id];
    const quantity = Object.values(basket).reduce((a, b) => a + b, 0),
      total = GOODS.reduce(
        (n, g) => n + (basket[g.id] || 0) * prices(activePort, g).buy,
        0,
      );
    return (
      cargoCount(state) + quantity < state.capacity &&
      total + prices(activePort, g).buy <= state.coins
    );
  }
  $("goods-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-good]");
    if (!btn) return;
    const g = GOODS.find((g) => g.id === btn.dataset.good),
      delta = Number(btn.dataset.delta);
    if (delta > 0 && !canAdd(g)) return;
    basket[g.id] = Math.max(0, (basket[g.id] || 0) + delta);
    renderMarket();
    const replacement = $("goods-list").querySelector(
      `[data-good="${g.id}"][data-delta="${delta}"]`,
    );
    if (replacement && !replacement.disabled) replacement.focus();
  });
  $("confirm-trade").onclick = () => {
    const state = getState();
    if (activePort?.id === SHIPYARD_PORT_ID) return;
    const draft = structuredClone(state);
    let count = 0;
    for (const g of GOODS)
      if (basket[g.id]) {
        const result = transact(draft, activePort, g.id, mode, basket[g.id]);
        if (!result.ok) {
          $("trade-message").textContent = result.message;
          return;
        }
        count += basket[g.id];
      }
    setState(draft);
    if (count > 0) audio.playCoin();
    tradingPost?.acknowledge();
    basket = {};
    updateHUD();
    renderMarket();
    $("trade-message").textContent =
      `${mode === "buy" ? "Loaded" : "Sold"} ${count} cargo units. A pleasure doing business, captain.`;
    saveGame(true);
  };
  $("buy-tab").onclick = () => {
    mode = "buy";
    basket = {};
    $("trade-message").textContent = "";
    renderMarket();
  };
  $("sell-tab").onclick = () => {
    mode = "sell";
    basket = {};
    $("trade-message").textContent = "";
    renderMarket();
  };
  $("repair").onclick = () => {
    const state = getState();
    const cost = Math.ceil((100 - state.health) * 1.5);
    if (cost > state.coins || cost <= 0) return;
    state.coins -= cost;
    state.health = 100;
    updateHUD();
    renderMarket("New planks, fresh caulking. Your hull is fully repaired.");
    $("trade-message").textContent =
      "New planks, fresh caulking. Your hull is fully repaired.";
    saveGame(true);
  };
  $("leave-port").onclick = leavePort;
  $("set-sail").onclick = leavePort;
  $("market").addEventListener("cancel", (e) => {
    e.preventDefault();
    leavePort();
  });
  return { enter: enterPort, leave: leavePort };
}
