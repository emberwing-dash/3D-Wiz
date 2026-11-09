// GuideDemoCtl.ts - PAUSE and SPEED (x1 / x2) of an auto demo, shared by the VISUALIZE and ANALYSE pages (the BUILD page has its own, in GuideDemo).
// Owns: the two flags and the time scale the page's simulated hand runs on. Must not: know about any page, pill or hand.

export class DemoCtl {
  paused = false
  speed = 1

  /** The dt the demo script should advance by this frame. */
  step(dt: number): number {
    return this.paused ? 0 : dt * this.speed
  }

  togglePause(): boolean {
    this.paused = !this.paused
    return this.paused
  }

  cycleSpeed(): number {
    this.speed = this.speed === 1 ? 2 : 1
    return this.speed
  }

  reset() {
    this.paused = false
    this.speed = 1
  }
}
