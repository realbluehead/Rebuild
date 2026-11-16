// Single entry point for big numbers: if we ever swap the library, only this file changes.
import Decimal from 'break_eternity.js';

export { Decimal };
export type DecimalSource = Decimal | number | string;
export const D = (v: DecimalSource): Decimal => new Decimal(v);

/** An amount read from a save or an import: a finite, non-negative Decimal (anything else, garbage included, is 0). */
export function amount(v: unknown): Decimal {
  try {
    const d = new Decimal(v as DecimalSource);
    return d.isFinite() && d.gte(0) ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}
