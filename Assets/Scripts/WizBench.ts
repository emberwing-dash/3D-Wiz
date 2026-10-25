// WizBench.ts - Tinkercad-style 3D circuit workbench: the real components laid out on a bench mat, joined by coloured wires
//               that follow docs/wiring-guide/s2-mini-wiring-guide-new.png. Pins carry readable labels.
// Owns: bench component models (same component ids as the robot), pin dots + labels, routed 3D wires, wire/part
//       highlight, drag-to-rotate (limited tilt of the board), selection colliders.
// Expects @inputs: unit box/sphere/cylinder meshes + lit/unlit materials (wired by the scene bootstrap).
// Must not: decide modes (WizMain does), validate wiring (WizValidator does) or create panels.

import {Interactable, makeInteractable} from "./WizInteract"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {PROJECT_PACK, ComponentDef, ConnectionDef, V3, RGBA, getComponent, getPin, hasSim} from "./ProjectPack"
import {PartKit, StyledMat, Style, buildElectronic, colliderSizeFor, colliderCenterFor} from "./WizParts"
import {makeLabel, LABEL_ACCENT, LABEL_COLOR} from "./WizLabelsUI"
import {pinRole, tiedDuplicate, PinRole, genericRole} from "./CircuitSim"
import {WizSchematic} from "./WizSchematic"

const DEG = Math.PI / 180

interface BenchPart {
  def: ComponentDef
  root: SceneObject
  mats: StyledMat[]
  style: Style
  hit: SceneObject
  collider: ColliderComponent
  interactable: Interactable
  labels: Text[]
}

interface WireRt {
  conn: ConnectionDef
  root: SceneObject
  segs: SceneObject[]
  segMats: StyledMat[]
  dotMats: StyledMat[]
  dots: SceneObject[]
  pts: vec3[]
  collider: ColliderComponent
  interactable: Interactable
  base: number // base thickness (cm)
  hitSeg: number // segment that carries the pinch collider
}

interface FanBtn {
  key: string
  root: SceneObject
  ring: StyledMat
}

interface FxRt {
  pivot: SceneObject
  kind: "spin" | "arm" | "halo" | "ring"
  axis: vec3
  mats: StyledMat[]
  angle: number
}

export interface FxState {
  glow: number // LED 0..1
  spin: number // motor -1..1
  sweep: boolean // servo
  sound: number // buzzer 0..1
  alert: boolean // hazard flash
}

const ROLE_COLOR: {[r: string]: RGBA} = {
  power: [1.0, 0.35, 0.3, 1],
  ground: [0.45, 0.55, 0.75, 1],
  signal: [1.0, 0.85, 0.3, 1],
  out: [0.4, 0.95, 0.55, 1],
  io: [0.45, 0.85, 1.0, 1],
}

