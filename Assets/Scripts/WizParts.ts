// WizParts.ts - primitive-shape kit + electronics model builders (real-size S2 Mini, buck, battery, switch, header strip,
//               OLED, MG90S servo) shared by the robot assembly and the circuit bench.
// Owns: material cloning/tinting (StyledMat), shape creation, per-component model construction at REAL dimensions.
// Must not: hold app state, create text, or know about modes. Sizes come from PROJECT_PACK (standard sizes, flagged there).

import {RGBA, V3, ComponentDef, getComponent} from "./ProjectPack"

export type Style = "normal" | "dim" | "highlight" | "ghost"

const HIGHLIGHT: RGBA = [0.35, 1.0, 1.0, 1]
const LIT_GAIN = 0.8

/** A tintable material wrapper (works for the lit glTF material and the Unlit material). */
export class StyledMat {
  mat: Material
  base: RGBA
  lit: boolean
  constructor(mat: Material, base: RGBA, lit: boolean) {
    this.mat = mat
    this.base = base
    this.lit = lit
    this.set(base)
  }
  set(c: RGBA): void {
    const g = this.lit ? LIT_GAIN : 1 // the preview environment light over-exposes lit colours
    const v = new vec4(c[0] * g, c[1] * g, c[2] * g, c[3])
    if (this.lit) this.mat.mainPass.baseColorFactor = v
    else this.mat.mainPass.baseColor = v
  }
  /** The base colour at a given opacity (X-ray body). */
  setAlpha(a: number): void {
    const b = this.base
    this.set([b[0], b[1], b[2], a])
  }

  applyStyle(style: Style, emphasis: number = 1): void {
    const b = this.base
    if (style === "dim") this.set([b[0] * 0.32, b[1] * 0.32, b[2] * 0.32, b[3]])
    else if (style === "ghost") this.set([b[0] * 0.5, b[1] * 0.5, b[2] * 0.5, b[3]])
    else if (style === "highlight") {
      const k = 0.38 * emphasis
      this.set([b[0] * (1 - k) + HIGHLIGHT[0] * k, b[1] * (1 - k) + HIGHLIGHT[1] * k, b[2] * (1 - k) + HIGHLIGHT[2] * k, b[3]])
    } else this.set(b)
  }
}

export class PartKit {
  box: RenderMesh
  sphere: RenderMesh
  cyl: RenderMesh
  litMat: Material
  unlitMat: Material
  constructor(box: RenderMesh, sphere: RenderMesh, cyl: RenderMesh, litMat: Material, unlitMat: Material) {
    this.box = box
    this.sphere = sphere
    this.cyl = cyl
    this.litMat = litMat
    this.unlitMat = unlitMat
  }

  styled(c: RGBA, lit: boolean): StyledMat {
    return new StyledMat((lit ? this.litMat : this.unlitMat).clone(), c, lit)
  }

  obj(parent: SceneObject, name: string, pos?: V3, rotDeg?: V3): SceneObject {
    const o = global.scene.createSceneObject(name)
    o.setParent(parent)
    const t = o.getTransform()
    if (pos) t.setLocalPosition(new vec3(pos[0], pos[1], pos[2]))
    if (rotDeg) t.setLocalRotation(quat.fromEulerVec(new vec3((rotDeg[0] * Math.PI) / 180, (rotDeg[1] * Math.PI) / 180, (rotDeg[2] * Math.PI) / 180)))
    return o
  }

  shape(parent: SceneObject, kind: "box" | "sphere" | "cyl", pos: V3, scale: V3, color: RGBA, name: string, lit: boolean = true, rotDeg?: V3): {obj: SceneObject; sm: StyledMat} {
    const o = this.obj(parent, name, pos, rotDeg)
    o.getTransform().setLocalScale(new vec3(scale[0], scale[1], scale[2]))
    const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = kind === "box" ? this.box : kind === "sphere" ? this.sphere : this.cyl
    const sm = this.styled(color, lit)
    rmv.mainMaterial = sm.mat
    return {obj: o, sm: sm}
  }
}

