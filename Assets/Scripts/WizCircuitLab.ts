// WizCircuitLab.ts - the Circuit Lab controller: free-form wiring on the bench + "can this circuit do X?" tests.
// Owns: the user's wires (as pin-to-pin pairs), the pin-picking flow (tap a part -> pick a pin -> tap another part -> pick a pin = a wire),
//       hints and auto-wiring from the pack's reference wiring, running CircuitSim (every GPIO combination) and playing the result back
//       on the bench (LED glow, motor spin, servo sweep, hazard flash).
// Must not: draw anything itself (WizBench draws), decide modes / menus (WizMain does) or keep component data (the pack does).
// The simulation is a simplified DC model: a virtual pass does NOT prove a physical build works.

import {PROJECT_PACK, RGBA, getComponent, hasSim} from "./ProjectPack"
import {Circuit, SimPart, Wire, Drive, FnReport, FnDef, Exploration, evaluateFunctions, pinRole, genericRole} from "./CircuitSim"
import {WizBench} from "./WizBench"
import {WizHud} from "./WizHud"

const GRN = new vec4(0.3, 1.0, 0.5, 1)
const RED = new vec4(1.0, 0.3, 0.25, 1)
const CYAN = new vec4(0.35, 1.0, 1.0, 1)
const SIGNAL_COLORS: RGBA[] = [[1.0, 0.85, 0.25, 1], [0.35, 0.9, 0.4, 1], [0.25, 0.65, 1.0, 1], [0.75, 0.45, 1.0, 1], [1.0, 0.6, 0.25, 1], [0.95, 0.95, 0.95, 1]]

interface PlayStep {
  fn: string
  drive: Drive
  dur: number
  first: boolean
}

export interface DriveMap {
  fwd: Drive | null
  back: Drive | null
  steer: Drive | null
  lights: Drive | null
  reasons: {[control: string]: string}
}

export class WizCircuitLab {
  private circuit: Circuit | null = null
  private wires: {id: string; a: string; b: string}[] = []
  private seq: number = 0
  private pending: string = ""
  private reports: FnReport[] = []
  private exploration: Exploration | null = null
  private play: PlayStep[] = []
  private playT: number = 0
  private playI: number = -1
  private active: boolean = false
  private passedOnce: {[fn: string]: boolean} = {}
  private hazardFlash: {[id: string]: number} = {}
  private lastHazards: string[] = []
  private colorN: number = 0
  onProgress: (fnId: string, firstTime: boolean) => void = () => {}
  onAllPassed: () => void = () => {}
  onWireCount: (n: number) => void = () => {}
  onFail: (why: string) => void = () => {}
  onVerified: (n: number, total: number) => void = () => {}

  constructor(private bench: WizBench, private hud: WizHud) {}

  /** Does the current project have electronics with an electrical model? */
  available(): boolean {
    if (PROJECT_PACK.connections.length === 0) return false
    for (const c of PROJECT_PACK.components) if (c.kind === "electronic" && c.group !== "prop" && c.benchPos) return true
    return false
  }

  /** Packs without an electrical model: every wire is checked against the verified pin connections (green / red) instead of simulated. */
  verifyMode(): boolean {
    return !hasSim()
  }

  functions(): FnDef[] {
    return PROJECT_PACK.circuit ? PROJECT_PACK.circuit.functions : []
  }

  private build() {
    const parts: SimPart[] = []
    for (const c of PROJECT_PACK.components) if (c.elec) parts.push({id: c.id, spec: c.elec})
    this.circuit = parts.length > 0 ? new Circuit(parts) : null
  }

  begin() {
    if (!this.available()) return
    this.build()
    this.active = true
    this.pending = ""
    this.stopPlay()
    this.bench.setLab(true)
    this.showRails()
    for (const w of this.wires) this.bench.addUserWire(w.id, w.a, w.b, this.wireColor(w.a, w.b))
    this.reports = []
    this.refreshPips(true)
    this.refreshLabel()
  }

  end() {
    this.active = false
    this.stopPlay()
    this.pending = ""
    this.bench.setLab(false)
    this.hud.setPips([])
  }

  isActive(): boolean {
    return this.active
  }

