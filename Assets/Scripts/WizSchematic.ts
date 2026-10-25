// WizSchematic.ts - KiCad-style circuit diagram for the Circuit Lab: every electronic part is a framed symbol with its pins on the
// left / right edge, wires are orthogonal lanes (no diagonal spaghetti) coloured by net. Pure view: WizBench owns it, the Lab logic
// (WizCircuitLab) decides which wires exist. Tap a symbol -> onPartTap(id) (the bench opens the pin picker for it).
// Owns: symbol layout, lane routing, pin marks, small status indicators (LED glow, motor spin, servo sweep, buzzer, hazard flash).
// Must not: simulate or validate anything.

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {PROJECT_PACK, ComponentDef, PinDef, RGBA, hasSim, shortName} from "./ProjectPack"
import {PartKit, StyledMat} from "./WizParts"
import {makeLabel, LABEL_ACCENT} from "./WizLabelsUI"
import {makeInteractable} from "./WizInteract"
import {pinRole, tiedDuplicate, ElecKind, genericRole} from "./CircuitSim"

const DEG = Math.PI / 180
const ROW = 0.95 // pin row pitch (cm)
const GAP_W = 2.8 // routing channel between two symbol columns
const LANE = 0.34
const ROLE_COLOR: {[r: string]: RGBA} = {
  power: [1.0, 0.35, 0.3, 1],
  ground: [0.45, 0.55, 0.75, 1],
  signal: [1.0, 0.85, 0.3, 1],
  out: [0.4, 0.95, 0.55, 1],
  io: [0.45, 0.85, 1.0, 1],
}
const KIND_COLOR: {[k: string]: RGBA} = {
  battery: [1.0, 0.45, 0.35, 1],
  boost: [1.0, 0.6, 0.3, 1],
  mcu: [0.35, 0.95, 1.0, 1],
  l293d: [0.75, 0.55, 1.0, 1],
  hc595: [0.75, 0.55, 1.0, 1],
  motor: [0.5, 0.95, 0.6, 1],
  servo: [0.5, 0.95, 0.6, 1],
  buzzer: [0.5, 0.95, 0.6, 1],
  led: [1.0, 0.85, 0.35, 1],
  module: [0.55, 0.85, 1.0, 1],
  resistor: [0.75, 0.8, 0.9, 1],
  diode: [0.75, 0.8, 0.9, 1],
  npn: [0.75, 0.8, 0.9, 1],
  button: [0.75, 0.8, 0.9, 1],
}

interface PinSlot {
  key: string
  name: string
  x: number // symbol-local
  y: number
  side: "L" | "R"
  def: PinDef
}

interface Sym {
  id: string
  def: ComponentDef
  kind: string
  col: number
  w: number
  h: number
  x: number // layout centre
  y: number
  root: SceneObject
  border: StyledMat[]
  slots: PinSlot[]
  lamp: SceneObject | null
  lampMat: StyledMat | null
  bar: SceneObject | null
}

interface SchWire {
  id: string
  root: SceneObject
  lanes: {gap: number; idx: number}[]
  corridor: {top: boolean; idx: number} | null
}

interface Fx {
  glow: number
  spin: number
  sweep: boolean
  sound: number
  alert: boolean
}

export class WizSchematic {
  readonly root: SceneObject
  private kit: PartKit
  private syms: {[id: string]: Sym} = {}
  private order: string[] = []
  private matCache: {[k: string]: StyledMat} = {}
  private pinDots: {[key: string]: {obj: SceneObject; mark: SceneObject}} = {}
  private marks: {[key: string]: boolean} = {}
  private wires: SchWire[] = []
  private lanesUsed: {[gap: number]: boolean[]} = {}
  private corridorUsed: {top: boolean[]; bottom: boolean[]} = {top: [], bottom: []}
  private colX: number[] = []
  private colW: number[] = []
  private xOff = 0
  private top = 0
  private bottom = 0
  private fx: {[id: string]: Fx} = {}
  private clock = 0
  private _onPartTap = new Event<string>()
  readonly onPartTap: PublicApi<string> = this._onPartTap.publicApi()

  constructor(kit: PartKit, parent: SceneObject) {
    this.kit = kit
    this.root = kit.obj(parent, "Schematic", [0, 3.5, 4])
    this.build()
    this.root.enabled = false
    this.fit(22, 26, -3, 1.5)
  }

