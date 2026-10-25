// WizHands.ts - hand tracking helpers: SAO-style gesture detection from SIK hand joints, wrist anchor, idle time, and a
//               SYNTHETIC hand generator that feeds the very same detector (virtual-hand demo and tests).
// Owns: SaoDetector (pure logic over joint positions), HandsService (reads SIK.HandInputData for left/right), SaoSynth.
// Gesture: index + middle fingers extended, ring + pinky curled, palm sweeping DOWN = open the menu; the same pose sweeping UP
//          closes it. Thresholds live in PROJECT_PACK.gesture (tolerant). Either hand. Must not touch the scene.

import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"
import {isSpectacles} from "./WizInteract"
import {PROJECT_PACK} from "./ProjectPack"

export interface HandJoints {
  wrist: vec3
  palm: vec3
  indexKnuckle: vec3
  indexTip: vec3
  middleKnuckle: vec3
  middleTip: vec3
  ringKnuckle: vec3
  ringTip: vec3
  pinkyKnuckle: vec3
  pinkyTip: vec3
  thumbTip: vec3
}

export type SaoEvent = "open" | "close" | null
export type HandSide = "left" | "right"

function ext(tip: vec3, knuckle: vec3, wrist: vec3): number {
  const k = knuckle.sub(wrist).length
  if (k < 0.0001) return 0
  return tip.sub(wrist).length / k
}

export class SaoDetector {
  private poseT = 0
  private cool = 0
  private hist: {t: number; p: vec3; pose: boolean}[] = []

  reset(): void {
    this.poseT = 0
    this.hist = []
  }

  /** Index + middle extended, ring + pinky curled (thumb ignored). */
  static isSaoPose(j: HandJoints): boolean {
    const g = PROJECT_PACK.gesture
    const i = ext(j.indexTip, j.indexKnuckle, j.wrist)
    const m = ext(j.middleTip, j.middleKnuckle, j.wrist)
    const r = ext(j.ringTip, j.ringKnuckle, j.wrist)
    const p = ext(j.pinkyTip, j.pinkyKnuckle, j.wrist)
    const open = i > g.extendedRatio && m > g.extendedRatio
    const curled = r < g.curledRatio + g.ringPinkyMargin && p < g.curledRatio + g.ringPinkyMargin
    const margin = Math.min(i, m) - Math.max(r, p) > g.ringPinkyMargin
    return open && curled && margin
  }

  /** Feed one frame (null = hand lost). Returns "open" on a downward sweep, "close" on an upward sweep. */
  feed(t: number, dt: number, j: HandJoints | null): SaoEvent {
    const g = PROJECT_PACK.gesture
    if (this.cool > 0) this.cool -= dt
    if (j === null) {
      this.reset()
      return null
    }
    const pose = SaoDetector.isSaoPose(j)
    this.poseT = pose ? this.poseT + dt : 0
    this.hist.push({t: t, p: j.palm, pose: this.poseT >= g.poseHoldS})
    while (this.hist.length > 0 && t - this.hist[0].t > g.swipeWindowS) this.hist.shift()
    if (this.cool > 0) return null
    let first: vec3 | null = null
    let last: vec3 | null = null
    for (let i = 0; i < this.hist.length; i++) {
      if (!this.hist[i].pose) continue
      if (first === null) first = this.hist[i].p
      last = this.hist[i].p
    }
    if (first === null || last === null) return null
    const dy = last.y - first.y
    const horiz = Math.sqrt(Math.pow(last.x - first.x, 2) + Math.pow(last.z - first.z, 2))
    if (Math.abs(dy) >= g.swipeDropCm && Math.abs(dy) > horiz * g.verticalDominance) {
      this.cool = g.debounceS
      this.hist = []
      return dy < 0 ? "open" : "close"
    }
    return null
  }
}

