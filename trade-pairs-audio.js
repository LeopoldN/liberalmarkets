(() => {
  'use strict';
  const button = document.getElementById('sound-toggle');
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const key = 'trade-pairs:sound';
  let enabled = true, context, master;
  const active = new Set();
  try { enabled = localStorage.getItem(key) !== 'off'; } catch {}
  function render() {
    button.textContent = enabled ? 'Sound on' : 'Sound off';
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Mute sound effects' : 'Enable sound effects');
    button.disabled = !AudioContext;
    if (!AudioContext) button.title = 'Sound is unavailable in this browser';
  }
  function note(frequency, start, duration, volume, endFrequency) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(volume, start + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope); envelope.connect(master);
    active.add(oscillator);
    oscillator.onended = () => { active.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(start); oscillator.stop(start + duration + 0.015);
  }
  async function play(kind = 'click') {
    if (!enabled || !AudioContext || document.hidden) return;
    try {
      // Created only by a player action, so no autoplay permission is needed.
      if (!context) {
        context = new AudioContext();
        master = context.createGain(); master.gain.value = 0.18;
        master.connect(context.destination);
      }
      if (context.state !== 'running') await context.resume();
      if (!enabled || context.state !== 'running') return;
      const now = context.currentTime + 0.005;
      if (kind === 'match' || kind === 'win') {
        const notes = kind === 'win' ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
        notes.forEach((frequency,i) => note(frequency, now + i * 0.075, 0.24, 0.42));
      } else if (kind === 'wrong') {
        note(220, now, 0.13, 0.4, 164.81);
      } else {
        note(900, now, 0.045, 0.45, 450);
      }
    } catch {
      // Audio is optional; browser/device restrictions must not interrupt a move.
    }
  }
  button.onclick = () => {
    enabled = !enabled;
    if (master) master.gain.setValueAtTime(enabled ? 0.18 : 0, context.currentTime);
    if (!enabled) for (const oscillator of active) { try { oscillator.stop(); } catch {} }
    try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch {}
    render();
    if (enabled) play('click');
  };
  render();
  window.TradePairsAudio = {play};
})();
