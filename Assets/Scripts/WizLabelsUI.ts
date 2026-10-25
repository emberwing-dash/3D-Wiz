// WizLabelsUI.ts - 3D label + dimension-box views (text in world space for pin names, part names, cm dimensions).
// Owns: Text creation for labels attached to scene content, a wireframe dimension box with W x H x D cm captions.
// Must not: hold app state or decide when labels show (the robot / bench / main script drive them).
// Text for the scene lives here (not in the controllers) so every visible string is created by a UI module.

import {V3, RGBA} from "./ProjectPack"
import {PartKit, StyledMat} from "./WizParts"

export const LABEL_COLOR = new vec4(0.92, 0.97, 1, 1)
export const LABEL_ACCENT = new vec4(0.35, 0.95, 1.0, 1)
export const LABEL_WARN = new vec4(1.0, 0.75, 0.25, 1)

/** A small world-space Text. `size` is the Lens font size (em height in cm ~ size / 43.9). */
export function makeLabel(parent: SceneObject, name: string, text: string, size: number, pos: V3, color: vec4 = LABEL_COLOR, rotDeg?: V3): Text {
  const so = global.scene.createSceneObject(name)
  so.setParent(parent)
  so.getTransform().setLocalPosition(new vec3(pos[0], pos[1], pos[2]))
  if (rotDeg) so.getTransform().setLocalRotation(quat.fromEulerVec(new vec3((rotDeg[0] * Math.PI) / 180, (rotDeg[1] * Math.PI) / 180, (rotDeg[2] * Math.PI) / 180)))
  const t = so.createComponent("Component.Text") as Text
  t.text = text
  t.size = size
  t.depthTest = true
  t.textFill.color = color
  // dark border so text stays readable on any background (additive display: dark outline + bright fill)
  t.outlineSettings.enabled = true
  t.outlineSettings.size = 0.6
  t.outlineSettings.fill.color = new vec4(0.02, 0.03, 0.06, 1)
  t.horizontalAlignment = HorizontalAlignment.Center
  t.verticalAlignment = VerticalAlignment.Center
  t.horizontalOverflow = HorizontalOverflow.Overflow
  t.verticalOverflow = VerticalOverflow.Overflow
  return t
}

/** Wireframe box (12 thin edges) with three dimension captions. Parent is NOT scaled; call setBox() with world-size values. */
export class DimBox {
  root: SceneObject
  private edges: SceneObject[] = []
  private mats: StyledMat[] = []
  private labW!: Text
  private labH!: Text
  private labD!: Text
  private labT!: Text
  private thick: number = 0.08

  constructor(kit: PartKit, parent: SceneObject, name: string, color: RGBA, labelSize: number) {
    this.root = global.scene.createSceneObject(name)
    this.root.setParent(parent)
    for (let i = 0; i < 12; i++) {
      const r = kit.shape(this.root, "box", [0, 0, 0], [0.1, 0.1, 0.1], color, "edge" + i, false)
      this.edges.push(r.obj)
      this.mats.push(r.sm)
    }
    this.labW = makeLabel(this.root, "dimW", "", labelSize, [0, 0, 0], LABEL_ACCENT)
    this.labH = makeLabel(this.root, "dimH", "", labelSize, [0, 0, 0], LABEL_ACCENT)
    this.labD = makeLabel(this.root, "dimD", "", labelSize, [0, 0, 0], LABEL_ACCENT)
    this.labT = makeLabel(this.root, "dimTitle", "", labelSize, [0, 0, 0], LABEL_WARN)
  }

  setThickness(t: number): void {
    this.thick = t
  }

  /** Box from min..max (in the parent frame, cm) with captions showing the REAL size (cm). */
  setBox(min: V3, max: V3, realSize: V3, title: string, offset: number = 0.8): void {
    const t = this.thick
    const cx = (min[0] + max[0]) / 2
    const cy = (min[1] + max[1]) / 2
    const cz = (min[2] + max[2]) / 2
    const sx = max[0] - min[0]
    const sy = max[1] - min[1]
    const sz = max[2] - min[2]
    const ex: V3[] = []
    const es: V3[] = []
    for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
      ex.push([cx, y, z])
      es.push([sx, t, t])
    }
    for (const x of [min[0], max[0]]) for (const z of [min[2], max[2]]) {
      ex.push([x, cy, z])
      es.push([t, sy, t])
    }
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) {
      ex.push([x, y, cz])
      es.push([t, t, sz])
    }
    for (let i = 0; i < 12; i++) {
      const tr = this.edges[i].getTransform()
      tr.setLocalPosition(new vec3(ex[i][0], ex[i][1], ex[i][2]))
      tr.setLocalScale(new vec3(es[i][0], es[i][1], es[i][2]))
    }
    this.labW.text = realSize[0].toFixed(1) + " cm"
    this.labH.text = realSize[1].toFixed(1) + " cm"
    this.labD.text = realSize[2].toFixed(1) + " cm"
    this.labT.text = title
    this.labW.getSceneObject().getTransform().setLocalPosition(new vec3(cx, min[1] - offset, max[2] + offset * 0.5))
    this.labH.getSceneObject().getTransform().setLocalPosition(new vec3(max[0] + offset * 1.6, cy, max[2] + offset * 0.5))
    this.labD.getSceneObject().getTransform().setLocalPosition(new vec3(min[0] - offset * 1.6, min[1], cz))
    this.labT.getSceneObject().getTransform().setLocalPosition(new vec3(cx, max[1] + offset, cz))
  }

  setVisible(on: boolean): void {
    this.root.enabled = on
  }

  /** Keep captions a constant world size and facing the viewer while the parent model is scaled/yawed. */
  setLabelScale(scale: number, yawRad: number): void {
    const q = quat.fromEulerVec(new vec3(0, -yawRad, 0))
    const labs = [this.labW, this.labH, this.labD, this.labT]
    for (let i = 0; i < labs.length; i++) {
      const tr = labs[i].getSceneObject().getTransform()
      tr.setLocalScale(new vec3(scale, scale, scale))
      tr.setLocalRotation(q)
    }
  }

  /** Colour of the 12 edges (used for the pulsing ghost outline). */
  tint(c: RGBA): void {
    for (let i = 0; i < this.mats.length; i++) this.mats[i].set(c)
  }

  /** Remove the caption text (ghost outlines carry no words). */
  clearCaptions(): void {
    this.labW.text = ""
    this.labH.text = ""
    this.labD.text = ""
    this.labT.text = ""
  }

  captions(): string[] {
    return [this.labW.text, this.labH.text, this.labD.text]
  }
}