  /** Forget every wire (a new project, or the Clear icon). */
  reset() {
    this.wires = []
    this.pending = ""
    this.reports = []
    this.exploration = null
    this.passedOnce = {}
    this.stopPlay()
    if (this.active) {
      this.bench.clearUserWires()
      this.showRails()
    }
  }

  wireCount(): number {
    return this.wires.length
  }

  wireList(): {id: string; a: string; b: string}[] {
    return this.wires.slice()
  }

  pendingPin(): string {
    return this.pending
  }

  // ---------------------------------------------------------------- wiring flow
  /** The user tapped a part: open its pin picker. */
  partTapped(id: string) {
    if (!this.active) return
    this.stopPlay() // a tap interrupts the playback
    const def = getComponent(id)
    if (!def.elec && !(this.verifyMode() && def.kind === "electronic" && def.group !== "prop")) return
    this.bench.openFan(id)
  }

  /** The user picked a pin in the picker (key = "part/pin"). */
  pinPicked(key: string) {
    if (!this.active) return
    this.bench.closeFan()
    if (this.pending === "") {
      this.pending = key
      this.bench.setPinMarks([key])
      this.hud.setLabel(this.pinName(key) + " >")
      return
    }
    if (this.pending === key) {
      this.pending = ""
      this.bench.setPinMarks([])
      this.refreshLabel()
      return
    }
    if (this.pending.split("/")[0] === key.split("/")[0]) {
      this.hud.toast("same part", new vec4(1.0, 0.75, 0.25, 1))
      this.pending = key
      this.bench.setPinMarks([key])
      return
    }
    const a = this.pending
    this.pending = ""
    this.addWire(a, key)
  }

  private pinName(key: string): string {
    const p = key.split("/")
    const def = getComponent(p[0])
    for (const pn of def.pins) if (pn.name === p[1]) return (def.name.length > 10 ? def.id : def.name) + " " + (pn.label ? pn.label : pn.name)
    return key
  }

  private wireColor(a: string, b: string): RGBA {
    const ra = this.role(a)
    const rb = this.role(b)
    if (ra === "ground" || rb === "ground") return [0.5, 0.58, 0.9, 1]
    if (ra === "power" || rb === "power") {
      const v33 = a.split("/")[1] === "3V3" || b.split("/")[1] === "3V3"
      return v33 ? [1.0, 0.6, 0.25, 1] : [1.0, 0.3, 0.28, 1]
    }
    this.colorN++
    return SIGNAL_COLORS[this.colorN % SIGNAL_COLORS.length]
  }

  private role(key: string) {
    const p = key.split("/")
    const def = getComponent(p[0])
    return def.elec ? pinRole(def.elec.kind, p[1]) : genericRole(p[1])
  }

  hasWire(a: string, b: string): boolean {
    for (const w of this.wires) if ((w.a === a && w.b === b) || (w.a === b && w.b === a)) return true
    return false
  }

  /** Add a wire (toggle: the same pair again removes it). */
  addWire(a: string, b: string): boolean {
    if (!this.active) return false
    if (a === b) return false
    if (this.hasWire(a, b)) {
      for (const w of this.wires.slice()) if ((w.a === a && w.b === b) || (w.a === b && w.b === a)) this.removeWire(w.id)
      return false
    }
    const id = "u" + this.seq++
    this.wires.push({id: id, a: a, b: b})
    let color = this.wireColor(a, b)
    let verdict: {state: "ok" | "wrong" | "unknown"; text: string} | null = null
    if (this.verifyMode()) {
      verdict = this.verifyPair(a, b)
      color = verdict.state === "ok" ? [0.3, 1.0, 0.5, 1] : verdict.state === "wrong" ? [1.0, 0.25, 0.2, 1] : [1.0, 0.75, 0.25, 1]
    }
    this.bench.addUserWire(id, a, b, color)
    this.afterChange()
    if (verdict) this.announce(verdict)
    return true
  }

  wireTapped(id: string) {
    if (!this.active) return
    this.removeWire(id) // (removing a wire also stops any playback)
    this.hud.toast("removed", new vec4(0.8, 0.85, 0.95, 1))
  }

