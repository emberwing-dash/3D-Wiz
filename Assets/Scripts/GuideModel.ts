// GuideModel.ts - the model of the Circuit Guide: split into parts, pulled apart, put back together, grabbed and placed anywhere.
// Source "rc": the RC car built from the repo's real printed parts (Assets/Models/Forrc/*.glb). Source "fbx": the user's imported
// FBX prefab (Assets/UserModels), split automatically into its top-level groups.
// Owns: the part list, explode / assemble tweening, per-part and whole-model grab, spin of wheels, drop-spot lookup.
// Must not: know about steps, the panel or the orb.

import {PartKit} from "./WizParts"
import {fitUserModel} from "./WizUserModel"
import {makeGrab, outlineBox, v3} from "./GuideKit"
import {V3} from "./GuideData"

export type ModelSource = "rc" | "fbx"

function forrcPrefab(glb: string): ObjectPrefab {
  switch (glb) {
    case "rcchassis":
      return requireAsset("../Models/Forrc/rcchassis.glb") as ObjectPrefab
    case "electronicsriser":
      return requireAsset("../Models/Forrc/electronicsriser.glb") as ObjectPrefab
    case "motorclip":
      return requireAsset("../Models/Forrc/motorclip.glb") as ObjectPrefab
    case "rubberbandwheel":
      return requireAsset("../Models/Forrc/rubberbandwheel.glb") as ObjectPrefab
    default:
      return requireAsset("../Models/Forrc/simplesteeringservocap.glb") as ObjectPrefab
  }
}

interface RcPartDef {
  id: string
  glb: string
  at: V3
  rotY: number
  out: V3 // exploded offset
  wheel?: boolean
}
// positions are the CAD assembly frame of PackForrc.ts (cm); front of the car is -z
const RC_PARTS: RcPartDef[] = [
  {id: "chassis", glb: "rcchassis", at: [0, 0, 0], rotY: 0, out: [0, -3, 0]},
  {id: "riser", glb: "electronicsriser", at: [0, 0, 0], rotY: 0, out: [0, 5, 0]},
  {id: "motor_clip", glb: "motorclip", at: [0, 0, 0], rotY: 0, out: [0, 4, 3]},
  {id: "servo_cap", glb: "simplesteeringservocap", at: [0, 3.1, -5.1], rotY: 0, out: [0, 4, -2]},
  {id: "wheel_fr", glb: "rubberbandwheel", at: [4, -1.8, -4.4], rotY: 0, out: [4, 0, 0], wheel: true},
  {id: "wheel_fl", glb: "rubberbandwheel", at: [-4, -1.8, -4.4], rotY: 180, out: [-4, 0, 0], wheel: true},
  {id: "wheel_rr", glb: "rubberbandwheel", at: [4, -1.8, 4.4], rotY: 0, out: [4, 0, 0], wheel: true},
  {id: "wheel_rl", glb: "rubberbandwheel", at: [-4, -1.8, 4.4], rotY: 180, out: [-4, 0, 0], wheel: true},
]
const PLA: [number, number, number, number][] = [
  [0.3, 0.52, 0.92, 1], [0.9, 0.92, 0.95, 1], [0.97, 0.55, 0.16, 1], [0.9, 0.92, 0.95, 1], [0.12, 0.12, 0.14, 1],
]

export interface ModelPart {
  id: string
  obj: SceneObject // the part's own node (moved by explode / drag)
  home: vec3 // assembled local position
  out: vec3 // exploded offset
  target: vec3 // where the tween is heading (local)
  baseRot: quat
  wheel: boolean
  hit: SceneObject
  hitOn: boolean
  grab: boolean
}

export class GuideModel {
  root: SceneObject
  parts: ModelPart[] = []
  source: ModelSource = "rc"
  note = ""
  private exploded = false
  private bodyHit: SceneObject
  private boundsMin = new vec3(-3.3, -3.8, -6)
  private boundsMax = new vec3(3.3, 4, 6)
  private spin = 0
  private heading = 0
  private xray = false
  private haloObj: SceneObject | null = null
  private kit: PartKit
  /** world limits of free placement (cm) */
  static LIM_MIN = new vec3(-1000, -1000, -1000) // the pages are anchored to the camera, so there is no fixed world box any more
  static LIM_MAX = new vec3(1000, 1000, 1000)
  onMoved: (() => void) | null = null
  onPartDropped: ((p: ModelPart, snapped: boolean) => void) | null = null

