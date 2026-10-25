// WizUserModel.ts - measuring and sanity-fitting the user's imported model (the "My Model" project).
// The editor-side importer (tools/import-model.md) already normalizes the model; this is the runtime safety net: if the instantiated
// model is wildly off in size (a unit mix-up: metres, millimetres, inches) it is scaled to a sensible desk size, and its bounds
// are measured from the real meshes, never assumed.
// Owns: world-AABB measurement of an instantiated prefab, the auto-fit rule, the result record (scale applied, triangles unknown at runtime).
// Must not: touch other scene objects or hold state.

import {V3} from "./ProjectPack"

export interface UserModelFit {
  min: V3 // bounds in the parent frame, after the fit (cm)
  max: V3
  scaleApplied: number // 1 = untouched
  note: string
}

const TARGET_CM = 14 // longest side after an auto-fit
const MIN_OK = 2.5 // below this longest side (cm) the model is considered mis-scaled
const MAX_OK = 40 // above this longest side (cm) the model is considered mis-scaled

function measure(so: SceneObject): {mn: vec3; mx: vec3; any: boolean} {
  let mn = new vec3(1e9, 1e9, 1e9)
  let mx = new vec3(-1e9, -1e9, -1e9)
  let any = false
  const walk = (o: SceneObject) => {
    const rmv = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (!isNull(rmv)) {
      const a = rmv.worldAabbMin()
      const b = rmv.worldAabbMax()
      mn = new vec3(Math.min(mn.x, a.x), Math.min(mn.y, a.y), Math.min(mn.z, a.z))
      mx = new vec3(Math.max(mx.x, b.x), Math.max(mx.y, b.y), Math.max(mx.z, b.z))
      any = true
    }
    for (let i = 0; i < o.getChildrenCount(); i++) walk(o.getChild(i))
  }
  walk(so)
  return {mn: mn, mx: mx, any: any}
}

/** Fit an instantiated user model under `parent`: auto-scale if needed, stand it on y = 0 and centre it on x / z. Bounds in parent space. */
export function fitUserModel(inst: SceneObject, parent: SceneObject): UserModelFit {
  const t = inst.getTransform()
  let m = measure(inst)
  if (!m.any) return {min: [-4, 0, -4], max: [4, 6, 4], scaleApplied: 1, note: "no meshes found in the model"}
  const pt = parent.getTransform()
  const k = pt.getWorldScale().x > 0 ? pt.getWorldScale().x : 1
  let size = m.mx.sub(m.mn).uniformScale(1 / k)
  let longest = Math.max(size.x, size.y, size.z)
  let scaleApplied = 1
  let note = "size ok"
  if (longest < MIN_OK || longest > MAX_OK) {
    scaleApplied = TARGET_CM / longest
    const cur = t.getLocalScale()
    t.setLocalScale(new vec3(cur.x * scaleApplied, cur.y * scaleApplied, cur.z * scaleApplied))
    m = measure(inst)
    size = m.mx.sub(m.mn).uniformScale(1 / k)
    longest = Math.max(size.x, size.y, size.z)
    note = "auto-scaled x" + scaleApplied.toFixed(4) + " (longest side was outside " + MIN_OK + ".." + MAX_OK + " cm)"
  }
  // stand on the desk and centre on x / z (in the parent's frame)
  const org = parent.getTransform().getWorldPosition()
  const cx = (m.mn.x + m.mx.x) / 2
  const cz = (m.mn.z + m.mx.z) / 2
  const shift = new vec3(-(cx - org.x) / k, -(m.mn.y - org.y) / k, -(cz - org.z) / k)
  t.setLocalPosition(t.getLocalPosition().add(shift))
  m = measure(inst)
  const mnL: V3 = [(m.mn.x - org.x) / k, (m.mn.y - org.y) / k, (m.mn.z - org.z) / k]
  const mxL: V3 = [(m.mx.x - org.x) / k, (m.mx.y - org.y) / k, (m.mx.z - org.z) / k]
  return {min: mnL, max: mxL, scaleApplied: scaleApplied, note: note}
}