  removeWire(id: string) {
    for (let i = 0; i < this.wires.length; i++) {
      if (this.wires[i].id === id) {
        this.wires.splice(i, 1)
        break
      }
    }
    this.bench.removeUserWire(id)
    this.afterChange()
  }

  clearAll() {
    this.reset()
    this.afterChange()
    this.hud.toast("clear", new vec4(0.8, 0.85, 0.95, 1))
  }

  /** Smart rails: supply / ground nets the pack connects for the user (not drawn in 3D, shown as flags in the diagram). */
  private railWires(): {id: string; a: string; b: string; color: RGBA}[] {
    const ids = PROJECT_PACK.circuit && PROJECT_PACK.circuit.autoRails ? PROJECT_PACK.circuit.autoRails : []
    const out: {id: string; a: string; b: string; color: RGBA}[] = []
    for (const c of PROJECT_PACK.connections) {
      if (ids.indexOf(c.id) < 0) continue
      out.push({id: "r_" + c.id, a: c.from.component + "/" + c.from.pin, b: c.to.component + "/" + c.to.pin, color: c.color})
    }
    return out
  }

  private isRail(connId: string): boolean {
    return !!PROJECT_PACK.circuit && !!PROJECT_PACK.circuit.autoRails && PROJECT_PACK.circuit.autoRails.indexOf(connId) >= 0
  }

  private showRails() {
    for (const r of this.railWires()) this.bench.addRail(r.id, r.a, r.b, r.color)
  }

  private simWires(): Wire[] {
    const out = this.wires.map((w) => [w.a, w.b] as Wire)
    for (const r of this.railWires()) out.push([r.a, r.b] as Wire)
    return out
  }

  /** After every edit: stop any playback, re-check hazards right away (a short circuit shows at once). */
  private afterChange() {
    this.stopPlay()
    this.pending = ""
    this.bench.setPinMarks([])
    this.reports = []
    this.exploration = null
    this.onWireCount(this.wires.length)
    this.lastHazards = []
    if (this.circuit && this.wires.length > 0) {
      const r = this.circuit.solve(this.simWires(), {gpio: {}, sr: {}, pressed: {}})
      this.lastHazards = r.hazards
      if (r.hazards.length > 0) {
        this.hud.toast(this.shortHazard(r.hazards[0]), RED)
        const id = r.hazards[0].split(":")[0].split("/")[0]
        this.flash(id, 1.8)
      }
    }
    this.refreshPips(true)
    this.refreshLabel()
  }

  private shortHazard(h: string): string {
    if (h.indexOf("short") >= 0) return "short circuit"
    if (h.indexOf("LED") >= 0) return "LED too hot"
    if (h.indexOf("GPIO") >= 0) return "GPIO overload"
    return "overload"
  }

  hazards(): string[] {
    return this.lastHazards.slice()
  }

  private flash(id: string, secs: number) {
    this.bench.setFx(id, {alert: true})
    this.hazardFlash[id] = secs
  }

  // ---------------------------------------------------------------- hints / auto wiring (the pack's reference wiring)
  private missing(): {id: string; a: string; b: string; label: string}[] {
    const out: {id: string; a: string; b: string; label: string}[] = []
    const sw = this.circuit ? this.simWires() : []
    for (const c of PROJECT_PACK.connections) {
      if (this.isRail(c.id)) continue
      const a = c.from.component + "/" + c.from.pin
      const b = c.to.component + "/" + c.to.pin
      const joined = this.circuit ? this.circuit.connected(sw, a, b) : this.hasWire(a, b)
      if (!joined) out.push({id: c.id, a: a, b: b, label: c.label})
    }
    return out
  }

  missingCount(): number {
    return this.missing().length
  }

  /** Light up the two pins of the next wire the reference design needs. */
  hint(): string {
    const m = this.missing()
    if (m.length === 0) {
      this.hud.toast("all wired", GRN)
      return ""
    }
    this.bench.setPinMarks([m[0].a, m[0].b])
    this.hud.setLabel(m[0].label)
    return m[0].id
  }

  /** Short name of the next missing reference wire (for Phobo's hint), empty when everything is wired. */
  nextWireLabel(): string {
    const m = this.missing()
    return m.length > 0 ? m[0].label : ""
  }

