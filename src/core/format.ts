import { D, type DecimalSource } from './decimal';

const SUFFIXES = ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** 1234 → "1.23k", 1e40 → "1.00e40". */
export function fmt(v: DecimalSource): string {
  const d = D(v);
  if (d.lt(1000)) {
    if (d.eq(d.floor())) return d.toString();
    return d.lt(1) ? d.toFixed(2) : d.lt(10) ? d.toFixed(1) : d.floor().toString();
  }
  const exp = Math.floor(d.log10().toNumber());
  const tier = Math.floor(exp / 3);
  if (tier < SUFFIXES.length) return d.div(D(10).pow(tier * 3)).toFixed(2) + SUFFIXES[tier];
  return `${d.div(D(10).pow(exp)).toNumber().toFixed(2)}e${exp}`;
}

export function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min ${s} s`;
  return `${s} s`;
}
