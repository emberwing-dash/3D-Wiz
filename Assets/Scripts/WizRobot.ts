// WizRobot.ts - the Sesame quadruped as seen in AR: real printed parts (converted STL meshes) + real-size electronics,
//               rigged hips/legs, exploded view, life-size / enlarged scale, desk grid, cm dimension boxes, OLED face.
// Owns: part SceneObjects (one per component id), selection colliders, servo-angle rig, desk, dimension boxes, OLED screen.
// Expects @inputs: unit box/sphere/cylinder meshes + lit (glTF) / unlit / face-unlit materials (wired by the scene bootstrap).
// Must not: decide modes (WizMain does), own the test-lab sequences (WizLab does) or create UI panels.

import {Interactable, makeInteractable, toWorld, isSpectacles} from "./WizInteract"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {PROJECT_PACK, ComponentDef, V3, RGBA, getComponent, getPartGuide, SERVO_MAP} from "./ProjectPack"
import {PartKit, StyledMat, Style, buildElectronic, buildPrims, colliderSizeFor, colliderCenterFor} from "./WizParts"
import {DimBox} from "./WizLabelsUI"
import {OledScreen, FaceMode} from "./WizOled"
import {fitUserModel} from "./WizUserModel"

export type Presentation = "desk" | "locator"

interface PartRt {
  def: ComponentDef
  root: SceneObject
  mats: StyledMat[]
  style: Style
  hit: SceneObject
  collider: ColliderComponent
  interactable: Interactable
  f: number
  target: number
  hipOf: string // servo name of the hip that carries this part ("" = none)
  baseRot: quat // fixed orientation (assembledRot)
  // build game
  hidden: boolean // not yet placed: not shown
  tray: boolean // offered to the user: sits on the tray (+ drag offset)
  drag: vec2 // drag offset from the tray position (robot-local cm, view plane)
  dragged: boolean
  popT: number // scale pop after snapping (s)
  flashT: number // cyan flash after snapping (s)
  shakeT: number // wrong-drop shake (s)
  fx: boolean // a colour effect is active and must be restored
  dragT: vec2 // where the hand wants the held part (the displayed drag follows it smoothly)
  yawStep: number // 0 = correct orientation; 1..3 = turned by 90 degrees per step (tap the held part to turn it)
  groups: {[g: string]: SceneObject} // nested pivots of a primitive part (finger segments, horns)
  glow: number // 0..1 glow of an LED-like part
  glowCol: RGBA
}

const DEG = Math.PI / 180

function prefabFor(glb: string): ObjectPrefab {
  switch (glb) {
    case "frame.glb":
      return requireAsset("../Models/Sesame/frame.glb") as ObjectPrefab
    case "bottom_cover.glb":
      return requireAsset("../Models/Sesame/bottom_cover.glb") as ObjectPrefab
    case "top_cover_cat.glb":
      return requireAsset("../Models/Sesame/top_cover_cat.glb") as ObjectPrefab
    case "hip_l1.glb":
      return requireAsset("../Models/Sesame/hip_l1.glb") as ObjectPrefab
    case "hip_r1.glb":
      return requireAsset("../Models/Sesame/hip_r1.glb") as ObjectPrefab
    case "hip_l2.glb":
      return requireAsset("../Models/Sesame/hip_l2.glb") as ObjectPrefab
    case "hip_r2.glb":
      return requireAsset("../Models/Sesame/hip_r2.glb") as ObjectPrefab
    case "foot_l3.glb":
      return requireAsset("../Models/Sesame/foot_l3.glb") as ObjectPrefab
    case "foot_r3.glb":
      return requireAsset("../Models/Sesame/foot_r3.glb") as ObjectPrefab
    case "foot_l4.glb":
      return requireAsset("../Models/Sesame/foot_l4.glb") as ObjectPrefab
    case "foot_r4.glb":
      return requireAsset("../Models/Sesame/foot_r4.glb") as ObjectPrefab
    case "rcchassis.glb":
      return requireAsset("../Models/Forrc/rcchassis.glb") as ObjectPrefab
    case "electronicsriser.glb":
      return requireAsset("../Models/Forrc/electronicsriser.glb") as ObjectPrefab
    case "motorclip.glb":
      return requireAsset("../Models/Forrc/motorclip.glb") as ObjectPrefab
    case "motorgear.glb":
      return requireAsset("../Models/Forrc/motorgear.glb") as ObjectPrefab
    case "drivegear.glb":
      return requireAsset("../Models/Forrc/drivegear.glb") as ObjectPrefab
    case "rubberbandwheel.glb":
      return requireAsset("../Models/Forrc/rubberbandwheel.glb") as ObjectPrefab
    case "axleouterspacer.glb":
      return requireAsset("../Models/Forrc/axleouterspacer.glb") as ObjectPrefab
    case "simplesteeringservocap.glb":
      return requireAsset("../Models/Forrc/simplesteeringservocap.glb") as ObjectPrefab
  }
  throw new Error("no prefab for " + glb)
}

function eulerQ(x: number, y: number, z: number): quat {
  return quat.fromEulerVec(new vec3(x * DEG, y * DEG, z * DEG))
}