@component
export class WizBench extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">WizBench - Tinkercad-style circuit bench</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Unit cube mesh (1 cm)")
  boxMesh!: RenderMesh
  @input
  @hint("Unit sphere mesh (1 cm)")
  sphereMesh!: RenderMesh
  @input
  @hint("Unit cylinder mesh (1 cm)")
  cylinderMesh!: RenderMesh
  @input
  @hint("Lit glTF material")
  litMaterial!: Material
  @input
  @hint("Unlit material (wires, pin dots)")
  unlitMaterial!: Material
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @widget(new SliderWidget(0.04, 0.2, 0.01))
  @hint("Wire radius in bench cm (bench is drawn about 2x real size)")
  wireThicknessCm: number = 0.11
  @input
  @widget(new SliderWidget(8, 24, 1))
  @hint("Pin label font size")
  labelSize: number = 16
  @input
  @widget(new SliderWidget(2, 14, 0.5))
  @hint("Degrees of board rotation per cm of drag")
  dragDegPerCm: number = 10
  @input
  @hint("Log interaction events (debug)")
  debugLog: boolean = false
  @ui.group_end

  private kit!: PartKit
  private tilt!: SceneObject
  private spin!: SceneObject
  private parts: {[id: string]: BenchPart} = {}
  private partOrder: string[] = []
  private wires: WireRt[] = []
  private pinDots: {[key: string]: SceneObject} = {}
  private pinDotMats: {[key: string]: StyledMat} = {}
  private loaded: boolean = false
  private wireMode: "off" | "all" | "ids" = "off"
  private wireIds: string[] = []
  private activeWire: string = ""
  private partsInteractive: boolean = true
  private wiresInteractive: boolean = false
  private yawDeg: number = 0
  private yawCur: number = 0
  private dragging: boolean = false
  private dragAccum: number = 0
  private selectedPart: string = ""
  private labelsOn: boolean = true
  private connectedSet: {[id: string]: boolean} | null = null
  private started: boolean = false
  private startQ: (() => void)[] = []
  // ---- Circuit Lab (free wiring) ----
  private labOn: boolean = false
  private userWires: WireRt[] = []
  private fan: SceneObject | null = null
  private fanBtns: FanBtn[] = []
  private fanPart: string = ""
  private fx: {[id: string]: FxRt} = {}
  private fxState: {[id: string]: FxState} = {}
  private pinMark: {[key: string]: boolean} = {}
  private clock: number = 0
  private sch: WizSchematic | null = null
  private railIds: string[] = []
  private labView: "diagram" | "3d" = "diagram"
  private asm: {ids: string[]; i: number; t: number; phase: "parts" | "wires" | "done"; wi: number; wt: number; wires: WireRt[]} | null = null
  private hand: SceneObject | null = null
  private handIndex: SceneObject | null = null
  private handThumb: SceneObject | null = null
  private _onPinPicked = new Event<string>()
  readonly onPinPicked: PublicApi<string> = this._onPinPicked.publicApi()

  private _onPartSelected = new Event<string>()
  private _onPartHover = new Event<string>()
  private _onWireSelected = new Event<string>()
  readonly onPartSelected: PublicApi<string> = this._onPartSelected.publicApi()
  readonly onPartHover: PublicApi<string> = this._onPartHover.publicApi()
  readonly onWireSelected: PublicApi<string> = this._onWireSelected.publicApi()

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => {
      this.started = true
      const q = this.startQ
      this.startQ = []
      for (let i = 0; i < q.length; i++) q[i]()
    })
    this.build()
    this.createEvent("UpdateEvent").bind(() => this.update(getDeltaTime()))
  }

  private whenStarted(fn: () => void) {
    if (this.started) fn()
    else this.startQ.push(fn)
  }

  private build() {
    try {
      this.kit = new PartKit(this.boxMesh, this.sphereMesh, this.cylinderMesh, this.litMaterial, this.unlitMaterial)
      const pl = PROJECT_PACK.placement
      this.tilt = this.kit.obj(this.sceneObject, "Tilt")
      this.tilt.getTransform().setLocalRotation(quat.fromEulerVec(new vec3(pl.benchTiltDeg * DEG, 0, 0)))
      this.tilt.getTransform().setLocalScale(new vec3(pl.benchScale, pl.benchScale, pl.benchScale))
      this.spin = this.kit.obj(this.tilt, "Spin")
      this.buildMat()
      this.buildParts()
      this.buildPins()
      this.buildWires()
      this.sch = new WizSchematic(this.kit, this.sceneObject)
      this.sch.onPartTap.add((id) => {
        if (this.labOn && this.loaded) this._onPartSelected.invoke(id)
      })
    } catch (e) {
      print("[WizBench] build failed: " + e + " " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  /** Project switch: rebuild the bench from the current PROJECT_PACK. */
  reload() {
    const old = this.tilt
    if (old) {
      old.enabled = false
      old.name = "Tilt_old"
      const d = this.createEvent("DelayedCallbackEvent")
      d.bind(() => {
        if (!isNull(old)) old.destroy()
      })
      d.reset(1.0)
    }
    if (this.sch) {
      this.sch.root.enabled = false
      this.sch.root.name = "Schematic_old"
      const so = this.sch.root
      const dd = this.createEvent("DelayedCallbackEvent")
      dd.bind(() => {
        if (!isNull(so)) so.destroy()
      })
      dd.reset(1.0)
      this.sch = null
    }
    this.parts = {}
    this.partOrder = []
    this.wires = []
    this.pinDots = {}
    this.pinDotMats = {}
    this.userWires = []
    this.fan = null
    this.fanBtns = []
    this.fanPart = ""
    this.fx = {}
    this.fxState = {}
    this.pinMark = {}
    this.labOn = false
    this.asm = null
    this.hand = null
    this.handIndex = null
    this.handThumb = null
    this.wireMode = "off"
    this.wireIds = []
    this.activeWire = ""
    this.yawDeg = 0
    this.yawCur = 0
    this.selectedPart = ""
    this.connectedSet = null
    this.build()
    this.sceneObject.enabled = this.loaded
  }

  // ---------------------------------------------------------------- building
  private buildMat() {
    const bm = PROJECT_PACK.placement.benchMat
    const w = bm ? bm.w : 14.6
    const d = bm ? bm.d : 14.2
    const cz = 0.6
    const crumb = bm && bm.style === "breadboard"
    this.kit.shape(this.spin, "box", [0, -0.2, cz], [w, 0.3, d], crumb ? [0.88, 0.88, 0.84, 1] : [0.06, 0.1, 0.13, 1], "mat", false)
    const lc: RGBA = crumb ? [0.45, 0.46, 0.5, 1] : [0.12, 0.22, 0.28, 1]
    if (crumb) {
      // Tinkercad-style breadboard: power rails (red / blue), a centre channel and hole columns
      this.kit.shape(this.spin, "box", [0, -0.03, cz - d / 2 + 0.7], [w - 0.6, 0.02, 0.18], [0.9, 0.2, 0.2, 1], "rail_plus", false)
      this.kit.shape(this.spin, "box", [0, -0.03, cz - d / 2 + 1.25], [w - 0.6, 0.02, 0.18], [0.2, 0.35, 0.9, 1], "rail_minus", false)
      this.kit.shape(this.spin, "box", [0, -0.03, cz + d / 2 - 0.7], [w - 0.6, 0.02, 0.18], [0.9, 0.2, 0.2, 1], "rail_plus2", false)
      this.kit.shape(this.spin, "box", [0, -0.03, cz + d / 2 - 1.25], [w - 0.6, 0.02, 0.18], [0.2, 0.35, 0.9, 1], "rail_minus2", false)
      this.kit.shape(this.spin, "box", [0, -0.03, cz], [w - 0.6, 0.02, 0.5], [0.3, 0.3, 0.33, 1], "channel", false)
      const cols = Math.floor((w - 2) / 0.9)
      for (let i = 0; i < cols; i++) {
        const x = -((cols - 1) * 0.9) / 2 + i * 0.9
        this.kit.shape(this.spin, "box", [x, -0.03, cz - 1.7], [0.1, 0.02, 1.7], lc, "hc" + i, false)
        this.kit.shape(this.spin, "box", [x, -0.03, cz + 1.7], [0.1, 0.02, 1.7], lc, "hd" + i, false)
      }
    } else {
      for (let x = -6; x <= 6; x += 2) this.kit.shape(this.spin, "box", [x, -0.03, cz], [0.04, 0.02, d - 0.4], lc, "gx" + x, false)
      for (let z = -6; z <= 7; z += 2) this.kit.shape(this.spin, "box", [0, -0.03, z], [w - 0.4, 0.02, 0.04], lc, "gz" + z, false)
    }
    // drag surface for rotating the board
    const hit = this.kit.obj(this.spin, "MatHit", [0, -0.2, cz])
    const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
    const box = Shape.createBoxShape()
    box.size = new vec3(w, 0.6, d)
    col.shape = box
    const it = makeInteractable(hit)
    it.targetingMode = 3
    this.whenStarted(() => {
      it.onDragUpdate.add((e) => {
        const dv = e.planecastDragVector ? e.planecastDragVector : e.dragVector
        if (dv) this.yawDeg = Math.max(-40, Math.min(40, this.yawDeg + dv.x * this.dragDegPerCm))
      })
    })
  }

  private buildParts() {
    const comps = PROJECT_PACK.components
    for (let i = 0; i < comps.length; i++) {
      const def = comps[i]
      if (def.kind !== "electronic" || !def.benchPos) continue
      const root = this.kit.obj(this.spin, def.id, def.benchPos, [0, def.benchYaw ? def.benchYaw : 0, 0])
      const mats = buildElectronic(this.kit, def.id, root)
      const hit = this.kit.obj(root, "bhit_" + def.id)
      const c = colliderCenterFor(def.id)
      const s = colliderSizeFor(def.id)
      hit.getTransform().setLocalPosition(new vec3(c[0], c[1], c[2]))
      const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
      const box = Shape.createBoxShape()
      box.size = new vec3(s[0], s[1], s[2])
      col.shape = box
      const inter = makeInteractable(hit)
      inter.targetingMode = 3
      const part: BenchPart = {def: def, root: root, mats: mats, style: "normal", hit: hit, collider: col, interactable: inter, labels: []}
      this.parts[def.id] = part
      this.partOrder.push(def.id)
      this.bindPart(part)
    }
  }

  private bindPart(part: BenchPart) {
    const it = part.interactable
    this.whenStarted(() => {
      it.onTriggerStart.add(() => {
        this.dragging = false
        this.dragAccum = 0
      })
      it.onDragUpdate.add((e) => {
        const d = e.planecastDragVector ? e.planecastDragVector : e.dragVector
        const dx = d ? d.x : 0
        this.dragAccum += Math.abs(dx)
        if (this.dragAccum > 0.8) this.dragging = true
        if (this.dragging) this.yawDeg = Math.max(-40, Math.min(40, this.yawDeg + dx * this.dragDegPerCm))
      })
      it.onTriggerEnd.add(() => {
        if (!this.dragging && this.partsInteractive && this.loaded) this._onPartSelected.invoke(part.def.id)
        this.dragging = false
      })
      it.onHoverEnter.add(() => {
        if (this.partsInteractive && this.loaded) this._onPartHover.invoke(part.def.id)
      })
      it.onHoverExit.add(() => {
        if (this.partsInteractive && this.loaded) this._onPartHover.invoke("")
      })
    })
  }

  /** Local-to-spin position of a pin (component placed at benchPos with yaw benchYaw). */
  private pinPosSpin(compId: string, pin: string): vec3 {
    const def = getComponent(compId)
    const p = getPin(compId, pin).at
    const yaw = (def.benchYaw ? def.benchYaw : 0) * DEG
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    const bp = def.benchPos as V3
    // R_y(yaw): x' = x c + z s ; z' = -x s + z c
    return new vec3(bp[0] + p[0] * c + p[2] * s, bp[1] + p[1], bp[2] - p[0] * s + p[2] * c)
  }

  private buildPins() {
    const used: {[k: string]: boolean} = {}
    for (const c of PROJECT_PACK.connections) {
      used[c.from.component + "/" + c.from.pin] = true
      used[c.to.component + "/" + c.to.pin] = true
    }
    for (const key in used) {
      const parts = key.split("/")
      const pos = this.pinPosSpin(parts[0], parts[1])
      const dot = this.kit.shape(this.spin, "sphere", [pos.x, pos.y, pos.z], [0.2, 0.2, 0.2], [0.95, 0.95, 0.4, 1], "pin_" + parts[0] + "_" + parts[1], false)
      this.pinDots[key] = dot.obj
      this.pinDotMats[key] = dot.sm
    }
    // pin labels (readable names); drawn lying on the board
    for (const id of this.partOrder) {
      const p = this.parts[id]
      const def = p.def
      if (def.group === "servo" && def.servo) {
        const sl = makeLabel(p.root, "label_" + def.id, def.servo as string, this.labelSize + 3, [0.0, 2.9, 0], LABEL_ACCENT)
        // root is yawed -90: counter-rotate so the name lies flat and reads from the front edge
        sl.getSceneObject().getTransform().setLocalRotation(quat.angleAxis(90 * DEG, vec3.up()).multiply(quat.angleAxis(-90 * DEG, vec3.right())))
        p.labels.push(sl)
        continue
      }
      for (let i = 0; i < def.pins.length; i++) {
        const pin = def.pins[i]
        if (!pin.label) continue
        const key = def.id + "/" + pin.name
        if (def.id === "mcu_s2mini" && !used[key]) continue // only the pins that carry wires get names (others stay clean)
        let off: V3
        const len = pin.label.length
        if (def.id === "mcu_s2mini") off = [pin.at[0] < 0 ? -(0.35 + len * 0.085) : 0.35 + len * 0.085, 0, 0]
        else if (def.id === "servo_header_strip") off = pin.name.charAt(0) === "S" ? [0, 0, 0.62] : [pin.at[0] < 0 ? -0.5 : 0.5, 0, 0]
        else if (def.id === "oled") off = [0, 0, -0.5]
        else if (def.id === "buck_converter") off = [pin.at[0] < 0 ? -0.5 : 0.5, 0, pin.at[2] < 0 ? -0.2 : 0.2]
        else if (def.id === "battery") off = [-0.6, 0, 0]
        else off = [0, 0, 0.55]
        const pos: V3 = [pin.at[0] + off[0], pin.at[1] + 0.05, pin.at[2] + off[2]]
        p.labels.push(makeLabel(p.root, "label_" + pin.name, pin.label, this.labelSize, pos, new vec4(1, 1, 0.75, 1), [-90, 0, 0]))
      }
    }
  }

  private buildWires() {
    const conns = PROJECT_PACK.connections
    for (let i = 0; i < conns.length; i++) this.wires.push(this.makeWire(conns[i]))
  }

  private makeWire(c: ConnectionDef, tidy: boolean = false, ptsIn?: vec3[]): WireRt {
    const a = ptsIn ? ptsIn[0] : this.pinPosSpin(c.from.component, c.from.pin)
    const b = ptsIn ? ptsIn[ptsIn.length - 1] : this.pinPosSpin(c.to.component, c.to.pin)
    const root = this.kit.obj(this.spin, "wire_" + c.id)
    const lift = c.lift
    // tidy (Lab) wires run Manhattan: straight up, along x, along z, straight down; each wire has its own height so they never touch
    const pts = ptsIn
      ? ptsIn
      : tidy
      ? [a, new vec3(a.x, a.y + lift, a.z), new vec3(b.x, a.y + lift, a.z), new vec3(b.x, a.y + lift, b.z), b]
      : [a, new vec3(a.x, a.y + lift, a.z), new vec3(b.x, b.y + lift, b.z), b]
    let hitSeg = 1
    for (let i = 1; i + 1 < pts.length; i++) if (pts[i + 1].sub(pts[i]).length > pts[hitSeg + 1].sub(pts[hitSeg]).length) hitSeg = i
    const base = c.group === "plug" ? this.wireThicknessCm * 0.8 : this.wireThicknessCm
    const segs: SceneObject[] = []
    const segMats: StyledMat[] = []
    const dotMats: StyledMat[] = []
    const dots: SceneObject[] = []
    for (let s = 0; s + 1 < pts.length; s++) {
      const so = this.kit.obj(root, "seg" + s)
      const vis = this.kit.shape(so, "cyl", [0, 0, 0], [base * 2, 1, base * 2], c.color, "mesh", false)
      segs.push(so)
      segMats.push(vis.sm)
    }
    for (let d = 0; d < pts.length; d++) {
      const r = this.kit.shape(root, "sphere", [pts[d].x, pts[d].y, pts[d].z], [base * 2.2, base * 2.2, base * 2.2], c.color, "joint" + d, false)
      dots.push(r.obj)
      dotMats.push(r.sm)
    }
    // pinch collider on the long middle segment
    const hit = this.kit.obj(segs[hitSeg], "whit_" + c.id)
    const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
    const box = Shape.createBoxShape()
    box.size = new vec3(0.5, 1, 0.5)
    col.shape = box
    const it = makeInteractable(hit)
    it.targetingMode = 3
    col.enabled = false
    const w: WireRt = {conn: c, root: root, segs: segs, segMats: segMats, dotMats: dotMats, dots: dots, pts: pts, collider: col, interactable: it, base: base, hitSeg: hitSeg}
    this.layoutWire(w)
    this.whenStarted(() => {
      it.onTriggerEnd.add(() => {
        if (this.wiresInteractive && this.loaded) this._onWireSelected.invoke(c.id)
      })
    })
    return w
  }

  private layoutWire(w: WireRt) {
    for (let s = 0; s < w.segs.length; s++) {
      const a = w.pts[s]
      const b = w.pts[s + 1]
      const d = b.sub(a)
      const len = Math.max(0.02, d.length)
      const tr = w.segs[s].getTransform()
      tr.setLocalPosition(a.add(b).uniformScale(0.5))
      const dir = d.uniformScale(1 / len)
      let q: quat
      if (dir.y < -0.9995) q = quat.fromEulerVec(new vec3(Math.PI, 0, 0))
      else q = quat.rotationFromTo(vec3.up(), dir)
      tr.setLocalRotation(q)
      const mesh = w.segs[s].getChild(0).getTransform()
      mesh.setLocalScale(new vec3(w.base * 2, len, w.base * 2))
      if (s === w.hitSeg) {
        const h = w.segs[s].getChild(1).getComponent("Physics.ColliderComponent") as ColliderComponent
        const sh = h.shape as BoxShape
        sh.size = new vec3(0.9, len, 0.9)
        h.shape = sh
      }
    }
  }

  // ---------------------------------------------------------------- Circuit Lab (free wiring)
  setLab(on: boolean) {
    this.labOn = on
    this.labView = "diagram"
    this.asm = null
    this.tilt.enabled = !on // the Lab wires on the circuit diagram (3D view on request); the 3D bench returns when it ends
    if (this.sch) this.sch.show(on)
    // dense parts (DIP chips, the ESP32 header) would pile their pin names up: the pin picker names them instead
    for (const id of this.partOrder) for (const l of this.parts[id].labels) l.getSceneObject().enabled = this.labsOn(id, on)
    if (on) {
      this.ensureLabPins()
      this.showWires("off")
      this.setWiresInteractive(true)
    } else {
      this.closeFan()
      this.clearFx()
      this.clearUserWires()
      this.pinMark = {}
      for (const key in this.pinDots) this.pinDots[key].enabled = this.usedByGuide(key)
    }
    this.paintPins()
  }

  getKit(): PartKit {
    return this.kit
  }

  /** Lab view: the KiCad-style diagram (wire here) or the 3D bench with the tidy wiring. */
  setLabView(v: "diagram" | "3d") {
    if (!this.labOn) return
    this.labView = v
    this.tilt.enabled = v === "3d"
    if (this.sch) this.sch.show(v === "diagram")
    if (v === "diagram") this.stopAssembly()
  }

  labViewMode(): string {
    return this.labView
  }

  private buildHand() {
    if (this.hand) return
    const k = this.kit
    const col: RGBA = [0.7, 0.92, 1, 1]
    const hand = k.obj(this.spin, "AsmHand")
    k.shape(hand, "box", [0, 0, 0], [1.3, 0.4, 1.2], col, "palm", false)
    for (let i = 0; i < 3; i++) k.shape(hand, "box", [-0.45 + i * 0.45, -0.45, -0.25], [0.3, 0.8, 0.3], col, "curl" + i, false)
    const idx = k.obj(hand, "index", [0.5, -0.2, 0.45])
    k.shape(idx, "box", [0, -0.5, 0], [0.28, 1.1, 0.28], col, "f", false)
    const th = k.obj(hand, "thumb", [-0.5, -0.2, 0.45])
    k.shape(th, "box", [0, -0.45, 0], [0.3, 0.95, 0.3], col, "f", false)
    hand.enabled = false
    this.hand = hand
    this.handIndex = idx
    this.handThumb = th
  }

  private setPinch(open: number) {
    if (!this.handIndex || !this.handThumb) return
    this.handIndex.getTransform().setLocalRotation(quat.angleAxis(-open * 40 * DEG, new vec3(0, 0, 1)))
    this.handThumb.getTransform().setLocalRotation(quat.angleAxis(open * 40 * DEG, new vec3(0, 0, 1)))
  }

  /** Hands assemble the circuit: each part is carried in and set down, then the wires grow in. Test via Play afterwards. */
  assemble() {
    if (!this.labOn || !this.loaded) return
    this.buildHand()
    this.setLabView("3d")
    const ids = this.partOrder.filter((id) => this.isLabPart(this.parts[id].def))
    for (const id of this.partOrder) this.parts[id].root.enabled = !this.isLabPart(this.parts[id].def)
    for (const w of this.userWires) w.root.enabled = false
    this.asm = {ids: ids, i: 0, t: 0, phase: "parts", wi: 0, wt: 0, wires: this.userWires.slice()}
    if (this.hand) this.hand.enabled = true
  }

  isAssembling(): boolean {
    return this.asm !== null
  }

  stopAssembly() {
    const a = this.asm
    if (!a) return
    this.asm = null
    for (const id of this.partOrder) {
      const p = this.parts[id]
      p.root.enabled = true
      const bp = p.def.benchPos
      if (bp) p.root.getTransform().setLocalPosition(new vec3(bp[0], bp[1], bp[2]))
    }
    for (const w of a.wires) if (!isNull(w.root)) w.root.enabled = true
    if (this.hand) this.hand.enabled = false
  }

  private updateAssembly(dt: number) {
    const a = this.asm
    if (!a || !this.hand) return
    if (a.phase === "parts") {
      if (a.i >= a.ids.length) {
        a.phase = "wires"
        return
      }
      const p = this.parts[a.ids[a.i]]
      const bp = p.def.benchPos as V3
      const rest = new vec3(bp[0], bp[1], bp[2])
      const start = new vec3(bp[0] * 0.3 + 4, bp[1] + 11, bp[2] + 7)
      a.t += dt / 0.5
      const e = Math.min(1, a.t)
      const ease = e * e * (3 - 2 * e)
      const pos = start.add(rest.sub(start).uniformScale(ease)).add(new vec3(0, Math.sin(Math.PI * ease) * 2.2, 0))
      p.root.enabled = true
      p.root.getTransform().setLocalPosition(pos)
      this.hand.getTransform().setLocalPosition(pos.add(new vec3(0.2, 1.9, 0.3)))
      this.setPinch(e < 0.9 ? 0.05 : (e - 0.9) * 10)
      if (a.t >= 1) {
        p.root.getTransform().setLocalPosition(rest)
        a.i++
        a.t = 0
      }
    } else if (a.phase === "wires") {
      a.wt += dt
      while (a.wt > 0.12 && a.wi < a.wires.length) {
        a.wt -= 0.12
        const w = a.wires[a.wi++]
        if (!isNull(w.root)) {
          w.root.enabled = true
          const pt = w.pts[0]
          this.hand.getTransform().setLocalPosition(pt.add(new vec3(0.2, 2.0, 0.3)))
        }
      }
      this.setPinch(0.5)
      if (a.wi >= a.wires.length) a.phase = "done"
    } else {
      a.t += dt
      if (a.t > 0.5) this.stopAssembly()
    }
  }

  private labsOn(id: string, labMode: boolean): boolean {
    return !(labMode && this.parts[id].def.pins.length > 6)
  }

  isLab(): boolean {
    return this.labOn
  }

  private usedByGuide(key: string): boolean {
    for (const c of PROJECT_PACK.connections) if (c.from.component + "/" + c.from.pin === key || c.to.component + "/" + c.to.pin === key) return true
    return false
  }

  /** A part the Lab wires: modelled parts, or every electronic part when the pack has no simulator (verified-pin packs). */
  private isLabPart(def: ComponentDef): boolean {
    return def.kind === "electronic" && def.group !== "prop" && (!!def.elec || !hasSim())
  }

  private ensureLabPins() {
    for (const id of this.partOrder) {
      const def = this.parts[id].def
      if (!this.isLabPart(def)) continue
      for (const p of def.pins) {
        const key = id + "/" + p.name
        if (this.pinDots[key]) {
          this.pinDots[key].enabled = true
          continue
        }
        const pos = this.pinPosSpin(id, p.name)
        const dot = this.kit.shape(this.spin, "sphere", [pos.x, pos.y, pos.z], [0.2, 0.2, 0.2], [0.95, 0.95, 0.4, 1], "pin_" + id + "_" + p.name, false)
        this.pinDots[key] = dot.obj
        this.pinDotMats[key] = dot.sm
      }
    }
  }

  private roleOf(key: string): PinRole {
    const parts = key.split("/")
    const def = getComponent(parts[0])
    return def.elec ? pinRole(def.elec.kind, parts[1]) : genericRole(parts[1])
  }

  /** Lab pin dots: coloured by role; marked pins (picked / hinted / wired) are bigger and bright. */
  paintPins() {
    if (!this.labOn) {
      this.refreshWires()
      return
    }
    for (const key in this.pinDots) {
      const m = this.pinMark[key] === true
      const c = ROLE_COLOR[this.roleOf(key)]
      this.pinDotMats[key].set(m ? [1, 1, 1, 1] : [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 1])
      const sc = m ? 0.55 : 0.2
      this.pinDots[key].getTransform().setLocalScale(new vec3(sc, sc, sc))
    }
  }

  setPinMarks(keys: string[]) {
    this.pinMark = {}
    for (const k of keys) this.pinMark[k] = true
    if (this.sch) this.sch.setMarks(keys)
    this.paintPins()
  }

  /** The pin picker: a panel of big round pin buttons for one part. Tapping one raises onPinPicked("part/pin"). */
  openFan(partId: string) {
    this.closeFan()
    const p = this.parts[partId]
    if (!p || !this.isLabPart(p.def)) return
    const def = p.def
    const pins = def.pins.filter((x) => (def.elec ? !tiedDuplicate(def.elec.kind, x.name) : true))
    const n = pins.length
    const cols = n <= 4 ? n : n <= 9 ? 3 : 4
    const rows = Math.ceil(n / cols)
    const cell = 2.4
    const fan = this.kit.obj(this.sceneObject, "PinFan", [0, 7.5, 9])
    this.fan = fan
    this.fanPart = partId
    this.fanBtns = []
    this.kit.shape(fan, "box", [0, 0, -0.2], [cols * cell + 1.0, rows * cell + 2.6, 0.12], [0.05, 0.1, 0.18, 1], "back", false)
    makeLabel(fan, "fanTitle", def.name, 38, [0, (rows * cell) / 2 + 0.7, 0.1], LABEL_ACCENT)
    for (let i = 0; i < n; i++) {
      const c = i % cols
      const r = Math.floor(i / cols)
      const x = (c - (cols - 1) / 2) * cell
      const y = ((rows - 1) / 2 - r) * cell - 0.3
      const key = partId + "/" + pins[i].name
      const col = ROLE_COLOR[this.roleOf(key)]
      const root = this.kit.obj(fan, "fpin_" + pins[i].name, [x, y, 0])
      const ring = this.kit.shape(root, "cyl", [0, 0, 0], [2.05, 0.1, 2.05], col, "ring", false, [90, 0, 0])
      this.kit.shape(root, "cyl", [0, 0, 0.06], [1.8, 0.1, 1.8], [0.06, 0.11, 0.18, 1], "disc", false, [90, 0, 0])
      makeLabel(root, "t", pins[i].label ? (pins[i].label as string) : pins[i].name, pins[i].name.length > 3 ? 26 : 34, [0, 0, 0.14], new vec4(col[0], col[1], col[2], 1))
      const hit = this.kit.obj(root, "fanhit_" + pins[i].name)
      const colr = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
      const box = Shape.createBoxShape()
      box.size = new vec3(2.3, 2.3, 0.8)
      colr.shape = box
      const it = makeInteractable(hit)
      it.targetingMode = 3
      it.onTriggerEnd.add(() => {
        if (this.fan === fan && this.labOn) this._onPinPicked.invoke(key)
      })
      this.fanBtns.push({key: key, root: root, ring: ring.sm})
    }
    this.select(partId)
  }

  closeFan() {
    const old = this.fan
    this.fan = null
    this.fanPart = ""
    this.fanBtns = []
    if (!old) return
    old.enabled = false
    old.name = "PinFan_old"
    const d = this.createEvent("DelayedCallbackEvent")
    d.bind(() => {
      if (!isNull(old)) old.destroy()
    })
    d.reset(0.6)
  }

  fanOpenFor(): string {
    return this.fanPart
  }

  fanPinKeys(): string[] {
    return this.fanBtns.map((b) => b.key)
  }

  /** Test helper: tap a pin button of the open picker exactly as a pinch does. */
  pickPinForTest(key: string) {
    this._onPinPicked.invoke(key)
  }

  addUserWire(id: string, a: string, b: string, color: RGBA) {
    const pa = a.split("/")
    const pb = b.split("/")
    const conn: ConnectionDef = {
      id: id, group: "servo", from: {component: pa[0], pin: pa[1]}, to: {component: pb[0], pin: pb[1]}, label: "", explanation: "", color: color, lift: 0.9 + (this.userWires.length % 12) * 0.3,
    }
    const w = this.makeWire(conn, true)
    w.root.enabled = true
    w.collider.enabled = this.wiresInteractive
    this.userWires.push(w)
    this.userWireColors(w)
    if (this.sch) this.sch.addWire(id, a, b, color)
  }

  private userWireColors(w: WireRt) {
    const c = w.conn.color
    for (let s = 0; s < w.segMats.length; s++) w.segMats[s].set(c)
    for (let d = 0; d < w.dotMats.length; d++) w.dotMats[d].set(c)
  }

  removeUserWire(id: string) {
    if (this.sch) this.sch.removeWire(id)
    for (let i = 0; i < this.userWires.length; i++) {
      if (this.userWires[i].conn.id !== id) continue
      const w = this.userWires[i]
      w.root.enabled = false
      const d = this.createEvent("DelayedCallbackEvent")
      d.bind(() => {
        if (!isNull(w.root)) w.root.destroy()
      })
      d.reset(0.6)
      this.userWires.splice(i, 1)
      return
    }
  }

  /** Smart rails: a supply / ground connection made for the user. Drawn as flags on the circuit diagram, not as wires in 3D. */
  addRail(id: string, a: string, b: string, color: RGBA) {
    this.railIds.push(id)
    if (this.sch) this.sch.addWire(id, a, b, color)
    this.addRailJumper(id, a, b, color)
  }

  // ---- breadboard: the supply rails are the red (+) and blue (-) strips; each rail pin gets a short jumper to its strip ----
  private railJump: {[pin: string]: boolean} = {}

  private railZ(minus: boolean): number {
    const bm = PROJECT_PACK.placement.benchMat
    const d = bm ? bm.d : 14.2
    const cz = 0.6
    return minus ? cz + d / 2 - 1.25 : cz - d / 2 + 0.7
  }

  private jumperTo(pin: string, minus: boolean, color: RGBA, id: string) {
    if (this.railJump[pin + (minus ? "-" : "+")]) return
    this.railJump[pin + (minus ? "-" : "+")] = true
    const pp = pin.split("/")
    const p = this.pinPosSpin(pp[0], pp[1])
    const h = 0.9 + (this.userWires.length % 8) * 0.22
    const z = this.railZ(minus)
    const pts = [p, new vec3(p.x, p.y + h, p.z), new vec3(p.x, p.y + h, z), new vec3(p.x, 0.05, z)]
    const conn: ConnectionDef = {id: id, group: "power", from: {component: pp[0], pin: pp[1]}, to: {component: pp[0], pin: pp[1]}, label: "", explanation: "", color: color, lift: h}
    const w = this.makeWire(conn, true, pts)
    w.root.enabled = this.tilt.enabled
    w.collider.enabled = false
    this.userWires.push(w)
    this.userWireColors(w)
  }

  private addRailJumper(id: string, a: string, b: string, color: RGBA) {
    const rs = PROJECT_PACK.circuit && PROJECT_PACK.circuit.railSrc ? PROJECT_PACK.circuit.railSrc : {plus: ["boost/OUT+"], minus: ["boost/OUT-"]}
    const isPlusSrc = (p: string) => rs.plus.indexOf(p) >= 0
    const isMinusSrc = (p: string) => rs.minus.indexOf(p) >= 0
    const plus = isPlusSrc(a) ? b : isPlusSrc(b) ? a : ""
    const minus = isMinusSrc(a) ? b : isMinusSrc(b) ? a : ""
    if (plus !== "" || minus !== "") {
      const src = plus !== "" ? (isPlusSrc(a) ? a : b) : isMinusSrc(a) ? a : b
      const other = plus !== "" ? plus : minus
      const isMinus = minus !== ""
      const col: RGBA = isMinus ? [0.2, 0.4, 1.0, 1] : [1.0, 0.25, 0.25, 1]
      this.jumperTo(other, isMinus, col, id)
      this.jumperTo(src, isMinus, col, id + "s")
    } else {
      // a short direct jumper (a resistor to its LED, the battery to the booster)
      this.addUserWire(id, a, b, color)
    }
  }

  clearUserWires() {
    const ids = this.userWires.map((w) => w.conn.id)
    for (const id of ids) this.removeUserWire(id)
    for (const id of this.railIds) if (this.sch) this.sch.removeWire(id)
    this.railIds = []
    this.railJump = {}
  }

  userWireList(): {id: string; a: string; b: string}[] {
    return this.userWires.filter((w) => w.conn.id.indexOf("r_") !== 0).map((w) => ({id: w.conn.id, a: w.conn.from.component + "/" + w.conn.from.pin, b: w.conn.to.component + "/" + w.conn.to.pin}))
  }

  // ---- effect indicators on parts (LED glow, motor spin, servo sweep, buzzer ring, hazard flash) ----
  private ensureFx(id: string): FxRt | null {
    if (this.fx[id]) return this.fx[id]
    const p = this.parts[id]
    if (!p || !p.def.elec) return null
    const k = p.def.elec.kind
    let rt: FxRt | null = null
    if (k === "motor") {
      const pivot = this.kit.obj(p.root, "fx_spin", [0, 0.5, 1.95])
      const a = this.kit.shape(pivot, "box", [0, 0, 0], [1.7, 0.14, 0.14], [0.35, 1.0, 1.0, 1], "bar", false)
      const b = this.kit.shape(pivot, "box", [0, 0, 0], [0.14, 1.7, 0.14], [0.35, 1.0, 1.0, 1], "bar2", false)
      rt = {pivot: pivot, kind: "spin", axis: new vec3(0, 0, 1), mats: [a.sm, b.sm], angle: 0}
    } else if (k === "servo") {
      const pivot = this.kit.obj(p.root, "fx_arm", [0, 3.3, 0])
      const a = this.kit.shape(pivot, "box", [0.7, 0, 0], [1.6, 0.14, 0.3], [0.35, 1.0, 1.0, 1], "arm", false)
      rt = {pivot: pivot, kind: "arm", axis: new vec3(0, 1, 0), mats: [a.sm], angle: 0}
    } else if (k === "led") {
      const pivot = this.kit.obj(p.root, "fx_halo", [0, 0.9, 0])
      const a = this.kit.shape(pivot, "sphere", [0, 0, 0], [1.4, 1.4, 1.4], [1.0, 0.45, 0.25, 0.5], "halo", false)
      rt = {pivot: pivot, kind: "halo", axis: new vec3(0, 1, 0), mats: [a.sm], angle: 0}
    } else if (k === "buzzer") {
      const pivot = this.kit.obj(p.root, "fx_ring", [0, 1.4, 0])
      const a = this.kit.shape(pivot, "cyl", [0, 0, 0], [1.6, 0.08, 1.6], [0.35, 1.0, 1.0, 1], "ring", false)
      rt = {pivot: pivot, kind: "ring", axis: new vec3(0, 1, 0), mats: [a.sm], angle: 0}
    }
    if (rt) {
      rt.pivot.enabled = false
      this.fx[id] = rt
    }
    return rt
  }

  setFx(id: string, s: Partial<FxState>) {
    const cur = this.fxState[id] ? this.fxState[id] : {glow: 0, spin: 0, sweep: false, sound: 0, alert: false}
    this.fxState[id] = {glow: s.glow !== undefined ? s.glow : cur.glow, spin: s.spin !== undefined ? s.spin : cur.spin, sweep: s.sweep !== undefined ? s.sweep : cur.sweep,
      sound: s.sound !== undefined ? s.sound : cur.sound, alert: s.alert !== undefined ? s.alert : cur.alert}
    this.ensureFx(id)
    if (this.sch) this.sch.setFx(id, s)
  }

  fxOf(id: string): FxState | null {
    return this.fxState[id] ? this.fxState[id] : null
  }

  clearFx() {
    if (this.sch) this.sch.clearFx()
    for (const id in this.fxState) {
      const p = this.parts[id]
      if (p) for (let i = 0; i < p.mats.length; i++) p.mats[i].applyStyle(p.style)
      if (this.fx[id]) this.fx[id].pivot.enabled = false
    }
    this.fxState = {}
  }

  private updateFx(dt: number) {
    if (this.sch) this.sch.update(dt)
    for (const id in this.fxState) {
      const st = this.fxState[id]
      const p = this.parts[id]
      const rt = this.fx[id]
      if (!p) continue
      // part tint: LED glow / hazard flash
      const glow = st.glow
      for (let i = 0; i < p.mats.length; i++) {
        const b = p.mats[i].base
        if (st.alert) {
          const k = 0.5 + 0.5 * Math.sin(this.clock * 14)
          p.mats[i].set([b[0] * (1 - 0.6 * k) + 1.0 * 0.6 * k, b[1] * (1 - 0.6 * k), b[2] * (1 - 0.6 * k), b[3]])
        } else if (glow > 0.01) p.mats[i].set([Math.min(1, b[0] * (1 - glow) + 1.0 * glow), Math.min(1, b[1] * (1 - glow) + 0.85 * glow), Math.min(1, b[2] * (1 - glow) + 0.4 * glow), b[3]])
        else p.mats[i].applyStyle(p.style)
      }
      if (!rt) continue
      let on = false
      if (rt.kind === "spin") {
        on = Math.abs(st.spin) > 0.01
        rt.angle += st.spin * 540 * dt
        rt.pivot.getTransform().setLocalRotation(quat.angleAxis(rt.angle * DEG, rt.axis))
      } else if (rt.kind === "arm") {
        on = st.sweep
        rt.angle = Math.sin(this.clock * 5) * 40
        rt.pivot.getTransform().setLocalRotation(quat.angleAxis(rt.angle * DEG, rt.axis))
      } else if (rt.kind === "halo") {
        on = glow > 0.02
        const sc = 1.0 + glow * 1.4
        rt.pivot.getTransform().setLocalScale(new vec3(sc, sc, sc))
        rt.mats[0].set([1.0, 0.55, 0.25, 0.25 + 0.35 * glow])
      } else if (rt.kind === "ring") {
        on = st.sound > 0.02
        const sc = 1.0 + 0.6 * ((this.clock * 3) % 1)
        rt.pivot.getTransform().setLocalScale(new vec3(sc, 1, sc))
      }
      rt.pivot.enabled = on
    }
  }

  // ---------------------------------------------------------------- public API
  setLoaded(on: boolean) {
    this.loaded = on
    this.sceneObject.enabled = on
  }

  isLoaded(): boolean {
    return this.loaded
  }

  setPartsInteractive(on: boolean) {
    this.partsInteractive = on
    for (const id of this.partOrder) this.parts[id].collider.enabled = on
  }

  setWiresInteractive(on: boolean) {
    this.wiresInteractive = on
    for (const w of this.wires) w.collider.enabled = on && this.wireShown(w.conn.id)
  }

  setLabelsVisible(on: boolean) {
    this.labelsOn = on
    for (const id of this.partOrder) for (const l of this.parts[id].labels) l.getSceneObject().enabled = on
  }

  showWires(mode: "off" | "all" | "ids", ids?: string[]) {
    this.wireMode = mode
    this.wireIds = ids ? ids : []
    this.refreshWires()
  }

  /** Wire game: connected wires draw bright, the rest dim. null = every wire bright (no game). */
  setConnected(ids: string[] | null) {
    if (ids === null) this.connectedSet = null
    else {
      const m: {[id: string]: boolean} = {}
      for (let i = 0; i < ids.length; i++) m[ids[i]] = true
      this.connectedSet = m
    }
    this.refreshWires()
  }

  isConnected(id: string): boolean {
    return this.connectedSet === null ? true : this.connectedSet[id] === true
  }

  setActiveWire(id: string) {
    this.activeWire = id
    this.refreshWires()
  }

  activeWireId(): string {
    return this.activeWire
  }

  setPartStyle(id: string, style: Style) {
    const p = this.parts[id]
    if (!p) return
    p.style = style
    for (let i = 0; i < p.mats.length; i++) p.mats[i].applyStyle(style)
  }

  setAllPartStyle(style: Style) {
    for (const id of this.partOrder) this.setPartStyle(id, style)
  }

  select(id: string) {
    this.selectedPart = id
    for (const pid of this.partOrder) this.setPartStyle(pid, pid === id ? "highlight" : "normal")
  }

  selected(): string {
    return this.selectedPart
  }

  highlightedParts(): string[] {
    const out: string[] = []
    for (const id of this.partOrder) if (this.parts[id].style === "highlight") out.push(id)
    return out
  }

  resetView() {
    this.yawDeg = 0
  }

  yaw(): number {
    return this.yawDeg
  }

  partIds(): string[] {
    return this.partOrder.slice()
  }

  partObject(id: string): SceneObject {
    return this.parts[id] ? this.parts[id].root : (null as unknown as SceneObject)
  }

  pinWorld(componentId: string, pin: string): vec3 {
    return this.pinDots[componentId + "/" + pin].getTransform().getWorldPosition()
  }

  private wireShown(id: string): boolean {
    if (this.wireMode === "all") return true
    if (this.wireMode === "ids") return this.wireIds.indexOf(id) >= 0
    return false
  }

  private refreshWires() {
    const used: {[k: string]: boolean} = {}
    for (const w of this.wires) {
      const shown = this.wireShown(w.conn.id)
      w.root.enabled = shown
      w.collider.enabled = shown && this.wiresInteractive
      if (!shown) continue
      const active = this.activeWire === w.conn.id
      const anyActive = this.activeWire !== ""
      let k = anyActive ? (active ? 1.0 : 0.55) : 1.0
      if (this.connectedSet !== null && !active && this.connectedSet[w.conn.id] !== true) k = 0.25
      const c = w.conn.color
      const col: RGBA = active ? [Math.min(1, c[0] * 0.5 + 0.5), Math.min(1, c[1] * 0.5 + 0.5), Math.min(1, c[2] * 0.5 + 0.5), 1] : [c[0] * k, c[1] * k, c[2] * k, 1]
      const th = active ? w.base * 2.6 : w.base
      for (let s = 0; s < w.segs.length; s++) {
        w.segMats[s].set(col)
        w.segs[s].getChild(0).getTransform().setLocalScale(new vec3(th * 2, w.segs[s].getChild(0).getTransform().getLocalScale().y, th * 2))
      }
      for (let d = 0; d < w.dots.length; d++) {
        w.dotMats[d].set(col)
        const sc = (d === 0 || d === 3) && active ? w.base * 7 : w.base * 2.2
        w.dots[d].getTransform().setLocalScale(new vec3(sc, sc, sc))
      }
      if (active) {
        used[w.conn.from.component + "/" + w.conn.from.pin] = true
        used[w.conn.to.component + "/" + w.conn.to.pin] = true
      }
    }
    // pin dots: glow on the active wire's ends, dim otherwise
    for (const key in this.pinDots) {
      const on = used[key] === true
      this.pinDotMats[key].set(on ? [1, 1, 0.55, 1] : this.activeWire !== "" ? [0.4, 0.4, 0.22, 1] : [0.95, 0.95, 0.4, 1])
      const sc = on ? 0.5 : 0.18
      this.pinDots[key].getTransform().setLocalScale(new vec3(sc, sc, sc))
    }
  }

  wireEndpointsWorld(): {id: string; a: vec3; b: vec3; from: string; to: string; shown: boolean}[] {
    const out: {id: string; a: vec3; b: vec3; from: string; to: string; shown: boolean}[] = []
    for (const w of this.wires) {
      out.push({
        id: w.conn.id,
        a: w.dots[0].getTransform().getWorldPosition(),
        b: w.dots[3].getTransform().getWorldPosition(),
        from: w.conn.from.component + "/" + w.conn.from.pin,
        to: w.conn.to.component + "/" + w.conn.to.pin,
        shown: w.root.enabled && this.sceneObject.enabled,
      })
    }
    return out
  }

  wireCount(): number {
    return this.wires.length
  }

  worldCentre(): vec3 {
    return this.spin.getTransform().getWorldPosition()
  }

  labelTexts(): string[] {
    const out: string[] = []
    for (const id of this.partOrder) for (const l of this.parts[id].labels) out.push(l.text)
    return out
  }

  getDebug(): {[k: string]: any} {
    return {loaded: this.loaded, wireMode: this.wireMode, activeWire: this.activeWire, selected: this.selectedPart, yaw: this.yawDeg}
  }

  private update(dt: number) {
    this.clock += dt
    if (!this.loaded) return
    if (this.labOn) this.updateFx(dt)
    if (this.asm) this.updateAssembly(dt)
    this.yawCur += (this.yawDeg - this.yawCur) * Math.min(1, dt * 10)
    this.spin.getTransform().setLocalRotation(quat.fromEulerVec(new vec3(0, this.yawCur * DEG, 0)))
  }
}
