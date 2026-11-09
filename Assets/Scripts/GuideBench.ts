// GuideBench.ts - the work area of the Circuit Guide: the table, the breadboard, the component parts waiting in a tray, their pins,
// the wire (two grabbable ends), the guide glow, and the rules that decide right / wrong for a drop.
// Owns: part + pin + wire objects, the glow (cyan guide / red wrong / green success), drop validation, the return-to-previous-position move.
// Must not: know about the panel, the orb, the narration or the step order. It is told the current step and reports results.

import {PartKit, StyledMat, partPrefab} from "./WizParts"
import {instModel} from "./GuideParts"
import {GuidePack, GuidePart, GuideSpot, GuideStep, V3} from "./GuideData"
import {GLOW_GUIDE, GLOW_OK, GLOW_WRONG, makeGrab, ontoPlane, outlineBox, v3} from "./GuideKit"
import {GuideModel} from "./GuideModel"
import {RGBA} from "./ProjectPack"

export type Outcome = "ok" | "wrong" | "miss" | "partial"
export interface BenchResult {
  kind: "place" | "wire"
  outcome: Outcome
  detail: string
}

interface PinRt {
  key: string // "esp32.IO12"
  label: string
  node: SceneObject
  dot: StyledMat
  glow: SceneObject
  glowMat: StyledMat
}

interface PartRt {
  def: GuidePart
  root: SceneObject
  hit: SceneObject
  pins: PinRt[]
  placed: boolean
  spot: string
  grab: boolean
  prev: vec3 // world position before the grab (the return target)
  prevParent: SceneObject
  moved: number
  goal: vec3 | null
}

interface EndRt {
  obj: SceneObject
  sm: StyledMat
  pin: string // "" = free
  home: vec3 // work-local rest
  prev: vec3 // world position before the grab
  grab: boolean
  moved: number
  goal: vec3 | null
}

interface WireRt {
  stepId: string
  ends: EndRt[]
  line: SceneObject
  lineMat: StyledMat
  done: boolean
}

const WIRE_COLORS: RGBA[] = [[0.95, 0.75, 0.2, 1], [0.35, 0.7, 1.0, 1], [1.0, 0.35, 0.3, 1], [0.3, 0.95, 0.5, 1], [0.95, 0.95, 0.95, 1]]

export class GuideBench {
  work: SceneObject
  model: GuideModel
  onResult: ((r: BenchResult) => void) | null = null
  onGrab: (() => void) | null = null
  onRelease: (() => void) | null = null
  /** A real hand / mouse grab while the bench is locked (the auto demo runs): the owner can end the demo. */
  onBlockedGrab: (() => void) | null = null
  private demoFlag = false

  private kit: PartKit
  private pack: GuidePack
  private scale: number
  private table!: SceneObject
  private board!: SceneObject
  private boardPins: PinRt[] = []
  private parts: PartRt[] = []
  private spotGlow: {[spot: string]: {root: SceneObject; mats: StyledMat[]}} = {}
  private spotHome: {[spot: string]: V3} = {}
  private wires: WireRt[] = []
  private wire: WireRt | null = null
  private step: GuideStep | null = null
  private glowState: "guide" | "wrong" | "ok" = "guide"
  private flashT = 0
  private flash!: SceneObject
  private flashMat!: StyledMat
  private clock = 0
  private tableTopY = 0
  private enabled = true
  private wireCount = 0

  constructor(parent: SceneObject, kit: PartKit, pack: GuidePack, scale: number, tiltDeg: number) {
    this.kit = kit
    // own copy of the spots: they are moved to fit an imported model, the shared sample packs must stay as authored
    this.pack = {...pack, spots: pack.spots.map((s) => ({...s, at: [...s.at] as V3, plate: [s.plate[0], s.plate[1]] as [number, number]}))}
    for (const s of this.pack.spots) this.spotHome[s.id] = [...s.at] as V3
    this.scale = scale
    this.work = kit.obj(parent, "GuideWork", [0, -5, -50])
    this.work.getTransform().setLocalScale(new vec3(scale, scale, scale))
    // the table top is tilted toward the user like a drafting table, so it reads from the fixed preview view point
    this.work.getTransform().setLocalRotation(quat.fromEulerVec(new vec3((tiltDeg * Math.PI) / 180, 0, 0)))
    this.model = new GuideModel(this.work, kit)
    this.build()
  }

