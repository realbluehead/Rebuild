// The phase splashes ("The arrival", "The voyage") dressed like the title screen (title.ts): the name in neon Monoton
// where the title's sits and as wide, the phase under it, CRT scanlines, and the blinking green "TAP TO …" in the
// title's dark box at the bottom, all sized in the title canvas's pixel (`--px`). The splash's own art goes under it.
const TITLE_PIXELS = 112; // (title.ts's SCENE_W)

export interface SplashDress {
  /** Removes the resize listener (when the splash goes). */
  drop(): void;
}

/** Adds the dressing to the splash `el` (already in the page): its `name` in `colour`, `phase` under it, `hint`. */
export function dressSplash(el: HTMLElement, name: string, phase: string, hint: string, colour: string): SplashDress {
  const div = (cls: string, text = '') => { const d = document.createElement('div'); d.className = cls; d.textContent = text; return d; };
  const title = div('title-name lit splash-name', name);
  title.style.color = colour;
  const sub = div('splash-sub', phase);
  const box = div('splash-box');
  box.append(div('splash-hint', hint));
  el.append(div('splash-scan'), title, sub, box);
  const fit = () => {
    const w = el.clientWidth || window.innerWidth;
    el.style.setProperty('--px', `${w / TITLE_PIXELS}px`);
    title.style.fontSize = '40px';
    title.style.fontSize = `${Math.min(64 * (w / 360), (40 * w * 0.88) / Math.max(1, title.offsetWidth))}px`;
    sub.style.top = `${title.offsetTop + title.offsetHeight + 8}px`;
  };
  fit();
  void document.fonts?.load('40px Monoton').then(fit, () => {});
  window.addEventListener('resize', fit);
  return { drop: () => window.removeEventListener('resize', fit) };
}