  constructor(parent: SceneObject, kit: PartKit) {
    this.kit = kit
    this.root = kit.obj(parent, "GuideModel")
    this.bodyHit = kit.obj(this.root, "guide_model_grab")
  }

  /** Build the model; `fbx` is the user's imported prefab (may be undefined: then the RC car is used). */
  build(source: ModelSource, fbx: ObjectPrefab | null): void {
    this.clear()
    if (source === "fbx" && fbx !== null && !isNull(fbx)) this.buildFbx(fbx)
    else {
      this.source = "rc"
      this.buildRc()
    }
    this.finishBodyHit()
  }

  private clear() {
    for (const p of this.parts) if (!isNull(p.obj)) p.obj.destroy()
    this.parts = []
    this.exploded = false
    this.spin = 0
    this.heading = 0
    this.root.getTransform().setLocalRotation(quat.quatIdentity())
  }

  private mkPart(id: string, holder: SceneObject, home: vec3, out: vec3, baseRot: quat, wheel: boolean, hitSize: vec3, hitCenter: vec3): ModelPart {
    const hit = this.kit.obj(holder, "guide_part_" + id, [hitCenter.x, hitCenter.y, hitCenter.z])
    const part: ModelPart = {id: id, obj: holder, home: home, out: out, target: home, baseRot: baseRot, wheel: wheel, hit: hit, hitOn: false, grab: false}
    makeGrab(hit, hitSize, {
      start: () => {
        part.grab = true
      },
      move: (d) => this.dragPart(part, d),
      end: () => this.dropPart(part),
    })
    hit.enabled = false
    this.parts.push(part)
    return part
  }

  private buildRc() {
    this.note = "RC car, " + RC_PARTS.length + " printed parts (repo STLs)"
    let ci = 0
    for (const d of RC_PARTS) {
      const holder = this.kit.obj(this.root, d.id, d.at)
      const rot = quat.fromEulerVec(new vec3(0, (d.rotY * Math.PI) / 180, 0))
      holder.getTransform().setLocalRotation(rot)
      const inst = forrcPrefab(d.glb).instantiate(holder)
      const color = PLA[Math.min(ci, PLA.length - 1)]
      if (d.id !== "wheel_fr" && d.id !== "wheel_fl" && d.id !== "wheel_rr" && d.id !== "wheel_rl") ci++
      this.tint(inst, d.wheel ? PLA[4] : color)
      const sz = d.wheel ? new vec3(1.6, 4.2, 4.2) : d.id === "chassis" ? new vec3(6.6, 2.6, 11.6) : d.id === "riser" ? new vec3(6.4, 3.4, 9.2) : new vec3(2.4, 2, 2.6)
      const ctr = d.id === "chassis" ? new vec3(0, -1.3, 0) : d.id === "riser" ? new vec3(0, 1.4, 0.3) : d.wheel ? new vec3(0, 0, 0) : new vec3(0, 0.5, 0)
      this.mkPart(d.id, holder, v3(d.at), v3(d.out), rot, !!d.wheel, sz, ctr)
    }
    this.boundsMin = new vec3(-6.3, -3.9, -6.4)
    this.boundsMax = new vec3(6.3, 3.9, 6.4)
  }

  private buildFbx(prefab: ObjectPrefab) {
    this.source = "fbx"
    const inst = prefab.instantiate(this.root)
    inst.name = "FbxModel"
    const fit = fitUserModel(inst, this.root)
    this.boundsMin = new vec3(fit.min[0], fit.min[1], fit.min[2])
    this.boundsMax = new vec3(fit.max[0], fit.max[1], fit.max[2])
    // the split: descend through single-child wrappers, then every child that carries a mesh is a part
    let level = inst
    for (let g = 0; g < 4 && level.getChildrenCount() === 1; g++) level = level.getChild(0)
    const kids: SceneObject[] = []
    for (let i = 0; i < level.getChildrenCount(); i++) kids.push(level.getChild(i))
    const centre = this.boundsMin.add(this.boundsMax).uniformScale(0.5)
    const span = Math.max(this.boundsMax.x - this.boundsMin.x, this.boundsMax.y - this.boundsMin.y, this.boundsMax.z - this.boundsMin.z)
    let n = 0
    for (const k of kids) {
      const home = k.getTransform().getLocalPosition()
      // part centre (in the model root frame) -> outward direction
      const wp = k.getTransform().getWorldPosition()
      const lp = this.root.getTransform().getWorldTransform().inverse().multiplyPoint(wp)
      let dir = lp.sub(centre)
      if (dir.length < 0.01) dir = new vec3(0, 1, 0)
      dir = dir.normalize().uniformScale(span * 0.55)
      this.mkPartOnExisting(k, "part" + n, home, dir)
      n++
    }
    if (this.parts.length === 0) this.mkPartOnExisting(inst, "part0", inst.getTransform().getLocalPosition(), new vec3(0, span * 0.5, 0))
    this.note = "FBX model split into " + this.parts.length + " parts, fitted " + fit.note
  }

