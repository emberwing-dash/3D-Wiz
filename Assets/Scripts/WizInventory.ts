// WizInventory.ts - the game-style parts inventory of VISUALIZE: a rounded glass panel with a grid of slots. Each slot shows the part's real 3D
// model turning slowly, a name, a coloured rarity border and a state (ready / in your hand / placed with a check). Pinch a slot and drag: the
// part leaves the slot, follows your hand, shows its suggested spot on the model, and a release puts it there (or anywhere you like). Pinch a
// placed slot to take the part back. Hover = the slot grows and the info bar names the part and its rule; every action has a sound.
// Owns: the panel, slots, hover / pick / place feedback. Must not: decide fit rules or placement (WizVisualize does) or modes (WizMain does).

import {makeInteractable} from "./WizInteract"
import {PartKit, buildElectronic} from "./WizParts"
import {RGBA, getComponent, PROJECT_PACK} from "./ProjectPack"
import {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {WizVisualize, InvItem} from "./WizVisualize"
import {rrect, Rrect, uiText, makeAudio, sfx, scaleTo, pop, COLOR_PLATE, COLOR_SLOT, COLOR_TEXT, COLOR_DIM, COLOR_GOOD, FONT_SEMIBOLD, SFX_PICK, SFX_OK, SFX_ERROR, SFX_SPAWN} from "./WizUI"

const SLOT = 3.1
const GAP = 0.55
const PAD = 1.1
const HEADER = 2.6
const FOOTER = 0.9
const PANEL_Z = -49
const PANEL_Y = -14.2 // the slim PARTS tab sits at the bottom edge of the view; the grid opens upward from it

// rarity colour by what the part is (power red, brains cyan, drivers purple, loads green, small parts white, hardware gold)
const RARITY: {[kind: string]: RGBA} = {
  battery: [1.0, 0.45, 0.35, 1],
  boost: [1.0, 0.6, 0.3, 1],
  mcu: [0.35, 0.95, 1.0, 1],
  l293d: [0.75, 0.55, 1.0, 1],
  hc595: [0.75, 0.55, 1.0, 1],
  motor: [0.5, 0.95, 0.6, 1],
  servo: [0.5, 0.95, 0.6, 1],
  screw: [1.0, 0.82, 0.35, 1],
  driver: [1.0, 0.82, 0.35, 1],
  other: [0.75, 0.82, 0.95, 1],
}

interface Slot {
  item: InvItem
  root: SceneObject
  bg: Rrect
  glow: Rrect
  thumb: SceneObject
  check: Text
  tween: CancelSet
  popT: CancelSet
  hover: boolean
  lastState: string
  rarity: RGBA
}

export class WizInventory {
  private panel: SceneObject // root: holds the tab and the body
  private body!: SceneObject // plate + slots (collapsible)
  private tab!: SceneObject
  private tabCount!: Text
  private tabArrow!: Text
  private open = false // starts folded: only the slim PARTS tab shows, the model has the view
  private bodyH = 0
  private bodyT: CancelSet = new CancelSet()
  private tabPop: CancelSet = new CancelSet()
  private slots: Slot[] = []
  private info!: Text
  private count!: Text
  private bar!: Rrect
  private barFill!: Rrect
  private barW = 10
  private audio: AudioComponent
  private on = false
  private clock = 0
  private shownW = 0
  private openT: CancelSet = new CancelSet()
  private built = false

  constructor(private kit: PartKit, private root: SceneObject, private viz: WizVisualize) {
    this.panel = global.scene.createSceneObject("InventoryPanel")
    this.panel.setParent(root)
    this.panel.getTransform().setLocalPosition(new vec3(0, PANEL_Y, PANEL_Z))
    this.audio = makeAudio(this.panel, 0.55)
    this.panel.enabled = false
  }

  // ------------------------------------------------------------------------------------------------ build
  private rarityOf(it: InvItem): RGBA {
    if (it.kind === "screw") return RARITY.screw
    if (it.kind === "driver") return RARITY.driver
    const def = PROJECT_PACK.components.find((c) => c.id === it.id)
    const k = def && def.elec ? def.elec.kind : "other"
    return RARITY[k] ? RARITY[k] : RARITY.other
  }

  private build() {
    for (const s of this.slots) if (!isNull(s.root)) s.root.destroy()
    this.slots = []
    const items = this.viz.inventory()
    const cols = Math.max(3, Math.ceil(items.length / 2))
    const rows = Math.max(1, Math.ceil(items.length / cols))
    const w = cols * SLOT + (cols - 1) * GAP + PAD * 2
    const h = rows * SLOT + (rows - 1) * GAP + PAD * 2 + HEADER + FOOTER
    this.shownW = w
    // plate
    if (this.body && !isNull(this.body)) this.body.destroy()
    this.body = global.scene.createSceneObject("InvBody")
    this.body.setParent(this.panel)
    this.bodyH = h
    this.body.getTransform().setLocalPosition(new vec3(0, h / 2 + 1.3, 0))
    this.buildTab()
    rrect(this.body, "plate", w, h, 1.2, COLOR_PLATE, -0.1, {size: 0.08, color: [0.35, 0.8, 0.95, 0.6]})
    uiText(this.body, "title", "PARTS", 26, COLOR_TEXT, new vec3(-w / 2 + 2.6, h / 2 - 1.3, 0.1), FONT_SEMIBOLD)
    this.count = uiText(this.body, "count", "0/" + items.length, 26, COLOR_GOOD, new vec3(w / 2 - 2.4, h / 2 - 1.3, 0.1), FONT_SEMIBOLD)
    // progress bar
    this.barW = w - PAD * 2 - 4.4
    this.bar = rrect(this.body, "bar", this.barW, 0.5, 0.25, [0.2, 0.26, 0.34, 1], 0.05)
    this.bar.obj.getTransform().setLocalPosition(new vec3(0.9, h / 2 - 1.3, 0.05))
    this.barFill = rrect(this.body, "barFill", this.barW, 0.5, 0.25, [0.35, 1.0, 0.55, 1], 0.08)
    this.barFill.obj.getTransform().setLocalPosition(new vec3(0.9, h / 2 - 1.3, 0.08))
    // info bar (hover tooltip) under the grid
    this.info = uiText(this.body, "info", "", 22, COLOR_DIM, new vec3(0, -h / 2 + 0.75, 0.1), FONT_SEMIBOLD)
    // slots
    for (let i = 0; i < items.length; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = -w / 2 + PAD + SLOT / 2 + col * (SLOT + GAP)
      const y = h / 2 - HEADER - PAD + 0.2 - SLOT / 2 - row * (SLOT + GAP)
      this.slots.push(this.buildSlot(items[i], x, y))
    }
    if (!this.open) this.body.getTransform().setLocalScale(new vec3(0.001, 0.001, 0.001))
    this.built = true
  }

  /** The slim PARTS tab: always visible, shows the count, a tap opens or closes the grid (so the model is never covered unless asked). */
  private buildTab() {
    if (this.tab && !isNull(this.tab)) this.tab.destroy()
    this.tab = global.scene.createSceneObject("InvTab")
    this.tab.setParent(this.panel)
    rrect(this.tab, "bg", 7.2, 1.7, 0.85, COLOR_PLATE, 0, {size: 0.07, color: [0.35, 0.8, 0.95, 0.7]})
    uiText(this.tab, "t", "PARTS", 22, COLOR_TEXT, new vec3(-1.5, 0, 0.1), FONT_SEMIBOLD)
    this.tabCount = uiText(this.tab, "c", "0/0", 22, COLOR_GOOD, new vec3(1.4, 0, 0.1), FONT_SEMIBOLD)
    this.tabArrow = uiText(this.tab, "a", this.open ? "v" : "^", 22, COLOR_DIM, new vec3(2.9, 0, 0.1), FONT_SEMIBOLD)
    const hit = global.scene.createSceneObject("invtab_hit")
    hit.setParent(this.tab)
    const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
    const box = Shape.createBoxShape()
    box.size = new vec3(7.2, 2.4, 0.9)
    col.shape = box
    const it = makeInteractable(hit)
    it.targetingMode = 3
    it.onTriggerEnd.add(() => {
      pop(this.tab, 1.15, 0.2, this.tabPop)
      this.setOpen(!this.open)
    })
  }

  /** Open / close the grid with an eased scale (the body stays enabled so a drag that started in a slot keeps going). */
  setOpen(on: boolean) {
    this.open = on
    if (this.tabArrow && !isNull(this.tabArrow)) this.tabArrow.text = on ? "v" : "^"
    if (!this.body || isNull(this.body)) return
    sfx(this.audio, on ? SFX_SPAWN : SFX_PICK)
    this.body.getTransform().setLocalPosition(new vec3(0, this.bodyH / 2 + 1.3, 0))
    scaleTo(this.body, on ? this.openScale() : 0.001, 0.28, this.bodyT, on ? "ease-out-back" : "ease-in-out-cubic")
  }

  /** A long item list (two rows of eight) opens smaller so it does not cover the whole view. */
  private openScale(): number {
    return this.slots.length > 10 ? 0.7 : 1
  }

  isOpen(): boolean {
    return this.open
  }

  private buildSlot(item: InvItem, x: number, y: number): Slot {
    const rarity = this.rarityOf(item)
    const root = global.scene.createSceneObject("slot_" + item.id)
    root.setParent(this.body)
    root.getTransform().setLocalPosition(new vec3(x, y, 0))
    const glow = rrect(root, "glow", SLOT + 0.5, SLOT + 0.5, 0.95, [rarity[0], rarity[1], rarity[2], 0.0], -0.02)
    const bg = rrect(root, "bg", SLOT, SLOT, 0.8, COLOR_SLOT, 0, {size: 0.1, color: [rarity[0] * 0.8, rarity[1] * 0.8, rarity[2] * 0.8, 0.9]})
    // 3D thumbnail: the part's real model, scaled to fit, turning slowly
    const thumb = global.scene.createSceneObject("thumb")
    thumb.setParent(root)
    thumb.getTransform().setLocalPosition(new vec3(0, 0.3, 0.4))
    const maxDim = Math.max(item.size[0], item.size[1], item.size[2], 0.1)
    const s = 1.7 / maxDim
    thumb.getTransform().setLocalScale(new vec3(s, s, s))
    thumb.getTransform().setLocalRotation(quat.angleAxis(0.5, new vec3(1, 0, 0)))
    this.fillThumb(thumb, item, rarity)
    uiText(root, "name", item.label, 17, COLOR_TEXT, new vec3(0, -SLOT / 2 + 0.5, 0.9), FONT_SEMIBOLD)
    const check = uiText(root, "check", "", 30, COLOR_GOOD, new vec3(SLOT / 2 - 0.55, SLOT / 2 - 0.5, 0.25), FONT_SEMIBOLD)
    // hit target
    const hit = global.scene.createSceneObject("invhit_" + item.id)
    hit.setParent(root)
    hit.getTransform().setLocalPosition(new vec3(0, 0, 0.3))
    const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
    const box = Shape.createBoxShape()
    box.size = new vec3(SLOT, SLOT, 0.9)
    col.shape = box
    const it = makeInteractable(hit)
    it.targetingMode = 3
    const slot: Slot = {item: item, root: root, bg: bg, glow: glow, thumb: thumb, check: check, tween: new CancelSet(), popT: new CancelSet(), hover: false, lastState: item.state, rarity: rarity}
    it.onHoverEnter.add(() => this.setHover(slot, true))
    it.onHoverExit.add(() => this.setHover(slot, false))
    it.onTriggerStart.add(() => {
      this.pick(slot)
      this.setOpen(false) // the grid folds away while the part is in your hand: the whole model stays in view
    })
    it.onDragUpdate.add((e) => {
      const d = e.planecastDragVector ? e.planecastDragVector : e.dragVector
      if (d) this.viz.dragWorld(slot.item.id, d.x, d.y)
    })
    it.onTriggerEnd.add(() => this.drop(slot))
    return slot
  }

  private fillThumb(parent: SceneObject, item: InvItem, rarity: RGBA) {
    if (item.kind === "component") {
      const def = PROJECT_PACK.components.find((c) => c.id === item.id)
      if (def && def.prims && def.prims.length > 0) {
        const holder = this.kit.obj(parent, "model", [0, -item.size[1] / 2, 0])
        if (buildElectronic(this.kit, item.id, holder).length > 0) return
      }
      this.kit.shape(parent, "box", [0, 0, 0], item.size, [item.color[0], item.color[1], item.color[2], 1], "box", true)
      return
    }
    if (item.kind === "screw") {
      this.kit.shape(parent, "cyl", [0, 0, 0], [0.5, item.size[1] * 0.8, 0.5], rarity, "shaft", false)
      this.kit.shape(parent, "cyl", [0, item.size[1] * 0.4, 0], [1.0, 0.25, 1.0], rarity, "head", false)
      return
    }
    this.kit.shape(parent, "cyl", [0, 1.4, 0], [0.9, 3.0, 0.9], [0.2, 0.55, 0.9, 1], "handle", false)
    this.kit.shape(parent, "cyl", [0, -1.6, 0], [0.22, 3.0, 0.22], [0.8, 0.82, 0.86, 1], "shaft", false)
    this.kit.shape(parent, "cyl", [0, -3.2, 0], [0.34, 0.3, 0.34], rarity, "tip", false)
  }

  // ------------------------------------------------------------------------------------------------ interaction
  private setHover(s: Slot, on: boolean) {
    s.hover = on
    scaleTo(s.root, on ? 1.12 : 1.0, 0.16, s.tween)
    this.info.text = on ? s.item.label + "   " + (s.item.rule !== "" ? s.item.rule : s.item.kind === "screw" ? "hardware" : s.item.kind === "driver" ? "tool" : "part") : ""
  }

  private pick(s: Slot) {
    sfx(this.audio, SFX_PICK)
    pop(s.root, 1.22, 0.22, s.popT)
    this.viz.grab(s.item.id)
  }

  private drop(s: Slot) {
    this.viz.release(s.item.id)
  }

  // ------------------------------------------------------------------------------------------------ per frame
  show(on: boolean) {
    if (on === this.on) return
    this.on = on
    this.viz.setTrayHidden(on)
    if (on) {
      if (!this.built || this.viz.inventory().length !== this.slots.length) this.build()
      this.panel.enabled = true
      this.open = false
      this.body.getTransform().setLocalScale(new vec3(0.001, 0.001, 0.001))
      this.tabArrow.text = "^"
      sfx(this.audio, SFX_SPAWN)
    } else {
      this.openT.cancel()
      this.panel.enabled = false
    }
  }

  isShown(): boolean {
    return this.on
  }

  /** Rebuild when the project (and so the item set) changes. */
  reset() {
    this.built = false
    if (this.on) {
      this.build()
    }
  }

  update(dt: number) {
    if (!this.on || !this.built) return
    this.clock += dt
    const items = this.viz.inventory()
    let placed = 0
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]
      const it = items.find((x) => x.id === s.item.id)
      if (!it) continue
      s.item = it
      if (it.state === "placed" || it.state === "seated") placed++
      // slow turn of the 3D thumbnail (faster while hovered)
      const yaw = this.clock * (s.hover ? 2.2 : 0.7) + i
      s.thumb.getTransform().setLocalRotation(quat.angleAxis(0.45, new vec3(1, 0, 0)).multiply(quat.angleAxis(yaw, new vec3(0, 1, 0))))
      if (it.state !== s.lastState) this.onState(s, it.state)
      // state look: border brightness
      const held = it.state === "held"
      const done = it.state === "placed" || it.state === "seated"
      const a = held ? 0.55 : done ? 0.22 : 0
      s.glow.rr.backgroundColor = new vec4(held ? 1 : done ? 0.35 : s.rarity[0], held ? 1 : done ? 1 : s.rarity[1], held ? 1 : done ? 0.55 : s.rarity[2], a)
      s.check.text = done ? "OK" : held ? "..." : ""
      s.thumb.enabled = !held
    }
    this.count.text = placed + "/" + this.slots.length
    this.tabCount.text = placed + "/" + this.slots.length
    const f = this.slots.length > 0 ? placed / this.slots.length : 0
    this.barFill.rr.size = new vec2(Math.max(0.2, this.barW * f), 0.5)
    this.barFill.obj.getTransform().setLocalPosition(new vec3(0.9 - (this.barW * (1 - f)) / 2, this.barFill.obj.getTransform().getLocalPosition().y, 0.08))
  }

  /** A slot's item changed state: sound + pop. */
  private onState(s: Slot, state: string) {
    const was = s.lastState
    s.lastState = state
    if ((state === "placed" || state === "seated") && was === "held") {
      sfx(this.audio, SFX_OK)
      pop(s.root, 1.25, 0.3, s.popT)
    } else if (state === "tray" && was === "held") {
      sfx(this.audio, SFX_ERROR)
      pop(s.root, 0.9, 0.25, s.popT)
    }
  }

  panelWidth(): number {
    return this.shownW
  }

  placedCount(): number {
    let n = 0
    for (const s of this.slots) if (s.item.state === "placed" || s.item.state === "seated") n++
    return n
  }

  slotCount(): number {
    return this.slots.length
  }
}