  // ------------------------------------------------------------------ build
  private build() {
    const k = this.kit
    // the table: a slab with a bright rim (black would vanish on the additive display)
    this.table = k.obj(this.work, "GuideTable", [0, -0.3, 0])
    k.shape(this.table, "box", [0, 0, 0], [22, 0.6, 17], [0.2, 0.3, 0.42, 0.9], "slab", false)
    for (const [x, z, w, d] of [[0, -8.5, 22, 0.18], [0, 8.5, 22, 0.18], [-11, 0, 0.18, 17], [11, 0, 0.18, 17]] as number[][]) {
      k.shape(this.table, "box", [x, 0.32, z], [w, 0.08, d], [0.35, 0.95, 1, 1], "rim", false)
    }
    this.tableTopY = 0
    // breadboard (real model) + its two rails as pins
    this.board = k.obj(this.work, "GuideBoard", [6.3, 0, -2.6])
    const bb = partPrefab(this.pack.board.glb)
    if (bb !== null) bb.instantiate(this.board)
    for (const p of this.pack.board.pins) this.boardPins.push(this.makePin(this.board, this.pack.board.id + "." + p.id, p.label, p.at))
    // parts waiting in the tray
    for (const def of this.pack.parts) this.parts.push(this.makePart(def))
    // spots glow (hidden until a step shows one)
    for (const s of this.pack.spots) this.spotGlow[s.id] = this.makeSpotGlow(s)
    // wire line + shared red flash
    this.flash = k.obj(this.work, "GuideFlash")
    const f = k.shape(this.flash, "sphere", [0, 0, 0], [1, 1, 1], GLOW_WRONG, "flash", false)
    this.flashMat = f.sm
    this.flash.enabled = false
    // the model sits on the table, left
    this.model.root.getTransform().setLocalPosition(new vec3(-6.2, 3.9, 0))
  }

  buildModel(source: "rc" | "fbx", fbx: ObjectPrefab | null) {
    this.model.build(source, fbx)
    this.model.root.getTransform().setLocalPosition(new vec3(-6.2, 3.9, 0))
    this.fitSpotsToModel(source === "fbx")
    for (const s of this.pack.spots) if (s.on === "model") this.spotGlow[s.id].root.setParent(this.model.root)
    for (const p of this.parts) {
      if (p.placed && p.spot !== "" && this.spotOf(p.spot).on === "model") {
        p.root.setParent(this.model.root)
        p.root.getTransform().setLocalPosition(v3(this.spotOf(p.spot).at))
      }
    }
  }

  /** A model of your own: the spots on the model move onto its top surface (spread along its long side); the RC car keeps the authored spots. */
  private fitSpotsToModel(custom: boolean) {
    const ms = this.pack.spots.filter((s) => s.on === "model")
    const b = this.model.bounds()
    const sx = b.max.x - b.min.x
    const sz = b.max.z - b.min.z
    const alongX = sx >= sz
    const span = alongX ? sx : sz
    const step = Math.min(span / Math.max(ms.length, 1), 3.4)
    for (let i = 0; i < ms.length; i++) {
      const s = ms[i]
      if (!custom) {
        s.at = [...this.spotHome[s.id]] as V3
      } else {
        const off = (i - (ms.length - 1) / 2) * step
        const cx = (b.min.x + b.max.x) / 2
        const cz = (b.min.z + b.max.z) / 2
        s.at = alongX ? [cx + off, b.max.y, cz] : [cx, b.max.y, cz + off]
      }
      if (this.spotGlow[s.id]) this.spotGlow[s.id].root.getTransform().setLocalPosition(v3(s.at))
    }
  }

  private spotOf(id: string): GuideSpot {
    return this.pack.spots.filter((s) => s.id === id)[0]
  }