  /** Add the next reference wire(s). */
  autoWire(all: boolean): number {
    if (!this.active) return 0
    let n = 0
    for (let guard = 0; guard < 80; guard++) {
      const m = this.missing()
      if (m.length === 0) break
      this.addWireQuiet(m[0].a, m[0].b)
      n++
      if (!all) break
    }
    this.afterChange()
    if (this.verifyMode() && n > 0) {
      const done = this.verifiedCount()
      this.onVerified(done, this.verifyTotal())
      if (done >= this.verifyTotal()) this.onAllPassed()
    }
    if (n === 0) this.hud.toast("all wired", GRN)
    return n
  }

  private addWireQuiet(a: string, b: string) {
    if (this.hasWire(a, b)) return
    const id = "u" + this.seq++
    this.wires.push({id: id, a: a, b: b})
    this.bench.addUserWire(id, a, b, this.verifyMode() ? [0.3, 1.0, 0.5, 1] : this.wireColor(a, b))
  }

  // ---------------------------------------------------------------- tests
  /** Run every function against the user's wiring, then play the result on the bench. */
  runTests(): FnReport[] {
    if (!this.active || !this.circuit) return []
    this.stopPlay()
    const fns = this.functions()
    const r = evaluateFunctions(this.circuit, this.simWires(), fns)
    this.reports = r.reports
    this.exploration = r.exploration
    this.lastHazards = r.exploration.hazards
    this.refreshPips(false)
    // playback script: one step per reached goal, per function
    this.play = []
    for (const rep of this.reports) {
      let first = true
      for (const d of rep.drives) {
        this.play.push({fn: rep.id, drive: d, dur: 1.5, first: first})
        first = false
      }
      if (rep.drives.length === 0) this.play.push({fn: rep.id, drive: {gpio: {}, sr: {}, pressed: {}}, dur: 0.9, first: true})
    }
    this.playI = -1
    this.playT = 0
    this.advance()
    return this.reports
  }

  /** Run one function only (the replay icon). */
  runOne(fnId: string) {
    if (!this.circuit) return
    if (this.reports.length === 0) this.runTests()
    else this.stopPlay()
    this.stopPlay()
    this.play = []
    for (const rep of this.reports) {
      if (rep.id !== fnId) continue
      for (const d of rep.drives) this.play.push({fn: rep.id, drive: d, dur: 1.5, first: false})
    }
    this.playI = -1
    this.advance()
  }

  reportList(): FnReport[] {
    return this.reports
  }

  passCount(): number {
    let n = 0
    for (const r of this.reports) if (r.pass) n++
    return n
  }

  allPass(): boolean {
    return this.reports.length > 0 && this.reports.every((r) => r.pass)
  }

  private refreshPips(untested: boolean) {
    const fns = this.functions()
    const states: number[] = []
    for (let i = 0; i < fns.length; i++) {
      const r = this.reports.find((x) => x.id === fns[i].id)
      if (untested || !r) states.push(1)
      else states.push(r.pass ? 4 : r.done > 0 ? 3 : 5)
    }
    this.hud.setPips(states)
  }

  private refreshLabel() {
    if (this.pending !== "") return
    if (this.verifyMode()) {
      this.hud.setLabel(this.verifiedCount() + "/" + this.verifyTotal())
      return
    }
    this.hud.setLabel(this.wires.length === 0 ? "" : String(this.wires.length))
  }

  // ---------------------------------------------------------------- verified pin connections (packs without a simulator)
  /** Is the pair one of the pack's verified connections (ok), a known wrong pair with an explanation (wrong), or something else (unknown)? */
  verifyPair(a: string, b: string): {state: "ok" | "wrong" | "unknown"; text: string} {
    const same = (x: {component: string; pin: string}, y: {component: string; pin: string}) =>
      (x.component + "/" + x.pin === a && y.component + "/" + y.pin === b) || (x.component + "/" + x.pin === b && y.component + "/" + y.pin === a)
    for (const c of PROJECT_PACK.connections) if (same(c.from, c.to)) return {state: "ok", text: c.explanation}
    for (const d of PROJECT_PACK.validation.distractors) if (same(d.from, d.to)) return {state: "wrong", text: d.explanation}
    return {state: "unknown", text: "Not a verified pin pair"}
  }

