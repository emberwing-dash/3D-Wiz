// WizMover.ts - "put it where you want it": a grab bar under the workspace. Pinch and hold the bar, move your hand, release: the whole
// workspace (model, bench, menu, HUD) follows the hand and, on release, drops onto the real surface below it (Spectacles World Query
// hit test: a table or the floor) when one is found.
// Owns: the grab bar, drag-follow, surface snap. Must not: decide modes or touch the circuit logic.

import {makeInteractable} from "./WizInteract"
import {PartKit} from "./WizParts"
import {RGBA} from "./ProjectPack"

const BAR_LOCAL = new vec3(0, -17.6, -54) // workbench space, under the lowest content

export class WizMover {
  private root: SceneObject
  private bar: SceneObject
  private kit: PartKit
  private mats: {set(c: RGBA): void}[] = []
  private startWorld = new vec3(0, 0, 0)
  private grabbed = false
  private session: HitTestSession | null = null
  private lastHit: string = ""

  constructor(kit: PartKit, root: SceneObject) {
    this.kit = kit
    this.root = root
    this.bar = kit.obj(root, "MoveBar", [BAR_LOCAL.x, BAR_LOCAL.y, BAR_LOCAL.z])
    const col: RGBA = [0.35, 0.95, 1.0, 1]
    const a = kit.shape(this.bar, "box", [0, 0, 0], [8, 1.0, 0.8], col, "bar", false)
    const b = kit.shape(this.bar, "sphere", [-4, 0, 0], [1.3, 1.3, 1.3], col, "capL", false)
    const c = kit.shape(this.bar, "sphere", [4, 0, 0], [1.3, 1.3, 1.3], col, "capR", false)
    this.mats = [a.sm, b.sm, c.sm]
    for (let i = -1; i <= 1; i++) kit.shape(this.bar, "box", [i * 1.6, 0, 0.45], [0.35, 0.55, 0.12], [0.04, 0.08, 0.14, 1], "grip" + i, false)
    const hit = kit.obj(this.bar, "movehit", [0, 0, 0.2])
    const col2 = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
    const box = Shape.createBoxShape()
    box.size = new vec3(12, 2.8, 1.6)
    col2.shape = box
    const it = makeInteractable(hit)
    it.targetingMode = 3
    it.onTriggerStart.add(() => this.grab())
    it.onDragUpdate.add((e) => this.drag(e.dragVector))
    it.onTriggerEnd.add(() => this.release())
    try {
      const wq = require("LensStudio:WorldQueryModule") as WorldQueryModule
      this.session = wq.createHitTestSession()
      this.session.start()
    } catch (e) {
      this.session = null // preview without world query: the bar still moves the workspace, it just does not snap
    }
  }

  private tint(c: RGBA) {
    for (const m of this.mats) m.set(c)
  }

  private grab() {
    this.grabbed = true
    this.startWorld = this.root.getTransform().getWorldPosition()
    this.tint([1, 1, 1, 1])
  }

  private drag(dv: vec3 | undefined) {
    if (!this.grabbed || !dv) return
    this.root.getTransform().setWorldPosition(this.startWorld.add(dv))
  }

  private release() {
    if (!this.grabbed) return
    this.grabbed = false
    this.tint([0.35, 0.95, 1.0, 1])
    this.snapToSurface()
  }

  /** Test hook: move the workspace by a world offset exactly as a hand drag would. */
  moveBy(dv: vec3) {
    this.grab()
    this.drag(dv)
    this.release()
  }

  lastSnap(): string {
    return this.lastHit
  }

  private snapToSurface() {
    if (!this.session) {
      this.lastHit = "no world query"
      return
    }
    const p = this.bar.getTransform().getWorldPosition()
    const from = p.add(new vec3(0, 25, 0))
    const to = p.sub(new vec3(0, 60, 0))
    this.session.hitTest(from, to, (hit) => {
      if (!hit || isNull(this.root)) {
        this.lastHit = "no surface"
        return
      }
      // the bar rests 2 cm above the surface it found
      const dy = hit.position.y + 2.0 - p.y
      const rt = this.root.getTransform()
      rt.setWorldPosition(rt.getWorldPosition().add(new vec3(0, dy, 0)))
      this.lastHit = "surface"
    })
  }

  barObject(): SceneObject {
    return this.bar
  }
}






































