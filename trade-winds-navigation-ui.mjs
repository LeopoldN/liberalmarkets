import * as THREE from "./assets/vendor/three.module.js";
import { cargoCount, VESSELS } from "./trade-winds-engine.mjs?v=cargo-80";
import { NauticalChartScene } from "./trade-winds-chart.mjs";

export function createNavigationUI({
  getState,
  getRenderer,
  getWater,
  ports,
  keys,
  saveGame,
  updateCompass,
}) {
  const $ = (id) => document.getElementById(id);
  let nauticalChart;

  function openSettings() {
    const state = getState();
    keys.clear();
    $("voyage-stats").textContent =
      `Day ${1 + Math.floor(state.elapsed / 180)} at sea · ${state.visited.length} of ${ports.length} ports visited · ${cargoCount(state)} / ${state.capacity} cargo`;
    $("save-status").textContent = "";
    $("settings").showModal();
  }
  $("settings-button").onclick = openSettings;
  $("close-settings").onclick = () => $("settings").close();
  $("resume").onclick = () => $("settings").close();
  $("save").onclick = () => {
    $("save-status").textContent = saveGame(true)
      ? "Your voyage has been saved."
      : "Saving is unavailable in this browser. Your voyage is still open.";
  };
  $("quit").onclick = () => {
    if (saveGame(true)) location.href = "games.html";
    else
      $("save-status").textContent =
        "Could not save. Your voyage is still open; enable browser storage before quitting.";
  };
  $("quality").onchange = (e) => {
    const quality = e.target.value;
    const renderer = getRenderer(),
      water = getWater();
    renderer.shadowMap.enabled = quality === "high";
    renderer.setPixelRatio(
      quality === "high" ? Math.min(devicePixelRatio, 2) : 1,
    );
    water.material.uniforms.fancy.value = quality === "high" ? 1 : 0;
  };
  // The Blender chart uses the same geographic projection as the sailing world.
  function drawChart() {
    const state = getState();
    nauticalChart?.update(state);
  }
  function layoutChart({ detail: chart }) {
    const bottom = chart.screen(new THREE.Vector3(-49, 2, 47));
    const end = chart.screen(new THREE.Vector3(59, 2, 47));
    const controls = $("chart-stage").querySelector(".chart-bottom");
    controls.style.left = `${bottom.x}px`;
    controls.style.top = `${bottom.y - 26}px`;
    controls.style.width = `${end.x - bottom.x}px`;
    controls.style.bottom = "auto";
    controls.style.right = "auto";
    const routes = chart.screen(new THREE.Vector3(-56, 2, 33));
    const plaque = $("chart-stage").querySelector(".chart-routes");
    plaque.style.left = `${routes.x}px`;
    plaque.style.top = `${routes.y}px`;
  }
  $("chart-stage").addEventListener("chartlayout", layoutChart);
  function selectDestination(id) {
    const state = getState();
    state.target = id || null;
    const p = ports.find((p) => p.id === id);
    $("destination").value = id || "";
    if (p) {
      const seconds =
        Math.hypot(p.x - state.x, p.z - state.z) /
        (VESSELS[state.vessel].speed * 0.92);
      $("route-info").textContent =
        `${p.name} · ≈ ${Math.max(1, Math.round(seconds / 60))} min, plus detours around land. Exports: ${p.exports.join(", ")}. High demand: ${p.imports.join(", ")}.`;
    } else
      $("route-info").textContent =
        "Chart a course. Follow the gold compass marker.";
    drawChart();
    updateCompass();
    saveGame(true);
  }
  function openChart() {
    const state = getState();
    keys.clear();
    $("settings").close();
    $("chart").showModal();
    nauticalChart ||= new NauticalChartScene($("chart-stage"), {
      onSelect: selectDestination,
    });
    nauticalChart.start(state);
    $("destination").value = state.target || "";
    selectDestination(state.target);
  }
  $("open-chart").onclick = openChart;
  $("close-chart").onclick = () => $("chart").close();
  $("destination").onchange = (e) => selectDestination(e.target.value);
  $("chart").addEventListener("close", () => nauticalChart?.stop());
  $("chart-set-sail").onclick = () => $("chart").close();
  $("chart-stage")
    .querySelectorAll("[data-route]")
    .forEach(
      (button) =>
        (button.onclick = () => selectDestination(button.dataset.route)),
    );
  return { openSettings, openChart, drawChart };
}