  /** Shared flat-colour material per colour: hundreds of separate material clones stalled Lens Studio. */
  private mat(c: RGBA): StyledMat {
    const key = c[0].toFixed(2) + "," + c[1].toFixed(2) + "," + c[2].toFixed(2)
    if (!this.matCache[key]) this.matCache[key] = this.kit.styled(c, false)
    return this.matCache[key]
  }

  private sh(parent: SceneObject, kind: "box" | "sphere", pos: [number, number, number], scale: [number, number, number], color: RGBA, name: string, own?: StyledMat): SceneObject {
    const o = this.kit.obj(parent, name, pos)
    o.getTransform().setLocalScale(new vec3(scale[0], scale[1], scale[2]))
    const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = kind === "box" ? this.kit.box : this.kit.sphere
    rmv.mainMaterial = (own ? own : this.mat(color)).mat
    return o
  }

  // ------------------------------------------------------------------------------------------------ layout
  // columns left to right: power | MCU | drivers + shift register | loads + resistors | LEDs and the small parts
  private colOf(kind: string): number {
    if (kind === "battery" || kind === "boost") return 0
    if (kind === "mcu") return 1
    if (kind === "l293d" || kind === "hc595" || kind === "module") return 2
    if (kind === "motor" || kind === "servo" || kind === "buzzer" || kind === "resistor") return 3
    return 4
  }

  private slotsFor(def: ComponentDef, kind: string): {left: PinDef[]; right: PinDef[]} {
    const pins = def.pins.filter((p) => !def.elec || !tiedDuplicate(kind as ElecKind, p.name))
    const passive = kind === "led" || kind === "resistor" || kind === "diode" || kind === "button"
    if (passive && pins.length === 2) {
      // current flows left to right: LED / diode anode on the left, cathode on the right
      if (kind === "led" || kind === "diode") return {left: [pins.find((p) => p.name === "A") as PinDef], right: [pins.find((p) => p.name === "K") as PinDef]}
      return {left: [pins[0]], right: [pins[1]]}
    }
    // chips and boards: inputs and supply on the left, outputs on the right (the way a schematic reads)
    const lab = (p: PinDef) => (p.label ? p.label : p.name)
    const split = (leftOrder: string[], rightOrder?: string[]) => {
      const left = leftOrder.map((l) => pins.find((p) => lab(p) === l)).filter((p) => !!p) as PinDef[]
      const rest = pins.filter((p) => left.indexOf(p) < 0)
      const right = rightOrder ? (rightOrder.map((l) => rest.find((p) => lab(p) === l)).filter((p) => !!p) as PinDef[]) : rest
      for (const p of rest) if (right.indexOf(p) < 0) right.push(p)
      return {left: left, right: right}
    }
    if (kind === "l293d") return split(["EN", "1A", "2A", "3A", "4A", "VCC1", "VCC2", "GND"], ["1Y", "2Y", "3Y", "4Y"])
    if (kind === "hc595") return split(["SER", "CLK", "LAT", "OE", "CLR", "VCC", "GND"], ["QA", "QB", "QC", "QD", "QE", "QF", "QG", "QH", "QH'"])
    if (kind === "mcu") return split(["5V", "3V3", "GND"])
    if (kind === "module" && pins.length <= 5) return {left: pins, right: []} // a sensor / display module: everything on its input side
    if (kind === "battery") return {left: [], right: pins}
    if (kind === "boost") return {left: pins.filter((p) => p.name.indexOf("IN") === 0), right: pins.filter((p) => p.name.indexOf("IN") !== 0)}
    if (kind === "motor" || kind === "servo" || kind === "buzzer") return {left: pins, right: []}
    if (kind === "npn") return {left: pins.filter((p) => p.name === "B"), right: pins.filter((p) => p.name !== "B")}
    const half = Math.ceil(pins.length / 2)
    return {left: pins.slice(0, half), right: pins.slice(half)}
  }

