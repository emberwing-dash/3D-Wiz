// WizProjectCards.ts - the Projects carousel: a row of 3D thumbnail cards (rotating mini model + icon + a name of at most two words).
// Owns: card visuals, hover/pop animation, pinch-to-pick. Pinching (or mouse-clicking) a card raises onPick(projectId).
// Must not: load packs or know what a project contains (WizMain does) and contains no buttons, only 3D cards.

import {Interactable, makeInteractable} from "./WizInteract"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {RGBA, V3} from "./ProjectPack"
import {PartKit, StyledMat} from "./WizParts"
import {makeLabel, LABEL_COLOR} from "./WizLabelsUI"
import {makeIconQuad} from "./WizIcons"

export interface CardDef {
  id: string
  name: string // at most two words
  icon: string
  thumb: string // thumbnail recipe id (sesame | pet | car | hand | circuit | mine)
  accent: RGBA
  steps: number // build steps (shown as a number only)
}

interface CardRt {
  def: CardDef
  root: SceneObject
  spin: SceneObject
  border: StyledMat
  hover: boolean
  pop: number
  k: number
}

const PITCH = 4.75

export class ProjectCards {
  readonly root: SceneObject
  private cards: CardRt[] = []
  private kit: PartKit
  private boxMesh: RenderMesh
  private faceMat: Material
  private current: string = ""
  private t: number = 0
  private visible: boolean = false
  private _onPick = new Event<string>()
  readonly onPick: PublicApi<string> = this._onPick.publicApi()
  private graveyard: SceneObject[] = []

  constructor(kit: PartKit, parent: SceneObject, boxMesh: RenderMesh, faceMat: Material) {
    this.kit = kit
    this.boxMesh = boxMesh
    this.faceMat = faceMat
    this.root = kit.obj(parent, "ProjectCards")
    this.root.enabled = false
  }

  isVisible(): boolean {
    return this.visible
  }

  ids(): string[] {
    return this.cards.map((c) => c.def.id)
  }

  /** Test helper: raise the same event a pinch on the card raises. */
  pick(id: string) {
    for (const c of this.cards) if (c.def.id === id) this._onPick.invoke(id)
  }

  show(defs: CardDef[], current: string) {
    this.current = current
    for (const c of this.cards) {
      c.root.enabled = false
      this.graveyard.push(c.root)
    }
    this.cards = []
    const n = defs.length
    for (let i = 0; i < n; i++) this.cards.push(this.makeCard(defs[i], (i - (n - 1) / 2) * PITCH))
    this.visible = true
    this.t = 0
    this.root.enabled = true
  }

  hide() {
    this.visible = false
    this.root.enabled = false
  }

  private makeCard(d: CardDef, x: number): CardRt {
    const kit = this.kit
    const root = kit.obj(this.root, "card_" + d.id, [x, 0, 0])
    const isCur = d.id === this.current
    const border = kit.shape(root, "box", [0, 0, -0.06], [4.45, 6.1, 0.12], isCur ? [0.3, 1.0, 0.5, 1] : d.accent, "border", false).sm
    kit.shape(root, "box", [0, 0, 0], [4.15, 5.8, 0.2], [0.04, 0.07, 0.12, 1], "plate", false)
    const spin = kit.obj(root, "thumb", [0, 0.7, 0.5])
    buildThumb(kit, spin, d.thumb)
    const ic = makeIconQuad(root, this.boxMesh, this.faceMat, "icon", d.icon, 0.95, [d.accent[0], d.accent[1], d.accent[2], 1])
    ic.obj.getTransform().setLocalPosition(new vec3(-1.5, 2.3, 0.14))
    makeLabel(root, "name", d.name, 26, [0, -2.15, 0.14], LABEL_COLOR)
    makeLabel(root, "count", d.steps > 0 ? "" + d.steps : "+", 30, [1.5, 2.3, 0.14], new vec4(d.accent[0], d.accent[1], d.accent[2], 1))
    const hit = kit.obj(root, "card_hit_" + d.id, [0, 0, 0.1])
    const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
    const box = Shape.createBoxShape()
    box.size = new vec3(4.4, 6.0, 1.2)
    col.shape = box
    const it = makeInteractable(hit)
    it.targetingMode = 3
    const rt: CardRt = {def: d, root: root, spin: spin, border: border, hover: false, pop: 0, k: 0}
    it.onHoverEnter.add(() => {
      rt.hover = true
    })
    it.onHoverExit.add(() => {
      rt.hover = false
    })
    it.onTriggerEnd.add(() => {
      if (this.t < 0.4) return
      rt.pop = 0.3
      this._onPick.invoke(d.id)
    })
    return rt
  }

  update(dt: number, clock: number) {
    for (let g = this.graveyard.length - 1; g >= 0; g--) {
      if (this.t > 1.0 || !this.visible) {
        if (!isNull(this.graveyard[g])) this.graveyard[g].destroy()
        this.graveyard.splice(g, 1)
      }
    }
    if (!this.visible) return
    this.t += dt
    const n = this.cards.length
    for (let i = 0; i < n; i++) {
      const c = this.cards[i]
      const k = Math.max(0, Math.min(1, this.t * 3.0 - i * 0.18))
      const ease = k * k * (3 - 2 * k)
      if (c.pop > 0) c.pop = Math.max(0, c.pop - dt)
      const s = Math.max(0.001, ease * (c.hover ? 1.1 : 1) * (1 + (c.pop > 0 ? 0.2 * (c.pop / 0.3) : 0)))
      c.root.getTransform().setLocalScale(new vec3(s, s, s))
      c.spin.getTransform().setLocalRotation(quat.fromEulerVec(new vec3(0.25, clock * 0.9 + i, 0)))
      const base = c.def.id === this.current ? [0.3, 1.0, 0.5, 1] : c.def.accent
      const b = c.hover ? 1.0 : 0.75
      c.border.set([Math.min(1, base[0] * b + (c.hover ? 0.2 : 0)), Math.min(1, base[1] * b + (c.hover ? 0.2 : 0)), Math.min(1, base[2] * b + (c.hover ? 0.2 : 0)), 1])
    }
  }
}