const GOLD: RGBA = [0.95, 0.8, 0.3, 1]
const BLACK: RGBA = [0.06, 0.06, 0.07, 1]
const SILVER: RGBA = [0.78, 0.8, 0.84, 1]

const PART_IDS = ["led_5mm", "resistor_axial", "diode_do41", "npn_to92", "dip16", "push_button", "buzzer", "esp32_wroom", "servo_micro", "breadboard_half"]

/** Real component models (KiCad / Adafruit CAD, converted by tools/cad/FetchPart.mjs; requireAsset needs string literals). */
export function partPrefab(id: string): ObjectPrefab | null {
  switch (id) {
    case "led_5mm":
      return requireAsset("../Models/Parts/led_5mm.glb") as ObjectPrefab
    case "resistor_axial":
      return requireAsset("../Models/Parts/resistor_axial.glb") as ObjectPrefab
    case "diode_do41":
      return requireAsset("../Models/Parts/diode_do41.glb") as ObjectPrefab
    case "npn_to92":
      return requireAsset("../Models/Parts/npn_to92.glb") as ObjectPrefab
    case "dip16":
      return requireAsset("../Models/Parts/dip16.glb") as ObjectPrefab
    case "push_button":
      return requireAsset("../Models/Parts/push_button.glb") as ObjectPrefab
    case "buzzer":
      return requireAsset("../Models/Parts/buzzer.glb") as ObjectPrefab
    case "esp32_wroom":
      return requireAsset("../Models/Parts/esp32_wroom.glb") as ObjectPrefab
    case "servo_micro":
      return requireAsset("../Models/Parts/servo_micro.glb") as ObjectPrefab
    case "breadboard_half":
      return requireAsset("../Models/Parts/breadboard_half.glb") as ObjectPrefab
  }
  return null
}

export function isPartModel(id: string): boolean {
  return PART_IDS.indexOf(id) >= 0
}

/** Instantiate a real model under the parent object, keeping each material's own colour (tintable like every other part material). */
function addModel(parent: SceneObject, id: string, mats: StyledMat[]): SceneObject | null {
  const pf = partPrefab(id)
  if (pf === null) return null
  const inst = pf.instantiate(parent)
  const walk = (so: SceneObject) => {
    const rmv = so.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (!isNull(rmv)) {
      const m = rmv.mainMaterial.clone()
      const c = m.mainPass.baseColorFactor
      const sm = new StyledMat(m, [c.x, c.y, c.z, c.w], true)
      rmv.mainMaterial = sm.mat
      mats.push(sm)
    }
    for (let i = 0; i < so.getChildrenCount(); i++) walk(so.getChild(i))
  }
  walk(inst)
  return inst
}

/** Build a component from its primitive recipe (generic packs). Returns the tintable materials and the nested group pivots. */
export function buildPrims(kit: PartKit, def: ComponentDef, parent: SceneObject): {mats: StyledMat[]; groups: {[g: string]: SceneObject}} {
  const groups: {[g: string]: SceneObject} = {}
  const mats: StyledMat[] = []
  const gd = def.groups ? def.groups : []
  for (let i = 0; i < gd.length; i++) {
    const par = gd[i].parent && groups[gd[i].parent as string] ? groups[gd[i].parent as string] : parent
    groups[gd[i].id] = kit.obj(par, "g_" + gd[i].id, gd[i].at)
  }
  const pr = def.prims ? def.prims : []
  for (let i = 0; i < pr.length; i++) {
    const p = pr[i]
    const par = p.g && groups[p.g] ? groups[p.g] : parent
    if (p.s === "glb") {
      // real model: its origin is bottom-centre, p is the centre of its bounding box
      const holder = kit.obj(par, "model_" + (p.n ? p.n : i), [p.p[0], p.p[1] - p.z[1] / 2, p.p[2]], p.r)
      addModel(holder, p.n ? p.n : "", mats)
      continue
    }
    const col = p.c ? p.c : def.color
    const kind = p.s === "sph" ? "sphere" : p.s === "cyl" ? "cyl" : "box"
    mats.push(kit.shape(par, kind, p.p, p.z, col, p.n ? p.n : "p" + i, true, p.r).sm)
  }
  return {mats: mats, groups: groups}
}