@component
export class WizRobot extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">WizRobot - Sesame quadruped (real parts, AR desk view)</span>')
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
  @hint("Lit glTF material (cloned per shape for electronics)")
  litMaterial!: Material
  @input
  @hint("Unlit material (desk grid, dimension lines)")
  unlitMaterial!: Material
  @input
  @hint("Unlit material with Base Texture enabled (OLED screen)")
  faceMaterial!: Material
  @input
  @allowUndefined
  @hint("Optional: YOUR model (imported FBX/GLB prefab, see tools/import-model.md). Shown on the desk in the My Model project.")
  userModel!: ObjectPrefab
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @widget(new SliderWidget(2, 14, 0.5))
  @hint("Degrees of yaw per cm of drag")
  dragDegPerCm: number = 14
  @input
  @hint("Log interaction events (debug)")
  debugLog: boolean = false
  @ui.group_end

  private kit!: PartKit
  private parts: {[id: string]: PartRt} = {}
  private partOrder: string[] = []
  private model!: SceneObject
  private rig!: SceneObject
  private deskRoot!: SceneObject
  private deskHit!: SceneObject
  private dimRobot!: DimBox
  private dimPart!: DimBox
  private oled!: OledScreen
  private screenObj!: SceneObject
  private angles: {[s: string]: number} = {R1: 90, R2: 90, L1: 90, L2: 90, R3: 90, R4: 90, L3: 90, L4: 90}
  private loaded: boolean = false
  private exploded: boolean = false
  private enlarged: boolean = false
  private presentation: Presentation = "desk"
  private partsInteractive: boolean = true
  private selectedPart: string = ""
  private yawDeg: number = 0
  private scaleMul: number = 1
  private shift = new vec2(0, 0)
  private dragging: boolean = false
  private dragAccum: number = 0
  private scaleCur: number = 1
  private lift: number = 0
  private groundY = 0 // model height offset so the lowest printed point rests ON the table plane, never in it
  private groundDirty = true
  private groundWait = 0 // frames to let the transforms settle after the workspace moved (bounds read a frame late)
  private lastRoot = new vec3(0, 0, 0)
  private coversVisible: boolean = true
  private legsHidden: boolean = false
  private dimsOn: boolean = true
  private deskPos = new vec3(0, 0, 0)
  private pickId: string = ""
  private ghost!: DimBox
  private ghostOn: boolean = false
  private clock: number = 0
  private confetti: {obj: SceneObject; vel: vec3; life: number}[] = []
  private confettiMats: StyledMat[] = []
  private paused: boolean = false
  private bob: boolean = false
  private region!: SceneObject
  private regionSm!: StyledMat
  private arrowTarget!: SceneObject
  private arrowTargetSm: StyledMat[] = []
  private arrowHeld!: SceneObject
  private arrowHeldSm: StyledMat[] = []
  private pathLine!: SceneObject
  private pathSm!: StyledMat
  private heldOutline!: DimBox
  private lastWrong: string = ""
  private pullDy: number = 0
  private started: boolean = false
  private startQ: (() => void)[] = []
  private propsOn: boolean = false
  private userBounds: {min: V3; max: V3} | null = null
  private userNote: string = ""

  private _onPartSelected = new Event<string>()
  private _onPartHover = new Event<string>()
  readonly onPartSelected: PublicApi<string> = this._onPartSelected.publicApi()
  readonly onPartHover: PublicApi<string> = this._onPartHover.publicApi()
  private _onGrab = new Event<string>()
  private _onSnap = new Event<string>()
  private _onWrong = new Event<string>()
  readonly onGrab: PublicApi<string> = this._onGrab.publicApi()
  readonly onSnap: PublicApi<string> = this._onSnap.publicApi()
  readonly onWrongDrop: PublicApi<string> = this._onWrong.publicApi()
  private _onRotate = new Event<string>()
  private _onPull = new Event<number>()
  private _onDeskTap = new Event<void>()
  readonly onRotate: PublicApi<string> = this._onRotate.publicApi()
  readonly onPull: PublicApi<number> = this._onPull.publicApi()
  readonly onDeskTap: PublicApi<void> = this._onDeskTap.publicApi()

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

  /** Run `fn` once the component has started (immediately if it already has: used after a project switch). */
  private whenStarted(fn: () => void) {
    if (this.started) fn()
    else this.startQ.push(fn)
  }

  private build() {
    try {
      this.kit = new PartKit(this.boxMesh, this.sphereMesh, this.cylinderMesh, this.litMaterial, this.unlitMaterial)
      this.model = this.kit.obj(this.sceneObject, "Model")
      this.rig = this.kit.obj(this.model, "Rig")
      this.resetActs()
      this.buildDesk()
      this.buildParts()
      this.buildScreen()
      this.buildDims()
    } catch (e) {
      print("[WizRobot] build failed: " + e + " " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  /** Project switch: throw the old model away and rebuild from the current PROJECT_PACK. */
  reload() {
    const old: SceneObject[] = []
    if (this.model) old.push(this.model)
    if (this.deskRoot) old.push(this.deskRoot)
    for (let i = 0; i < old.length; i++) {
      old[i].enabled = false
      old[i].name = old[i].name + "_old"
    }
    const d = this.createEvent("DelayedCallbackEvent")
    d.bind(() => {
      for (let i = 0; i < old.length; i++) if (!isNull(old[i])) old[i].destroy()
    })
    d.reset(1.0)
    this.parts = {}
    this.partOrder = []
    this.confetti = []
    this.confettiMats = []
    this.exploded = false
    this.enlarged = false
    this.selectedPart = ""
    this.yawDeg = this.defaultYaw()
    this.shift = new vec2(0, 0)
    this.scaleCur = 1
    this.lift = 0
    this.groundY = 0
    this.groundDirty = true
    this.pickId = ""
    this.ghostOn = false
    this.coversVisible = true
    this.legsHidden = false
    this.propsOn = false
    this.userBounds = null
    this.build()
    this.sceneObject.enabled = this.loaded
  }

  private resetActs() {
    this.angles = {}
    if (PROJECT_PACK.rig.mode === "sesame") {
      for (let i = 0; i < SERVO_MAP.length; i++) this.angles[SERVO_MAP[i].name] = 90
    } else {
      for (let i = 0; i < PROJECT_PACK.rig.acts.length; i++) this.angles[PROJECT_PACK.rig.acts[i].name] = PROJECT_PACK.rig.acts[i].zero
    }
  }

  setPropsVisible(on: boolean) {
    this.propsOn = on
    for (const id of this.partOrder) this.applyVisibility(this.parts[id])
  }

  // ---------------------------------------------------------------- building
  private hideVisuals(so: SceneObject) {
    const v = so.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (!isNull(v)) v.enabled = false
    for (let i = 0; i < so.getChildrenCount(); i++) this.hideVisuals(so.getChild(i))
  }

  private buildDesk() {
    this.deskRoot = this.kit.obj(this.sceneObject, "Desk")
    const w = PROJECT_PACK.placement.deskSize[0]
    const d = PROJECT_PACK.placement.deskSize[1]
    this.kit.shape(this.deskRoot, "box", [0, -0.15, 0], [w, 0.1, d], [0.07, 0.11, 0.15, 1], "slab", false)
    const lineC: RGBA = [0.2, 0.42, 0.52, 1]
    const majorC: RGBA = [0.35, 0.8, 0.95, 1]
    for (let x = -Math.floor(w / 2); x <= Math.floor(w / 2); x += 2) {
      const major = x % 10 === 0
      this.kit.shape(this.deskRoot, "box", [x, -0.08, 0], [major ? 0.1 : 0.05, 0.02, d], major ? majorC : lineC, "gx" + x, false)
    }
    for (let z = -Math.floor(d / 2); z <= Math.floor(d / 2); z += 2) {
      const major = z % 10 === 0
      this.kit.shape(this.deskRoot, "box", [0, -0.08, z], [w, 0.02, major ? 0.1 : 0.05], major ? majorC : lineC, "gz" + z, false)
    }
    // On a phone the real surface is the desk: keep the (invisible) drag surface, hide the dark slab and grid.
    if (!isSpectacles()) this.hideVisuals(this.deskRoot)
    // Drag surface: grab the desk to move the robot around on it.
    this.deskHit = this.kit.obj(this.deskRoot, "DeskHit", [0, -0.1, 0])
    const col = this.deskHit.createComponent("Physics.ColliderComponent") as ColliderComponent
    const box = Shape.createBoxShape()
    box.size = new vec3(w, 0.6, d)
    col.shape = box
    const it = makeInteractable(this.deskHit)
    it.targetingMode = 3
    let deskAccum = 0
    this.whenStarted(() => {
      it.onTriggerStart.add(() => {
        deskAccum = 0
      })
      it.onDragUpdate.add((e) => {
        const dv = e.planecastDragVector ? e.planecastDragVector : e.dragVector
        if (!dv) return
        deskAccum += Math.abs(dv.x) + Math.abs(dv.y)
        const lim = 5
        this.shift.x = Math.max(-lim, Math.min(lim, this.shift.x + dv.x))
        this.shift.y = Math.max(-lim * 0.6, Math.min(lim * 0.6, this.shift.y - dv.y * 0.5))
      })
      it.onTriggerEnd.add(() => {
        if (deskAccum < 0.8 && this.loaded && this.partsInteractive) this._onDeskTap.invoke()
      })
    })
  }

  private buildParts() {
    const comps = PROJECT_PACK.components
    for (let i = 0; i < comps.length; i++) {
      const def = comps[i]
      if (def.deskHidden) continue
      const root = this.kit.obj(this.rig, def.id)
      const mats: StyledMat[] = []
      let groups: {[g: string]: SceneObject} = {}
      if (def.model === "user") {
        this.buildUserModel(def, root, mats)
      } else if (def.prims && def.prims.length > 0) {
        const b = buildPrims(this.kit, def, root)
        for (let k = 0; k < b.mats.length; k++) mats.push(b.mats[k])
        groups = b.groups
      } else if (def.kind === "printed") {
        const inst = prefabFor(def.glb as string).instantiate(root)
        inst.name = "mesh"
        this.collectMeshes(inst, def.color, mats)
      } else {
        const m = buildElectronic(this.kit, def.id, root)
        for (let k = 0; k < m.length; k++) mats.push(m[k])
      }
      // hit box on a unit-scale wrapper (Hard Rule 6)
      const hit = this.kit.obj(root, "hit_" + def.id)
      let size: V3
      let center: V3
      if (def.boundsMin && def.boundsMax) {
        const bmin = def.boundsMin as V3
        const bmax = def.boundsMax as V3
        const piv = def.assembled
        size = [bmax[0] - bmin[0] + 0.2, bmax[1] - bmin[1] + 0.2, bmax[2] - bmin[2] + 0.2]
        center = [(bmin[0] + bmax[0]) / 2 - piv[0], (bmin[1] + bmax[1]) / 2 - piv[1], (bmin[2] + bmax[2]) / 2 - piv[2]]
      } else {
        size = colliderSizeFor(def.id)
        center = colliderCenterFor(def.id)
      }
      hit.getTransform().setLocalPosition(new vec3(center[0], center[1], center[2]))
      const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
      const box = Shape.createBoxShape()
      box.size = new vec3(size[0], size[1], size[2])
      col.shape = box
      const inter = makeInteractable(hit)
      inter.targetingMode = 3
      let hipOf = ""
      if (def.servo && PROJECT_PACK.rig.mode === "sesame") {
        const sv = def.servo as string
        if (sv.charAt(1) === "3" || sv.charAt(1) === "4") {
          // foot / leg servo: carried by the hip of the same side and front/back
          hipOf = sv.charAt(0) + (sv.charAt(1) === "3" ? "1" : "2")
        } else if (def.kind === "printed") hipOf = ""
      }
      const br = def.assembledRot ? eulerQ(def.assembledRot[0], def.assembledRot[1], def.assembledRot[2]) : quat.quatIdentity()
      const part: PartRt = {
        def: def, root: root, mats: mats, style: "normal", hit: hit, collider: col, interactable: inter, f: 0, target: 0, hipOf: hipOf, baseRot: br,
        hidden: false, tray: false, drag: new vec2(0, 0), dragged: false, popT: 0, flashT: 0, shakeT: 0, fx: false,
        dragT: new vec2(0, 0), yawStep: 0, groups: groups, glow: 0, glowCol: [1, 1, 1, 1],
      }
      this.parts[def.id] = part
      this.partOrder.push(def.id)
      this.bindPart(part)
      root.getTransform().setLocalPosition(new vec3(def.assembled[0], def.assembled[1], def.assembled[2]))
      root.getTransform().setLocalRotation(br)
    }
  }

  private collectMeshes(so: SceneObject, color: RGBA, mats: StyledMat[]) {
    const rmv = so.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (!isNull(rmv)) {
      const sm = new StyledMat(rmv.mainMaterial.clone(), color, true)
      rmv.mainMaterial = sm.mat
      mats.push(sm)
    }
    for (let i = 0; i < so.getChildrenCount(); i++) this.collectMeshes(so.getChild(i), color, mats)
  }

  /** My Model: the user's imported prefab stands in for the printed body; its bounds are measured, not assumed. */
  private buildUserModel(def: ComponentDef, root: SceneObject, mats: StyledMat[]) {
    if (this.userModel === undefined || this.userModel === null || isNull(this.userModel)) {
      // no model assigned yet: a plain placeholder block so the project still runs (the README says how to import a real one)
      const m = this.kit.shape(root, "box", [0, def.sizeCm[1] / 2, 0], def.sizeCm, def.color, "placeholder", true)
      mats.push(m.sm)
      def.boundsMin = [-def.sizeCm[0] / 2, 0, -def.sizeCm[2] / 2]
      def.boundsMax = [def.sizeCm[0] / 2, def.sizeCm[1], def.sizeCm[2] / 2]
      this.userNote = "placeholder block (no model assigned)"
      return
    }
    const inst = this.userModel.instantiate(root)
    inst.name = "UserModel"
    const fit = fitUserModel(inst, root)
    def.boundsMin = fit.min
    def.boundsMax = fit.max
    def.sizeCm = [fit.max[0] - fit.min[0], fit.max[1] - fit.min[1], fit.max[2] - fit.min[2]]
    this.userNote = fit.note
    this.collectMeshes(inst, def.color, mats)
  }

  userModelNote(): string {
    return this.userNote
  }

  private bindPart(part: PartRt) {
    const it = part.interactable
    this.whenStarted(() => {
      it.onTriggerStart.add(() => {
        this.dragging = false
        this.dragAccum = 0
        this.pullDy = 0
        if (this.pickId === part.def.id && this.loaded) this._onGrab.invoke(part.def.id)
      })
      it.onDragUpdate.add((e) => {
        const d = e.planecastDragVector ? e.planecastDragVector : e.dragVector
        if (this.pickId === part.def.id && this.loaded) {
          if (d) this.dragMove(d.x, d.y)
          return
        }
        const dx = d ? d.x : 0
        this.dragAccum += Math.abs(dx)
        this.pullDy += d ? d.y : 0
        if (this.dragAccum > 0.8) this.dragging = true
        if (this.dragging) this.yawDeg += dx * this.dragDegPerCm
      })
      it.onTriggerEnd.add(() => {
        if (this.pickId === part.def.id && this.loaded) {
          if (!part.dragged) this.rotatePick() // a plain pinch (no movement) turns the held part by 90 degrees
          else this.dragEnd()
          this.dragging = false
          return
        }
        if (this.debugLog) print("[WizRobot] triggerEnd " + part.def.id + " dragging=" + this.dragging)
        if (this.partsInteractive && this.loaded) {
          if (Math.abs(this.pullDy) > 2.5 && Math.abs(this.pullDy) > this.dragAccum * 0.6) this._onPull.invoke(this.pullDy > 0 ? 1 : -1)
          else if (!this.dragging) this._onPartSelected.invoke(part.def.id)
        }
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

  private buildScreen() {
    this.oled = new OledScreen()
    if (!this.parts["oled"] || !PROJECT_PACK.identity.hasOled) return
    const oled = this.parts["oled"].root
    // active area of the 0.96in panel is about 21.7 x 10.9 mm
    this.screenObj = this.kit.obj(oled, "screen", [0, 0.185, 0.3])
    this.screenObj.getTransform().setLocalScale(new vec3(2.17, 0.02, 1.09))
    const rmv = this.screenObj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = this.boxMesh
    const mat = this.faceMaterial.clone()
    mat.mainPass.baseTex = this.oled.texture
    mat.mainPass.baseColor = new vec4(1, 1, 1, 1)
    rmv.mainMaterial = mat
  }

  private buildDims() {
    this.dimRobot = new DimBox(this.kit, this.model, "RobotDims", [0.35, 0.95, 1.0, 1], 30)
    this.dimPart = new DimBox(this.kit, this.model, "PartDims", [1.0, 0.78, 0.25, 1], 26)
    this.dimPart.setVisible(false)
    this.ghost = new DimBox(this.kit, this.model, "Ghost", [0.35, 1.0, 1.0, 1], 20)
    this.ghost.setThickness(0.14)
    this.ghost.setVisible(false)
    this.heldOutline = new DimBox(this.kit, this.model, "HeldOutline", [0.35, 1.0, 1.0, 1], 20)
    this.heldOutline.setThickness(0.12)
    this.heldOutline.setVisible(false)
    const rg = this.kit.shape(this.model, "box", [0, 0, 0], [1, 1, 1], [0.35, 1.0, 1.0, 0.28], "TargetRegion", false)
    rg.sm.mat.mainPass.blendMode = BlendMode.Normal
    rg.sm.mat.mainPass.depthWrite = false
    this.region = rg.obj
    this.regionSm = rg.sm
    this.region.enabled = false
    const mkArrow = (name: string, mats: StyledMat[]): SceneObject => {
      const root = this.kit.obj(this.model, name)
      const shaft = this.kit.shape(root, "cyl", [0, 0.8, 0], [0.18, 1.6, 0.18], [0.35, 1.0, 1.0, 1], "shaft", false)
      const tip = this.kit.shape(root, "sphere", [0, 1.75, 0], [0.5, 0.5, 0.5], [0.35, 1.0, 1.0, 1], "tip", false)
      mats.push(shaft.sm)
      mats.push(tip.sm)
      root.enabled = false
      return root
    }
    this.arrowTarget = mkArrow("ArrowTarget", this.arrowTargetSm)
    this.arrowHeld = mkArrow("ArrowHeld", this.arrowHeldSm)
    const pl = this.kit.shape(this.model, "cyl", [0, 0, 0], [0.07, 1, 0.07], [0.35, 1.0, 1.0, 1], "PathLine", false)
    this.pathLine = pl.obj
    this.pathSm = pl.sm
    this.pathLine.enabled = false
    this.refreshDims()
  }

  // ---------------------------------------------------------------- public API: state
  setLoaded(on: boolean) {
    this.groundDirty = true
    this.loaded = on
    this.sceneObject.enabled = on
  }

  isLoaded(): boolean {
    return this.loaded
  }

  setPresentation(p: Presentation, deskWorld: vec3, locatorWorld: vec3) {
    this.groundDirty = true
    this.presentation = p
    this.deskPos = p === "desk" ? deskWorld : locatorWorld
    this.sceneObject.getTransform().setWorldPosition(toWorld(this.sceneObject, this.deskPos))
    this.deskRoot.enabled = p === "desk"
    this.refreshDims()
  }

  getPresentation(): Presentation {
    return this.presentation
  }

  setExploded(on: boolean) {
    this.exploded = on
    for (const id of this.partOrder) this.parts[id].target = on ? 1 : 0
    this.refreshDims()
  }

  isExploded(): boolean {
    return this.exploded
  }

  setPartExploded(id: string, on: boolean) {
    if (this.parts[id]) this.parts[id].target = on ? 1 : 0
  }

  explodedFraction(id: string): number {
    return this.parts[id] ? this.parts[id].f : 0
  }

  setEnlarged(on: boolean) {
    this.groundDirty = true
    this.enlarged = on
    this.legsHidden = on
    for (const id of this.partOrder) this.applyVisibility(this.parts[id])
    this.refreshDims()
  }

  isEnlarged(): boolean {
    return this.enlarged
  }

  /** Scale actually applied to the model (life-size = 1). */
  targetScale(): number {
    return this.baseScale() * this.scaleMul
  }

  /** Drive mode shrinks the car so it has room to drive on the desk. */
  setScaleMul(k: number) {
    this.scaleMul = k
  }

  private baseScale(): number {
    if (this.presentation === "locator") return PROJECT_PACK.placement.locatorScale
    const ms = PROJECT_PACK.placement.modelScale !== undefined ? (PROJECT_PACK.placement.modelScale as number) : 1
    if (!this.enlarged) return ms
    return (this.exploded ? PROJECT_PACK.placement.enlargeExploded : PROJECT_PACK.placement.enlarge) * ms
  }

  currentScale(): number {
    return this.scaleCur
  }

  setCoverVisible(on: boolean) {
    this.groundDirty = true
    this.coversVisible = on
    for (const id of this.partOrder) this.applyVisibility(this.parts[id])
  }

  private applyVisibility(p: PartRt) {
    let vis = true
    const isLeg = PROJECT_PACK.rig.mode === "sesame" && (p.def.group === "hip" || p.def.group === "foot" || p.def.group === "servo")
    if (this.legsHidden && isLeg) vis = false
    if (p.hidden) vis = false
    if (p.def.group === "prop" && !this.propsOn) vis = false
    if (!this.coversVisible && (p.def.id === "top_cover_cat" || p.def.id === "bottom_cover" || p.def.group === "cover")) vis = false
    p.root.enabled = vis
  }

  /** X-ray: the printed body drawn see-through (alpha) so the parts and wires inside read clearly; false = solid again. */
  setPrintedXray(on: boolean, alpha: number = 0.28) {
    for (const id of this.partOrder) {
      const p = this.parts[id]
      if (p.def.kind !== "printed") continue
      for (const m of p.mats) {
        if (on) m.setAlpha(alpha)
        else m.applyStyle("normal")
      }
    }
  }

  /** Hide / show the printed body so the circuit inside is seen on its own. */
  setPrintedHidden(on: boolean) {
    for (const id of this.partOrder) {
      const p = this.parts[id]
      if (p.def.kind === "printed") {
        p.hidden = on
        this.applyVisibility(p)
      }
    }
  }

  setPartsInteractive(on: boolean) {
    this.partsInteractive = on
  }

  setDimsVisible(on: boolean) {
    this.dimsOn = on
    this.dimRobot.setVisible(on && this.presentation === "desk")
  }

  dimsVisible(): boolean {
    return this.dimsOn
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
    this.refreshPartDims()
  }

  selected(): string {
    return this.selectedPart
  }

  highlightedParts(): string[] {
    const out: string[] = []
    for (const id of this.partOrder) if (this.parts[id].style === "highlight") out.push(id)
    return out
  }

  private defaultYaw(): number {
    return PROJECT_PACK.placement.viewYaw !== undefined ? (PROJECT_PACK.placement.viewYaw as number) : 0
  }

  /** Drive mode: place the model on the desk (x, z in workbench cm) and turn it (degrees about the vertical axis). */
  setPoseXZ(x: number, z: number, yaw: number) {
    this.shift = new vec2(x, z)
    this.yawDeg = yaw
  }

  poseXZ(): {x: number; z: number; yaw: number} {
    return {x: this.shift.x, z: this.shift.y, yaw: this.yawDeg}
  }

  modelObject(): SceneObject {
    return this.model
  }

  homeYaw(): number {
    return this.defaultYaw()
  }

  resetView() {
    this.yawDeg = this.defaultYaw()
    this.shift = new vec2(0, 0)
  }

  yaw(): number {
    return this.yawDeg
  }

  // ---------------------------------------------------------------- servos + face
  setAngle(servo: string, deg: number) {
    this.angles[servo] = deg
  }

  /** Same as setAngle: generic packs call their actuators "acts" (servo angle, wheel spin, LED level, slide cm ...). */
  setAct(name: string, v: number) {
    this.angles[name] = v
  }

  getAngle(servo: string): number {
    return this.angles[servo]
  }

  setAllAngles(deg: number) {
    if (PROJECT_PACK.rig.mode === "sesame") {
      for (const k in this.angles) this.angles[k] = deg
    } else this.resetActs()
  }

  setFace(name: string, mode: FaceMode) {
    this.oled.setFace(name, mode)
  }

  currentFace(): string {
    return this.oled.faceName()
  }

  oledScreen(): OledScreen {
    return this.oled
  }

  // ---------------------------------------------------------------- dims
  private bodyBounds(): {min: V3; max: V3} {
    const mn: V3 = [1e9, 1e9, 1e9]
    const mx: V3 = [-1e9, -1e9, -1e9]
    const sesame = PROJECT_PACK.rig.mode === "sesame"
    for (const id of this.partOrder) {
      const d = this.parts[id].def
      if (!d.boundsMin || !d.boundsMax || d.group === "prop") continue
      if (sesame && d.kind !== "printed") continue
      if (this.legsHidden && (d.group === "hip" || d.group === "foot")) continue
      for (let k = 0; k < 3; k++) {
        mn[k] = Math.min(mn[k], d.boundsMin[k])
        mx[k] = Math.max(mx[k], d.boundsMax[k])
      }
    }
    return {min: mn, max: mx}
  }

  refreshDims() {
    if (!this.dimRobot) return
    const b = this.bodyBounds()
    const size: V3 = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]
    this.dimRobot.setBox(b.min, b.max, size, this.legsHidden ? "Body (legs hidden), real size" : "Robot, real size (rest pose)", 1.0)
    this.dimRobot.setVisible(this.dimsOn && this.presentation === "desk")
    this.refreshPartDims()
  }

  robotDimsCm(): V3 {
    const b = this.bodyBounds()
    return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]
  }

  dimCaptions(): string[] {
    return this.dimRobot.captions()
  }

  partDimCaptions(): string[] {
    return this.dimPart.captions()
  }

  private refreshPartDims() {
    if (!this.dimPart) return
    const id = this.selectedPart
    if (id === "" || !this.parts[id] || this.presentation !== "desk") {
      this.dimPart.setVisible(false)
      return
    }
    const def = this.parts[id].def
    const b = this.partBounds(def)
    this.dimPart.setBox(b.min, b.max, def.sizeCm, def.name, 0.6)
    this.dimPart.setVisible(this.dimsOn)
  }

  /** Assembled-pose bounds of a part in the robot frame (electronics: centred box from the standard size). */
  private partBounds(def: ComponentDef): {min: V3; max: V3} {
    if (def.boundsMin && def.boundsMax) return {min: def.boundsMin, max: def.boundsMax}
    let sz: V3 = def.sizeCm
    const r = def.assembledRot
    if (r && Math.abs(r[0]) === 90) sz = [sz[0], sz[2], sz[1]]
    const a = def.assembled
    return {min: [a[0] - sz[0] / 2, a[1] - sz[1] / 2, a[2] - sz[2] / 2], max: [a[0] + sz[0] / 2, a[1] + sz[1] / 2, a[2] + sz[2] / 2]}
  }

  // ---------------------------------------------------------------- build game (pick up -> identify -> put there)
  /** Offer `id` on the tray (empty = nothing to pick, e.g. a wiring step). Parts not in `placed` stay hidden. */
  offerPart(id: string, placed: string[]) {
    this.pickId = id
    this.exploded = false
    for (const pid of this.partOrder) {
      const p = this.parts[pid]
      p.hidden = !(placed.indexOf(pid) >= 0 || pid === id)
      p.tray = pid === id
      p.drag = new vec2(0, 0)
      p.dragged = false
      p.f = 0
      p.target = 0
      p.popT = 0
      p.shakeT = 0
      p.dragT = new vec2(0, 0)
      p.yawStep = pid === id ? (this.partOrder.indexOf(pid) % 3) + 1 : 0 // starts turned the wrong way on purpose
      this.applyVisibility(p)
    }
    this.yawDeg = this.defaultYaw()
    this.shift = new vec2(0, 0)
    this.setAllAngles(90)
    if (id !== "") {
      const b = this.partBounds(this.parts[id].def)
      const pad = 0.15
      this.ghost.setBox([b.min[0] - pad, b.min[1] - pad, b.min[2] - pad], [b.max[0] + pad, b.max[1] + pad, b.max[2] + pad], this.parts[id].def.sizeCm, "", 0.1)
      this.ghost.clearCaptions()
      this.ghost.setVisible(true)
      this.ghostOn = true
      // the exact target region (pulsing volume) + the insertion arrow of the guide
      const cx = (b.min[0] + b.max[0]) / 2
      const cy = (b.min[1] + b.max[1]) / 2
      const cz = (b.min[2] + b.max[2]) / 2
      this.region.getTransform().setLocalPosition(new vec3(cx, cy, cz))
      this.region.getTransform().setLocalScale(new vec3(b.max[0] - b.min[0] + 0.1, b.max[1] - b.min[1] + 0.1, b.max[2] - b.min[2] + 0.1))
      this.region.enabled = true
      this.heldOutline.setVisible(false)
      this.pathLine.enabled = true
      const g = getPartGuide(id)
      const fd = g ? g.attach.faceDir : ([0, 1, 0] as V3)
      this.arrowTarget.getTransform().setLocalPosition(new vec3(cx, cy, cz))
      this.arrowTarget.getTransform().setLocalRotation(this.dirQuat(new vec3(fd[0], fd[1], fd[2])))
      this.arrowTarget.enabled = true
      this.arrowHeld.enabled = true
    } else {
      this.ghost.setVisible(false)
      this.ghostOn = false
      this.region.enabled = false
      this.arrowTarget.enabled = false
      this.arrowHeld.enabled = false
      this.pathLine.enabled = false
      this.heldOutline.setVisible(false)
    }
  }

  private dirQuat(d: vec3): quat {
    const len = d.length
    if (len < 0.0001) return quat.quatIdentity()
    const n = d.uniformScale(1 / len)
    if (n.y < -0.9995) return quat.fromEulerVec(new vec3(Math.PI, 0, 0))
    return quat.rotationFromTo(vec3.up(), n)
  }

  /** A plain pinch on the held part turns it by 90 degrees about the vertical axis. */
  rotatePick() {
    const p = this.parts[this.pickId]
    if (!p) return
    p.yawStep = (p.yawStep + 1) % 4
    this._onRotate.invoke(this.pickId)
  }

  pickYawStep(): number {
    const p = this.parts[this.pickId]
    return p ? p.yawStep : -1
  }

  /** "far" | "orientation" | "": why the last drop was rejected. */
  lastWrongReason(): string {
    return this.lastWrong
  }

  /** "wrong" (amber) | "close" (cyan: right way up, not there yet) | "ready" (green: release to snap). */
  pickState(): string {
    const p = this.parts[this.pickId]
    if (!p) return ""
    if (p.yawStep !== 0) return "wrong"
    const tray = PROJECT_PACK.game.tray
    const dx = tray[0] + p.dragT.x - p.def.assembled[0]
    const dy = tray[1] + p.dragT.y - p.def.assembled[1]
    return Math.sqrt(dx * dx + dy * dy) <= PROJECT_PACK.game.snapCm * 1.4 ? "ready" : "close"
  }

  setPaused(on: boolean) {
    this.paused = on
  }

  setBob(on: boolean) {
    this.bob = on
  }

  /** Snap parts into the robot (the parts that travel with the picked one, and Skip). */
  placeParts(ids: string[]) {
    for (const id of ids) {
      const p = this.parts[id]
      if (!p) continue
      p.hidden = false
      p.tray = false
      p.drag = new vec2(0, 0)
      p.f = 0
      p.target = 0
      p.popT = 0.35
      p.flashT = 0.5
      this.applyVisibility(p)
    }
    if (ids.indexOf(this.pickId) >= 0) {
      this.pickId = ""
      this.ghost.setVisible(false)
      this.ghostOn = false
      this.region.enabled = false
      this.arrowTarget.enabled = false
      this.arrowHeld.enabled = false
      this.pathLine.enabled = false
      this.heldOutline.setVisible(false)
    }
    for (const id of ids) if (this.parts[id]) this.parts[id].yawStep = 0
  }

  endGame() {
    this.pickId = ""
    this.ghost.setVisible(false)
    this.ghostOn = false
    this.region.enabled = false
    this.arrowTarget.enabled = false
    this.arrowHeld.enabled = false
    this.pathLine.enabled = false
    this.heldOutline.setVisible(false)
    for (const pid of this.partOrder) {
      const p = this.parts[pid]
      p.hidden = false
      p.tray = false
      p.drag = new vec2(0, 0)
      this.applyVisibility(p)
    }
  }

  currentPick(): string {
    return this.pickId
  }

  isPlacedVisible(id: string): boolean {
    const p = this.parts[id]
    return !!p && !p.hidden && !p.tray
  }

  private dragMove(dx: number, dy: number) {
    const p = this.parts[this.pickId]
    if (!p) return
    const s = Math.max(0.2, this.scaleCur)
    p.dragT = new vec2(p.dragT.x + dx / s, p.dragT.y + dy / s)
    p.dragged = true
  }

  /** Release: snap when within the pack snap radius of the target (view plane), otherwise spring back with a shake. */
  private dragEnd() {
    const id = this.pickId
    const p = this.parts[id]
    if (!p || !p.dragged) return
    p.dragged = false
    const tray = PROJECT_PACK.game.tray
    const tx = p.def.assembled[0]
    const ty = p.def.assembled[1]
    const dist = Math.sqrt(Math.pow(tray[0] + p.dragT.x - tx, 2) + Math.pow(tray[1] + p.dragT.y - ty, 2))
    if (dist <= PROJECT_PACK.game.snapCm && p.yawStep === 0) {
      this.lastWrong = ""
      this.placeParts([id])
      this._onSnap.invoke(id)
    } else {
      this.lastWrong = dist <= PROJECT_PACK.game.snapCm ? "orientation" : "far"
      p.dragT = new vec2(0, 0)
      p.shakeT = 0.5
      p.fx = true
      this._onWrong.invoke(id)
    }
  }

  /** World-space (x, y) movement in cm that brings the offered part onto its target (what a drag must cover). */
  pickDeltaWorld(): vec2 {
    const p = this.parts[this.pickId]
    if (!p) return new vec2(0, 0)
    const tray = PROJECT_PACK.game.tray
    const s = this.scaleCur
    return new vec2((p.def.assembled[0] - tray[0] - p.dragT.x) * s, (p.def.assembled[1] - tray[1] - p.dragT.y) * s)
  }

  /** Test helper: the same path a hand drag takes (grab, move, release). Bypasses hand tracking, not the game rules. */
  simulateDrag(dxWorld: number, dyWorld: number) {
    if (this.pickId === "") return
    this._onGrab.invoke(this.pickId)
    this.dragMove(dxWorld, dyWorld)
    this.dragEnd()
  }

  /** Celebration: confetti-like burst of small spheres. */
  celebrate() {
    if (this.confetti.length === 0) {
      const cols: RGBA[] = [[0.35, 1, 1, 1], [1, 0.75, 0.25, 1], [1, 1, 1, 1], [0.5, 1, 0.7, 1]]
      for (let i = 0; i < PROJECT_PACK.game.confetti; i++) {
        const r = this.kit.shape(this.model, "sphere", [0, 6, 0], [0.5, 0.5, 0.5], cols[i % cols.length], "confetti" + i, false)
        this.confetti.push({obj: r.obj, vel: new vec3(0, 0, 0), life: 0})
        this.confettiMats.push(r.sm)
        r.obj.enabled = false
      }
    }
    for (let i = 0; i < this.confetti.length; i++) {
      const c = this.confetti[i]
      c.obj.enabled = true
      c.obj.getTransform().setLocalPosition(new vec3(0, 5, 2))
      c.vel = new vec3((Math.random() - 0.5) * 16, 6 + Math.random() * 8, (Math.random() - 0.3) * 8)
      c.life = 1.6
    }
  }

  confettiActive(): boolean {
    for (let i = 0; i < this.confetti.length; i++) if (this.confetti[i].life > 0) return true
    return false
  }

  // ---------------------------------------------------------------- queries (tests / debug)
  partIds(): string[] {
    return this.partOrder.slice()
  }

  partObject(id: string): SceneObject {
    return this.parts[id].root
  }

  partHitObject(id: string): SceneObject {
    return this.parts[id].hit
  }

  partWorldPosition(id: string): vec3 {
    return this.parts[id].root.getTransform().getWorldPosition()
  }

  /** World AABB over every enabled printed mesh under the model, optionally restricted to ids. */
  worldBounds(ids?: string[]): {min: vec3; max: vec3} {
    let mn = new vec3(1e9, 1e9, 1e9)
    let mx = new vec3(-1e9, -1e9, -1e9)
    const walk = (so: SceneObject) => {
      const rmv = so.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      if (!isNull(rmv) && so.isEnabledInHierarchy && so.name !== "screen") {
        const a = rmv.worldAabbMin()
        const b = rmv.worldAabbMax()
        mn = new vec3(Math.min(mn.x, a.x), Math.min(mn.y, a.y), Math.min(mn.z, a.z))
        mx = new vec3(Math.max(mx.x, b.x), Math.max(mx.y, b.y), Math.max(mx.z, b.z))
      }
      for (let i = 0; i < so.getChildrenCount(); i++) walk(so.getChild(i))
    }
    for (const id of this.partOrder) {
      if (ids && ids.indexOf(id) < 0) continue
      const p = this.parts[id]
      if (p.def.kind === "printed") walk(p.root)
    }
    return {min: mn, max: mx}
  }

  getDebug(): {[k: string]: any} {
    return {
      loaded: this.loaded,
      exploded: this.exploded,
      enlarged: this.enlarged,
      scale: this.scaleCur,
      selected: this.selectedPart,
      face: this.oled ? this.oled.faceName() : "",
      yaw: this.yawDeg,
      lift: this.lift,
      presentation: this.presentation,
    }
  }

  angleSnapshot(): {[s: string]: number} {
    return {...this.angles}
  }

  // ---------------------------------------------------------------- per-frame
  private update(dt: number) {
    if (dt > 0.1) dt = 0.1
    if (this.paused) dt = 0
    if (!this.loaded || !this.model) return
    // scale + yaw + shift
    const ts = this.targetScale()
    this.scaleCur += (ts - this.scaleCur) * Math.min(1, dt * 8)
    if (Math.abs(ts - this.scaleCur) < 0.002) this.scaleCur = ts
    const s = this.scaleCur
    const mt = this.model.getTransform()
    mt.setLocalScale(new vec3(s, s, s))
    mt.setLocalRotation(quat.fromEulerVec(new vec3(0, this.yawDeg * DEG, 0)))
    if (Math.abs(ts - this.scaleCur) > 0.003) this.groundDirty = true
    const rp = this.sceneObject.getTransform().getWorldPosition()
    if (rp.sub(this.lastRoot).length > 0.001) {
      this.lastRoot = rp
      this.groundDirty = true
      this.groundWait = 3
    }
    if (this.groundDirty) this.settleOnTable()
    mt.setLocalPosition(new vec3(this.shift.x, this.groundY + (this.bob ? Math.sin(this.clock * 2.2) * 0.35 : 0), this.shift.y))
    const sc = 1 / Math.max(0.2, s)
    this.dimRobot.setLabelScale(sc, this.yawDeg * DEG)
    this.dimPart.setLabelScale(sc, this.yawDeg * DEG)
    // explode
    const k = Math.min(1, dt * PROJECT_PACK.placement.explodeSpeed)
    for (const id of this.partOrder) {
      const p = this.parts[id]
      if (Math.abs(p.target - p.f) > 0.001) {
        p.f += (p.target - p.f) * k
        if (Math.abs(p.target - p.f) < 0.003) p.f = p.target
      }
    }
    this.clock += dt
    this.updateFx(dt)
    this.solveRig()
    // selection colliders: hidden-inside parts only selectable once exploded
    for (const id of this.partOrder) {
      const p = this.parts[id]
      const d = p.def
      const outward = d.kind === "printed" || d.outward === true || d.id === "oled" || d.id === "power_switch"
      const inside = this.exploded || p.f > 0.5 || this.presentation === "locator" || !this.coversVisible
      p.collider.enabled = this.partsInteractive && p.root.enabled && d.group !== "prop" && (p.tray || outward || inside)
    }
    this.deskHit.getTransform() // keep reference alive
    if (this.oled) this.oled.tick(dt)
  }

  /** Put the model ON the desk plane: measure its lowest printed point (world) and move the model so it touches the plane exactly. */
  private settleOnTable() {
    if (!this.deskRoot || this.presentation !== "desk") {
      this.groundDirty = false
      return
    }
    if (this.groundWait > 0) {
      this.groundWait--
      return
    }
    const b = this.worldBounds()
    if (b.min.y > 1e8) return // nothing measurable yet: try again next frame
    const planeY = this.deskRoot.getTransform().getWorldPosition().y + 0.1
    const err = planeY - b.min.y
    if (Math.abs(err) < 0.02) {
      this.groundDirty = false
      return
    }
    this.groundY += err
  }

  private updateFx(dt: number) {
    for (const id of this.partOrder) {
      const p = this.parts[id]
      if (p.popT > 0) p.popT = Math.max(0, p.popT - dt)
      if (p.shakeT > 0) p.shakeT = Math.max(0, p.shakeT - dt)
      if (p.flashT > 0) p.flashT = Math.max(0, p.flashT - dt)
      if (p.shakeT > 0) {
        for (let i = 0; i < p.mats.length; i++) p.mats[i].set([1.0, 0.75, 0.25, 1])
        p.fx = true
      } else if (p.flashT > 0) {
        for (let i = 0; i < p.mats.length; i++) p.mats[i].applyStyle("highlight", 1.6)
        p.fx = true
      } else if (p.fx) {
        for (let i = 0; i < p.mats.length; i++) p.mats[i].applyStyle(p.style)
        p.fx = false
      }
    }
    if (this.ghostOn) {
      const k = 0.55 + 0.45 * Math.sin(this.clock * 6)
      const st = this.pickState()
      let col: RGBA = [0.2 + 0.2 * k, 0.6 + 0.4 * k, 1.0, 1] // cyan: right way up, keep going
      if (st === "wrong") col = [1.0, 0.65 + 0.15 * k, 0.15, 1] // amber: wrong orientation
      else if (st === "ready") col = [0.25, 1.0, 0.45, 1] // green: release to snap
      this.ghost.tint(col)
      this.regionSm.set([col[0], col[1], col[2], 0.18 + 0.2 * k])
      for (let i = 0; i < this.arrowTargetSm.length; i++) this.arrowTargetSm[i].set(col)
      const p = this.parts[this.pickId]
      if (p) {
        // held part: bright cyan outline + its own arrow + a faint path line to the target
        const b = this.partBounds(p.def)
        const tp = PROJECT_PACK.game.tray
        const a = p.def.assembled
        const off = new vec3(tp[0] + p.drag.x - a[0], tp[1] + p.drag.y - a[1], tp[2] - a[2])
        const hmin: V3 = [b.min[0] + off.x - 0.1, b.min[1] + off.y - 0.1, b.min[2] + off.z - 0.1]
        const hmax: V3 = [b.max[0] + off.x + 0.1, b.max[1] + off.y + 0.1, b.max[2] + off.z + 0.1]
        this.heldOutline.setBox(hmin, hmax, p.def.sizeCm, "", 0.1)
        this.heldOutline.clearCaptions()
        this.heldOutline.setVisible(true)
        this.heldOutline.tint([0.35, 1.0, 1.0, 1])
        const hc = new vec3((hmin[0] + hmax[0]) / 2, (hmin[1] + hmax[1]) / 2, (hmin[2] + hmax[2]) / 2)
        const tc = new vec3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2)
        const g = getPartGuide(p.def.id)
        const fd = g ? g.attach.faceDir : ([0, 1, 0] as V3)
        // held arrow = the guide direction expressed in the part frame, then turned with the part
        const ra = quat.fromEulerVec(new vec3(0, p.yawStep * 90 * DEG, 0))
        const local = p.baseRot.invert().multiplyVec3(new vec3(fd[0], fd[1], fd[2]))
        const world = ra.multiplyVec3(p.baseRot.multiplyVec3(local))
        this.arrowHeld.getTransform().setLocalPosition(hc)
        this.arrowHeld.getTransform().setLocalRotation(this.dirQuat(world))
        for (let i = 0; i < this.arrowHeldSm.length; i++) this.arrowHeldSm[i].set([0.35, 1.0, 1.0, 1])
        const d = tc.sub(hc)
        const len = Math.max(0.05, d.length)
        const pt = this.pathLine.getTransform()
        pt.setLocalPosition(hc.add(tc).uniformScale(0.5))
        pt.setLocalRotation(this.dirQuat(d))
        pt.setLocalScale(new vec3(0.07, len, 0.07))
        this.pathSm.set([col[0], col[1], col[2], 1])
      }
    }
    for (let i = 0; i < this.confetti.length; i++) {
      const c = this.confetti[i]
      if (c.life <= 0) continue
      c.life -= dt
      if (c.life <= 0) {
        c.obj.enabled = false
        continue
      }
      c.vel = new vec3(c.vel.x, c.vel.y - 14 * dt, c.vel.z)
      const t = c.obj.getTransform()
      t.setLocalPosition(t.getLocalPosition().add(c.vel.uniformScale(dt)))
    }
  }

  private jointRot(servo: string): quat {
    const a = this.angles[servo]
    if (servo.charAt(1) === "1" || servo.charAt(1) === "2") return eulerQ(0, a - 90, 0)
    return quat.quatIdentity()
  }

  private footRot(servo: string): quat {
    const a = this.angles[servo]
    const front = servo.charAt(1) === "3"
    const phi = front ? a - 90 : 90 - a
    return eulerQ(0, 0, phi)
  }

  private solveRig() {
    if (PROJECT_PACK.rig.mode === "sesame") this.solveSesame()
    else this.solveGeneric()
  }

  /** Generic packs: actuators (acts) rotate / move / glow parts and nested groups; the whole model can yaw, roll or lift ("*"). */
  private solveGeneric() {
    const rotM: {[k: string]: quat} = {}
    const movM: {[k: string]: vec3} = {}
    const glowM: {[k: string]: {v: number; col: RGBA}} = {}
    const acts = PROJECT_PACK.rig.acts
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i]
      const v = this.angles[a.name] !== undefined ? this.angles[a.name] : a.zero
      const delta = v - a.zero
      if (Math.abs(delta) < 1e-6) continue
      for (let k = 0; k < a.els.length; k++) {
        const e = a.els[k]
        const key = e.part + "|" + (e.grp ? e.grp : "")
        if (e.op === "rot") {
          const ax = new vec3(e.axis[0], e.axis[1], e.axis[2])
          const q = quat.angleAxis(delta * e.k * DEG, ax.length > 0 ? ax.normalize() : vec3.up())
          rotM[key] = rotM[key] ? q.multiply(rotM[key]) : q
        } else if (e.op === "move") {
          const m = new vec3(e.axis[0] * delta * e.k, e.axis[1] * delta * e.k, e.axis[2] * delta * e.k)
          movM[key] = movM[key] ? movM[key].add(m) : m
        } else {
          const g = Math.max(0, Math.min(1, delta * e.k))
          const prev = glowM[e.part]
          if (!prev || g > prev.v) glowM[e.part] = {v: g, col: [e.axis[0], e.axis[1], e.axis[2], 1]}
        }
      }
    }
    for (const id of this.partOrder) {
      const p = this.parts[id]
      const d = p.def
      if (p.tray) {
        const tp = PROJECT_PACK.game.tray
        const sm = PROJECT_PACK.gesture.followSmooth
        p.drag = new vec2(p.drag.x + (p.dragT.x - p.drag.x) * sm, p.drag.y + (p.dragT.y - p.drag.y) * sm)
        const sh = p.shakeT > 0 ? Math.sin(p.shakeT * 70) * 0.5 * p.shakeT : 0
        p.root.getTransform().setLocalPosition(new vec3(tp[0] + p.drag.x + sh, tp[1] + p.drag.y, tp[2]))
        p.root.getTransform().setLocalRotation(quat.fromEulerVec(new vec3(0, p.yawStep * 90 * DEG, 0)).multiply(p.baseRot))
        p.root.getTransform().setLocalScale(new vec3(1, 1, 1))
        continue
      }
      const ex = new vec3(d.exploded[0] * p.f, d.exploded[1] * p.f, d.exploded[2] * p.f)
      let pos = new vec3(d.assembled[0], d.assembled[1], d.assembled[2])
      const mv = movM[id + "|"]
      if (mv) pos = pos.add(mv)
      const rq = rotM[id + "|"]
      const t = p.root.getTransform()
      t.setLocalPosition(pos.add(ex))
      t.setLocalRotation(rq ? rq.multiply(p.baseRot) : p.baseRot)
      const popK = p.popT > 0 ? 1 + 0.4 * (p.popT / 0.35) : 1
      t.setLocalScale(new vec3(popK, popK, popK))
      if (d.groups) {
        for (let g = 0; g < d.groups.length; g++) {
          const gd = d.groups[g]
          const go = p.groups[gd.id]
          if (!go) continue
          const gk = id + "|" + gd.id
          const gm = movM[gk]
          go.getTransform().setLocalPosition(new vec3(gd.at[0] + (gm ? gm.x : 0), gd.at[1] + (gm ? gm.y : 0), gd.at[2] + (gm ? gm.z : 0)))
          go.getTransform().setLocalRotation(rotM[gk] ? rotM[gk] : quat.quatIdentity())
        }
      }
      const gl = glowM[id]
      if (gl || p.glow > 0) {
        const v = gl ? gl.v : 0
        if (Math.abs(v - p.glow) > 0.002 || (gl && v > 0)) {
          p.glow = v
          const col = gl ? gl.col : p.glowCol
          p.glowCol = col
          for (let i = 0; i < p.mats.length; i++) {
            const b = p.mats[i].base
            p.mats[i].set([b[0] * (1 - v) + col[0] * v, b[1] * (1 - v) + col[1] * v, b[2] * (1 - v) + col[2] * v, b[3]])
          }
          if (v === 0) for (let i = 0; i < p.mats.length; i++) p.mats[i].applyStyle(p.style)
        }
      }
    }
    // the whole model: yaw / roll / lift
    const wk = "*|"
    const rt = this.rig.getTransform()
    rt.setLocalRotation(rotM[wk] ? rotM[wk] : quat.quatIdentity())
    const wm = movM[wk]
    rt.setLocalPosition(wm ? wm : new vec3(0, 0, 0))
  }

  private solveSesame() {
    let lowest = 1e9
    for (const id of this.partOrder) {
      const p = this.parts[id]
      const d = p.def
      if (p.tray) {
        const tp = PROJECT_PACK.game.tray
        const sm = PROJECT_PACK.gesture.followSmooth
        p.drag = new vec2(p.drag.x + (p.dragT.x - p.drag.x) * sm, p.drag.y + (p.dragT.y - p.drag.y) * sm)
        const sh = p.shakeT > 0 ? Math.sin(p.shakeT * 70) * 0.5 * p.shakeT : 0
        p.root.getTransform().setLocalPosition(new vec3(tp[0] + p.drag.x + sh, tp[1] + p.drag.y, tp[2]))
        p.root.getTransform().setLocalRotation(quat.fromEulerVec(new vec3(0, p.yawStep * 90 * DEG, 0)).multiply(p.baseRot))
        p.root.getTransform().setLocalScale(new vec3(1, 1, 1))
        continue
      }
      const ex = new vec3(d.exploded[0] * p.f, d.exploded[1] * p.f, d.exploded[2] * p.f)
      const base = new vec3(d.assembled[0], d.assembled[1], d.assembled[2])
      let pos = base
      let rot = p.baseRot
      const isHipJoint = d.kind === "printed" && d.group === "hip"
      const isFootJoint = d.kind === "printed" && d.group === "foot"
      if (isHipJoint) {
        rot = this.jointRot(d.servo as string)
      } else if (isFootJoint || (d.group === "servo" && p.hipOf !== "")) {
        const hipName = isFootJoint ? p.hipOf || this.hipFor(d.servo as string) : p.hipOf
        const hipDef = getComponent("joint_" + hipName.toLowerCase())
        const hp = new vec3(hipDef.assembled[0], hipDef.assembled[1], hipDef.assembled[2])
        const rh = this.jointRot(hipName)
        pos = hp.add(rh.multiplyVec3(base.sub(hp)))
        if (isFootJoint) {
          rot = rh.multiply(this.footRot(d.servo as string))
          // lowest point of this leg piece for the body lift
          const bmin = d.boundsMin as V3
          const bmax = d.boundsMax as V3
          const phi = (this.angles[d.servo as string] - 90) * (d.servo!.charAt(1) === "3" ? 1 : -1) * DEG
          for (let cx = 0; cx < 2; cx++) for (let cy = 0; cy < 2; cy++) {
            const rx = (cx ? bmax[0] : bmin[0]) - d.assembled[0]
            const ry = (cy ? bmax[1] : bmin[1]) - d.assembled[1]
            const y = d.assembled[1] + rx * Math.sin(phi) + ry * Math.cos(phi)
            lowest = Math.min(lowest, y)
          }
        } else rot = rh.multiply(p.baseRot)
      }
      const t = p.root.getTransform()
      t.setLocalPosition(pos.add(ex))
      t.setLocalRotation(rot)
      const popK = p.popT > 0 ? 1 + 0.4 * (p.popT / 0.35) : 1
      t.setLocalScale(new vec3(popK, popK, popK))
    }
    const targetLift = lowest < 1e8 ? Math.max(0, -lowest) : 0
    this.lift += (targetLift - this.lift) * 0.35
    this.rig.getTransform().setLocalPosition(new vec3(0, this.lift, 0))
  }

  private hipFor(servo: string): string {
    return servo.charAt(0) + (servo.charAt(1) === "3" ? "1" : "2")
  }

  servoMap() {
    return SERVO_MAP
  }
}
