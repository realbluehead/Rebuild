// Single entry point for big numbers: if we ever swap the library, only this file changes.
import Decimal from 'break_eternity.js';

export { Decimal };
export type DecimalSource = Decimal | number | string;
export const D = (v: DecimalSource): Decimal => new Decimal(v);