/** Build the model of an electronic component (local frame: origin on the board centre, y=0 = underside). */
export function buildElectronic(kit: PartKit, id: string, parent: SceneObject): StyledMat[] {
  const def = getComponent(id)
  if (def.prims && def.prims.length > 0) return buildPrims(kit, def, parent).mats
  const key = def.model ? def.model : id
  const out: StyledMat[] = []
  const add = (kind: "box" | "sphere" | "cyl", pos: V3, scale: V3, color: RGBA, name: string, rot?: V3) => {
    out.push(kit.shape(parent, kind, pos, scale, color, name, true, rot).sm)
  }
  if (key === "mcu_s2mini") {
    add("box", [0, 0.06, 0], [2.54, 0.12, 3.43], def.color, "pcb")
    add("box", [0, 0.22, 1.58], [0.9, 0.32, 0.8], SILVER, "usbc")
    add("box", [0, 0.17, -0.45], [0.8, 0.1, 0.8], BLACK, "esp32s2")
    add("box", [-0.55, 0.15, -1.45], [0.45, 0.06, 0.4], SILVER, "rf-can")
    for (let i = 0; i < def.pins.length; i++) {
      const p = def.pins[i]
      add("cyl", [p.at[0], 0.2, p.at[2]], [0.1, 0.4, 0.1], GOLD, "pin_" + p.name)
    }
  } else if (key === "buck_converter") {
    add("box", [0, 0.06, 0], [4.3, 0.12, 2.1], def.color, "pcb")
    add("box", [0.35, 0.62, 0], [1.3, 1.0, 1.3], BLACK, "inductor")
    add("cyl", [-1.3, 0.72, 0.5], [0.95, 1.2, 0.95], SILVER, "cap_in")
    add("cyl", [1.55, 0.62, 0.55], [0.85, 1.0, 0.85], SILVER, "cap_out")
    add("box", [-0.55, 0.19, -0.35], [1.1, 0.3, 0.9], BLACK, "ic")
    add("box", [0.2, 0.3, -0.75], [0.5, 0.4, 0.4], [0.1, 0.35, 0.9, 1], "trimmer_5v")
    for (let i = 0; i < def.pins.length; i++) {
      const p = def.pins[i]
      add("cyl", [p.at[0], 0.14, p.at[2]], [0.28, 0.14, 0.28], GOLD, "pad_" + p.name)
    }
  } else if (key === "battery") {
    add("box", [0, 0.75, 0], [5.4, 1.5, 3.0], def.color, "pack")
    add("box", [0.2, 1.51, 0], [3.6, 0.03, 2.2], [0.95, 0.6, 0.12, 1], "label")
    add("box", [-2.85, 0.5, -0.6], [0.4, 0.14, 0.14], [1.0, 0.15, 0.1, 1], "lead_plus")
    add("box", [-2.85, 0.5, 0.6], [0.4, 0.14, 0.14], BLACK, "lead_minus")
    for (let i = 0; i < def.pins.length; i++) {
      const p = def.pins[i]
      add("sphere", [p.at[0] - 0.2, p.at[1], p.at[2]], [0.2, 0.2, 0.2], GOLD, "term_" + i)
    }
  } else if (key === "power_switch") {
    add("box", [0, 0.6, 0], [2.1, 1.2, 1.4], BLACK, "body")
    add("box", [0, 1.25, 0], [1.7, 0.25, 1.0], [0.18, 0.18, 0.2, 1], "rocker", [0, 0, 12])
    add("box", [0.0, 1.3, -0.1], [0.12, 0.12, 0.12], [0.9, 0.9, 0.95, 1], "mark")
    for (let i = 0; i < def.pins.length; i++) {
      const p = def.pins[i]
      add("box", [p.at[0], 0.15, 0.85], [0.18, 0.5, 0.35], SILVER, "tab_" + p.name)
    }
  } else if (key === "servo_header_strip") {
    add("box", [0, 0.08, 0], [2.8, 0.16, 1.4], def.color, "protoboard")
    for (let n = 1; n <= 8; n++) {
      const x = -0.889 + (n - 1) * 0.254
      add("box", [x, 0.3, 0], [0.25, 0.28, 0.76], BLACK, "header" + n)
      for (let r = -1; r <= 1; r++) add("cyl", [x, 0.52, r * 0.254], [0.07, 0.5, 0.07], GOLD, "pin" + n + "_" + r)
    }
    add("box", [0, 0.62, 0.0], [2.2, 0.05, 0.05], [1.0, 0.18, 0.15, 1], "rail_5v")
    add("box", [0, 0.62, -0.254], [2.2, 0.05, 0.05], [0.12, 0.12, 0.14, 1], "rail_gnd")
  } else if (key === "oled") {
    add("box", [0, 0.06, 0], [2.73, 0.12, 2.73], def.color, "pcb")
    add("box", [0, 0.14, 0.3], [2.5, 0.04, 1.65], BLACK, "glass")
    for (let i = 0; i < def.pins.length; i++) {
      const p = def.pins[i]
      add("cyl", [p.at[0], 0.16, p.at[2]], [0.09, 0.34, 0.09], GOLD, "pin_" + p.name)
    }
    for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) add("cyl", [sx * 1.2, 0.13, sz * 1.2], [0.28, 0.02, 0.28], SILVER, "hole")
  } else if (key === "servo" || def.group === "servo") {
    add("box", [0, 1.125, 0], [2.28, 2.25, 1.22], def.color, "body")
    add("box", [0, 1.7, 0], [3.25, 0.25, 1.22], def.color, "ears")
    add("cyl", [0.57, 2.4, 0], [1.1, 0.3, 1.1], [0.15, 0.18, 0.3, 1], "gear-boss")
    add("cyl", [0.57, 2.6, 0], [0.8, 0.14, 0.8], [0.92, 0.92, 0.95, 1], "horn")
    add("box", [-1.45, 0.9, 0.3], [0.5, 0.1, 0.1], [1.0, 0.5, 0.1, 1], "wire_sig")
    add("box", [-1.45, 0.9, 0.0], [0.5, 0.1, 0.1], [1.0, 0.15, 0.1, 1], "wire_5v")
    add("box", [-1.45, 0.9, -0.3], [0.5, 0.1, 0.1], [0.4, 0.2, 0.1, 1], "wire_gnd")
  }
  return out
}