  private makePin(parent: SceneObject, key: string, label: string, at: V3): PinRt {
    const node = this.kit.obj(parent, "pin_" + key, at)
    const dot = this.kit.shape(node, "sphere", [0, 0, 0], [0.22, 0.22, 0.22], [0.95, 0.95, 1, 0.9], "dot", false)
    const glow = this.kit.obj(node, "pinglow_" + key)
    const g = this.kit.shape(glow, "sphere", [0, 0, 0], [0.95, 0.95, 0.95], GLOW_GUIDE, "g", false)
    glow.enabled = false
    return {key: key, label: label, node: node, dot: dot.sm, glow: glow, glowMat: g.sm}
  }

  private makePart(def: GuidePart): PartRt {
    const root = this.kit.obj(this.work, "guide_" + def.id, def.trayAt)
    instModel(this.kit, root, def.glb, def.sizeCm)
    const pins = def.pins.map((p) => this.makePin(root, def.id + "." + p.id, p.label, p.at))
    for (const p of pins) p.dot.mat.mainPass.baseColor = new vec4(1, 1, 1, 0.0) // pin dots only show once the part is placed
    const hit = this.kit.obj(root, "guide_part_" + def.id, [0, def.sizeCm[1] / 2, 0])
    const rt: PartRt = {def: def, root: root, hit: hit, pins: pins, placed: false, spot: "", grab: false, prev: vec3.zero(), prevParent: this.work, moved: 0, goal: null}
    const hs = new vec3(Math.max(def.sizeCm[0] + 0.8, 2.2), Math.max(def.sizeCm[1] + 0.6, 1.4), Math.max(def.sizeCm[2] + 0.8, 2.2))
    const it = makeGrab(hit, hs, {
      start: () => this.beginPart(rt),
      move: (d) => this.movePart(rt, d),
      end: () => this.endPart(rt),
    })
    // a faint cyan block shows which part the pointer is on (big, easy grab target)
    const halo = outlineBox(this.kit, hit, "hover_halo", hs)
    halo.enabled = false
    it.onHoverEnter.add(() => (halo.enabled = true))
    it.onHoverExit.add(() => (halo.enabled = false))
    return rt
  }

  private makeSpotGlow(s: GuideSpot): {root: SceneObject; mats: StyledMat[]} {
    const parent = s.on === "board" ? this.board : this.model.root
    const root = this.kit.obj(parent, "spotglow_" + s.id, s.at)
    const mats: StyledMat[] = []
    mats.push(this.kit.shape(root, "box", [0, 0.05, 0], [s.plate[0], 0.1, s.plate[1]], GLOW_GUIDE, "plate", false).sm)
    mats.push(this.kit.shape(root, "cyl", [0, 1.7, 0], [0.07, 3.0, 0.07], GLOW_GUIDE, "stalk", false).sm)
    mats.push(this.kit.shape(root, "sphere", [0, 3.4, 0], [0.8, 0.8, 0.8], GLOW_GUIDE, "beacon", false).sm)
    root.enabled = false
    return {root: root, mats: mats}
  }

  // ------------------------------------------------------------------ guide for a step
  setEnabled(on: boolean) {
    this.enabled = on
  }

  showStep(step: GuideStep | null) {
    this.step = step
    this.clearGuide()
    this.glowState = "guide"
    if (step === null) return
    if (step.kind === "place") {
      if (step.spot) {
        if (step.spot && this.spotOf(step.spot).on === "model") this.model.assemble()
        this.spotGlow[step.spot].root.enabled = true
      }
      for (const p of this.parts) p.hit.enabled = !p.placed
    } else {
      for (const p of this.parts) p.hit.enabled = false
      for (const key of step.pins ? step.pins : []) {
        const pin = this.findPin(key)
        if (pin) pin.glow.enabled = true
      }
      this.spawnWire(step)
    }
    this.applyGlow()
  }

  private clearGuide() {
    for (const id in this.spotGlow) this.spotGlow[id].root.enabled = false
    for (const p of this.allPins()) p.glow.enabled = false
    if (this.wire !== null && !this.wire.done) {
      this.wire.line.destroy()
      for (const e of this.wire.ends) e.obj.destroy()
      this.wires = this.wires.filter((w) => w !== this.wire)
      this.wire = null
    }
  }

  private allPins(): PinRt[] {
    let out = this.boardPins.slice()
    for (const p of this.parts) out = out.concat(p.pins)
    return out
  }