// ---- thumbnails: tiny primitive models (each about 3 cm across) ----------------------------------------------------------
function buildThumb(kit: PartKit, parent: SceneObject, id: string) {
  const b = (p: V3, s: V3, c: RGBA, n: string, r?: V3) => kit.shape(parent, "box", p, s, c, n, true, r)
  const cy = (p: V3, s: V3, c: RGBA, n: string, r?: V3) => kit.shape(parent, "cyl", p, s, c, n, true, r)
  const sp = (p: V3, d: number, c: RGBA, n: string) => kit.shape(parent, "sphere", p, [d, d, d], c, n, true)
  const OR: RGBA = [0.97, 0.5, 0.14, 1]
  if (id === "sesame") {
    b([0, 0, 0], [2.0, 0.55, 1.5], [0.93, 0.93, 0.95, 1], "body")
    for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) b([sx * 1.15, -0.4, sz * 0.6], [0.45, 0.8, 0.35], OR, "leg" + sx + sz)
    b([-0.55, 0.45, 0], [0.4, 0.4, 0.3], [0.93, 0.93, 0.95, 1], "ear1")
    b([0.55, 0.45, 0], [0.4, 0.4, 0.3], [0.93, 0.93, 0.95, 1], "ear2")
    b([0, 0.05, 0.78], [0.9, 0.35, 0.05], [0.2, 0.9, 1.0, 1], "screen")
  } else if (id === "pet") {
    b([0, 0, 0], [2.1, 1.5, 1.7], [0.92, 0.93, 0.96, 1], "shell")
    b([-0.5, 0.1, 0.87], [0.5, 0.5, 0.05], [0.2, 0.95, 1.0, 1], "eyeL")
    b([0.5, 0.1, 0.87], [0.5, 0.5, 0.05], [0.2, 0.95, 1.0, 1], "eyeR")
  } else if (id === "car") {
    b([0, 0, 0], [2.7, 0.18, 1.3], [0.55, 0.57, 0.62, 1], "plate")
    for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) cy([sx * 0.95, 0, sz * 0.8], [0.75, 0.3, 0.75], [0.1, 0.1, 0.12, 1], "w" + sx + sz, [90, 0, 0])
    b([1.0, 0.35, 0], [0.4, 0.3, 0.8], [0.2, 0.5, 0.95, 1], "sonar")
    b([-0.4, 0.3, 0], [0.8, 0.35, 0.7], [0.15, 0.55, 0.45, 1], "uno")
  } else if (id === "forrc") {
    b([0, 0, 0], [2.7, 0.3, 1.3], [0.3, 0.52, 0.92, 1], "chassis")
    b([-0.2, 0.3, 0], [1.4, 0.3, 0.9], [0.9, 0.92, 0.95, 1], "riser")
    for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) cy([sx * 0.95, -0.1, sz * 0.8], [0.7, 0.18, 0.7], [0.12, 0.12, 0.14, 1], "w" + sx + sz, [0, 0, 90])
    b([-0.3, 0.55, 0], [0.8, 0.12, 0.6], [0.15, 0.55, 0.45, 1], "pcb")
    sp([0.4, 0.62, 0.1], 0.22, [1.0, 0.25, 0.2, 1], "led")
  } else if (id === "hand") {
    b([-0.9, 0, 0], [1.2, 0.5, 1.2], [0.85, 0.85, 0.9, 1], "forearm")
    b([0.1, 0, 0], [0.9, 0.3, 1.3], [0.93, 0.93, 0.95, 1], "palm")
    for (let i = 0; i < 4; i++) b([1.0, 0, -0.5 + i * 0.33], [0.9 + (i === 1 ? 0.2 : 0), 0.22, 0.24], [0.93, 0.93, 0.95, 1], "f" + i)
    b([0.6, 0, 0.85], [0.7, 0.22, 0.24], [0.93, 0.93, 0.95, 1], "thumb", [0, 30, 0])
  } else if (id === "circuit") {
    b([0, 0, 0], [2.8, 0.2, 1.7], [0.9, 0.9, 0.86, 1], "board")
    b([0, 0.12, -0.7], [2.6, 0.03, 0.1], [0.9, 0.2, 0.2, 1], "rail")
    sp([-0.6, 0.35, 0.2], 0.4, [1.0, 0.25, 0.2, 1], "led")
    cy([0.3, 0.2, 0.2], [0.15, 0.7, 0.15], [0.85, 0.7, 0.45, 1], "res", [0, 0, 90])
    b([0.95, 0.25, 0.2], [0.35, 0.25, 0.35], [0.15, 0.15, 0.18, 1], "btn")
  } else {
    b([0, 0, 0], [1.6, 1.6, 1.6], [0.55, 0.6, 0.7, 1], "cube")
    b([0, 0, 0.85], [0.9, 0.18, 0.05], [0.3, 1.0, 1.0, 1], "plusH")
    b([0, 0, 0.85], [0.18, 0.9, 0.05], [0.3, 1.0, 1.0, 1], "plusV")
  }
}
