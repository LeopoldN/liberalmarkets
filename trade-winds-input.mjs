import * as THREE from "./assets/vendor/three.module.js";
import { DEBRIS_REACH } from "./trade-winds-debris.mjs";

// Bind once, after the sailing canvas exists. Input owns only gesture bookkeeping.
export function bindSailingInput({
  canvas,
  camera,
  keys,
  sailing,
  navigation,
  audio,
  getState,
  isStarted,
  paused,
  isSolid,
  getDebris,
  salvage,
  getZoom,
  setZoom,
  resize,
  toast,
  updateAudio,
  saveGame,
}) {
  const $ = (id) => document.getElementById(id);
  const raycaster = new THREE.Raycaster();
  const seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const pointers = new Map();
  let pointerStart = null,
    pinchDistance = 0,
    pinched = false;
  function pointerDown(e) {
    if (paused()) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pointerStart = { x: e.clientX, y: e.clientY };
    if (pointers.size === 2) {
      pinched = true;
      const [a, b] = [...pointers.values()];
      pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }
  function pointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()],
        d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance > 0)
        setZoom(
          THREE.MathUtils.clamp((getZoom() * pinchDistance) / d, 0.65, 2),
        );
      pinchDistance = d;
      resize();
    }
  }
  function pointerCancel(e) {
    pointers.delete(e.pointerId);
    if (!pointers.size) {
      pinched = false;
      pointerStart = null;
    }
  }
  function pointerUp(e) {
    pointers.delete(e.pointerId);
    if (pinched) {
      if (!pointers.size) pinched = false;
      return;
    }
    if (
      paused() ||
      !pointerStart ||
      Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 12
    )
      return;
    raycaster.setFromCamera(
      new THREE.Vector2(
        (e.clientX / innerWidth) * 2 - 1,
        1 - (e.clientY / innerHeight) * 2,
      ),
      camera,
    );
    const point = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(seaPlane, point)) {
      const debris = getDebris().find(
        (item) => Math.hypot(item.x - point.x, item.z - point.z) < 20,
      );
      if (debris) {
        if (
          Math.hypot(debris.x - getState().x, debris.z - getState().z) <=
          DEBRIS_REACH
        )
          salvage(debris.id);
        else {
          sailing.target = { x: debris.x, z: debris.z };
          toast(
            "Sail closer, then press E or tap Salvage to recover the cargo.",
          );
        }
        pointerStart = null;
        return;
      }
      if (isSolid(point.x, point.z)) {
        toast("Choose open water, captain.");
        return;
      }
      sailing.target = { x: point.x, z: point.z };
    }
    pointerStart = null;
  }
  window.addEventListener("keydown", (e) => {
    if (!isStarted() || e.ctrlKey || e.metaKey || e.altKey) return;
    audio.unlock();
    const key = e.key.toLowerCase();
    if (
      ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key) &&
      !paused()
    )
      e.preventDefault();
    if (e.repeat && ["m", "escape"].includes(key)) return;
    if (key === "escape") {
      if ($("market").open || $("chart").open || $("settings").open) return;
      navigation.openSettings();
      e.preventDefault();
      return;
    }
    if (key === "m" && !$("market").open) {
      e.preventDefault();
      $("chart").open ? $("chart").close() : navigation.openChart();
      return;
    }
    if (paused()) return;
    if (key === "e") {
      e.preventDefault();
      if (!e.repeat) salvage();
      return;
    }
    if (key === " ") {
      sailing.speed = 0;
      sailing.target = null;
      keys.clear();
      toast("Anchor dropped.", 2000);
      return;
    }
    keys.add(key);
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());
  document.addEventListener(
    "pointerdown",
    () => {
      if (isStarted()) audio.unlock();
    },
    { passive: true },
  );
  document.addEventListener("visibilitychange", () => {
    keys.clear();
    updateAudio();
    if (document.hidden) saveGame(true);
  });
  window.addEventListener("pagehide", () => {
    audio.stop();
    saveGame(true);
  });
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerCancel);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      setZoom(THREE.MathUtils.clamp(getZoom() + e.deltaY * 0.001, 0.65, 2));
      resize();
    },
    { passive: false },
  );
}