  private mkPartOnExisting(node: SceneObject, id: string, home: vec3, out: vec3) {
    const t = node.getTransform()
    const wr = t.getLocalRotation()
    const ctr = this.boundsMin.add(this.boundsMax).uniformScale(0.5)
    void ctr
    const sz = this.boundsMax.sub(this.boundsMin).uniformScale(0.25)
    const s = new vec3(Math.max(sz.x, 2), Math.max(sz.y, 2), Math.max(sz.z, 2))
    const part = this.mkPart(id, node, home, out, wr, false, s, vec3.zero())
    void part
  }

  private tint(so: SceneObject, c: [number, number, number, number]) {
    const walk = (o: SceneObject) => {
      const r = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      if (!isNull(r)) {
        const m = r.mainMaterial.clone()
        m.mainPass.baseColorFactor = new vec4(c[0] * 0.85, c[1] * 0.85, c[2] * 0.85, 1)
        r.mainMaterial = m
      }
      for (let i = 0; i < o.getChildrenCount(); i++) walk(o.getChild(i))
    }
    walk(so)
  }

  private finishBodyHit() {
    const sz = this.boundsMax.sub(this.boundsMin)
    const c = this.boundsMax.add(this.boundsMin).uniformScale(0.5)
    this.bodyHit.getTransform().setLocalPosition(c)
    if (this.bodyHit.getComponent("Physics.ColliderComponent")) this.bodyHit.getComponent("Physics.ColliderComponent").destroy()
    const bsz = sz.add(new vec3(1, 1, 1))
    const it = makeGrab(this.bodyHit, bsz, {
      move: (d) => this.moveBy(d),
    })
    for (let i = this.bodyHit.getChildrenCount() - 1; i >= 0; i--) this.bodyHit.getChild(i).destroy()
    const halo = outlineBox(this.kit, this.bodyHit, "hover_halo", bsz, [0.35, 0.95, 1, 1], 0.18)
    this.haloObj = halo
    halo.enabled = false
    it.onHoverEnter.add(() => {
      if (!isNull(halo)) halo.enabled = true
    })
    it.onHoverExit.add(() => {
      if (!isNull(halo)) halo.enabled = false
    })
    this.bodyHit.enabled = true
  }

  /** See-through printed body (best effort: alpha blend on the printed parts only, not on components attached to it). */
  setXray(on: boolean): void {
    this.xray = on
    const walk = (o: SceneObject) => {
      const r = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      if (!isNull(r)) {
        const pass = r.mainMaterial.mainPass
        pass.blendMode = on ? BlendMode.PremultipliedAlphaAuto : BlendMode.Normal
        const c = pass.baseColorFactor
        pass.baseColorFactor = new vec4(c.x, c.y, c.z, on ? 0.35 : 1)
      }
      for (let i = 0; i < o.getChildrenCount(); i++) walk(o.getChild(i))
    }
    for (const p of this.parts) walk(p.obj)
  }

  /** Test / demo hook: show the hover outline without a pointer. */
  showHoverOutline(on: boolean): void {
    if (this.haloObj !== null && !isNull(this.haloObj)) this.haloObj.enabled = on
  }

  /** Local bounds of the model (cm), after build(). */
  bounds(): {min: vec3; max: vec3} {
    return {min: this.boundsMin, max: this.boundsMax}
  }

  isXray(): boolean {
    return this.xray
  }

  // ------------------------------------------------------------------ explode / assemble
  isExploded(): boolean {
    return this.exploded
  }

  /** True when every part sits at its assembled position. */
  isAssembled(): boolean {
    for (const p of this.parts) if (p.obj.getTransform().getLocalPosition().sub(p.home).length > 0.15) return false
    return true
  }