  private findPin(key: string): PinRt | null {
    const all = this.allPins()
    for (const p of all) if (p.key === key) return p
    return null
  }

  private applyGlow() {
    const c = this.glowState === "guide" ? GLOW_GUIDE : this.glowState === "wrong" ? GLOW_WRONG : GLOW_OK
    for (const id in this.spotGlow) for (const m of this.spotGlow[id].mats) m.set(c)
    for (const p of this.allPins()) p.glowMat.set(c)
  }

  /** Success: green on the current guide (the caller moves on to the next step after a moment). */
  showSuccess() {
    this.glowState = "ok"
    this.applyGlow()
  }

  glowName(): string {
    return this.glowState
  }

  // ------------------------------------------------------------------ parts
  private partWorld(p: PartRt): vec3 {
    return p.root.getTransform().getWorldPosition()
  }

  /** Table-local position of a world point (author cm, flat table frame). */
  private toLocal(w: vec3): vec3 {
    return this.work.getTransform().getWorldTransform().inverse().multiplyPoint(w)
  }

  private normal(): vec3 {
    return this.work.getTransform().getWorldRotation().multiplyVec3(new vec3(0, 1, 0))
  }

  /** The plane a dragged thing slides on: the table plane lifted by `lift` author cm. */
  private lifted(w: vec3, lift: number): vec3 {
    const n = this.normal()
    const loc = this.toLocal(w)
    return ontoPlane(w, this.work.getTransform().getWorldTransform().multiplyPoint(new vec3(loc.x, this.tableTopY + lift, loc.z)), n)
  }

