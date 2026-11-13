// The bluetreri per second shown at the top: measured, not estimated. What the rovers produce is what reaches camp plus
// what their holds gained (an unload moves bluetreri from a hold to camp and changes nothing), so the measure is smooth
// even when loads arrive minutes apart. It is averaged over about RATE_TAU seconds of game time.
export const RATE_TAU = 120;

export class RateMeter {
  /** Bluetreri per second (averaged). */
  rate: number;
  private carried: number;

  /** `start`: the first value shown, before there is anything to measure (an estimate, or the offline average). */
  constructor(start: number, carried: number) {
    this.rate = Math.max(0, start);
    this.carried = carried;
  }

  /** After `dt` seconds of game time, `deposited` reached camp and the rovers now carry `carried`. */
  feed(dt: number, deposited: number, carried: number): void {
    if (!(dt > 0)) return;
    const made = Math.max(0, deposited + carried - this.carried);
    this.carried = carried;
    const k = 1 - Math.exp(-dt / RATE_TAU);
    this.rate += (made / dt - this.rate) * k;
  }

  /** Starts over from `rate` (after time simulated in one go, like a frozen tab). */
  reset(rate: number, carried: number): void {
    this.rate = Math.max(0, rate);
    this.carried = carried;
  }
}