  explode(): void {
    this.exploded = true
    for (const p of this.parts) {
      p.target = p.home.add(p.out)
      p.hit.enabled = true
    }
    this.bodyHit.enabled = false
  }

  assemble(): void {
    this.exploded = false
    for (const p of this.parts) {
      p.target = p.home
      p.hit.enabled = false
    }
    this.bodyHit.enabled = true
  }

  /** Test helper: a part dragged by `d` cm in model space and dropped (same path as a hand grab). */
  simDragPart(id: string, localTo: vec3): void {
    const p = this.parts.filter((x) => x.id === id)[0]
    if (!p) return
    p.grab = true
    p.obj.getTransform().setLocalPosition(localTo)
    p.target = localTo
    this.dropPart(p)
  }

  private dragPart(p: ModelPart, d: vec3) {
    const w = p.obj.getTransform().getWorldPosition()
    const nw = w.add(d)
    p.obj.getTransform().setWorldPosition(nw)
    p.target = p.obj.getTransform().getLocalPosition()
  }

  private dropPart(p: ModelPart) {
    if (!p.grab) return
    p.grab = false
    const far = p.obj.getTransform().getLocalPosition().sub(p.home).length
    let snapped = false
    if (far < 1.8) {
      p.target = p.home // close to its slot: snaps back in
      snapped = true
    } else p.target = p.obj.getTransform().getLocalPosition() // left where the user dropped it
    if (this.onPartDropped) this.onPartDropped(p, snapped)
  }

  // ------------------------------------------------------------------ free placement
  moveBy(d: vec3): void {
    const t = this.root.getTransform()
    const p = t.getWorldPosition().add(d)
    const q = new vec3(
      Math.max(GuideModel.LIM_MIN.x, Math.min(GuideModel.LIM_MAX.x, p.x)),
      Math.max(GuideModel.LIM_MIN.y, Math.min(GuideModel.LIM_MAX.y, p.y)),
      Math.max(GuideModel.LIM_MIN.z, Math.min(GuideModel.LIM_MAX.z, p.z)),
    )
    t.setWorldPosition(q)
    if (this.onMoved) this.onMoved()
  }

  /** The model dropped onto the table plane keeps its height; this lifts it to rest on y = planeY. */
  restOn(planeY: number): void {
    const t = this.root.getTransform()
    const p = t.getWorldPosition()
    const k = t.getWorldScale().y
    t.setWorldPosition(new vec3(p.x, planeY - this.boundsMin.y * k, p.z))
  }

  worldPos(): vec3 {
    return this.root.getTransform().getWorldPosition()
  }

  spotWorld(at: V3): vec3 {
    return this.root.getTransform().getWorldTransform().multiplyPoint(v3(at))
  }

  /** Drive along the table: turn about the table's up axis and move `dist` cm along the heading, in the table frame. */
  drive(dist: number, dyaw: number): void {
    const t = this.root.getTransform()
    this.heading += dyaw
    t.setLocalRotation(quat.fromEulerVec(new vec3(0, this.heading, 0)))
    const f = new vec3(-Math.sin(this.heading), 0, -Math.cos(this.heading))
    const p = t.getLocalPosition().add(f.uniformScale(dist))
    // the car stays on the table (it may overhang a little); a model that was placed elsewhere keeps its own range
    const cur = t.getLocalPosition()
    const cl = (v: number, lo: number, hi: number, c: number) => Math.max(Math.min(lo, c), Math.min(Math.max(hi, c), v))
    t.setLocalPosition(new vec3(cl(p.x, -7.5, 7.5, cur.x), p.y, cl(p.z, -4, 3.5, cur.z)))
    if (this.onMoved) this.onMoved()
  }

  forwardWorld(): vec3 {
    return this.root.getTransform().getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
  }

  spinWheels(rad: number): void {
    this.spin += rad
    for (const p of this.parts) {
      if (!p.wheel) continue
      p.obj.getTransform().setLocalRotation(p.baseRot.multiply(quat.fromEulerVec(new vec3(this.spin, 0, 0))))
    }
  }

  update(dt: number): void {
    const k = Math.min(1, dt * 6)
    for (const p of this.parts) {
      if (p.grab) continue
      const t = p.obj.getTransform()
      const cur = t.getLocalPosition()
      const d = p.target.sub(cur)
      if (d.length > 0.01) t.setLocalPosition(cur.add(d.uniformScale(k)))
    }
  }

  planeY(): number {
    return this.root.getTransform().getWorldPosition().y
  }
}