  private build() {
    const comps = PROJECT_PACK.components.filter((c) => c.kind === "electronic" && c.group !== "prop" && c.benchPos && (!!c.elec || !hasSim()))
    const cols: Sym[][] = [[], [], [], [], []]
    for (const def of comps) {
      const kind: string = def.elec ? def.elec.kind : def.id.indexOf("esp") === 0 ? "mcu" : "module"
      const sp = this.slotsFor(def, kind)
      const rows = Math.max(sp.left.length, sp.right.length, 1)
      const passive = kind === "led" || kind === "resistor" || kind === "diode" || kind === "button" || kind === "npn"
      const longest = Math.max(
        ...sp.left.map((p) => (p.label ? p.label : p.name).length),
        ...sp.right.map((p) => (p.label ? p.label : p.name).length),
        3
      )
      const bothSides = sp.left.length > 0 && sp.right.length > 0
      const w = Math.max(passive ? 3.4 : 4.6, (bothSides ? 2 : 1) * (longest * 0.21 + 0.9) + (shortName(def.id).length > 9 ? 1.5 : 0.8))
      const h = rows * ROW + 1.5
      const sym: Sym = {id: def.id, def: def, kind: kind, col: this.colOf(kind), w: w, h: h, x: 0, y: 0, root: null as unknown as SceneObject, border: [], slots: [], lamp: null, lampMat: null, bar: null}
      const place = (list: PinDef[], side: "L" | "R") => {
        for (let i = 0; i < list.length; i++) {
          const p = list[i]
          sym.slots.push({key: def.id + "/" + p.name, name: p.name, x: side === "L" ? -w / 2 : w / 2, y: h / 2 - 1.5 - ROW * (i + 0.5) + ROW * 0.5 * 0, side: side, def: p})
        }
      }
      place(sp.left, "L")
      place(sp.right, "R")
      cols[sym.col].push(sym)
      this.syms[def.id] = sym
      this.order.push(def.id)
    }
    // column widths + x
    let x = 0
    for (let c = 0; c < cols.length; c++) {
      let w = 0
      for (const s of cols[c]) w = Math.max(w, s.w)
      this.colW[c] = w
      this.colX[c] = x + w / 2
      x += w + GAP_W
    }
    const totalW = x - GAP_W
    this.xOff = -totalW / 2
    // stack each column; passives pair up (resistor row = LED row)
    let maxH = 0
    const heights: number[] = []
    for (let c = 0; c < cols.length; c++) {
      let h = 0
      for (const s of cols[c]) h += s.h + 1.1
      heights[c] = Math.max(0, h - 1.1)
      maxH = Math.max(maxH, heights[c])
    }
    for (let c = 0; c < cols.length; c++) {
      let y = maxH / 2
      for (const s of cols[c]) {
        s.x = this.colX[c] - totalW / 2
        s.y = y - s.h / 2
        y -= s.h + 1.1
      }
    }
    this.top = maxH / 2 + 1.2
    this.bottom = -maxH / 2 - 1.2
    for (const id of this.order) this.drawSymbol(this.syms[id])
  }

