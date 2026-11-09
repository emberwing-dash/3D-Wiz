// GuideDemo.ts - AUTO DEMO of the Circuit Guide: a visible simulated hand plays the whole build like a presenter (about 2 minutes).
// It explodes / reassembles the model, carries it through free space, builds every step, makes ONE deliberate mistake (red, orb hint,
// the part returns), presses Play and drives the car with the joystick.
// Owns: the hand look + motion and the timed script. Every grab / drop goes through the SAME bench code a real hand uses
//       (GuideBench.demoGrab* / demoMove* / demoRelease* -> beginPart / endPart -> judgePart, and moveBy for the model, moveStick for the joystick).
// Must not: decide right or wrong itself, or need any hand input.

import {PartKit} from "./WizParts"
import type {WizGuide} from "./WizGuide"

type Op = (dt: number) => boolean // returns true when finished

const SKIN: [number, number, number, number] = [1.0, 0.8, 0.66, 0.95]
const HAND_DIR = new vec3(0.38, -0.42, 0.82).normalize() // local +z of the hand: the arm comes from the lower right, toward the viewer

export class DemoHand {
  root: SceneObject
  pos = vec3.zero()
  private open = 1.3
  private openTarget = 1.3
  private index: SceneObject
  private thumb: SceneObject
  private palm: SceneObject
  private arm: SceneObject
  private tips: SceneObject[] = []

  constructor(kit: PartKit, parent: SceneObject) {
    this.root = kit.obj(parent, "GuideDemoHand")
    this.root.getTransform().setWorldRotation(quat.rotationFromTo(new vec3(0, 0, 1), HAND_DIR))
    const cyl = (name: string) => kit.shape(this.root, "cyl", [0, 0, 0], [0.7, 1, 0.7], SKIN, name, false).obj
    this.index = cyl("index")
    this.thumb = cyl("thumb")
    this.arm = cyl("arm")
    this.palm = kit.shape(this.root, "sphere", [0, 0, 4.4], [3.0, 2.6, 2.8], SKIN, "palm", false).obj
    for (const n of ["tipA", "tipB"]) this.tips.push(kit.shape(this.root, "sphere", [0, 0, 0], [0.95, 0.95, 0.95], [1, 0.9, 0.8, 1], n, false).obj)
    this.layout()
    this.root.enabled = false
  }

  private seg(o: SceneObject, a: vec3, b: vec3, thick: number) {
    const d = b.sub(a)
    const len = Math.max(0.05, d.length)
    const t = o.getTransform()
    t.setLocalPosition(a.add(b).uniformScale(0.5))
    const dir = d.uniformScale(1 / len)
    t.setLocalRotation(dir.y < -0.9995 ? quat.fromEulerVec(new vec3(Math.PI, 0, 0)) : quat.rotationFromTo(vec3.up(), dir))
    t.setLocalScale(new vec3(thick, len, thick))
  }

  private layout() {
    const g = this.open
    this.seg(this.index, new vec3(0, g, 0), new vec3(0, g + 1.0, 3.6), 0.75)
    this.seg(this.thumb, new vec3(0, -g, 0), new vec3(0, -g - 1.2, 3.0), 0.85)
    this.seg(this.arm, new vec3(0, -0.4, 5.4), new vec3(0.2, -1.4, 18), 1.7)
    this.tips[0].getTransform().setLocalPosition(new vec3(0, g, 0))
    this.tips[1].getTransform().setLocalPosition(new vec3(0, -g, 0))
  }

  show(on: boolean) {
    this.root.enabled = on
  }

  setPos(p: vec3) {
    this.pos = p
    this.root.getTransform().setWorldPosition(p)
  }

  setPinch(on: boolean) {
    this.openTarget = on ? 0.12 : 1.3
  }

  isPinched(): boolean {
    return this.openTarget < 0.5
  }

  update(dt: number) {
    if (Math.abs(this.open - this.openTarget) > 0.001) {
      this.open += (this.openTarget - this.open) * Math.min(1, dt * 14)
      this.layout()
    }
  }
}

export interface DemoStats {
  exploded: boolean
  modelLiftMax: number
  wrongShown: number
  playPressed: boolean
  driveDistance: number
  finished: boolean
}

