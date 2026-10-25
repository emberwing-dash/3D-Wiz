// WizInteract.ts - one place that decides how a 3D thing is pinched / dragged / tapped.
//   Spectacles : the real SpectaclesInteractionKit Interactable (hand pinch, mouse in the Lens Studio SPECS preview).
//   Snapchat   : a phone-touch stand-in with the SAME events (tap = pinch-click, finger drag = pinch-drag), so the engine
//                scripts do not know which one they got. It ray-casts the touch against the colliders the scripts already add.
// Everything the engine reads from an Interactable is in InteractableLike: targetingMode and five events.

import {Interactable as SikInteractable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"

export interface DragArgs {
  planecastDragVector?: vec3
  dragVector?: vec3
}

export class WizEvent<T> {
  private fns: Array<(a: T) => void> = []
  add(f: (a: T) => void): void {
    this.fns.push(f)
  }
  remove(f: (a: T) => void): void {
    const i = this.fns.indexOf(f)
    if (i >= 0) this.fns.splice(i, 1)
  }
  invoke(a: T): void {
    const c = this.fns.slice()
    for (let i = 0; i < c.length; i++) c[i](a)
  }
}

export interface InteractableLike {
  targetingMode: number
  onTriggerStart: {add(f: (a: any) => void): any}
  onTriggerEnd: {add(f: (a: any) => void): any}
  onDragUpdate: {add(f: (a: DragArgs) => void): any}
  onHoverEnter: {add(f: (a: any) => void): any}
  onHoverExit: {add(f: (a: any) => void): any}
}

export type Interactable = InteractableLike

export function isSpectacles(): boolean {
  return global.deviceInfoSystem.isSpectacles()
}

class TouchInteractable implements InteractableLike {
  targetingMode = 3
  onTriggerStart = new WizEvent<any>()
  onTriggerEnd = new WizEvent<any>()
  onDragUpdate = new WizEvent<DragArgs>()
  onHoverEnter = new WizEvent<any>()
  onHoverExit = new WizEvent<any>()
}

class TouchRouter {
  private static inst: TouchRouter | null = null
  private map: {[uid: string]: TouchInteractable} = {}
  private probe = Physics.createGlobalProbe()
  private cam: Camera | null = null
  private active: TouchInteractable | null = null
  private activeDist = 60
  private lastPos = new vec2(0, 0)
  private busy = false

  static get(host: SceneObject): TouchRouter {
    if (TouchRouter.inst === null) TouchRouter.inst = new TouchRouter(host)
    return TouchRouter.inst
  }

  private constructor(host: SceneObject) {
    const sc = host.createComponent("Component.ScriptComponent") as ScriptComponent
    sc.createEvent("TouchStartEvent").bind((e: TouchStartEvent) => this.down(e.getTouchPosition()))
    sc.createEvent("TouchMoveEvent").bind((e: TouchMoveEvent) => this.move(e.getTouchPosition()))
    sc.createEvent("TouchEndEvent").bind(() => this.up())
  }

  register(so: SceneObject, it: TouchInteractable): void {
    this.map[so.uniqueIdentifier] = it
  }

  private camera(): Camera | null {
    if (this.cam !== null && !isNull(this.cam)) return this.cam
    const n = global.scene.getRootObjectsCount()
    for (let i = 0; i < n; i++) {
      const c = this.find(global.scene.getRootObject(i))
      if (c !== null) {
        this.cam = c
        return c
      }
    }
    return null
  }

  private find(so: SceneObject): Camera | null {
    const c = so.getComponent("Component.Camera") as Camera
    if (!isNull(c)) return c
    for (let i = 0; i < so.getChildrenCount(); i++) {
      const r = this.find(so.getChild(i))
      if (r !== null) return r
    }
    return null
  }

  simDown(p: vec2): void {
    this.down(p)
  }
  simMove(p: vec2): void {
    this.move(p)
  }
  simUp(): void {
    this.up()
  }

  private down(p: vec2): void {
    const cam = this.camera()
    if (cam === null || this.busy) return
    const a = cam.getTransform().getWorldPosition()
    const b = a.add(cam.screenSpaceToWorldSpace(p, 100).sub(a).normalize().uniformScale(600))
    this.lastPos = p
    const hits = this.probe.rayCastAllSync(a, b)
    for (let i = 0; i < hits.length; i++) {
      const so = hits[i].collider.getSceneObject()
      const it = this.map[so.uniqueIdentifier]
      if (it !== undefined && so.isEnabledInHierarchy) {
        this.active = it
        this.activeDist = Math.max(20, hits[i].distance)
        it.onHoverEnter.invoke({})
        it.onTriggerStart.invoke({})
        return
      }
    }
  }

  private move(p: vec2): void {
    const it = this.active
    const cam = this.camera()
    if (it === null || cam === null) return
    const h = 2 * this.activeDist * Math.tan(cam.fov / 2)
    const w = h * cam.aspect
    const d = new vec3((p.x - this.lastPos.x) * w, -(p.y - this.lastPos.y) * h, 0)
    this.lastPos = p
    it.onDragUpdate.invoke({planecastDragVector: d, dragVector: d})
  }

  private up(): void {
    const it = this.active
    if (it === null) return
    this.active = null
    it.onTriggerEnd.invoke({})
    it.onHoverExit.invoke({})
  }
}

/** Add an interactable to a scene object that already has a collider (all engine hit boxes do). */
export function makeInteractable(so: SceneObject): InteractableLike {
  if (isSpectacles()) return so.createComponent(SikInteractable.getTypeName()) as SikInteractable
  const it = new TouchInteractable()
  TouchRouter.get(so).register(so, it)
  return it
}

/** Test hook (LEAF / debugging): feed a touch tap or drag through the same path as a finger. No-op on Spectacles. */
export function simulateTouch(host: SceneObject, from: vec2, to: vec2 | null): void {
  if (isSpectacles()) return
  const r = TouchRouter.get(host)
  r.simDown(from)
  if (to !== null) r.simMove(to)
  r.simUp()
}

/** The scripts author positions in "workbench space" (content ~55 cm in front of the 3DWiz root). On glasses the root sits at the
 *  origin, so that equals world space; on a phone the root is moved onto the detected surface, so convert through it. */
export function toWorld(so: SceneObject, v: vec3): vec3 {
  let r = so
  while (r.hasParent()) r = r.getParent()
  return r.getTransform().getWorldTransform().multiplyPoint(v)
}