  private drawSymbol(s: Sym) {
    const k = this.kit
    const col: RGBA = KIND_COLOR[s.kind] ? KIND_COLOR[s.kind] : [0.8, 0.8, 0.8, 1]
    s.root = k.obj(this.root, "sym_" + s.id, [s.x, s.y, 0])
    this.sh(s.root, "box", [0, 0, 0], [s.w, s.h, 0.08], [0.04, 0.07, 0.12, 1], "back")
    const bm = k.styled(col, false)
    s.border.push(bm)
    const t = 0.1
    const edges: [number, number, number, number][] = [
      [0, s.h / 2, s.w + t, t],
      [0, -s.h / 2, s.w + t, t],
      [-s.w / 2, 0, t, s.h],
      [s.w / 2, 0, t, s.h],
    ]
    for (let i = 0; i < 4; i++) {
      this.sh(s.root, "box", [edges[i][0], edges[i][1], 0.07], [edges[i][2], edges[i][3], 0.06], col, "edge" + i, bm)
    }
    const passive = s.kind === "led" || s.kind === "resistor" || s.kind === "diode" || s.kind === "button" || s.kind === "npn"
    const title = passive ? s.id.toUpperCase() : shortName(s.id)
    makeLabel(s.root, "title", title, passive ? 20 : 22, [0, s.h / 2 - 0.6, 0.14], new vec4(col[0], col[1], col[2], 1))
    for (const sl of s.slots) {
      const r = ROLE_COLOR[this.roleOf(s.kind, sl.name)]
      const dir = sl.side === "L" ? -1 : 1
      this.sh(s.root, "box", [sl.x + dir * 0.35, sl.y, 0.1], [0.7, 0.07, 0.05], r, "stub_" + sl.name)
      const dot = this.sh(s.root, "sphere", [sl.x + dir * 0.75, sl.y, 0.14], [0.3, 0.3, 0.3], r, "pin_" + sl.name)
      const mark = this.sh(s.root, "sphere", [sl.x + dir * 0.75, sl.y, 0.2], [0.8, 0.8, 0.8], [1, 1, 1, 1], "mark_" + sl.name)
      mark.enabled = false
      this.pinDots[sl.key] = {obj: dot, mark: mark}
      const label = sl.def.label ? sl.def.label : sl.name
      const lx = sl.x - dir * (0.35 + label.length * 0.1)
      makeLabel(s.root, "pl_" + sl.name, label, 14, [lx, sl.y, 0.14], new vec4(0.92, 0.97, 1, 1))
    }
    // tap target for the pin picker
    const hit = k.obj(s.root, "shit_" + s.id, [0, 0, 0.35])
    const col2 = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
    const box = Shape.createBoxShape()
    box.size = new vec3(Math.max(2.4, s.w), Math.max(2.4, s.h), 0.8)
    col2.shape = box
    const it = makeInteractable(hit)
    it.targetingMode = 3
    const id = s.id
    it.onTriggerEnd.add(() => {
      if (this.root.enabled) this._onPartTap.invoke(id)
    })
    // status lamp (top-right corner)
    const lamp = k.shape(s.root, "sphere", [s.w / 2 - 0.55, s.h / 2 - 0.6, 0.18], [0.5, 0.5, 0.5], [0.2, 0.25, 0.3, 1], "lamp", false)
    s.lamp = lamp.obj
    s.lampMat = lamp.sm
    if (s.kind === "motor" || s.kind === "servo") {
      const bar = k.obj(s.root, "bar", [-s.w / 2 + 0.9, -s.h / 2 + 0.9, 0.2])
      this.sh(bar, "box", [0.45, 0, 0], [0.9, 0.12, 0.08], [0.35, 1.0, 1.0, 1], "arm")
      bar.enabled = false
      s.bar = bar
    }
  }

  private roleOf(kind: string, pin: string): string {
    return hasSim() ? pinRole(kind as ElecKind, pin) : genericRole(pin)
  }

  // ------------------------------------------------------------------------------------------------ wires
  private slotOf(key: string): {sym: Sym; slot: PinSlot} | null {
    const i = key.indexOf("/")
    const sym = this.syms[key.substring(0, i)]
    if (!sym) return null
    const name = key.substring(i + 1)
    for (const sl of sym.slots) if (sl.name === name) return {sym: sym, slot: sl}
    // a pin that is a tied duplicate of another (same net): draw it on its twin
    return null
  }

  private gapCenter(g: number): number {
    // between column g-1 (right edge) and column g (left edge); gap 0 = left of column 0, gap n = right of the last column
    const n = this.colX.length
    const off = this.xOff
    if (g <= 0) return this.colX[0] - this.colW[0] / 2 - GAP_W / 2 + off
    if (g >= n) return this.colX[n - 1] + this.colW[n - 1] / 2 + GAP_W / 2 + off
    return (this.colX[g - 1] + this.colW[g - 1] / 2 + this.colX[g] - this.colW[g] / 2) / 2 + off
  }

  private allocLane(g: number): number {
    if (!this.lanesUsed[g]) this.lanesUsed[g] = []
    const u = this.lanesUsed[g]
    for (let i = 0; i < u.length; i++)
      if (!u[i]) {
        u[i] = true
        return i
      }
    u.push(true)
    return u.length - 1
  }

  private laneX(g: number, idx: number): number {
    const cap = Math.floor((GAP_W - 0.6) / LANE)
    const i = idx % cap
    return this.gapCenter(g) + (i - (cap - 1) / 2) * LANE
  }