  private railConnIds(): string[] {
    return PROJECT_PACK.circuit && PROJECT_PACK.circuit.autoRails ? PROJECT_PACK.circuit.autoRails : []
  }

  verifyTotal(): number {
    return PROJECT_PACK.connections.filter((c) => c.group !== "plug" && this.railConnIds().indexOf(c.id) < 0).length
  }

  verifiedCount(): number {
    let n = 0
    for (const c of PROJECT_PACK.connections) {
      if (c.group === "plug" || this.railConnIds().indexOf(c.id) >= 0) continue
      if (this.hasWire(c.from.component + "/" + c.from.pin, c.to.component + "/" + c.to.pin)) n++
    }
    return n
  }

  private announce(v: {state: "ok" | "wrong" | "unknown"; text: string}) {
    if (v.state === "ok") {
      this.hud.toast("ok", GRN)
      const n = this.verifiedCount()
      this.onVerified(n, this.verifyTotal())
      if (n >= this.verifyTotal()) this.onAllPassed()
    } else {
      this.hud.toast(v.state === "wrong" ? "wrong pin" : "not verified", RED)
      this.onFail(v.text)
    }
  }

  private stopPlay() {
    this.play = []
    this.playI = -1
    this.bench.clearFx()
    this.hazardFlash = {}
  }

  isPlaying(): boolean {
    return this.play.length > 0
  }

  private advance() {
    this.playI++
    this.playT = 0
    if (!this.circuit) return
    if (this.playI >= this.play.length) {
      this.finish()
      return
    }
    const step = this.play[this.playI]
    const res = this.circuit.solve(this.simWires(), step.drive)
    // clear the previous step's effects, then apply this step's
    this.bench.clearFx()
    for (const id of this.circuit.partIds()) {
      const s = res.parts[id]
      if (!s) continue
      const k = this.circuit.spec(id).kind
      if (k === "led") this.bench.setFx(id, {glow: s.lit})
      else if (k === "motor") this.bench.setFx(id, {spin: s.spin})
      else if (k === "servo") this.bench.setFx(id, {sweep: s.moves})
      else if (k === "buzzer") this.bench.setFx(id, {sound: s.sound})
    }
    for (const h of res.hazards) this.flash(h.split(":")[0].split("/")[0], 1.2)
    const fnDef = this.functions().find((f) => f.id === step.fn)
    const rep = this.reports.find((x) => x.id === step.fn)
    if (step.first && fnDef && rep) {
      this.hud.setLabel(fnDef.label + " " + rep.done + "/" + rep.total)
      if (rep.pass) {
        const firstTime = this.passedOnce[rep.id] !== true
        this.passedOnce[rep.id] = true
        this.onProgress(rep.id, firstTime)
      } else if (rep.missing.length > 0) {
        this.hud.toast(rep.missing[0], RED)
        this.onFail(rep.missing[0])
      }
    }
  }

  private finish() {
    this.play = []
    this.playI = -1
    this.bench.clearFx()
    this.hud.setLabel(this.passCount() + "/" + this.reports.length)
    if (this.allPass()) {
      this.hud.toast("car works", GRN)
      this.onAllPassed()
    } else {
      const bad = this.reports.find((r) => !r.pass)
      if (bad && bad.missing.length > 0) this.hud.toast(bad.missing[0], new vec4(1.0, 0.75, 0.25, 1))
    }
  }

  /** Per-frame: step the playback and expire hazard flashes. */
  tick(dt: number) {
    if (!this.active) return
    for (const id in this.hazardFlash) {
      this.hazardFlash[id] -= dt
      if (this.hazardFlash[id] <= 0) {
        delete this.hazardFlash[id]
        this.bench.setFx(id, {alert: false})
      }
    }
    if (this.play.length === 0 || this.playI < 0) return
    this.playT += dt
    const step = this.play[this.playI]
    if (step && this.playT >= step.dur) this.advance()
  }

