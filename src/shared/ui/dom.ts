// Small DOM helpers and the in-game dialogs, shared by both phases (dialogs open inside the phone, `#app`).

/** Creates an element with a class and text. */
export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
};

export function modal(cls = '') {
  const wrap = h('div', `modal ${cls}`);
  const box = h('div', 'box px-box');
  wrap.append(box);
  // Inside the "phone", not the whole window.
  (document.getElementById('app') ?? document.body).append(wrap);
  return {
    box,
    close: () => wrap.remove(),
    addClose(label: string, onClose?: () => void) {
      const b = h('button', 'px-btn can', label);
      b.addEventListener('click', () => { wrap.remove(); onClose?.(); });
      box.append(b);
    },
  };
}

/** In-game yes/no dialog (the browser's own confirm() is blocked in some embedded browsers). */
export function confirmModal(question: string, yes: string, onYes: () => void) {
  const m = modal();
  m.box.append(h('div', '', question));
  const b = h('button', 'px-btn danger', yes);
  b.addEventListener('click', () => { m.close(); onYes(); });
  m.box.append(b);
  m.addClose('Cancel');
}

export function textModal(title: string, value: string, readOnly: boolean, onOk?: (t: string) => void) {
  const m = modal();
  const ta = h('textarea');
  ta.value = value;
  ta.readOnly = readOnly;
  m.box.append(h('div', '', title), ta);
  m.addClose(readOnly ? 'Close' : 'Load', () => onOk?.(ta.value));
  if (readOnly) ta.select();
}