  addWire(id: string, a: string, b: string, color: RGBA) {
    this.removeWire(id)
    const A = this.slotOf(a)
    const B = this.slotOf(b)
    if (!A || !B) return
    const k = this.kit
    const root = k.obj(this.root, "swire_" + id)
    // KiCad style: ground and supply nets are drawn as labelled flags at each pin, only signals get routed wires
    const roleA = this.roleOf(A.sym.kind, A.slot.name)
    const roleB = this.roleOf(B.sym.kind, B.slot.name)
    if (roleA === "ground" || roleB === "ground" || roleA === "power" || roleB === "power") {
      let tag = "GND"
      if (!(roleA === "ground" || roleB === "ground")) {
        const srcA = A.sym.kind === "battery" || A.sym.kind === "boost" || A.sym.kind === "mcu"
        const src = srcA ? A : B
        tag = src.slot.def.label ? src.slot.def.label : src.slot.name
      }
      this.flag(root, A, tag, color)
      this.flag(root, B, tag, color)
      this.wires.push({id: id, root: root, lanes: [], corridor: null})
      return
    }
    const ax = A.sym.x + A.slot.x
    const ay = A.sym.y + A.slot.y
    const bx = B.sym.x + B.slot.x
    const by = B.sym.y + B.slot.y
    const dirA = A.slot.side === "L" ? -1 : 1
    const dirB = B.slot.side === "L" ? -1 : 1
    const portAx = ax + dirA * 0.75
    const portBx = bx + dirB * 0.75
    const gA = A.slot.side === "L" ? A.sym.col : A.sym.col + 1
    const gB = B.slot.side === "L" ? B.sym.col : B.sym.col + 1
    const lanes: {gap: number; idx: number}[] = []
    let corridor: {top: boolean; idx: number} | null = null
    const pts: [number, number][] = [[portAx, ay]]
    if (gA === gB) {
      const li = this.allocLane(gA)
      lanes.push({gap: gA, idx: li})
      const lx = this.laneX(gA, li)
      pts.push([lx, ay], [lx, by])
    } else {
      const la = this.allocLane(gA)
      const lb = this.allocLane(gB)
      lanes.push({gap: gA, idx: la}, {gap: gB, idx: lb})
      const top = ay + by >= 0
      const used = top ? this.corridorUsed.top : this.corridorUsed.bottom
      let ci = 0
      while (used[ci]) ci++
      used[ci] = true
      corridor = {top: top, idx: ci}
      const cy = top ? this.top + ci * LANE : this.bottom - ci * LANE
      pts.push([this.laneX(gA, la), ay], [this.laneX(gA, la), cy], [this.laneX(gB, lb), cy], [this.laneX(gB, lb), by])
    }
    pts.push([portBx, by])
    // lead-ins from the pin dots
    pts.unshift([ax + dirA * 0.75, ay])
    pts.push([bx + dirB * 0.75, by])
    const z = 0.12 + (this.wires.length % 7) * 0.012
    const th = 0.13
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i]
      const q = pts[i + 1]
      const dx = Math.abs(q[0] - p[0])
      const dy = Math.abs(q[1] - p[1])
      if (dx < 0.001 && dy < 0.001) continue
      this.sh(root, "box", [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, z], [dx + th, dy + th, th], color, "seg" + i)
    }
    for (let i = 1; i + 1 < pts.length - 1; i++) this.sh(root, "sphere", [pts[i][0], pts[i][1], z], [0.26, 0.26, 0.26], color, "bend" + i)
    this.wires.push({id: id, root: root, lanes: lanes, corridor: corridor})
  }

  private flag(root: SceneObject, e: {sym: Sym; slot: PinSlot}, tag: string, color: RGBA) {
    const k = this.kit
    const dir = e.slot.side === "L" ? -1 : 1
    const x = e.sym.x + e.slot.x + dir * 0.75
    const y = e.sym.y + e.slot.y
    this.sh(root, "box", [x + dir * 0.3, y, 0.12], [0.6, 0.13, 0.06], color, "flagline")
    this.sh(root, "box", [x + dir * 0.62, y, 0.12], [0.13, 0.6, 0.06], color, "flagbar")
    makeLabel(root, "flagtxt", tag, 14, [x + dir * (0.85 + tag.length * 0.1), y, 0.14], new vec4(color[0] * 0.5 + 0.5, color[1] * 0.5 + 0.5, color[2] * 0.5 + 0.5, 1))
  }

  removeWire(id: string) {
    for (let i = 0; i < this.wires.length; i++) {
      if (this.wires[i].id !== id) continue
      const w = this.wires[i]
      for (const l of w.lanes) if (this.lanesUsed[l.gap]) this.lanesUsed[l.gap][l.idx] = false
      if (w.corridor) (w.corridor.top ? this.corridorUsed.top : this.corridorUsed.bottom)[w.corridor.idx] = false
      w.root.enabled = false
      w.root.destroy()
      this.wires.splice(i, 1)
      return
    }
  }

  clearWires() {
    for (const id of this.wires.map((w) => w.id)) this.removeWire(id)
  }

  wireCount(): number {
    return this.wires.length
  }

  hasPin(key: string): boolean {
    return !!this.pinDots[key]
  }

  // ------------------------------------------------------------------------------------------------ marks + status
  setMarks(keys: string[]) {
    this.marks = {}
    for (const k of keys) this.marks[k] = true
    for (const key in this.pinDots) {
      const m = this.marks[key] === true
      this.pinDots[key].mark.enabled = m
    }
  }

  setFx(id: string, s: Partial<Fx>) {
    const cur = this.fx[id] ? this.fx[id] : {glow: 0, spin: 0, sweep: false, sound: 0, alert: false}
    this.fx[id] = {glow: s.glow !== undefined ? s.glow : cur.glow, spin: s.spin !== undefined ? s.spin : cur.spin, sweep: s.sweep !== undefined ? s.sweep : cur.sweep,
      sound: s.sound !== undefined ? s.sound : cur.sound, alert: s.alert !== undefined ? s.alert : cur.alert}
  }

  clearFx() {
    this.fx = {}
    for (const id of this.order) this.paintSym(this.syms[id], {glow: 0, spin: 0, sweep: false, sound: 0, alert: false})
  }

  private paintSym(s: Sym, f: Fx) {
    const base: RGBA = KIND_COLOR[s.kind] ? KIND_COLOR[s.kind] : [0.8, 0.8, 0.8, 1]
    const flash = f.alert ? 0.5 + 0.5 * Math.sin(this.clock * 14) : 0
    const c: RGBA = f.alert ? [base[0] * (1 - flash) + flash, base[1] * (1 - flash) + 0.1 * flash, base[2] * (1 - flash) + 0.1 * flash, 1] : [base[0], base[1], base[2], 1]
    for (const b of s.border) b.set(c)
    if (s.lampMat) {
      let lc: RGBA = [0.2, 0.25, 0.3, 1]
      if (s.kind === "led" && f.glow > 0.02) lc = [1.0, 0.8 + 0.1 * f.glow, 0.3, 1]
      else if (s.kind === "motor" && Math.abs(f.spin) > 0.01) lc = [0.35, 1.0, 0.6, 1]
      else if (s.kind === "servo" && f.sweep) lc = [0.35, 1.0, 0.6, 1]
      else if (s.kind === "buzzer" && f.sound > 0.02) lc = [0.35, 1.0, 0.6, 1]
      s.lampMat.set(lc)
    }
    if (s.lamp && s.kind === "led") {
      const sc = 0.5 + f.glow * 0.7
      s.lamp.getTransform().setLocalScale(new vec3(sc, sc, sc))
    }
  }

  update(dt: number) {
    if (!this.root.enabled) return
    this.clock += dt
    for (const id of this.order) {
      const s = this.syms[id]
      const f = this.fx[id] ? this.fx[id] : {glow: 0, spin: 0, sweep: false, sound: 0, alert: false}
      this.paintSym(s, f)
      if (s.bar) {
        let ang = 0
        let on = false
        if (s.kind === "motor" && Math.abs(f.spin) > 0.01) {
          on = true
          ang = this.clock * f.spin * 540
        } else if (s.kind === "servo" && f.sweep) {
          on = true
          ang = Math.sin(this.clock * 5) * 40
        }
        s.bar.enabled = on
        if (on) s.bar.getTransform().setLocalRotation(quat.angleAxis(ang * DEG, new vec3(0, 0, 1)))
      }
    }
  }

  /** Scale the diagram to fit a box (cm) and centre it at (cx, cy). */
  fit(maxW: number, maxH: number, cx: number, cy: number) {
    const e = this.extent()
    const sc = Math.min(1, maxW / e.w, maxH / e.h)
    this.root.getTransform().setLocalScale(new vec3(sc, sc, sc))
    this.root.getTransform().setLocalPosition(new vec3(cx, cy, 4))
  }

  show(on: boolean) {
    this.root.enabled = on
  }

  symbolIds(): string[] {
    return this.order.slice()
  }

  /** Bounding size of the drawn diagram (cm) */
  extent(): {w: number; h: number} {
    const n = this.colX.length
    return {w: this.colX[n - 1] + this.colW[n - 1] / 2 + 2 * GAP_W, h: this.top - this.bottom + 4}
  }
}

