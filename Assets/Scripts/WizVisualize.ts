// WizVisualize.ts - VISUALIZE: a virtual TRY-BEFORE-YOU-BUILD workbench. A model (default: the Sesame frame + bottom cover,
//                   or the user's own prefab), its measured interior, a tray of real-size components (+ alternative servos),
//                   fasteners and screwdrivers. Grab, drop, test-fit (green fits / amber tight / red clash), screw things in.
// Owns: model + interior, tray items, drag/drop rules, fit colours, screw action, test-circuit animation, ghost-hand demo.
// Expects @inputs: unit meshes + lit / unlit / face materials (bootstrap) and an optional userModel prefab (Inspector).
// Must not: decide modes or menus (WizMain does) or claim physical correctness: rule-based, standard sizes, virtual only.

import {Interactable, makeInteractable} from "./WizInteract"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {PROJECT_PACK, V3, RGBA, shortName, getComponent, ScrewHole, FastenerDef, ToolDef, PrimDef} from "./ProjectPack"
import {PartKit, StyledMat, buildElectronic} from "./WizParts"
import {fitUserModel} from "./WizUserModel"
import {DimBox, makeLabel, LABEL_ACCENT} from "./WizLabelsUI"
import {OledScreen} from "./WizOled"
import {FitBox, FitItem, evaluate, arrange, recommend, cavitySize, isTight, checkScrew, ScrewResult} from "./WizFit"

const GREEN: RGBA = [0.2, 0.95, 0.45, 0.55]
const RED: RGBA = [1.0, 0.25, 0.2, 0.6]
const AMBER: RGBA = [1.0, 0.75, 0.25, 0.6]
const SIN_TILT = Math.sin(0.9)

type Kind = "component" | "screw" | "driver"
type State = "tray" | "held" | "placed" | "seated"

interface WItem {
  id: string
  kind: Kind
  baseline: boolean // one of the six catalogue components that the verdict counts
  size: V3 // current box size (components) / hit size (screws, drivers)
  color: RGBA
  obj: SceneObject
  body: StyledMat[]
  hit: SceneObject
  collider: ColliderComponent
  label: Text
  home: V3 // resting centre on the tray / rack
  pos: V3 // current centre
  goal: V3
  state: State
  holeId: string // screws: the hole it sits in
  spin: number // screws: 0..1 screwing progress
  flashT: number
  flashColor: RGBA
  yaw: number
}

/** One slot of the parts inventory (WizInventory): what the part is and where it is now. */
export interface InvItem {
  id: string
  kind: Kind
  label: string
  state: string
  size: V3
  color: RGBA
  rule: string
}

export interface TestResults {
  power: boolean
  data: boolean
  servo: boolean
}

interface DemoStep {
  kind: "move" | "grab" | "drop"
  to?: V3
  dur?: number
  id?: string
}