export class GuideDemo {
  hand: DemoHand
  running = false
  stats: DemoStats = {exploded: false, modelLiftMax: 0, wrongShown: 0, playPressed: false, driveDistance: 0, finished: false}
  startedAt = -10
  onEnd: (() => void) | null = null
  /** SPEED pill: 1 or 2. PACE is the showcase base pace, so x1 reads well in a recording (about 5 s per step) and x2 is a quick run. */
  speed = 1
  paused = false
  private stepping = false
  private stepFrom = -1
  private realDt = 0
  static PACE = 1.7
  /** Stats of the showcase for tests: the hand reached each target, wire ends, placements. */
  reached: string[] = []
  private ops: Op[] = []
  private i = 0

  constructor(private g: WizGuide, kit: PartKit, parent: SceneObject) {
    this.hand = new DemoHand(kit, parent)
  }

  // ------------------------------------------------------------------ script
  private build() {
    const g = this.g
    const b = g.bench
    const ops: Op[] = []
    const off = new vec3(0, 0.5, 0) // the hand holds a part from just above its origin
    const wait = (s: number) => {
      let t = 0
      ops.push((dt) => (t += dt) >= s)
    }
    const call = (f: () => void) => ops.push(() => (f(), true))
    const waitReal = (sec: number) => {
      let t = 0
      ops.push(() => (t += this.realDt) >= sec)
    }
    const until = (c: () => boolean, max: number) => {
      let t = 0
      ops.push((dt) => ((t += dt), c() || t >= max))
    }
    const moveTo = (target: () => vec3, dur: number, lift: number, each?: (p: vec3, prev: vec3) => void) => {
      let t = 0
      let start: vec3 | null = null
      ops.push((dt) => {
        if (start === null) start = this.hand.pos
        t += dt
        const s = Math.min(1, t / dur)
        const e = s * s * (3 - 2 * s)
        const p = start.add(target().sub(start).uniformScale(e)).add(new vec3(0, Math.sin(Math.PI * e) * lift, 0))
        const prev = this.hand.pos
        this.hand.setPos(p)
        if (each) each(p, prev)
        return s >= 1
      })
    }
    const pinch = (on: boolean) => {
      let t = 0
      let first = true
      ops.push((dt) => {
        if (first) {
          this.hand.setPinch(on)
          first = false
        }
        return (t += dt) >= 0.35
      })
    }
    const lifted = (l: vec3, y: number) => b.tableToWorld(new vec3(l.x, y, l.z))
    // ---- start: the hand comes in from the lower right
    call(() => {
      this.hand.setPos(b.tableToWorld(new vec3(14, 8, 12)))
      this.hand.show(true)
      this.hand.setPinch(false)
      g.orb.say("Auto build. Watch the hand build the car. Grab any part, or press YOUR TURN, to take over.")
    })
    wait(4)
    // ---- explode and reassemble with the real pills
    moveTo(() => g.pillWorld("explode").add(new vec3(0, 0.6, 1.2)), 2.2, 2)
    pinch(true)
    call(() => {
      g.tapPill("explode")
      this.stats.exploded = true
    })
    pinch(false)
    wait(2.6)
    moveTo(() => g.pillWorld("assemble").add(new vec3(0, 0.6, 1.2)), 1.4, 1)
    pinch(true)
    call(() => g.tapPill("assemble"))
    pinch(false)
    wait(2.2)
    // ---- grab the whole model and carry it through free space, then put it back
    let home = vec3.zero()
    const mv = (p: vec3, prev: vec3) => {
      g.bench.model.moveBy(p.sub(prev))
      this.stats.modelLiftMax = Math.max(this.stats.modelLiftMax, g.bench.model.worldPos().y - home.y)
    }
    moveTo(() => g.bench.model.worldPos().add(new vec3(0, 3.5, 1)), 1.8, 2)
    call(() => (home = g.bench.model.worldPos()))
    pinch(true)
    moveTo(() => home.add(new vec3(-2.5, 12, 4.5)), 2.4, 0, mv) // the hand starts 3.5 cm above the model: this lifts it about 8.5 cm
    wait(1.4)
    moveTo(() => home.add(new vec3(0, 3.5, 1)), 2.0, 0, mv)
    pinch(false)
    wait(0.8)
    // ---- the steps
    const steps = g.stepCount()
    for (let i = 0; i < steps; i++) {
      const st = g.stepAt(i)
      until(() => g.phase() === "working" && g.stepIndex() === i, 15)
      wait(2.4) // read the panel, hear the narration
      if (st.kind === "place") {
        const id = st.part as string
        const spot = st.spot as string
        const pick = () => {
          moveTo(() => b.partWorldPos(id).add(off), 2.2, 2)
          pinch(true)
          call(() => b.demoGrabPart(id))
        }
        const carry = (to: () => vec3, dur: number) => moveTo(() => to().add(off), dur, 2.2, (p) => b.demoMovePart(id, p.sub(off)))
        pick()
        if (i === 0) {
          // the one deliberate mistake: the ESP32 is put in the wrong place
          carry(() => lifted(new vec3(0.2, 0, 2.6), 3.2), 2.4)
          call(() => b.demoReleasePart(id))
          call(() => this.stats.wrongShown++)
          pinch(false)
          waitReal(3.2) // red glow, the orb speaks the hint, the part goes back (real time: the return tween is not scaled)
          pick()
        }
        carry(() => {
          const l = b.worldToTable(b.spotWorldPos(spot))
          return lifted(l, 3.2)
        }, 2.4)
        call(() => b.demoReleasePart(id))
        call(() => this.reached.push("place:" + id))
        pinch(false)
      } else {
        const pins = st.pins as [string, string]
        for (let e = 0; e < 2; e++) {
          const key = pins[e]
          moveTo(() => b.endWorldPos(e).add(off), 1.9, 2)
          pinch(true)
          call(() => b.demoGrabEnd(e))
          moveTo(() => {
            const l = b.worldToTable(b.pinWorldPos(key))
            return lifted(l, 3.0).add(off)
          }, 2.1, 2.2, (p) => b.demoMoveEnd(e, p.sub(off)))
          call(() => b.demoReleaseEnd(e))
          call(() => this.reached.push("pin:" + key))
          pinch(false)
        }
      }
      until(() => g.stepIndex() > i || g.phase() === "built", 9)
      wait(1.6)
    }
    // ---- Play, then drive with the joystick
    moveTo(() => g.playWorld().add(new vec3(0, 0.8, 1.0)), 2.2, 2)
    pinch(true)
    call(() => {
      g.pressPlay()
      this.stats.playPressed = true
    })
    pinch(false)
    wait(2.6)
    let p0 = vec3.zero()
    call(() => (p0 = g.bench.model.worldPos()))
    moveTo(() => g.controller.knobWorld().add(new vec3(0, 0, 1.2)), 1.8, 1.5)
    pinch(true)
    const stick = (tx: number, ty: number, dur: number) => {
      let t = 0
      ops.push((dt) => {
        t += dt
        const c = g.controller
        const cur = c.stickLocal()
        const R = c.stickRadius()
        c.moveStick((tx * R - cur.x) * Math.min(1, dt * 4), (ty * R - cur.y) * Math.min(1, dt * 4))
        this.hand.setPos(c.knobWorld().add(new vec3(0, 0, 1.2)))
        this.stats.driveDistance = Math.max(this.stats.driveDistance, g.bench.model.worldPos().sub(p0).length)
        return t >= dur
      })
    }
    stick(0, 0.7, 2.4)
    stick(0.75, 0.6, 3.6)
    stick(0.75, 0.6, 2.0)
    stick(0, 0, 0.9)
    pinch(false)
    wait(1.0)
    call(() => {
      this.stats.finished = true
      g.orb.say("That was the whole guide: place parts, wire pins, Play, drive.")
    })
    wait(4)
    this.ops = ops
  }