  private flat(a: vec3, b: vec3): number {
    const p = this.toLocal(a)
    const q = this.toLocal(b)
    return Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.z - q.z) * (p.z - q.z))
  }

  private beginPart(p: PartRt) {
    if (!this.enabled && !this.demoFlag) {
      if (this.onBlockedGrab) this.onBlockedGrab()
      return
    }
    if (p.placed) return
    p.grab = true
    p.moved = 0
    p.goal = null
    p.prev = this.partWorld(p)
    p.prevParent = p.root.getParent()
    const w = this.partWorld(p)
    p.root.getTransform().setWorldPosition(this.lifted(w, 3.2))
    if (this.onGrab) this.onGrab()
  }

  private movePart(p: PartRt, d: vec3) {
    if (!p.grab) return
    p.moved += d.length
    const cand = this.partWorld(p).add(d)
    p.root.getTransform().setWorldPosition(this.lifted(cand, 3.2))
  }

  private endPart(p: PartRt) {
    if (!p.grab) return
    p.grab = false
    if (this.onRelease) this.onRelease()
    if (p.moved < 0.4) {
      p.root.getTransform().setWorldPosition(p.prev)
      return
    }
    this.judgePart(p)
  }

  /** The rule for a dropped part: the right part, on the glowing spot (horizontal distance within the snap radius). */
  private judgePart(p: PartRt) {
    const st = this.step
    if (st === null || st.kind !== "place" || !st.spot || !st.part) {
      this.rejectPart(p, "Not now. Follow the step on the panel.")
      return
    }
    const spot = this.spotOf(st.spot)
    const sw = spot.on === "board" ? this.board.getTransform().getWorldTransform().multiplyPoint(v3(spot.at)) : this.model.spotWorld(spot.at)
    const pw = this.partWorld(p)
    const dh = this.flat(pw, sw)
    const snap = 2.4
    if (p.def.id === st.part && dh <= snap) {
      p.placed = true
      p.spot = spot.id
      p.root.setParent(spot.on === "board" ? this.work : this.model.root)
      if (spot.on === "board") p.root.getTransform().setWorldPosition(sw)
      else p.root.getTransform().setLocalPosition(v3(spot.at))
      p.hit.enabled = false
      for (const pin of p.pins) pin.dot.mat.mainPass.baseColor = new vec4(0.95, 0.95, 1, 0.9)
      this.report({kind: "place", outcome: "ok", detail: p.def.id + " on " + spot.id})
    } else {
      const why = p.def.id !== st.part ? "wrong part " + p.def.id : "off the spot by " + dh.toFixed(1) + " cm"
      this.rejectPart(p, why)
    }
  }

  private rejectPart(p: PartRt, why: string) {
    this.glowState = "wrong"
    this.applyGlow()
    this.flashAt(this.partWorld(p), 1.4 + Math.max(p.def.sizeCm[0], p.def.sizeCm[2]))
    p.goal = p.prev // back to the previous position
    this.report({kind: "place", outcome: "wrong", detail: why})
  }

  /** Test hook: the same path as a hand drag (grab, move to world position, release) for a part. */
  simDropPart(partId: string, world: vec3): void {
    const p = this.parts.filter((x) => x.def.id === partId)[0]
    if (!p || p.placed) return
    this.beginPart(p)
    p.moved = 5
    p.root.getTransform().setWorldPosition(world)
    this.endPart(p)
  }

  /** Back to the start of a build: every part in the tray, no wires, no glow. */
  reset() {
    this.setLedLit(false)
    for (const w of this.wires) {
      if (!isNull(w.line)) w.line.destroy()
      for (const e of w.ends) if (!isNull(e.obj)) e.obj.destroy()
    }
    this.wires = []
    this.wire = null
    this.wrongWire = null
    this.wireCount = 0
    for (const p of this.parts) {
      p.placed = false
      p.spot = ""
      p.grab = false
      p.goal = null
      p.root.setParent(this.work)
      p.root.getTransform().setLocalPosition(v3(p.def.trayAt))
      for (const pin of p.pins) pin.dot.mat.mainPass.baseColor = new vec4(1, 1, 1, 0)
    }
    this.glowState = "guide"
    this.flash.enabled = false
    this.clearGuide()
  }

  // ------------------------------------------------------------------ auto demo (simulated hand): same grab / drop path as a real drag
  tableToWorld(l: vec3): vec3 {
    return this.work.getTransform().getWorldTransform().multiplyPoint(l)
  }

  worldToTable(w: vec3): vec3 {
    return this.toLocal(w)
  }

  pinWorldPos(key: string): vec3 {
    const p = this.findPin(key)
    return p ? this.pinWorld(p) : this.work.getTransform().getWorldPosition()
  }

  endWorldPos(i: number): vec3 {
    return this.wire === null ? this.work.getTransform().getWorldPosition() : this.endWorld(this.wire.ends[i])
  }

  private partById(id: string): PartRt {
    return this.parts.filter((x) => x.def.id === id)[0]
  }

  demoGrabPart(id: string): void {
    const p = this.partById(id)
    if (!p || p.placed) return
    this.demoFlag = true
    this.beginPart(p)
    this.demoFlag = false
    p.moved = 5
  }

  demoMovePart(id: string, world: vec3): void {
    const p = this.partById(id)
    if (p && p.grab) p.root.getTransform().setWorldPosition(world)
  }

  demoReleasePart(id: string): void {
    const p = this.partById(id)
    if (p) this.endPart(p)
  }

  demoGrabEnd(i: number): void {
    if (this.wire === null) return
    this.demoFlag = true
    this.beginEnd(this.wire, this.wire.ends[i])
    this.demoFlag = false
    this.wire.ends[i].moved = 5
  }

  demoMoveEnd(i: number, world: vec3): void {
    const w = this.wire
    if (w === null || !w.ends[i].grab) return
    w.ends[i].obj.getTransform().setWorldPosition(world)
    this.layoutWire(w)
  }

  demoReleaseEnd(i: number): void {
    const w = this.wire
    if (w !== null) this.endEnd(w, w.ends[i])
  }

  /** The demo ended while something was held: it goes back to where it was picked up. */
  demoAbort(): void {
    for (const p of this.parts) {
      if (p.grab) {
        p.grab = false
        p.goal = p.prev
      }
    }
    if (this.wire !== null) {
      for (const e of this.wire.ends) {
        if (e.grab) {
          e.grab = false
          e.goal = e.prev
        }
      }
    }
  }

  /** Test hook: world position of a spot of the current step (where a correct drop goes). */
  spotWorldPos(spotId: string): vec3 {
    const spot = this.spotOf(spotId)
    return spot.on === "board" ? this.board.getTransform().getWorldTransform().multiplyPoint(v3(spot.at)) : this.model.spotWorld(spot.at)
  }

  boardWorldPos(): vec3 {
    return this.board.getTransform().getWorldPosition()
  }

  partWorldPos(id: string): vec3 {
    return this.partWorld(this.parts.filter((x) => x.def.id === id)[0])
  }

  isPlaced(id: string): boolean {
    return this.parts.filter((x) => x.def.id === id)[0].placed
  }

  // ------------------------------------------------------------------ wire
  private spawnWire(step: GuideStep) {
    const k = this.kit
    const col = WIRE_COLORS[this.wireCount % WIRE_COLORS.length]
    this.wireCount++
    const line = k.obj(this.work, "wire_" + step.id)
    const lm = k.shape(line, "cyl", [0, 0, 0], [0.16, 1, 0.16], col, "wireline", false)
    const w: WireRt = {stepId: step.id, ends: [], line: line, lineMat: lm.sm, done: false}
    for (let i = 0; i < 2; i++) {
      const home = new vec3(i === 0 ? 3.6 : 8.4, 0.6, 3.0)
      const obj = k.obj(this.work, "wire_end_" + step.id + "_" + i, [home.x, home.y, home.z])
      const e = k.shape(obj, "sphere", [0, 0, 0], [0.7, 0.7, 0.7], col, "endball", false)
      const rt: EndRt = {obj: obj, sm: e.sm, pin: "", home: home, prev: vec3.zero(), grab: false, moved: 0, goal: null}
      const hit = k.obj(obj, "guide_wire_end_" + i)
      makeGrab(hit, new vec3(1.9, 1.9, 1.9), {
        start: () => this.beginEnd(w, rt),
        move: (d) => this.moveEnd(w, rt, d),
        end: () => this.endEnd(w, rt),
      })
      w.ends.push(rt)
    }
    this.wire = w
    this.wires.push(w)
    this.layoutWire(w)
  }

  private endWorld(e: EndRt): vec3 {
    return e.obj.getTransform().getWorldPosition()
  }

  private layoutWire(w: WireRt) {
    const a = this.endWorld(w.ends[0])
    const b = this.endWorld(w.ends[1])
    const d = b.sub(a)
    const len = Math.max(0.05, d.length)
    const tr = w.line.getTransform()
    tr.setWorldPosition(a.add(b).uniformScale(0.5))
    const dir = d.uniformScale(1 / len)
    tr.setWorldRotation(dir.y < -0.9995 ? quat.fromEulerVec(new vec3(Math.PI, 0, 0)) : quat.rotationFromTo(vec3.up(), dir))
    const s = w.line.getChild(0).getTransform()
    s.setLocalScale(new vec3(0.16, len / this.scale, 0.16))
    w.line.getTransform().setLocalScale(new vec3(1, 1, 1))
  }

  private beginEnd(w: WireRt, e: EndRt) {
    if (!this.enabled && !this.demoFlag) {
      if (this.onBlockedGrab) this.onBlockedGrab()
      return
    }
    if (w.done) return
    e.grab = true
    e.moved = 0
    e.goal = null
    e.prev = this.endWorld(e)
    e.pin = ""
    if (this.onGrab) this.onGrab()
  }

  private moveEnd(w: WireRt, e: EndRt, d: vec3) {
    if (!e.grab) return
    e.moved += d.length
    const cand = this.endWorld(e).add(d)
    e.obj.getTransform().setWorldPosition(this.lifted(cand, 3.0))
    this.layoutWire(w)
  }

  private pinWorld(p: PinRt): vec3 {
    return p.node.getTransform().getWorldPosition()
  }

  /** Nearest pin of a PLACED part (or of the breadboard) within the grab radius, by horizontal distance. */
  private nearestPin(at: vec3): {pin: PinRt; d: number} | null {
    let best: {pin: PinRt; d: number} | null = null
    const placed: PinRt[] = this.boardPins.slice()
    for (const p of this.parts) if (p.placed) for (const q of p.pins) placed.push(q)
    for (const q of placed) {
      const d = this.flat(this.pinWorld(q), at)
      if (best === null || d < best.d) best = {pin: q, d: d}
    }
    return best
  }

  private endEnd(w: WireRt, e: EndRt) {
    if (!e.grab) return
    e.grab = false
    if (this.onRelease) this.onRelease()
    if (e.moved < 0.4) {
      e.obj.getTransform().setWorldPosition(e.prev)
      this.layoutWire(w)
      return
    }
    this.judgeEnd(w, e)
  }

  private judgeEnd(w: WireRt, e: EndRt) {
    const st = this.step
    const at = this.endWorld(e)
    const near = this.nearestPin(at)
    if (near === null || near.d > 1.5 || st === null || st.kind !== "wire" || !st.pins) {
      this.returnEnd(w, e)
      this.report({kind: "wire", outcome: "miss", detail: "dropped away from any pin"})
      return
    }
    const other = w.ends[0] === e ? w.ends[1] : w.ends[0]
    const wanted = st.pins.indexOf(near.pin.key) >= 0 && other.pin !== near.pin.key
    if (!wanted) {
      this.glowState = "wrong"
      this.applyGlow()
      this.lineWrong(w)
      this.flashAt(this.pinWorld(near.pin), 1.6)
      this.returnEnd(w, e)
      this.report({kind: "wire", outcome: "wrong", detail: "end on " + near.pin.key + ", wanted " + st.pins.join(" + ")})
      return
    }
    e.pin = near.pin.key
    e.obj.getTransform().setWorldPosition(this.pinWorld(near.pin).add(this.normal().uniformScale(0.3 * this.scale)))
    this.layoutWire(w)
    if (other.pin !== "") {
      w.done = true
      for (const x of w.ends) x.obj.getChild(1).enabled = false // hands off the ends once the wire is complete
      this.report({kind: "wire", outcome: "ok", detail: w.ends[0].pin + " <-> " + w.ends[1].pin})
    } else this.report({kind: "wire", outcome: "partial", detail: "one end set on " + near.pin.key})
  }

  private lineWrong(w: WireRt) {
    w.lineMat.set(GLOW_WRONG)
    w.ends.forEach((x) => x.sm.set(GLOW_WRONG))
    this.flashT = 0.9
    this.wrongWire = w
  }
  private wrongWire: WireRt | null = null

  private returnEnd(w: WireRt, e: EndRt) {
    e.pin = ""
    e.goal = e.prev
    void w
  }

  /** Test hook: the same path as a hand drag for one wire end (index 0 / 1) onto a pin key ("esp32.IO12"), or onto nothing. */
  simDropEnd(index: number, pinKey: string): void {
    const w = this.wire
    if (w === null) return
    const e = w.ends[index]
    this.beginEnd(w, e)
    e.moved = 5
    const pin = this.findPin(pinKey)
    const target = pin ? this.pinWorld(pin) : this.endWorld(e).add(new vec3(3, 0, 12))
    e.obj.getTransform().setWorldPosition(target)
    this.layoutWire(w)
    this.endEnd(w, e)
  }

  wireEndsSet(): number {
    return this.wire === null ? 0 : this.wire.ends.filter((x) => x.pin !== "").length
  }

  wireDone(id: string): boolean {
    return this.wires.some((w) => w.stepId === id && w.done)
  }

  placedCount(): number {
    return this.parts.filter((p) => p.placed).length
  }

  pinKeys(): string[] {
    return this.allPins().map((p) => p.key)
  }

  // ------------------------------------------------------------------ feedback
  private flashAt(world: vec3, size: number) {
    this.flash.enabled = true
    this.flash.getTransform().setWorldPosition(world.add(this.normal().uniformScale(0.6)))
    this.flash.getChild(0).getTransform().setLocalScale(new vec3(size, size, size))
    this.flashMat.set(GLOW_WRONG)
    this.flashT = 0.9
  }

  private report(r: BenchResult) {
    if (this.onResult) this.onResult(r)
  }

  /** Back to the cyan guide after a mistake was shown (the hint has been spoken). */
  resetGuideColor() {
    this.glowState = "guide"
    this.applyGlow()
    if (this.wrongWire) {
      const w = this.wrongWire
      w.lineMat.set(w.lineMat.base)
      w.ends.forEach((x) => x.sm.set(x.sm.base))
      this.wrongWire = null
    }
  }

  private ledGlow: SceneObject | null = null
  private ledOn = false

  /** Play on a circuit without a vehicle: the placed LED lights up (a warm glow that breathes). Off again on restart. */
  setLedLit(on: boolean) {
    this.ledOn = on
    for (const p of this.parts) {
      if (p.def.id !== "led") continue
      if (this.ledGlow === null || isNull(this.ledGlow)) {
        this.ledGlow = this.kit.shape(p.root, "sphere", [0, p.def.sizeCm[1] * 0.75, 0], [1.5, 1.5, 1.5], [1.0, 0.85, 0.35, 1], "led_glow", false).obj
      }
      this.ledGlow.enabled = on
    }
  }

  isLedLit(): boolean {
    return this.ledOn
  }

  isWrongShown(): boolean {
    return this.glowState === "wrong"
  }

  update(dt: number) {
    this.clock += dt
    this.model.update(dt)
    if (this.ledOn && this.ledGlow !== null && !isNull(this.ledGlow)) {
      const k = 1 + 0.18 * Math.sin(this.clock * 6)
      this.ledGlow.getTransform().setLocalScale(new vec3(k, k, k))
    }
    // pulse
    const pulse = 1 + 0.12 * Math.sin(this.clock * 5)
    for (const id in this.spotGlow) {
      const g = this.spotGlow[id]
      if (g.root.enabled) g.root.getChild(2).getTransform().setLocalPosition(new vec3(0, 3.4 + 0.3 * Math.sin(this.clock * 3), 0))
    }
    for (const p of this.allPins()) if (p.glow.enabled) p.glow.getTransform().setLocalScale(new vec3(pulse, pulse, pulse))
    // return moves
    const k = Math.min(1, dt * 12)
    for (const p of this.parts) {
      if (p.goal !== null) {
        const t = p.root.getTransform()
        const c = t.getWorldPosition()
        const d = p.goal.sub(c)
        if (d.length < 0.05) {
          t.setWorldPosition(p.goal)
          p.goal = null
        } else t.setWorldPosition(c.add(d.uniformScale(k)))
      }
    }
    for (const w of this.wires) {
      for (const e of w.ends) {
        if (e.goal !== null) {
          const t = e.obj.getTransform()
          const c = t.getWorldPosition()
          const d = e.goal.sub(c)
          if (d.length < 0.05) {
            t.setWorldPosition(e.goal)
            e.goal = null
          } else t.setWorldPosition(c.add(d.uniformScale(k)))
          this.layoutWire(w)
        } else if (e.pin !== "") {
          const pin = this.findPin(e.pin)
          if (pin) e.obj.getTransform().setWorldPosition(this.pinWorld(pin).add(this.normal().uniformScale(0.3 * this.scale)))
        }
      }
      if (w.ends.some((x) => x.pin !== "")) this.layoutWire(w)
    }
    if (this.flashT > 0) {
      this.flashT -= dt
      if (this.flashT <= 0) this.flash.enabled = false
    }
  }

  // ------------------------------------------------------------------ read-outs for tests
  /** Colour of the glow that is showing now (cyan guide / red wrong / green success). */
  glowRgba(): vec4 {
    for (const id in this.spotGlow) if (this.spotGlow[id].root.enabled) return this.spotGlow[id].mats[0].mat.mainPass.baseColor
    for (const p of this.allPins()) if (p.glow.enabled) return p.glowMat.mat.mainPass.baseColor
    return new vec4(0, 0, 0, 0)
  }

  glowPins(): string[] {
    return this.allPins().filter((p) => p.glow.enabled).map((p) => p.key)
  }

  glowSpots(): string[] {
    const out: string[] = []
    for (const id in this.spotGlow) if (this.spotGlow[id].root.enabled) out.push(id)
    return out
  }

  spotGlowWorld(id: string): vec3 {
    return this.spotGlow[id].root.getTransform().getWorldPosition()
  }

  /** Is the part the user has not placed still grabbable? */
  partGrabbable(id: string): boolean {
    const p = this.parts.filter((x) => x.def.id === id)[0]
    return p.hit.enabled
  }

  /** Where the red flash / shape of the last mistake sat (true while it shows). */
  flashShowing(): boolean {
    return this.flash.enabled
  }

  parts_(): PartRt[] {
    return this.parts
  }
}