@component
export class WizVisualize extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">WizVisualize - virtual try-before-you-build workbench</span>')
  @ui.separator
  @ui.group_start("Your model")
  @input
  @allowUndefined
  @hint("Optional: drop YOUR own model here (a GLB/FBX/OBJ imported as a prefab). Empty = the bundled Sesame frame. Its interior is estimated from its bounding box.")
  userModel!: ObjectPrefab
  @ui.group_end
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
  @hint("Unlit material (boxes, outlines)")
  unlitMaterial!: Material
  @input
  @hint("Unlit material with Base Texture enabled (simulated OLED)")
  faceMaterial!: Material
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Log events (debug)")
  debugLog: boolean = false
  @ui.group_end

  private kit!: PartKit
  private root!: SceneObject
  private model!: SceneObject
  private modelRoot!: SceneObject
  private cavDim!: DimBox
  private slotDim!: DimBox
  private items: WItem[] = []
  private holes: {def: ScrewHole; obj: SceneObject; sm: StyledMat; filled: boolean; by: string}[] = []
  private cavity: FitBox = {min: [0, 0, 0], max: [1, 1, 1]}
  private cavityBasis: string = "estimated"
  private modelSource: string = "Sesame frame"
  private slots: {[id: string]: V3} = {}
  private slotSizes: {[id: string]: V3} = {} // the (possibly turned) footprint each slot was planned with
  private active: boolean = false
  private paused: boolean = false
  private heldId: string = ""
  private rs: number = 1.6
  private advice: string = ""
  private lastScrew: ScrewResult | null = null
  private clock: number = 0
  // test animation
  private testing: boolean = false
  private testT: number = 0
  private testPath: vec3[] = []
  private testLen: number[] = []
  private pulse!: SceneObject
  private pulseMat!: StyledMat
  private simRoot!: SceneObject
  private simScreen!: OledScreen
  private simBar!: SceneObject
  private results: TestResults | null = null
  // ghost-hand demo
  private hand!: SceneObject
  private handThumb!: SceneObject
  private handIndex!: SceneObject
  private demo: {steps: DemoStep[]; i: number; t: number; from: V3; carry: string} | null = null
  private handPos: V3 = [0, 8, 6]
  private started: boolean = false
  private startQ: (() => void)[] = []
  private userNote: string = ""
  private trayHidden: boolean = false

  private _onChanged = new Event<void>()
  private _onScrew = new Event<string>()
  private _onPlaced = new Event<string>()
  readonly onChanged: PublicApi<void> = this._onChanged.publicApi()
  readonly onScrew: PublicApi<string> = this._onScrew.publicApi()
  readonly onPlaced: PublicApi<string> = this._onPlaced.publicApi()

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
      this.rs = PROJECT_PACK.visualize.scale
      this.root = this.kit.obj(this.sceneObject, "Bench")
      this.root.getTransform().setLocalScale(new vec3(this.rs, this.rs, this.rs))
      this.model = this.kit.obj(this.root, "Model")
      this.modelRoot = this.kit.obj(this.model, "ModelRoot")
      this.buildModel() // measured while the bench is still un-tilted so world AABBs equal local bounds
      this.root.getTransform().setLocalRotation(quat.fromEulerVec(new vec3(0.9, 0, 0)))
      this.cavDim = new DimBox(this.kit, this.model, "Interior", [0.35, 0.95, 1.0, 1], 14)
      this.cavDim.setThickness(0.06)
      this.slotDim = new DimBox(this.kit, this.model, "Slot", [0.3, 1.0, 0.5, 1], 12)
      this.slotDim.setThickness(0.07)
      this.slotDim.setVisible(false)
      this.myModelHoles()
      this.buildItems()
      this.buildHoles()
      this.buildTestProps()
      this.buildHand()
      this.computeSlots()
      this.refresh()
    } catch (e) {
      print("[WizVisualize] build failed: " + e + " " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  /** Project switch: rebuild the workbench for the current PROJECT_PACK. */
  reload() {
    const old = this.root
    if (old) {
      old.enabled = false
      old.name = "Bench_old"
      const d = this.createEvent("DelayedCallbackEvent")
      d.bind(() => {
        if (!isNull(old)) old.destroy()
      })
      d.reset(1.0)
    }
    this.items = []
    this.holes = []
    this.slots = {}
    this.slotSizes = {}
    this.heldId = ""
    this.advice = ""
    this.lastScrew = null
    this.results = null
    this.testing = false
    this.demo = null
    this.build()
    this.sceneObject.enabled = this.active
  }

  // ---------------------------------------------------------------- model + interior
  private buildModel() {
    const d = PROJECT_PACK.visualize.defaultCavity
    if (PROJECT_PACK.identity.id === "my-model" && this.userModel !== undefined && this.userModel !== null && !isNull(this.userModel)) {
      const inst = this.userModel.instantiate(this.modelRoot)
      inst.name = "UserModel"
      this.modelSource = "your model"
      const fit = fitUserModel(inst, this.modelRoot)
      const w = PROJECT_PACK.visualize.wallCm
      this.cavity = {
        min: [fit.min[0] + w, fit.min[1] + w, fit.min[2] + w],
        max: [fit.max[0] - w, fit.max[1] - w, fit.max[2] - w],
      }
      this.cavityBasis = "estimated"
      this.userNote = fit.note
    } else if (PROJECT_PACK.visualize.shell && PROJECT_PACK.visualize.shell.length > 0) {
      this.modelSource = PROJECT_PACK.identity.short ? (PROJECT_PACK.identity.short as string) : PROJECT_PACK.identity.name
      this.buildShell(PROJECT_PACK.visualize.shell)
      this.cavity = {min: [d.min[0], d.min[1], d.min[2]], max: [d.max[0], d.max[1], d.max[2]]}
      this.cavityBasis = d.basis
    } else {
      this.modelSource = "Sesame frame"
      const frame = requireAsset("../Models/Sesame/frame.glb") as ObjectPrefab
      const bottom = requireAsset("../Models/Sesame/bottom_cover.glb") as ObjectPrefab
      frame.instantiate(this.modelRoot).name = "frame"
      bottom.instantiate(this.modelRoot).name = "bottom_cover"
      this.cavity = {min: [d.min[0], d.min[1], d.min[2]], max: [d.max[0], d.max[1], d.max[2]]}
      this.cavityBasis = d.basis
    }
  }

  faceMat(): Material {
    return this.faceMaterial
  }

  userModelNote(): string {
    return this.userNote
  }

  /** My Model: two illustrative screw holes in the measured interior so the screw rules can be tried. */
  private myModelHoles() {
    if (PROJECT_PACK.identity.id !== "my-model") return
    const c = this.cavity
    PROJECT_PACK.guide.screwHoles = [
      {id: "h_a", hostId: "usermodel", at: [c.min[0] + 0.9, c.min[1], c.min[2] + 0.9], dir: [0, -1, 0], type: "M2 self-tapping", diameterMm: 2.0, depthMm: 5, basis: "illustrative"},
      {id: "h_b", hostId: "usermodel", at: [c.max[0] - 0.9, c.min[1], c.max[2] - 0.9], dir: [0, -1, 0], type: "M2 self-tapping", diameterMm: 2.0, depthMm: 5, basis: "illustrative"},
    ]
  }

  /** Generic packs: the enclosure drawn from primitives around the interior (approximate, per the pack). */
  private buildShell(list: PrimDef[]) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i]
      const kind = p.s === "sph" ? "sphere" : p.s === "cyl" ? "cyl" : "box"
      this.kit.shape(this.modelRoot, kind, p.p, p.z, p.c ? p.c : [0.6, 0.62, 0.68, 1], p.n ? p.n : "shell" + i, true, p.r)
    }
  }

  // ---------------------------------------------------------------- tray / rack items
  private makeItemRoot(id: string, kind: Kind, size: V3, color: RGBA, home: V3, baseline: boolean): WItem {
    const obj = this.kit.obj(this.model, "wb_" + id, home)
    const body: StyledMat[] = []
    if (kind === "component") {
      const r = this.kit.shape(obj, "box", [0, 0, 0], size, [color[0], color[1], color[2], 0.9], "box", false)
      r.sm.mat.mainPass.blendMode = BlendMode.Normal
      r.sm.mat.mainPass.depthWrite = false
      body.push(r.sm)
    }
    const hit = this.kit.obj(obj, "wbhit_" + id)
    const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
    const box = Shape.createBoxShape()
    box.size = new vec3(Math.max(size[0], 1.2), Math.max(size[1], 1.2), Math.max(size[2], 1.2))
    col.shape = box
    const inter = makeInteractable(hit)
    inter.targetingMode = 3
    const label = makeLabel(obj, "wblabel_" + id, "", 16, [0, size[1] / 2 + 0.9, 0], LABEL_ACCENT)
    label.getSceneObject().enabled = false
    const it: WItem = {
      id: id, kind: kind, baseline: baseline, size: size, color: color, obj: obj, body: body, hit: hit, collider: col, label: label,
      home: home, pos: [home[0], home[1], home[2]], goal: [home[0], home[1], home[2]], state: "tray", holeId: "", spin: 0, flashT: 0, flashColor: color, yaw: 0,
    }
    this.items.push(it)
    this.whenStarted(() => {
      inter.onTriggerStart.add(() => this.grab(it.id))
      inter.onDragUpdate.add((e) => {
        const d = e.planecastDragVector ? e.planecastDragVector : e.dragVector
        if (d) this.dragBy(it.id, d.x / this.rs, -d.y / (this.rs * SIN_TILT))
      })
      inter.onTriggerEnd.add(() => this.release(it.id))
      inter.onHoverEnter.add(() => {
        it.label.getSceneObject().enabled = true
      })
      inter.onHoverExit.add(() => {
        if (this.heldId !== it.id) it.label.getSceneObject().enabled = false
      })
    })
    return it
  }

  /** Show the part's real model (the same one the bench uses) instead of a plain box; the fit colours tint its materials. */
  private useRealModel(it: WItem) {
    const def = getComponent(it.id)
    if (!def.prims || def.prims.length === 0) return
    const root = this.kit.obj(it.obj, "model", [0, -it.size[1] / 2, 0])
    const mats = buildElectronic(this.kit, it.id, root)
    if (mats.length === 0) return
    it.obj.getChild(0).enabled = false // the placeholder box
    it.body = mats
  }

  private buildItems() {
    const cat = PROJECT_PACK.visualize.catalog
    const rowA = [-5.5, -1.0, 3.0, 6.8]
    const rowB = [-6.2, -3.4, 0.0, 4.2]
    const baseY = -0.1
    for (let i = 0; i < cat.length; i++) {
      const c = cat[i]
      const def = getComponent(c.id)
      const sx = i < 4 ? rowA[i] : rowB[i - 4]
      const z = i < 4 ? 7.5 : 11.2
      const it = this.makeItemRoot(c.id, "component", c.size, def.color, [sx, baseY + c.size[1] / 2, z], true)
      it.label.text = shortName(c.id)
      this.useRealModel(it)
    }
    const alt = PROJECT_PACK.workbench.altServos
    for (let i = 0; i < alt.length; i++) {
      const sz = alt[i].size
      const it = this.makeItemRoot(alt[i].id, "component", sz, alt[i].color, [rowB[2 + i], baseY + sz[1] / 2, 11.2], false)
      it.label.text = alt[i].label
    }
    const fs = PROJECT_PACK.guide.fasteners
    const vs = PROJECT_PACK.workbench.screwVisualScale
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i]
      const len = (f.lengthMm / 10) * vs
      const dia = (f.diameterMm / 10) * vs
      const hs: V3 = [dia * 2, len + 0.4, dia * 2]
      const it = this.makeItemRoot("fx_" + f.id, "screw", hs, f.color, [9.4, baseY + hs[1] / 2, -3.2 + i * 1.7], false)
      const sh = this.kit.shape(it.obj, "cyl", [0, 0, 0], [dia, len, dia], f.color, "shaft", false)
      const hd = this.kit.shape(it.obj, "cyl", [0, len / 2 + 0.1, 0], [dia * 1.9, 0.2, dia * 1.9], f.color, "head", false)
      it.body.push(sh.sm)
      it.body.push(hd.sm)
      it.label.text = f.label
    }
    const ts = PROJECT_PACK.guide.tools
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i]
      const tipC: RGBA = t.head === "phillips" ? [1.0, 0.75, 0.25, 1] : [0.7, 0.55, 0.9, 1]
      const hs: V3 = [1.2, 6.0, 1.2]
      const it = this.makeItemRoot("tool_" + t.id, "driver", hs, tipC, [-9.4, baseY + 3.0, -2.2 + i * 2.2], false)
      const hd = this.kit.shape(it.obj, "cyl", [0, 1.4, 0], [0.9, 3.0, 0.9], [0.2, 0.55, 0.9, 1], "handle", false)
      const sf = this.kit.shape(it.obj, "cyl", [0, -1.6, 0], [0.22, 3.0, 0.22], [0.8, 0.82, 0.86, 1], "shaft", false)
      const tp = this.kit.shape(it.obj, "cyl", [0, -3.2, 0], [0.34, 0.3, 0.34], tipC, "tip", false)
      it.body.push(hd.sm)
      it.body.push(sf.sm)
      it.body.push(tp.sm)
      it.label.text = t.label
    }
  }

  private buildHoles() {
    const hs = PROJECT_PACK.guide.screwHoles
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i]
      const r = this.kit.shape(this.model, "cyl", [h.at[0], h.at[1] + 0.05, h.at[2]], [(h.diameterMm / 10) * 3.2, 0.12, (h.diameterMm / 10) * 3.2], [1.0, 0.75, 0.25, 1], "hole_" + h.id, false)
      this.holes.push({def: h, obj: r.obj, sm: r.sm, filled: false, by: ""})
    }
  }

  private buildTestProps() {
    const p = this.kit.shape(this.model, "sphere", [0, 0, 0], [0.7, 0.7, 0.7], [1, 0.2, 0.2, 1], "pulse", false)
    this.pulse = p.obj
    this.pulseMat = p.sm
    this.pulse.enabled = false
    this.simRoot = this.kit.obj(this.model, "SimRoot")
    const scr = this.kit.obj(this.simRoot, "simScreenFrame", [0, 0, 0])
    scr.enabled = PROJECT_PACK.identity.hasOled === true
    this.kit.shape(scr, "box", [0, 0, -0.05], [2.9, 1.6, 0.1], [0.1, 0.35, 0.75, 1], "simPcb", true)
    const face = this.kit.obj(scr, "simScreen", [0, 0, 0.02], [90, 0, 0])
    face.getTransform().setLocalScale(new vec3(2.17, 0.02, 1.09))
    const rmv = face.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = this.boxMesh
    this.simScreen = new OledScreen()
    const mat = this.faceMaterial.clone()
    mat.mainPass.baseTex = this.simScreen.texture
    mat.mainPass.baseColor = new vec4(1, 1, 1, 1)
    rmv.mainMaterial = mat
    this.simBar = this.kit.shape(this.simRoot, "box", [3.6, 0, 0], [2.2, 0.35, 0.35], [0.9, 0.9, 0.95, 1], "simServoHorn", false).obj
    this.kit.shape(this.simRoot, "cyl", [3.6, 0, -0.25], [0.9, 0.5, 0.9], [0.2, 0.32, 0.62, 1], "simServo", true, [90, 0, 0])
    this.simRoot.enabled = false
  }

  private buildHand() {
    this.hand = this.kit.obj(this.model, "GhostHand", [0, 8, 6])
    const c: RGBA = [0.5, 0.95, 1.0, 0.55]
    const mk = (kind: "box" | "sphere" | "cyl", pos: V3, sc: V3, name: string): SceneObject => {
      const r = this.kit.shape(this.hand, kind, pos, sc, c, name, false)
      r.sm.mat.mainPass.blendMode = BlendMode.Normal
      r.sm.mat.mainPass.depthWrite = false
      return r.obj
    }
    mk("box", [0, 1.4, 0], [1.9, 0.5, 2.2], "palm")
    this.handIndex = mk("sphere", [-0.5, 0.2, 1.6], [0.55, 0.55, 0.55], "indexTip")
    this.handThumb = mk("sphere", [0.7, 0.2, 1.6], [0.55, 0.55, 0.55], "thumbTip")
    mk("cyl", [-0.5, 0.8, 1.2], [0.35, 1.4, 0.35], "indexFinger")
    mk("cyl", [0.7, 0.8, 1.2], [0.35, 1.4, 0.35], "thumbFinger")
    this.hand.enabled = false
  }

  // ---------------------------------------------------------------- interaction
  private find(id: string): WItem | null {
    for (let i = 0; i < this.items.length; i++) if (this.items[i].id === id) return this.items[i]
    return null
  }

  private restY(it: WItem): number {
    return -0.1 + it.size[1] / 2
  }

  /** Pinch on an item: it follows the hand (the drag target is kept per item). */
  grab(id: string) {
    const it = this.find(id)
    if (!it || !this.active) return
    if (this.demo !== null && this.demo.carry !== id) this.cancelDemo()
    if (this.heldId !== "" && this.heldId !== id) this.release(this.heldId)
    this.heldId = id
    it.state = "held"
    it.goal = [it.pos[0], it.pos[1], it.pos[2]]
    it.label.getSceneObject().enabled = true
    if (it.kind === "component" && it.baseline) {
      const s = this.slots[id]
      if (s) {
        this.slotDim.setBox([s[0] - it.size[0] / 2, s[1] - it.size[1] / 2, s[2] - it.size[2] / 2], [s[0] + it.size[0] / 2, s[1] + it.size[1] / 2, s[2] + it.size[2] / 2], it.size, "", 0.1)
        this.slotDim.clearCaptions()
        this.slotDim.setVisible(true)
      }
    }
    this.refresh()
  }

  dragBy(id: string, dx: number, dz: number) {
    const it = this.find(id)
    if (!it || it.state !== "held") return
    it.goal = [it.goal[0] + dx, it.goal[1], it.goal[2] + dz]
  }

  /** Release rules: components rest in the interior (or snap to their green slot) or go back to the tray; screws seat in a hole;
   *  screwdrivers act on a seated screw. */
  release(id: string) {
    const it = this.find(id)
    if (!it || it.state !== "held") return
    if (this.heldId === id) this.heldId = ""
    this.slotDim.setVisible(false)
    it.label.getSceneObject().enabled = false
    const g = it.goal
    if (it.kind === "component") this.dropComponent(it, g)
    else if (it.kind === "screw") this.dropScrew(it, g)
    else this.dropDriver(it, g)
    this.refresh()
  }

  private overCavity(g: V3): boolean {
    const c = this.cavity
    const m = 0.9
    return g[0] > c.min[0] - m && g[0] < c.max[0] + m && g[2] > c.min[2] - m && g[2] < c.max[2] + m
  }

  private dropComponent(it: WItem, g: V3) {
    if (!this.overCavity(g)) {
      this.toTray(it, true)
      return
    }
    const slot = this.slots[it.id]
    if (it.baseline && slot && Math.abs(g[0] - slot[0]) < 1.6 && Math.abs(g[2] - slot[2]) < 1.6) {
      it.goal = [slot[0], slot[1], slot[2]]
      const ss = this.slotSizes[it.id]
      if (ss) {
        it.size = [ss[0], ss[1], ss[2]] // snapping to a slot also turns the part the way the slot was planned
        this.applyItemSize(it)
      }
    } else {
      let base = this.cavity.min[1]
      const hw = it.size[0] / 2
      const hd = it.size[2] / 2
      for (let i = 0; i < this.items.length; i++) {
        const o = this.items[i]
        if (o === it || o.kind !== "component" || o.state !== "placed") continue
        if (Math.abs(o.goal[0] - g[0]) < hw + o.size[0] / 2 - 0.05 && Math.abs(o.goal[2] - g[2]) < hd + o.size[2] / 2 - 0.05) base = Math.max(base, o.goal[1] + o.size[1] / 2)
      }
      it.goal = [g[0], base + it.size[1] / 2, g[2]]
    }
    it.state = "placed"
    this._onPlaced.invoke(it.id)
  }

  private toTray(it: WItem, shake: boolean) {
    it.state = "tray"
    it.goal = [it.home[0], it.home[1], it.home[2]]
    if (shake) {
      it.flashT = 0.5
      it.flashColor = AMBER
    }
  }

  private nearestHole(g: V3, wantFree: boolean): number {
    let best = -1
    let bd = 1.5
    for (let i = 0; i < this.holes.length; i++) {
      const h = this.holes[i]
      if (wantFree && h.filled) continue
      const d = Math.sqrt(Math.pow(h.def.at[0] - g[0], 2) + Math.pow(h.def.at[2] - g[2], 2))
      if (d < bd) {
        bd = d
        best = i
      }
    }
    return best
  }

  private dropScrew(it: WItem, g: V3) {
    const hi = this.nearestHole(g, true)
    if (hi < 0) {
      this.toTray(it, true)
      return
    }
    const h = this.holes[hi]
    for (let i = 0; i < this.items.length; i++) if (this.items[i].kind === "screw" && this.items[i].state === "seated" && this.items[i].holeId === h.def.id) this.toTray(this.items[i], false)
    it.state = "seated"
    it.holeId = h.def.id
    it.goal = [h.def.at[0], h.def.at[1] + it.size[1] / 2, h.def.at[2]]
  }

  private dropDriver(it: WItem, g: V3) {
    let target: WItem | null = null
    let bd = 1.8
    for (let i = 0; i < this.items.length; i++) {
      const s = this.items[i]
      if (s.kind !== "screw" || s.state !== "seated" || s.spin > 0.001) continue
      const d = Math.sqrt(Math.pow(s.goal[0] - g[0], 2) + Math.pow(s.goal[2] - g[2], 2))
      if (d < bd) {
        bd = d
        target = s
      }
    }
    this.toTray(it, false)
    if (target === null) {
      it.flashT = 0.4
      it.flashColor = AMBER
      return
    }
    const tg: WItem = target
    const hole = this.holes.find((h) => h.def.id === tg.holeId)
    const f: FastenerDef | undefined = PROJECT_PACK.guide.fasteners.find((x) => "fx_" + x.id === tg.id)
    const t: ToolDef | undefined = PROJECT_PACK.guide.tools.find((x) => "tool_" + x.id === it.id)
    if (!hole || !f || !t) return
    const res = checkScrew(hole.def, f, t)
    this.lastScrew = res
    if (res.ok) {
      tg.spin = 0.002
      hole.filled = true
      hole.by = f.id
      hole.sm.set([0.3, 1.0, 0.5, 1])
      this._onScrew.invoke("ok")
    } else {
      tg.flashT = 0.6
      tg.flashColor = RED
      this.toTray(tg, false)
      tg.holeId = ""
      this._onScrew.invoke(res.reason)
    }
  }

  // ---------------------------------------------------------------- slots, fit state, verdict
  private baselineFit(): FitItem[] {
    const out: FitItem[] = []
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]
      if (it.kind !== "component" || !it.baseline) continue
      out.push({id: it.id, size: [it.size[0], it.size[1], it.size[2]], center: [0, 0, 0], fixed: this.isFixed(it.id)})
    }
    return out
  }

  private isFixed(id: string): boolean {
    const c = PROJECT_PACK.visualize.catalog.find((x) => x.id === id)
    return !!c && c.fixed === true
  }

  private computeSlots() {
    const r = arrange(this.baselineFit(), this.cavity)
    this.slots = {}
    this.slotSizes = {}
    for (let i = 0; i < r.items.length; i++) {
      this.slots[r.items[i].id] = r.items[i].center
      this.slotSizes[r.items[i].id] = [r.items[i].size[0], r.items[i].size[1], r.items[i].size[2]]
    }
  }

  private placedFit(): FitItem[] {
    const out: FitItem[] = []
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]
      if (it.kind !== "component" || it.state !== "placed") continue
      out.push({id: it.id, size: [it.size[0], it.size[1], it.size[2]], center: [it.goal[0], it.goal[1], it.goal[2]], fixed: true})
    }
    return out
  }

  /** 0 not placed, 4 fits (green), 3 tight (amber), 5 clash / overflow (red) for each of the six catalogue components. */
  verdictStates(): number[] {
    const placed = this.placedFit()
    const r = evaluate(placed, this.cavity)
    const out: number[] = []
    const cat = PROJECT_PACK.visualize.catalog
    for (let i = 0; i < cat.length; i++) {
      const k = placed.findIndex((p) => p.id === cat[i].id)
      if (k < 0) out.push(0)
      else if (!r.fits[k]) out.push(5)
      else out.push(isTight(placed[k], this.cavity, PROJECT_PACK.workbench.tightCm) ? 3 : 4)
    }
    return out
  }

  holeStates(): number[] {
    return this.holes.map((h) => (h.filled ? 4 : 0))
  }

  fitCount(): {count: number; total: number} {
    const v = this.verdictStates()
    let c = 0
    for (let i = 0; i < v.length; i++) if (v[i] === 4 || v[i] === 3) c++
    return {count: c, total: v.length}
  }

  private refresh() {
    const placed = this.placedFit()
    const r = evaluate(placed, this.cavity)
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]
      if (it.kind !== "component") continue
      const k = placed.findIndex((p) => p.id === it.id)
      const c: RGBA = k < 0 ? [it.color[0], it.color[1], it.color[2], 0.9] : !r.fits[k] ? RED : isTight(placed[k], this.cavity, PROJECT_PACK.workbench.tightCm) ? AMBER : GREEN
      it.body[0].set(c)
      it.body[0].base = c
    }
    const c = this.cavity
    this.cavDim.setBox(c.min, c.max, cavitySize(c), "Interior (" + this.cavityBasis + ")", 0.7)
    this.cavDim.setLabelScale(1 / this.rs, 0)
    this.simRoot.getTransform().setLocalPosition(new vec3((c.min[0] + c.max[0]) / 2, c.max[1] + 2.4, (c.min[2] + c.max[2]) / 2))
    this._onChanged.invoke()
  }

  // ---------------------------------------------------------------- actions (menu icons, tests)
  /** Auto-arrange ("Arrange" icon): the six catalogue components go to their rule-based slots; grows the interior when needed. */
  arrangeNow() {
    const base = this.baselineFit()
    const rec = recommend(base, this.cavity)
    this.cavity = rec.cavity
    this.advice = rec.text
    this.slots = {}
    this.slotSizes = {}
    for (let i = 0; i < rec.items.length; i++) {
      this.slots[rec.items[i].id] = rec.items[i].center
      this.slotSizes[rec.items[i].id] = [rec.items[i].size[0], rec.items[i].size[1], rec.items[i].size[2]]
    }
    for (let i = 0; i < rec.items.length; i++) {
      const it = this.find(rec.items[i].id)
      if (!it) continue
      it.size = [rec.items[i].size[0], rec.items[i].size[1], rec.items[i].size[2]]
      it.state = "placed"
      it.goal = [rec.items[i].center[0], rec.items[i].center[1], rec.items[i].center[2]]
      this.applyItemSize(it)
    }
    this.results = null
    this.stopTest()
    this.refresh()
    if (this.debugLog) print("[WizVisualize] arrange: " + rec.text)
  }

  private applyItemSize(it: WItem) {
    if (it.obj.getChildrenCount() > 0) it.obj.getChild(0).getTransform().setLocalScale(new vec3(it.size[0], it.size[1], it.size[2]))
  }

  adviceText(): string {
    return this.advice
  }

  /** Everything back on the tray, holes empty. */
  resetAll() {
    this.cancelDemo()
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]
      it.state = "tray"
      it.goal = [it.home[0], it.home[1], it.home[2]]
      it.pos = [it.home[0], it.home[1], it.home[2]]
      it.spin = 0
      it.holeId = ""
    }
    for (let i = 0; i < this.holes.length; i++) {
      this.holes[i].filled = false
      this.holes[i].sm.set([1.0, 0.75, 0.25, 1])
    }
    this.heldId = ""
    this.advice = ""
    this.results = null
    this.lastScrew = null
    this.stopTest()
    this.slotDim.setVisible(false)
    this.computeSlots()
    this.refresh()
  }

  setActive(on: boolean) {
    this.active = on
    this.sceneObject.enabled = on
    if (on) {
      this.stopTest()
      this.refresh()
    } else this.cancelDemo()
  }

  isActive(): boolean {
    return this.active
  }

  setPaused(on: boolean) {
    this.paused = on
  }

  // ---------------------------------------------------------------- state access for Main / tests
  /** The inventory: every part, screw and tool with its label, size and state (tray / held / placed / seated). */
  inventory(): InvItem[] {
    const out: InvItem[] = []
    for (const it of this.items) {
      let label = it.label.text
      if (it.kind === "component" && PROJECT_PACK.workbench.altServos.find((a) => a.id === it.id)) label = (PROJECT_PACK.workbench.altServos.find((a) => a.id === it.id) as {label: string}).label
      const cat = PROJECT_PACK.visualize.catalog.find((c) => c.id === it.id)
      out.push({id: it.id, kind: it.kind, label: label, state: it.state, size: [it.size[0], it.size[1], it.size[2]], color: it.color, rule: cat && cat.rule ? cat.rule : ""})
    }
    return out
  }

  /** A pinch-drag from outside the model (the inventory slot): world cm in the view plane -> workbench units. */
  dragWorld(id: string, dx: number, dy: number) {
    this.dragBy(id, dx / this.rs, -dy / (this.rs * SIN_TILT))
  }

  /** Inventory mode: parts that are on the tray are not drawn (they live in the inventory slots). */
  setTrayHidden(on: boolean) {
    this.trayHidden = on
  }

  itemState(id: string): string {
    const it = this.find(id)
    return it ? it.state : ""
  }

  itemIds(): string[] {
    return this.items.map((i) => i.id)
  }

  heldItem(): string {
    return this.heldId
  }

  itemCenter(id: string): V3 {
    const it = this.find(id)
    return it ? [it.goal[0], it.goal[1], it.goal[2]] : [0, 0, 0]
  }

  itemFits(id: string): boolean {
    const v = this.verdictStates()
    const k = PROJECT_PACK.visualize.catalog.findIndex((c) => c.id === id)
    return k >= 0 && (v[k] === 4 || v[k] === 3)
  }

  itemColor(id: string): string {
    const v = this.verdictStates()
    const k = PROJECT_PACK.visualize.catalog.findIndex((c) => c.id === id)
    if (k < 0 || v[k] === 0) return "none"
    return v[k] === 5 ? "red" : v[k] === 3 ? "amber" : "green"
  }

  slotOf(id: string): V3 {
    const s = this.slots[id]
    return s ? [s[0], s[1], s[2]] : [0, 0, 0]
  }

  holesFilled(): number {
    let n = 0
    for (let i = 0; i < this.holes.length; i++) if (this.holes[i].filled) n++
    return n
  }

  holeIds(): string[] {
    return this.holes.map((h) => h.def.id)
  }

  holeCenter(id: string): V3 {
    const h = this.holes.find((x) => x.def.id === id)
    return h ? [h.def.at[0], h.def.at[1], h.def.at[2]] : [0, 0, 0]
  }

  lastScrewResult(): ScrewResult | null {
    return this.lastScrew
  }

  interiorCm(): V3 {
    return cavitySize(this.cavity)
  }

  interiorBasis(): string {
    return this.cavityBasis
  }

  source(): string {
    return this.modelSource
  }

  /** Test helper: grab, move the drag target to `at` (model cm, x/z used) and release: the same code path as a hand. */
  dropAt(id: string, at: V3) {
    this.grab(id)
    const it = this.find(id)
    if (!it) return
    it.goal = [at[0], it.goal[1], at[2]]
    this.release(id)
  }

  setCavityForTest(min: V3, max: V3) {
    this.cavity = {min: min, max: max}
    this.cavityBasis = "estimated"
    this.resetAll()
  }

  testResults(): TestResults | null {
    return this.results
  }

  isTesting(): boolean {
    return this.testing
  }

  getDebug(): {[k: string]: any} {
    return {active: this.active, source: this.modelSource, basis: this.cavityBasis, interior: cavitySize(this.cavity), fit: this.fitCount(), holes: this.holesFilled(), testing: this.testing, demo: this.demo !== null}
  }

  // ---------------------------------------------------------------- persistence
  serialize(): {[k: string]: any} {
    const placed: {id: string; c: V3; s: V3}[] = []
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]
      if (it.kind === "component" && it.state === "placed") placed.push({id: it.id, c: [it.goal[0], it.goal[1], it.goal[2]], s: [it.size[0], it.size[1], it.size[2]]})
    }
    const holes: {id: string; by: string}[] = []
    for (let i = 0; i < this.holes.length; i++) if (this.holes[i].filled) holes.push({id: this.holes[i].def.id, by: this.holes[i].by})
    return {placed: placed, holes: holes, cavity: this.cavity}
  }

  restore(data: {[k: string]: any}) {
    if (!data) return
    this.resetAll()
    if (data.cavity) this.cavity = data.cavity as FitBox
    const placed = data.placed as {id: string; c: V3; s: V3}[]
    if (placed) {
      for (let i = 0; i < placed.length; i++) {
        const it = this.find(placed[i].id)
        if (!it) continue
        it.size = placed[i].s
        it.state = "placed"
        it.goal = placed[i].c
        it.pos = [placed[i].c[0], placed[i].c[1], placed[i].c[2]]
        this.applyItemSize(it)
      }
    }
    const holes = data.holes as {id: string; by: string}[]
    if (holes) {
      for (let i = 0; i < holes.length; i++) {
        const h = this.holes.find((x) => x.def.id === holes[i].id)
        const s = this.items.find((x) => x.id === "fx_" + holes[i].by)
        if (!h || !s) continue
        h.filled = true
        h.by = holes[i].by
        h.sm.set([0.3, 1.0, 0.5, 1])
        s.state = "seated"
        s.holeId = h.def.id
        s.spin = 1
        s.goal = [h.def.at[0], h.def.at[1] + s.size[1] / 2 - 0.9, h.def.at[2]]
        s.pos = [s.goal[0], s.goal[1], s.goal[2]]
      }
    }
    this.computeSlots()
    this.refresh()
  }

  // ---------------------------------------------------------------- simulated circuit test (Play icon)
  startTest() {
    const placed = this.placedFit()
    const r = evaluate(placed, this.cavity)
    const fit = (id: string): boolean => {
      const k = placed.findIndex((p) => p.id === id)
      return k >= 0 && r.fits[k]
    }
    const center = (id: string): V3 => {
      const k = placed.findIndex((p) => p.id === id)
      return k >= 0 ? placed[k].center : [0, 0, 0]
    }
    const tc = PROJECT_PACK.visualize.test ? PROJECT_PACK.visualize.test : {power: [], data: [], servo: []}
    let dist = 0
    if (tc.data.length >= 2) {
      const a = center(tc.data[0])
      const b = center(tc.data[1])
      dist = Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2))
    }
    const power = tc.power.length > 0 && tc.power.every((id) => fit(id))
    const data = tc.data.length >= 2 ? fit(tc.data[0]) && fit(tc.data[1]) && dist <= PROJECT_PACK.visualize.leadReachCm : tc.data.length === 1 ? fit(tc.data[0]) : true
    const servo = tc.servo.length > 0 ? tc.servo.every((id) => fit(id)) : true
    this.results = {power: power, data: data, servo: servo}
    this.testPath = []
    const ids = tc.power.concat(tc.data.length >= 2 ? [tc.data[1]] : [])
    if (ids.length === 1) ids.push(ids[0])
    for (let i = 0; i < ids.length; i++) {
      const c = center(ids[i])
      this.testPath.push(new vec3(c[0], c[1], c[2]))
    }
    this.testLen = []
    for (let i = 1; i < this.testPath.length; i++) this.testLen.push(this.testPath[i].sub(this.testPath[i - 1]).length)
    this.testT = 0
    this.testing = true
    this.pulse.enabled = true
    this.simRoot.enabled = true
    const sesame = PROJECT_PACK.identity.id === "sesame-quadruped"
    this.simScreen.setFace(data ? (sesame ? "dance" : "eye_happy") : sesame ? "dead" : "eye_scared", "loop")
    this._onChanged.invoke()
  }

  stopTest() {
    this.testing = false
    if (this.pulse) this.pulse.enabled = false
    if (this.simRoot) this.simRoot.enabled = false
  }

  // ---------------------------------------------------------------- ghost-hand demo ("Show me")
  /** A short wordless demonstration: a ghost hand carries a part to its slot, then a screw to a hole and drives it. Skippable. */
  playDemo() {
    this.resetAll()
    const dm = PROJECT_PACK.visualize.demo
    const steps: DemoStep[] = []
    if (dm) {
      for (let i = 0; i < dm.parts.length; i++) {
        if (!this.find(dm.parts[i])) continue
        const sl = this.slotOf(dm.parts[i])
        const hp = this.itemHome(dm.parts[i])
        steps.push({kind: "move", to: [hp[0], 3, hp[2]], dur: 0.9})
        steps.push({kind: "grab", id: dm.parts[i]})
        steps.push({kind: "move", to: [sl[0], sl[1] + 2.5, sl[2]], dur: 1.2})
        steps.push({kind: "drop"})
      }
      const hole = this.holeCenter(dm.hole)
      const hs = this.itemHome(dm.screw)
      const ht = this.itemHome(dm.tool)
      if (this.find(dm.screw) && this.holes.length > 0) {
        steps.push({kind: "move", to: [hs[0], 3, hs[2]], dur: 0.9})
        steps.push({kind: "grab", id: dm.screw})
        steps.push({kind: "move", to: [hole[0], hole[1] + 3, hole[2]], dur: 1.3})
        steps.push({kind: "drop"})
        if (this.find(dm.tool)) {
          steps.push({kind: "move", to: [ht[0], 3, ht[2]], dur: 0.9})
          steps.push({kind: "grab", id: dm.tool})
          steps.push({kind: "move", to: [hole[0], hole[1] + 4, hole[2]], dur: 1.2})
          steps.push({kind: "drop"})
        }
      }
    }
    steps.push({kind: "move", to: [0, 9, 6], dur: 0.8})
    this.demo = {steps: steps, i: 0, t: 0, from: [this.handPos[0], this.handPos[1], this.handPos[2]], carry: ""}
    this.hand.enabled = true
  }

  private itemHome(id: string): V3 {
    const it = this.find(id)
    return it ? it.home : [0, 0, 0]
  }

  cancelDemo() {
    if (this.demo === null) return
    const c = this.demo.carry
    this.demo = null
    this.hand.enabled = false
    if (c !== "") {
      const it = this.find(c)
      if (it && it.state === "held") {
        this.heldId = ""
        this.toTray(it, false)
      }
    }
  }

  isDemoPlaying(): boolean {
    return this.demo !== null
  }

  private stepDemo(dt: number) {
    const d = this.demo
    if (d === null) return
    if (d.i >= d.steps.length) {
      this.cancelDemo()
      return
    }
    const st = d.steps[d.i]
    if (st.kind === "move" && st.to !== undefined && st.dur !== undefined) {
      d.t += dt
      const k = Math.min(1, d.t / st.dur)
      const e = k * k * (3 - 2 * k)
      this.handPos = [d.from[0] + (st.to[0] - d.from[0]) * e, d.from[1] + (st.to[1] - d.from[1]) * e, d.from[2] + (st.to[2] - d.from[2]) * e]
      if (d.carry !== "") {
        const it = this.find(d.carry)
        if (it) it.goal = [this.handPos[0], it.goal[1], this.handPos[2]]
      }
      if (k >= 1) {
        d.from = [st.to[0], st.to[1], st.to[2]]
        d.t = 0
        d.i++
      }
    } else if (st.kind === "grab" && st.id !== undefined) {
      this.grab(st.id)
      if (this.demo !== null) this.demo.carry = st.id
      d.i++
    } else if (st.kind === "drop") {
      const c = d.carry
      d.carry = ""
      if (c !== "") this.release(c)
      d.i++
    }
    const gap = d.carry !== "" ? 0.1 : 0.6
    this.handIndex.getTransform().setLocalPosition(new vec3(-gap, 0.2, 1.6))
    this.handThumb.getTransform().setLocalPosition(new vec3(gap, 0.2, 1.6))
  }

  // ---------------------------------------------------------------- per frame
  private update(dt: number) {
    if (!this.active) return
    if (dt > 0.1) dt = 0.1
    if (this.paused) dt = 0
    this.clock += dt
    if (this.demo !== null) {
      this.stepDemo(dt)
      this.hand.getTransform().setLocalPosition(new vec3(this.handPos[0], this.handPos[1], this.handPos[2]))
    }
    const sm = Math.min(1, (1 - Math.pow(0.0001, dt)) * 1.6)
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]
      let gy = it.goal[1]
      if (it.state === "held") gy = this.restY(it) + 1.4
      it.pos = [it.pos[0] + (it.goal[0] - it.pos[0]) * sm, it.pos[1] + (gy - it.pos[1]) * sm, it.pos[2] + (it.goal[2] - it.pos[2]) * sm]
      let px = it.pos[0]
      let pyOff = 0
      if (it.flashT > 0) {
        it.flashT = Math.max(0, it.flashT - dt)
        px += Math.sin(it.flashT * 70) * 0.25 * it.flashT * 2
        for (let k = 0; k < it.body.length; k++) it.body[k].set(it.flashT > 0 ? it.flashColor : it.body[k].base)
      }
      if (it.kind === "screw" && it.spin > 0 && it.spin < 1) {
        it.spin = Math.min(1, it.spin + dt / 1.2)
        it.yaw += dt * 14
        pyOff = -0.9 * it.spin
      } else if (it.kind === "screw" && it.spin >= 1) pyOff = -0.9
      it.obj.enabled = !(this.trayHidden && it.state === "tray")
      const t = it.obj.getTransform()
      t.setLocalPosition(new vec3(px, it.pos[1] + pyOff, it.pos[2]))
      t.setLocalRotation(quat.fromEulerVec(new vec3(0, it.yaw, 0)))
    }
    if (this.testing) {
      this.simScreen.tick(dt)
      const wig = this.results !== null && this.results.servo ? Math.sin(this.clock * 6) * 0.6 : 0
      this.simBar.getTransform().setLocalRotation(quat.fromEulerVec(new vec3(0, 0, wig)))
      this.testT += dt * 6
      let rest = this.testT
      let seg = 0
      while (seg < this.testLen.length && rest > this.testLen[seg]) {
        rest -= this.testLen[seg]
        seg++
      }
      if (seg >= this.testLen.length) {
        this.testT = 0
        return
      }
      const a = this.testPath[seg]
      const b = this.testPath[seg + 1]
      const f = this.testLen[seg] > 0.0001 ? rest / this.testLen[seg] : 0
      this.pulse.getTransform().setLocalPosition(a.add(b.sub(a).uniformScale(f)))
      const dataPhase = seg === this.testLen.length - 1
      const ok = this.results !== null && (dataPhase ? this.results.data : this.results.power)
      this.pulseMat.set(ok ? (dataPhase ? [0.3, 0.7, 1.0, 1] : [1.0, 0.25, 0.2, 1]) : [1.0, 0.75, 0.25, 1])
    }
  }
}