  // ---------------------------------------------------------------- persistence + tests
  serialize(): string[][] {
    return this.wires.map((w) => [w.a, w.b])
  }

  restore(list: string[][] | undefined) {
    this.wires = []
    if (!list) return
    for (const p of list) {
      const id = "u" + this.seq++
      this.wires.push({id: id, a: p[0], b: p[1]})
    }
  }

  /** Test helper: the effects of one drive on the current wiring. */
  probe(drive: Drive) {
    if (!this.circuit) this.build()
    return (this.circuit as Circuit).solve(this.simWires(), drive)
  }

  /** Drive mode: find, by simulation, which GPIO / shift-register states make the user's own circuit drive forward, reverse, steer and light up. */
  driveMap(): DriveMap {
    if (!this.circuit) this.build()
    const circ = this.circuit as Circuit
    const wires = this.simWires()
    const r = evaluateFunctions(circ, wires, this.functions())
    this.reports = r.reports
    this.exploration = r.exploration
    const out: DriveMap = {fwd: null, back: null, steer: null, lights: null, reasons: {}}
    let lights: Drive | null = null
    const ids = circ.partIds()
    for (const rep of r.reports) {
      for (const d of rep.drives) {
        const res = circ.solve(wires, d)
        let litAny = false
        for (const id of ids) {
          const s = res.parts[id]
          if (!s) continue
          const k = circ.spec(id).kind
          if (k === "motor" && s.spin > 0.2 && !out.fwd) out.fwd = d
          else if (k === "motor" && s.spin < -0.2 && !out.back) out.back = d
          else if (k === "servo" && s.moves && !out.steer) out.steer = d
          else if (k === "led" && s.lit > 0.1) litAny = true
        }
        if (litAny) {
          if (!lights) lights = {gpio: {}, sr: {}, pressed: {}}
          for (const k in d.gpio) lights.gpio[k] = d.gpio[k]
          for (const k in d.sr) lights.sr[k] = (lights.sr[k] ? lights.sr[k] : 0) | d.sr[k]
        }
      }
    }
    out.lights = lights
    // keep only the pins that matter for each effect, so that held controls can be combined (forward + steer + lights)
    const minimal = (d: Drive | null, ok: (res: ReturnType<Circuit["solve"]>) => boolean): Drive | null => {
      if (!d) return null
      const cur: Drive = {gpio: {...d.gpio}, sr: {...d.sr}, pressed: {...d.pressed}}
      for (const k of Object.keys(cur.gpio)) {
        const keep = cur.gpio[k]
        delete cur.gpio[k]
        if (!ok(circ.solve(wires, cur))) cur.gpio[k] = keep
      }
      for (const k of Object.keys(cur.sr)) {
        const keep = cur.sr[k]
        delete cur.sr[k]
        if (!ok(circ.solve(wires, cur))) cur.sr[k] = keep
      }
      return cur
    }
    const kindOf = (id: string) => circ.spec(id).kind
    const motor = ids.find((i) => kindOf(i) === "motor")
    const servo = ids.find((i) => kindOf(i) === "servo")
    const leds = ids.filter((i) => kindOf(i) === "led")
    if (motor) {
      out.fwd = minimal(out.fwd, (s) => s.parts[motor].spin > 0.2)
      out.back = minimal(out.back, (s) => s.parts[motor].spin < -0.2)
    }
    if (servo) out.steer = minimal(out.steer, (s) => s.parts[servo].moves)
    out.lights = minimal(out.lights, (s) => leds.some((l) => s.parts[l].lit > 0.1))
    const rep = (id: string) => r.reports.find((x) => x.id === id)
    const why = (id: string): string => {
      const p = rep("power")
      if (p && !p.pass && p.missing.length > 0) return p.missing[0]
      const x = rep(id)
      return x && x.missing.length > 0 ? x.missing[0] : "no signal"
    }
    out.reasons = {fwd: why("drive"), back: why("drive"), left: why("steer"), right: why("steer"), lights: why("lights")}
    return out
  }

  /** The four function pips for the current wiring (Drive mode shows them without playing the bench animation). */
  showPips() {
    this.refreshPips(false)
  }

  circuitModel(): Circuit | null {
    return this.circuit
  }
}
