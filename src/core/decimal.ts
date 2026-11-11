// Punt únic d'entrada per als números grans: si mai canviem de llibreria, només es toca aquí.
import Decimal from 'break_eternity.js';

export { Decimal };
export type DecimalSource = Decimal | number | string;
export const D = (v: DecimalSource): Decimal => new Decimal(v);
