// WizLab.ts - SIMULATED test lab (pure logic): runs the command sequences of the CURRENT pack (Sesame: movement-sequences.h ported
//             from the firmware, plus the face that goes with each command) driving actuator values (servo angles, wheel spin,
//             LED level, slide distance ...) and the OLED face.
// Owns: command playback (steps, waits, actuator slew), idle blink, simulation labels. NOT hardware, NOT the wiring validator.
// Must not: touch the scene (WizMain passes an output sink), or share state with WizValidator.

import {PROJECT_PACK, CommandDef, getCommand, SERVO_MAP} from "./ProjectPack"

export interface LabOutput {
  setAngle(servo: string, deg: number): void
  setFace(name: string, mode: "loop" | "once" | "boomerang"): void
}

/** Actuator names + neutral values + speeds of the current pack. */
function actuators(): {name: string; zero: number; speed: number}[] {
  if (PROJECT_PACK.rig.mode === "sesame") return SERVO_MAP.map((s) => ({name: s.name as string, zero: 90, speed: PROJECT_PACK.lab.motorDegPerS}))
  return PROJECT_PACK.rig.acts.map((a) => ({name: a.name, zero: a.zero, speed: a.speed}))
}

export class SesameLab {
  private cur: {[s: string]: number} = {}
  private tgt: {[s: string]: number} = {}
  private cmd: CommandDef | null = null
  private stepIdx: number = 0
  private stepT: number = 0
  private _last: string = ""
  private _face: string = "idle"
  private _running: boolean = false
  private idleT: number = 0
  private blinking: boolean = false
  private out: LabOutput

  constructor(out: LabOutput) {
    this.out = out // no output calls here: the robot component may not be awake yet; WizMain calls reset() from OnStart
  }

  reset(): void {
    this.cmd = null
    this._running = false
    this._last = ""
    this.blinking = false
    this.idleT = 0
    this.cur = {}
    this.tgt = {}
    const acts = actuators()
    for (let i = 0; i < acts.length; i++) {
      this.cur[acts[i].name] = acts[i].zero
      this.tgt[acts[i].name] = acts[i].zero
      this.out.setAngle(acts[i].name, acts[i].zero)
    }
    const rf = PROJECT_PACK.lab.commands.find((c) => c.id === "rest")
    this._face = PROJECT_PACK.lab.restFace !== undefined ? PROJECT_PACK.lab.restFace : rf ? rf.face : "rest"
    this.out.setFace(this._face, "boomerang")
  }

  get running(): boolean {
    return this._running
  }

  get lastCommand(): string {
    return this._last
  }

  get face(): string {
    return this._face
  }

  angles(): {[s: string]: number} {
    return {...this.cur}
  }

  targets(): {[s: string]: number} {
    return {...this.tgt}
  }

  /** Every actuator reached its commanded value (a command may still be waiting). */
  settled(): boolean {
    const acts = actuators()
    for (let i = 0; i < acts.length; i++) if (this.tgt[acts[i].name] !== undefined && Math.abs(this.tgt[acts[i].name] - this.cur[acts[i].name]) > 0.01) return false
    return true
  }

  run(id: string): boolean {
    const c = getCommand(id)
    if (!c) return false
    this.cmd = c
    this._last = id
    this._running = true
    this.stepIdx = 0
    this.stepT = 0
    this.blinking = false
    this.setFace(c.face, c.mode)
    this.beginStep()
    return true
  }

  private setFace(name: string, mode: "loop" | "once" | "boomerang"): void {
    this._face = name
    this.out.setFace(name, mode)
  }

  private beginStep(): void {
    const c = this.cmd as CommandDef
    const st = c.steps[this.stepIdx]
    this.stepT = 0
    if (st.face) this.setFace(st.face, st.mode ? st.mode : "once")
    if (st.jump) {
      for (const k in st.jump) {
        this.cur[k] = st.jump[k]
        this.tgt[k] = st.jump[k]
        this.out.setAngle(k, st.jump[k])
      }
    }
    if (st.ang) for (const k in st.ang) this.tgt[k] = st.ang[k]
  }

  tick(dt: number): void {
    // actuator slew toward targets (illustrative speeds)
    const acts = actuators()
    for (let i = 0; i < acts.length; i++) {
      const s = acts[i].name
      if (this.tgt[s] === undefined) continue
      const maxStep = acts[i].speed * dt
      const d = this.tgt[s] - this.cur[s]
      if (Math.abs(d) > 0.0001) {
        this.cur[s] += Math.max(-maxStep, Math.min(maxStep, d))
        this.out.setAngle(s, this.cur[s])
      }
    }
    if (this._running && this.cmd) {
      this.stepT += dt
      const st = this.cmd.steps[this.stepIdx]
      if (this.stepT * 1000 >= st.wait) {
        this.stepIdx++
        if (this.stepIdx >= this.cmd.steps.length) {
          this._running = false
          this.idleT = 0
        } else this.beginStep()
      }
    } else if (this._face === "idle" || this._face === "idle_blink") {
      // firmware enterIdle(): idle face with an occasional blink (timing here is illustrative)
      this.idleT += dt
      if (!this.blinking && this.idleT > 3.5) {
        this.blinking = true
        this.idleT = 0
        this._face = "idle_blink"
        this.out.setFace("idle_blink", "once")
      } else if (this.blinking && this.idleT > 0.7) {
        this.blinking = false
        this.idleT = 0
        this._face = "idle"
        this.out.setFace("idle", "boomerang")
      }
    }
  }

  /** Test helper: servo angle snapshot as a signature string. */
  poseSignature(): string {
    const parts: string[] = []
    const acts = actuators()
    for (let i = 0; i < acts.length; i++) parts.push(acts[i].name + ":" + Math.round(this.cur[acts[i].name]))
    return parts.join(",")
  }
}
