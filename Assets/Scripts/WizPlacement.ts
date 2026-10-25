// WizPlacement.ts - "put the workspace on a table": a virtual table plane (the stand-in for real plane detection in the preview) with a ring
// that follows where the user looks. Pinch the plane to place: the whole workspace (model, bench, menu, HUD) lands on the ring and turns to
// face the user. The grab bar (WizMover) can move it again afterwards.
// Owns: the plane, the marker ring, the place action. Must not: decide modes or menus (WizMain does).

import {makeInteractable} from "./WizInteract"
import {PartKit} from "./WizParts"
import {RGBA} from "./ProjectPack"

const TABLE_DROP = 39 // cm below the eyes (default): the height of a desk or table top in front of a seated user
const TABLE_W = 90
const TABLE_D = 60
const CYAN: RGBA = [0.35, 0.95, 1.0, 1]

export function mainCamera(): Camera | null {
  const n = global.scene.getRootObjectsCount()
  const scan = (o: SceneObject): Camera | null => {
    const c = o.getComponent("Component.Camera") as Camera
    if (!isNull(c)) return c
    for (let i = 0; i < o.getChildrenCount(); i++) {
      const r = scan(o.getChild(i))
      if (r) return r
    }
    return null
  }
  for (let i = 0; i < n; i++) {
    const c = scan(global.scene.getRootObject(i))
    if (c) return c
  }
  return null
}

export class WizPlacement {
  private root: SceneObject
  private kit: PartKit
  private plane: SceneObject
  private marker: SceneObject
  private ringMat: {set(c: RGBA): void}
  private cam: Camera | null = null
  private on = false
  private clock = 0
  private spot = new vec3(0, 0, -60)
  private planeY = -55
  private placedOnce = false
  onPlaced: () => void = () => {}

  /** `root` = the 3DWiz root that is moved; `deskLocal` = where the desk plane sits in the workbench frame. */
  private deskLocal: vec3

  constructor(kit: PartKit, root: SceneObject, deskLocal: vec3) {
    this.deskLocal = deskLocal
    this.kit = kit
    this.root = root
    this.plane = global.scene.createSceneObject("PlacePlane")
    // translucent table: a thin box, a grid of lines and the four corners
    kit.shape(this.plane, "box", [0, 0, 0], [TABLE_W, 0.15, TABLE_D], [0.1, 0.25, 0.3, 1], "top", false)
    for (let i = -4; i <= 4; i++) {
      kit.shape(this.plane, "box", [(i * TABLE_W) / 8, 0.1, 0], [0.12, 0.05, TABLE_D], [0.25, 0.7, 0.8, 1], "gx" + i, false)
    }
    for (let j = -3; j <= 3; j++) {
      kit.shape(this.plane, "box", [0, 0.1, (j * TABLE_D) / 6], [TABLE_W, 0.05, 0.12], [0.25, 0.7, 0.8, 1], "gz" + j, false)
    }
    // the pinch target covers the table (a thick invisible box)
    const hit = global.scene.createSceneObject("placehit")
    hit.setParent(this.plane)
    const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
    const box = Shape.createBoxShape()
    box.size = new vec3(TABLE_W, 12, TABLE_D)
    col.shape = box
    const it = makeInteractable(hit)
    it.targetingMode = 3
    it.onTriggerEnd.add(() => this.confirm())
    // the ring that follows the gaze
    this.marker = global.scene.createSceneObject("PlaceMarker")
    const ring = kit.shape(this.marker, "cyl", [0, 0.3, 0], [14, 0.2, 14], CYAN, "ring", false)
    kit.shape(this.marker, "cyl", [0, 0.4, 0], [11.5, 0.25, 11.5], [0.05, 0.1, 0.15, 1], "hole", false)
    kit.shape(this.marker, "sphere", [0, 0.6, 0], [1.6, 1.6, 1.6], CYAN, "dot", false)
    this.ringMat = ring.sm
    this.plane.enabled = false
    this.marker.enabled = false
  }

  setDesk(v: vec3) {
    this.deskLocal = v
  }

  begin() {
    this.cam = mainCamera()
    if (!this.cam) return
    this.on = true
    const p = this.cam.getTransform().getWorldPosition()
    this.planeY = p.y - TABLE_DROP
    this.plane.enabled = true
    this.marker.enabled = true
    this.update(0)
  }

  cancel() {
    this.on = false
    this.plane.enabled = false
    this.marker.enabled = false
  }

  isPlacing(): boolean {
    return this.on
  }

  hasPlaced(): boolean {
    return this.placedOnce
  }

  /** The point on the table plane the user is looking at (clamped to the table, never behind the user). */
  private gazePoint(): vec3 {
    const cam = this.cam as Camera
    const t = cam.getTransform()
    const o = t.getWorldPosition()
    const d = t.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
    let hit: vec3
    if (d.y < -0.08) {
      const k = (this.planeY - o.y) / d.y
      hit = o.add(d.uniformScale(Math.min(k, 140)))
    } else {
      hit = new vec3(o.x + d.x * 85, this.planeY, o.z + d.z * 85) // looking level or up: 85 cm ahead (the glasses view is narrow: far enough that a 20 cm model fits)
    }
    // keep it at a comfortable reach: 30 to 110 cm from the user (flat distance)
    const dx = hit.x - o.x
    const dz = hit.z - o.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    const k2 = Math.max(50, Math.min(120, dist)) / Math.max(0.001, dist)
    return new vec3(o.x + dx * k2, this.planeY, o.z + dz * k2)
  }

  update(dt: number) {
    if (!this.on || !this.cam) return
    this.clock += dt
    const g = this.gazePoint()
    this.spot = this.spot.add(g.sub(this.spot).uniformScale(dt <= 0 ? 1 : Math.min(1, dt * 10)))
    this.marker.getTransform().setWorldPosition(this.spot)
    this.plane.getTransform().setWorldPosition(new vec3(this.spot.x, this.planeY, this.spot.z))
    // table faces the user's heading
    const f = this.cam.getTransform().getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
    this.plane.getTransform().setWorldRotation(quat.angleAxis(Math.atan2(-f.x, -f.z), vec3.up()))
    const pulse = 1 + Math.sin(this.clock * 5) * 0.06
    this.marker.getTransform().setWorldScale(new vec3(pulse, 1, pulse))
  }

  /** The place action (pinch on the table). Also the test hook. */
  confirm() {
    if (!this.on || !this.cam) return
    this.placeAt(this.spot)
    this.cancel()
    this.placedOnce = true
    this.onPlaced()
  }

  /** Move the workspace so its desk sits on `point`, turned to face the user. */
  placeAt(point: vec3) {
    const cam = this.cam ? this.cam : mainCamera()
    if (!cam) return
    const f = cam.getTransform().getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
    const yaw = Math.atan2(-f.x, -f.z)
    const rt = this.root.getTransform()
    const rot = quat.angleAxis(yaw, vec3.up())
    rt.setWorldRotation(rot)
    // root origin so that rot * deskLocal + origin = point
    const off = rot.multiplyVec3(this.deskLocal)
    rt.setWorldPosition(point.sub(off))
  }

  spotWorld(): vec3 {
    return this.spot
  }
}
