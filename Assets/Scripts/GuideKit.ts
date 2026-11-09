// GuideKit.ts - small shared helpers of the Circuit Guide: colliders, SIK drag binding with the camera-plane -> table-plane mapping,
// glow colours, fixed-size text.
// Owns: look-and-feel constants, collider creation, the drag binder. Must not: hold step / game state.

import {InteractableLike, makeInteractable} from "./WizInteract"
import {mainCamera} from "./WizPlacement"
import {RGBA} from "./ProjectPack"
import {FONT_MEDIUM, FONT_SEMIBOLD} from "./WizUI"

export const GLOW_GUIDE: RGBA = [0.3, 0.95, 1.0, 0.62] // white / cyan: do this
export const GLOW_WRONG: RGBA = [1.0, 0.22, 0.2, 0.75] // red: mistake
export const GLOW_OK: RGBA = [0.3, 1.0, 0.45, 0.75] // green: success
export const TEXT_LIGHT = new vec4(0.94, 0.98, 1, 1)
export const TEXT_DIM = new vec4(0.68, 0.8, 0.9, 1)

export function v3(a: [number, number, number]): vec3 {
  return new vec3(a[0], a[1], a[2])
}

export function box(so: SceneObject, size: vec3, center: vec3 = vec3.zero()): ColliderComponent {
  const col = so.createComponent("Physics.ColliderComponent") as ColliderComponent
  const s = Shape.createBoxShape()
  s.size = size
  col.shape = s
  void center
  return col
}

export function camWorldPos(): vec3 {
  const c = mainCamera()
  return c ? c.getTransform().getWorldPosition() : vec3.zero()
}

/** Move a camera-plane candidate position onto the plane through `p` with normal `n` along the eye ray (camera-plane drag -> table drag). */
export function ontoPlane(candidate: vec3, p: vec3, n: vec3): vec3 {
  const o = camWorldPos()
  const d = candidate.sub(o)
  const den = n.dot(d)
  if (Math.abs(den) < 0.0001) return candidate
  const t = n.dot(p.sub(o)) / den
  if (t <= 0) return candidate
  return o.add(d.uniformScale(t))
}

export interface DragHooks {
  start?: () => void
  move: (delta: vec3) => void
  end?: () => void
}

/** Collider + SIK Interactable on `so`; the hooks get start / per-frame world delta / end. Returns the interactable. */
export function makeGrab(so: SceneObject, size: vec3, hooks: DragHooks): InteractableLike {
  box(so, size)
  const it = makeInteractable(so)
  it.targetingMode = 3
  it.onTriggerStart.add(() => {
    if (hooks.start) hooks.start()
  })
  it.onDragUpdate.add((e) => {
    const d = e.planecastDragVector ? e.planecastDragVector : e.dragVector
    if (d) hooks.move(d)
  })
  it.onTriggerEnd.add(() => {
    if (hooks.end) hooks.end()
  })
  return it
}

/** A pinch-only target (buttons): the callback runs when the pinch is released on it. */
export function makeTap(so: SceneObject, size: vec3, onTap: () => void, onDown?: () => void, onUp?: () => void): InteractableLike {
  box(so, size)
  const it = makeInteractable(so)
  it.targetingMode = 3
  it.onTriggerStart.add(() => {
    if (onDown) onDown()
  })
  it.onTriggerEnd.add(() => {
    if (onUp) onUp()
    onTap()
  })
  return it
}

