// What phase II's tabs share: the context they act through, and small helpers that write to the DOM only on change.
import { fmt, fmtTime } from '../../shared/format';
import { h } from '../../shared/ui/dom';
import type { P2State } from '../core/state';

/** The state and what to call after an action changed it (saves and refreshes the screen). */
export interface Ctx {
  s: P2State;
  changed(): void;
}

/** A tab of the bottom panel: its button label, its list, and how it refreshes (a few times a second). */
export interface Tab {
  label: string;
  list: HTMLElement;
  update(s: P2State): void;
  /** The desert plot it belongs to (opening it glides there; tapping the plot opens it). */
  plot?: number;
  /** Shown in the scene instead of the desert while the tab is open (the star map). */
  scene?: HTMLElement;
  /** Called when the tab is opened. */
  shown?(): void;
}

/** Sets an element's text if it changed. */
export function set(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
/** Toggles a class if it changed. */
export function flag(el: HTMLElement, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}
/** A button that is pressable (yellow) only when `can`. */
export function enable(b: HTMLButtonElement, can: boolean): void {
  if (b.disabled === can) b.disabled = !can;
  flag(b, 'can', can);
}
/** Sets a bar's fill (0..1). */
export function fill(bar: HTMLElement, x: number): void {
  const w = `${Math.round(Math.max(0, Math.min(1, x)) * 1000) / 10}%`;
  if (bar.style.width !== w) bar.style.width = w;
}
/** A slim bar: the outer element and its fill. */
export function bar(): { el: HTMLElement; fill: HTMLElement } {
  const el = h('div', 'bar slim');
  const f = h('i');
  el.append(f);
  return { el, fill: f };
}

export const time = (sec: number): string => fmtTime(Math.max(0, Math.ceil(sec)));
export const num = (x: number): string => fmt(Math.floor(x));
/** A cost part that shows whether it is met: "have/need what". */
export const part = (have: number, need: number, what: string): HTMLElement =>
  h('span', `cost-part${have >= need ? ' ok' : ''}`, `${num(Math.min(have, need))}/${num(need)} ${what}`);