/** Local-frame AABB size used for the selection collider of an electronic component (cm). */
export function colliderSizeFor(id: string): V3 {
  const def = getComponent(id)
  if (def.prims && def.prims.length > 0 && def.boundsMin && def.boundsMax) {
    return [Math.max(0.9, def.boundsMax[0] - def.boundsMin[0] + 0.2), Math.max(0.9, def.boundsMax[1] - def.boundsMin[1] + 0.2), Math.max(0.9, def.boundsMax[2] - def.boundsMin[2] + 0.2)]
  }
  if (def.group === "servo") return [3.25, 2.7, 1.3]
  const s = def.sizeCm
  return [s[0] + 0.2, Math.max(s[1], 0.6) + 0.2, s[2] + 0.2]
}

/** Local-frame centre of the collider for an electronic component. */
export function colliderCenterFor(id: string): V3 {
  const def = getComponent(id)
  if (def.prims && def.prims.length > 0 && def.boundsMin && def.boundsMax) {
    const a = def.assembled
    return [(def.boundsMin[0] + def.boundsMax[0]) / 2 - a[0], (def.boundsMin[1] + def.boundsMax[1]) / 2 - a[1], (def.boundsMin[2] + def.boundsMax[2]) / 2 - a[2]]
  }
  if (def.group === "servo") return [0, 1.3, 0]
  return [0, Math.max(def.sizeCm[1], 0.6) / 2, 0]
}

export function packSizeLabel(sz: V3): string {
  return sz[0].toFixed(1) + " x " + sz[1].toFixed(1) + " x " + sz[2].toFixed(1) + " cm"
}