export function label(parent: SceneObject, name: string, text: string, size: number, pos: vec3, color: vec4 = TEXT_LIGHT, bold: boolean = false): Text {
  const so = global.scene.createSceneObject(name)
  so.setParent(parent)
  so.getTransform().setLocalPosition(pos)
  const t = so.createComponent("Component.Text") as Text
  t.text = text
  t.size = size
  t.font = bold ? FONT_SEMIBOLD : FONT_MEDIUM
  t.depthTest = true
  t.setRenderOrder(3)
  t.textFill.color = color
  t.outlineSettings.enabled = true
  t.outlineSettings.size = 0.4
  t.outlineSettings.fill.color = new vec4(0.02, 0.04, 0.08, 1)
  t.horizontalAlignment = HorizontalAlignment.Center
  t.verticalAlignment = VerticalAlignment.Center
  t.horizontalOverflow = HorizontalOverflow.Overflow
  t.verticalOverflow = VerticalOverflow.Overflow
  return t
}

/** Break text into lines of at most `max` characters (word wrap). */
export function wrap(text: string, max: number): string {
  const words = text.split(" ")
  const lines: string[] = []
  let cur = ""
  for (const w of words) {
    if (cur.length + w.length + 1 > max && cur.length > 0) {
      lines.push(cur)
      cur = w
    } else cur = cur.length > 0 ? cur + " " + w : w
  }
  if (cur.length > 0) lines.push(cur)
  return lines.join("\n")
}

/** The tilted work table every page uses (a slab with a bright rim); returns the table root. Local axes: x right, z toward the user, y up. */
export function buildTable(kit: import("./WizParts").PartKit, parent: SceneObject, name: string, at: vec3, scale: number, tiltDeg: number, w: number, d: number): SceneObject {
  const work = kit.obj(parent, name, [at.x, at.y, at.z])
  work.getTransform().setLocalScale(new vec3(scale, scale, scale))
  work.getTransform().setLocalRotation(quat.fromEulerVec(new vec3((tiltDeg * Math.PI) / 180, 0, 0)))
  const t = kit.obj(work, "Table", [0, -0.3, 0])
  kit.shape(t, "box", [0, 0, 0], [w, 0.6, d], [0.2, 0.3, 0.42, 0.9], "slab", false)
  for (const [x, z, sw, sd] of [[0, -d / 2, w, 0.18], [0, d / 2, w, 0.18], [-w / 2, 0, 0.18, d], [w / 2, 0, 0.18, d]] as number[][]) {
    kit.shape(t, "box", [x, 0.32, z], [sw, 0.08, sd], [0.35, 0.95, 1, 1], "rim", false)
  }
  return work
}

/** A thin cylinder between two world points (wires, leader lines). `holder` must be a unit-scale-parent object made by kit.shape("cyl"). */
export function placeSegment(holder: SceneObject, a: vec3, b: vec3, thick: number, parentScale: number) {
  const d = b.sub(a)
  const len = Math.max(0.05, d.length)
  const tr = holder.getTransform()
  tr.setWorldPosition(a.add(b).uniformScale(0.5))
  const dir = d.uniformScale(1 / len)
  tr.setWorldRotation(dir.y < -0.9995 ? quat.fromEulerVec(new vec3(Math.PI, 0, 0)) : quat.rotationFromTo(vec3.up(), dir))
  holder.getChild(0).getTransform().setLocalScale(new vec3(thick, len / parentScale, thick))
}

/** A thin outline (12 edges) around a box of `size` cm: shows what the pointer is on WITHOUT covering it (a filled translucent box renders solid on this material). */
export function outlineBox(kit: import("./WizParts").PartKit, parent: SceneObject, name: string, size: vec3, color: RGBA = [0.35, 0.95, 1, 1], thick: number = 0.14): SceneObject {
  const root = kit.obj(parent, name)
  const hx = size.x / 2
  const hy = size.y / 2
  const hz = size.z / 2
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) kit.shape(root, "box", [0, sy * hy, sz * hz], [size.x + thick, thick, thick], color, "ex", false)
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) kit.shape(root, "box", [sx * hx, 0, sz * hz], [thick, size.y + thick, thick], color, "ey", false)
  }
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) kit.shape(root, "box", [sx * hx, sy * hy, 0], [thick, thick, size.z + thick], color, "ez", false)
  }
  return root
}
