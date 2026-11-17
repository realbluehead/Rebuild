// Game speed multiplier, for testing: a button that cycles ×1 → ×1000, remembered in this browser (one setting for
// both phases). Each phase multiplies its game time by `speed()`.
import { h } from './dom';

const SPEED_KEY = 'rebuild:speed';
export const SPEEDS = [1, 2, 5, 10, 50, 100, 1000];

export interface SpeedControl {
  el: HTMLButtonElement;
  /** The chosen multiplier (1 = normal). */
  speed(): number;
}

export function speedControl(): SpeedControl {
  let speed = 1;
  try {
    const saved = Number(localStorage.getItem(SPEED_KEY));
    if (SPEEDS.includes(saved)) speed = saved;
  } catch { /* no storage */ }
  const el = h('button', 'px-btn speed-ctl');
  el.title = 'Game speed (for testing)';
  const show = () => { el.textContent = `Speed ×${speed}`; el.classList.toggle('can', speed > 1); };
  show();
  el.addEventListener('click', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    try { localStorage.setItem(SPEED_KEY, String(speed)); } catch { /* no storage */ }
    show();
  });
  return { el, speed: () => speed };
}
