// WizVizBar.ts - the layer toggles of VISUALIZE under the model: BODY, WIRES, POWER, EXPLODE. A lit pill = on. Four pills, one row, nothing else.
// Owns: the pills and their look. Must not: change the model (WizMain maps a toggle to WizArView / WizRobot).

import {makeInteractable} from "./WizInteract"
import {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {rrect, Rrect, uiText, pop, COLOR_PLATE, COLOR_TEXT, COLOR_DIM, FONT_SEMIBOLD} from "./WizUI"

const W = 5.2
const H = 2.0
const GAP = 0.45

interface Pill {
  id: string
  obj: SceneObject
  bg: Rrect
  label: Text
  on: boolean
  cancel: CancelSet
}

export class WizVizBar {
  private root: SceneObject
  private pills: Pill[] = []
  private shown = false
  onToggle: (id: string, on: boolean) => void = () => {}

  constructor(parent: SceneObject, y: number, items: {id: string; text: string; on: boolean}[]) {
    this.root = global.scene.createSceneObject("VizBar")
    this.root.setParent(parent)
    this.root.getTransform().setLocalPosition(new vec3(0, y, -54))
    const total = items.length * W + (items.length - 1) * GAP
    rrect(this.root, "plate", total + 1.0, H + 0.8, 1.2, COLOR_PLATE, -0.1, {size: 0.07, color: [0.35, 0.8, 0.95, 0.55]})
    for (let i = 0; i < items.length; i++) {
      const d = items[i]
      const o = global.scene.createSceneObject("vizpill_" + d.id)
      o.setParent(this.root)
      o.getTransform().setLocalPosition(new vec3(-total / 2 + W / 2 + i * (W + GAP), 0, 0))
      const bg = rrect(o, "bg", W, H, 0.9, COLOR_PLATE, 0)
      const label = uiText(o, "t", d.text, 20, COLOR_TEXT, new vec3(0, 0, 0.1), FONT_SEMIBOLD)
      const hit = global.scene.createSceneObject("vizpill_hit_" + d.id)
      hit.setParent(o)
      const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
      const box = Shape.createBoxShape()
      box.size = new vec3(W, H + 0.8, 0.9)
      col.shape = box
      const it = makeInteractable(hit)
      it.targetingMode = 3
      const pill: Pill = {id: d.id, obj: o, bg: bg, label: label, on: d.on, cancel: new CancelSet()}
      it.onTriggerEnd.add(() => {
        if (!this.shown) return
        pill.on = !pill.on
        pop(o, 1.12, 0.2, pill.cancel)
        this.paint(pill)
        this.onToggle(pill.id, pill.on)
      })
      this.pills.push(pill)
      this.paint(pill)
    }
    this.root.enabled = false
  }

  private paint(p: Pill) {
    p.bg.rr.backgroundColor = p.on ? new vec4(0.35, 0.85, 1.0, 0.95) : new vec4(0.1, 0.14, 0.21, 0.92)
    p.label.textFill.color = p.on ? new vec4(0.03, 0.06, 0.1, 1) : COLOR_DIM
  }

  show(on: boolean) {
    this.shown = on
    this.root.enabled = on
  }

  isShown(): boolean {
    return this.shown
  }

  /** Reset to the opening state: BODY and WIRES on, POWER and EXPLODE off. */
  reset(on: string[]) {
    for (const p of this.pills) {
      p.on = on.indexOf(p.id) >= 0
      this.paint(p)
    }
  }

  isOn(id: string): boolean {
    const p = this.pills.find((x) => x.id === id)
    return !!p && p.on
  }

  set(id: string, on: boolean) {
    const p = this.pills.find((x) => x.id === id)
    if (!p) return
    p.on = on
    this.paint(p)
  }
}