/** Synthetic hand joints (a "peace" pose or a fist) used for the virtual-hand demo and for tests; same detector, same code path. */
export class SaoSynth {
  static frame(pose: "peace" | "fist", palmY: number, x: number = 0, z: number = -38): HandJoints {
    const w = new vec3(x, palmY - 6, z)
    const k = (dx: number) => new vec3(x + dx, palmY + 3, z)
    const tipUp = (dx: number) => new vec3(x + dx, palmY + 10.5, z + 0.5)
    const tipCurl = (dx: number) => new vec3(x + dx, palmY + 1, z + 3)
    const peace = pose === "peace"
    return {
      wrist: w,
      palm: new vec3(x, palmY, z),
      indexKnuckle: k(-2.4),
      indexTip: peace ? tipUp(-2.4) : tipCurl(-2.4),
      middleKnuckle: k(-0.8),
      middleTip: peace ? tipUp(-0.8) : tipCurl(-0.8),
      ringKnuckle: k(0.8),
      ringTip: tipCurl(0.8),
      pinkyKnuckle: k(2.4),
      pinkyTip: tipCurl(2.4),
      thumbTip: new vec3(x - 4, palmY + 1, z + 1),
    }
  }
}

export class HandsService {
  private det: {[h: string]: SaoDetector} = {left: new SaoDetector(), right: new SaoDetector(), synth: new SaoDetector()}
  private clock = 0
  private idleT = 0
  private lastPalm: {[h: string]: vec3 | null} = {left: null, right: null}
  private synth: {palmY: number; dir: number; t: number} | null = null
  lastSide: HandSide = "right"
  lastAnchor: vec3 | null = null

  private static read(side: HandSide): HandJoints | null {
    if (!isSpectacles()) return null
    const h = SIK.HandInputData.getHand(side)
    if (!h || !h.isTracked()) return null
    const palm = h.getPalmCenter()
    if (palm === null) return null
    return {
      wrist: h.wrist.position,
      palm: palm,
      indexKnuckle: h.indexKnuckle.position,
      indexTip: h.indexTip.position,
      middleKnuckle: h.middleKnuckle.position,
      middleTip: h.middleTip.position,
      ringKnuckle: h.ringKnuckle.position,
      ringTip: h.ringTip.position,
      pinkyKnuckle: h.pinkyKnuckle.position,
      pinkyTip: h.pinkyTip.position,
      thumbTip: h.thumbTip.position,
    }
  }

  /** Virtual hand: play a synthetic peace-pose sweep (down = open, up = close) through the real detector. */
  playSynthetic(down: boolean): void {
    this.synth = {palmY: down ? 6 : -6, dir: down ? -1 : 1, t: 0}
  }

  isSyntheticPlaying(): boolean {
    return this.synth !== null
  }

  anyTracked(): boolean {
    return HandsService.read("left") !== null || HandsService.read("right") !== null
  }

  idleSeconds(): number {
    return this.idleT
  }

  /** The tracked hand's pinch point (thumb tip / index tip midpoint), if that hand is pinching. */
  pinchPoint(side: HandSide): vec3 | null {
    if (!isSpectacles()) return null
    const h = SIK.HandInputData.getHand(side)
    if (!h || !h.isTracked() || !h.isPinching()) return null
    return h.thumbTip.position.add(h.indexTip.position).uniformScale(0.5)
  }

  update(dt: number): {event: SaoEvent; side: HandSide} | null {
    this.clock += dt
    let result: {event: SaoEvent; side: HandSide} | null = null
    let moved = false
    const sides: HandSide[] = ["left", "right"]
    for (let i = 0; i < sides.length; i++) {
      const s = sides[i]
      const j = HandsService.read(s)
      if (j !== null) {
        const lp = this.lastPalm[s]
        if (lp !== null && j.palm.sub(lp).length > 0.15) moved = true
        this.lastPalm[s] = j.palm
        this.lastAnchor = j.wrist
        this.lastSide = s
      } else this.lastPalm[s] = null
      const ev = this.det[s].feed(this.clock, dt, j)
      if (ev !== null && result === null) result = {event: ev, side: s}
    }
    if (this.synth !== null) {
      this.synth.t += dt
      this.synth.palmY += this.synth.dir * dt * 16 // cm/s sweep
      const done = this.synth.t > 0.9
      const j = done ? null : SaoSynth.frame("peace", this.synth.palmY, 0, -38)
      const ev = this.det["synth"].feed(this.clock, dt, j) // own detector: the real right hand feeds null every frame and would reset it
      if (ev !== null && result === null) result = {event: ev, side: "right"}
      if (done) this.synth = null
      moved = true
    }
    this.idleT = moved ? 0 : this.idleT + dt
    return result
  }
}