  // ------------------------------------------------------------------ control
  start() {
    this.stats = {exploded: false, modelLiftMax: 0, wrongShown: 0, playPressed: false, driveDistance: 0, finished: false}
    this.reached = []
    this.paused = false
    this.stepping = false
    this.build()
    this.i = 0
    this.running = true
    this.startedAt = getTime()
  }

  /** End the demo (finished or taken over). */
  stop() {
    if (!this.running) return
    this.running = false
    this.ops = []
    this.hand.show(false)
    if (this.onEnd) this.onEnd()
  }

  /** PAUSE / PLAY pill. */
  togglePause(): void {
    if (!this.running) return
    this.paused = !this.paused
    this.stepping = false
  }

  /** STEP pill: run exactly one guide step, then hold at the start of the next. */
  stepOnce(): void {
    if (!this.running) return
    this.stepFrom = this.g.stepIndex()
    this.stepping = true
    this.paused = false
  }

  /** SPEED pill: x1 <-> x2. */
  cycleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : 1
  }

  update(realDt: number) {
    this.hand.update(realDt)
    if (!this.running) return
    if (this.stepping && (this.g.stepIndex() !== this.stepFrom || this.g.phase() === "built")) {
      this.stepping = false
      this.paused = true
    }
    if (this.paused) return
    this.realDt = realDt
    const dt = realDt * this.speed * GuideDemo.PACE
    const op = this.ops[this.i]
    if (op === undefined) {
      this.stop()
      return
    }
    if (op(dt)) this.i++
  }
}
