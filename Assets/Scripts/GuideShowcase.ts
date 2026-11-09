// GuideShowcase.ts - the AUTO BUILD showcase furniture of the BUILD page: the controls (PAUSE / STEP / SPEED / DEMO <-> YOUR TURN), the
// MODEL picker (LOAD MODEL), the VIDEO panel (an animated storyboard that stands in for the tutorial video, in sync with the build steps),
// and the in-space outline guide of the current step (arrow part -> target, target name, pin names).
// Owns: those widgets and their per-frame refresh. Reads the guide through WizGuide read-outs only.
// Must not: decide right or wrong, hold step state (WizGuide does), or touch any key / network.

import {PartKit, StyledMat} from "./WizParts"
import {rrect} from "./WizUI"
import {makeTap, label, placeSegment, GLOW_GUIDE, GLOW_OK, TEXT_LIGHT, TEXT_DIM} from "./GuideKit"
import type {WizGuide} from "./WizGuide"

// root-local layout (the root is anchored to the camera when the page opens; the user looks along -z)
// the voice orb floats at about x 8..12, y 4..11 (its caption below it): the video panel sits above it, the pills in a column to its right
const VIDEO_AT = new vec3(11.4, 14.6, -62)
const COL_X = 15.0 // x of the pill column and of the model picker (kept off the right edge of a narrow, portrait preview)
const PILL_W = 3.6
const PILL_Y = [10.2, 8.3, 6.4, 4.5] // PAUSE, STEP, SPEED, MODE
const PICK_ARROWS: [number, number, number] = [14.0, 16.0, 0.7] // x of "<", x of ">", y
const PICK_HEAD_Y = 2.9
const PICK_NAME_Y = 2.2
const VIDEO_W = 9
const VIDEO_H = 6.4
const SCR_W = 8.2

interface Pill {
  root: SceneObject
  text: Text
}

export class GuideShowcase {
  root: SceneObject
  private pills: {[id: string]: Pill} = {}
  private clock = 0
  // video widgets
  private vCaption!: Text
  private vNext!: Text
  private vTag!: Text
  private vBarFill!: SceneObject
  private vItem!: SceneObject
  private vItemMat!: StyledMat
  private vItemText!: Text
  private vWire!: SceneObject
  private vWireMat!: StyledMat
  private vDotA!: SceneObject
  private vDotB!: SceneObject
  private slotObjs: {obj: SceneObject; mat: StyledMat; text: Text}[] = []
  private slotOf: {[part: string]: number} = {}
  private placeOrder: string[] = []
  private slotX: number[] = []
  // outline guide
  private arrow: SceneObject
  private arrowHead: SceneObject
  private arrowMats: StyledMat[] = []
  private tLabel: Text
  private pinLabels: Text[] = []
  private modelName!: Text
  private modelCount!: Text

  constructor(private g: WizGuide, private kit: PartKit, parent: SceneObject) {
    this.root = kit.obj(parent, "GuideShowcase")
    this.buildControls()
    this.buildModelPicker()
    this.buildVideo()
    const a = kit.shape(kit.obj(this.root, "ShowArrowHolder"), "cyl", [0, 0, 0], [1, 1, 1], GLOW_GUIDE, "shaft", false)
    this.arrow = a.obj.getParent()
    this.arrowMats.push(a.sm)
    const h = kit.shape(this.root, "sphere", [0, 0, 0], [0.7, 0.7, 0.7], GLOW_GUIDE, "ShowArrowHead", false)
    this.arrowHead = h.obj
    this.arrowMats.push(h.sm)
    this.arrow.enabled = false
    this.arrowHead.enabled = false
    this.tLabel = label(this.root, "ShowTargetLabel", "", 24, vec3.zero(), TEXT_LIGHT, true)
    this.tLabel.getSceneObject().enabled = false
    for (let i = 0; i < 2; i++) {
      const l = label(this.root, "ShowPinLabel" + i, "", 18, vec3.zero(), TEXT_LIGHT, true)
      l.getSceneObject().enabled = false
      this.pinLabels.push(l)
    }
  }

  // ------------------------------------------------------------------ controls
  private pill(id: string, text: string, x: number, y: number, w: number, color: [number, number, number, number], on: () => void): Pill {
    const r = this.kit.obj(this.root, "show_btn_" + id, [x, y, -62])
    rrect(r, "plate_" + id, w, 1.8, 0.9, color, 0, {size: 0.12, color: [0.8, 0.97, 1, 0.9]})
    const t = label(r, "label_" + id, text, 17, new vec3(0, 0, 0.3), TEXT_LIGHT, true)
    makeTap(this.kit.obj(r, "show_btn_hit_" + id), new vec3(w + 0.3, 2.1, 2.0), on)
    const p = {root: r, text: t}
    this.pills[id] = p
    return p
  }

  private buildControls() {
    this.pill("pause", "PAUSE", COL_X, PILL_Y[0], PILL_W, [0.12, 0.3, 0.5, 0.92], () => this.g.toggleDemoPause())
    this.pill("step", "STEP", COL_X, PILL_Y[1], PILL_W, [0.12, 0.3, 0.5, 0.92], () => this.g.stepDemo())
    this.pill("speed", "SPEED x1", COL_X, PILL_Y[2], PILL_W, [0.12, 0.3, 0.5, 0.92], () => this.g.cycleDemoSpeed())
    this.pill("mode", "MODE: DEMO", COL_X, PILL_Y[3], PILL_W, [0.1, 0.5, 0.3, 0.95], () => this.g.toggleYourTurn())
  }

  private buildModelPicker() {
    this.modelCount = label(this.root, "ShowModelHead", "LOAD MODEL", 13, new vec3(COL_X, PICK_HEAD_Y, -62), TEXT_DIM)
    this.modelName = label(this.root, "ShowModelName", "RC car", 16, new vec3(COL_X, PICK_NAME_Y, -62), TEXT_LIGHT, true)
    this.pill("model_prev", "<", PICK_ARROWS[0], PICK_ARROWS[2], 1.5, [0.2, 0.3, 0.42, 0.95], () => this.g.pickModel(-1))
    this.pill("model_next", ">", PICK_ARROWS[1], PICK_ARROWS[2], 1.5, [0.2, 0.3, 0.42, 0.95], () => this.g.pickModel(1))
  }

  // ------------------------------------------------------------------ video panel
  private buildVideo() {
    const k = this.kit
    const v = k.obj(this.root, "GuideVideo", [VIDEO_AT.x, VIDEO_AT.y, VIDEO_AT.z])
    rrect(v, "video_plate", VIDEO_W, VIDEO_H, 0.9, [0.08, 0.12, 0.2, 0.92], 0, {size: 0.16, color: [1, 0.8, 0.35, 0.95]})
    label(v, "video_head", "TUTORIAL VIDEO (STAND-IN)", 14, new vec3(0, 2.85, 0.3), new vec4(1, 0.82, 0.4, 1), true)
    rrect(k.obj(v, "video_screen_holder", [0, 1.1, 0]), "video_screen", SCR_W, 2.9, 0.4, [0.03, 0.05, 0.1, 0.95], 0.1)
    // slots: one per "place" step, in step order
    const n = this.g.stepCount()
    for (let i = 0; i < n; i++) {
      const st = this.g.stepAt(i)
      if (st.kind === "place" && st.part) {
        this.slotOf[st.part] = this.placeOrder.length
        this.placeOrder.push(st.part)
      }
    }
    const cnt = this.placeOrder.length
    const sp = cnt > 1 ? Math.min(2.2, 6.4 / (cnt - 1)) : 0
    for (let i = 0; i < cnt; i++) {
      const x = -(sp * (cnt - 1)) / 2 + i * sp
      this.slotX.push(x)
      const slot = k.obj(v, "video_slot" + i, [x, 1.5, 0.3])
      const sm = k.shape(slot, "box", [0, 0, 0], [1.7, 0.95, 0.06], [0.3, 0.8, 0.9, 0.45], "slot", false).sm
      const tx = label(slot, "slot_text", this.g.partShort(this.placeOrder[i]), 10, new vec3(0, 0, 0.1), TEXT_DIM)
      this.slotObjs.push({obj: slot, mat: sm, text: tx})
    }
    k.shape(v, "box", [0, 0.1, 0.25], [SCR_W - 0.4, 0.04, 0.04], [0.4, 0.5, 0.6, 0.6], "tray_line", false)
    label(v, "tray_text", "PARTS", 9, new vec3(-3.6, -0.15, 0.3), TEXT_DIM)
    // moving part
    this.vItem = k.obj(v, "video_item", [0, 0.2, 0.5])
    this.vItemMat = k.shape(this.vItem, "box", [0, 0, 0], [1.6, 0.8, 0.1], [1, 0.6, 0.2, 0.95], "item", false).sm
    this.vItemText = label(this.vItem, "item_text", "", 11, new vec3(0, 0, 0.12), TEXT_LIGHT, true)
    // wire (a thin bar that grows from pin to pin) and its two pin dots
    this.vWire = k.obj(v, "video_wire", [0, 1.0, 0.5])
    this.vWireMat = k.shape(this.vWire, "box", [0, 0, 0], [1, 0.12, 0.08], [1, 0.8, 0.2, 0.95], "wirebar", false).sm
    this.vDotA = k.shape(v, "sphere", [0, 1.0, 0.55], [0.3, 0.3, 0.3], [1, 1, 1, 0.9], "dotA", false).obj
    this.vDotB = k.shape(v, "sphere", [0, 1.0, 0.55], [0.3, 0.3, 0.3], [1, 1, 1, 0.9], "dotB", false).obj
    this.vWire.enabled = false
    this.vDotA.enabled = false
    this.vDotB.enabled = false
    this.vCaption = label(v, "video_caption", "", 18, new vec3(0, -0.75, 0.3), TEXT_LIGHT, true)
    this.vNext = label(v, "video_next", "", 13, new vec3(0, -1.4, 0.3), TEXT_DIM)
    rrect(k.obj(v, "video_bar_holder", [0, -2.0, 0]), "video_bar_track", 7.4, 0.22, 0.1, [0.2, 0.28, 0.4, 0.9], 0.2)
    this.vBarFill = k.shape(v, "box", [-3.7, -2.0, 0.3], [0.01, 0.2, 0.05], [1, 0.8, 0.35, 1], "bar_fill", false).obj
    this.vTag = label(v, "video_tag", "", 14, new vec3(0, -2.65, 0.3), TEXT_DIM)
  }

  private slotPos(part: string): number {
    const i = this.slotOf[part]
    return i === undefined ? 0 : this.slotX[i]
  }

  private pinX(key: string): number {
    const part = key.split(".")[0]
    if (this.slotOf[part] !== undefined) return this.slotPos(part)
    return 3.8 // a breadboard rail: the right end of the strip
  }

  private wireColor(key: string): [number, number, number, number] {
    const k = key.toLowerCase()
    if (k.indexOf("5v") >= 0 || k.indexOf("plus") >= 0 || k.indexOf("+") >= 0 || k.indexOf("vcc") >= 0) return [1, 0.3, 0.25, 0.95]
    if (k.indexOf("gnd") >= 0 || k.indexOf("minus") >= 0 || k.indexOf("-") >= 0) return [0.3, 0.55, 1, 0.95]
    return [1, 0.8, 0.2, 0.95]
  }

  // ------------------------------------------------------------------ per-frame refresh
  update(dt: number) {
    this.clock += dt
    this.refreshControls()
    this.refreshVideo()
    this.refreshOutline()
  }

  private refreshControls() {
    const g = this.g
    this.pills["pause"].text.text = g.demoRunning() && !g.demoPaused() ? "PAUSE" : "PLAY"
    this.pills["speed"].text.text = "SPEED x" + g.demoSpeed()
    this.pills["mode"].text.text = g.demoRunning() ? "MODE: DEMO" : "MODE: YOUR TURN"
    this.modelName.text = g.modelName()
    this.modelCount.text = "LOAD MODEL  " + (g.modelIndex() + 1) + "/" + g.modelCount()
  }

  private refreshVideo() {
    const g = this.g
    const idx = g.stepIndex()
    const total = g.stepCount()
    const st = g.step()
    const period = 3.4
    const t = (this.clock % period) / period
    // placed slots go green, the rest stay dim
    for (let i = 0; i < this.slotObjs.length; i++) {
      const done = g.isPartPlaced(this.placeOrder[i])
      this.slotObjs[i].mat.set(done ? GLOW_OK : [0.3, 0.8, 0.9, 0.45])
      this.slotObjs[i].text.text = this.g.partShort(this.placeOrder[i])
    }
    this.vItem.enabled = false
    this.vWire.enabled = false
    this.vDotA.enabled = false
    this.vDotB.enabled = false
    if (st === null) {
      this.vCaption.text = g.phase() === "idle" ? "" : "Build complete"
      this.vNext.text = g.phase() === "play" ? "Powered on: drive with the joystick" : "POWER ON: press PLAY"
      this.setBar(1)
    } else {
      this.vCaption.text = this.clip(st.title, 26)
      const nx = idx + 1 < total ? g.stepAt(idx + 1) : null
      this.vNext.text = nx === null ? "NEXT: power on" : "NEXT: " + this.clip(nx.title, 24)
      const ease = t < 0.7 ? t / 0.7 : 1
      const e = ease * ease * (3 - 2 * ease)
      if (st.kind === "place" && st.part) {
        const x = this.slotPos(st.part)
        const done = g.isPartPlaced(st.part)
        this.vItem.enabled = true
        const y = done ? 1.5 : 0.2 + (1.5 - 0.2) * e + Math.sin(Math.PI * e) * 0.55
        this.vItem.getTransform().setLocalPosition(new vec3(x, y, 0.5))
        this.vItemMat.set(e >= 1 || done ? GLOW_OK : [1, 0.6, 0.2, 0.95])
        this.vItemText.text = g.partShort(st.part)
      } else if (st.pins) {
        const ax = this.pinX(st.pins[0])
        const bx = this.pinX(st.pins[1])
        this.vWire.enabled = true
        const pulse = 0.22 + 0.1 * Math.sin(this.clock * 9)
        this.vDotA.enabled = true
        this.vDotB.enabled = true
        this.vDotA.getTransform().setLocalPosition(new vec3(ax, 1.0, 0.55))
        this.vDotB.getTransform().setLocalPosition(new vec3(bx, 1.0, 0.55))
        const sc = t < 0.25 ? 0.3 + pulse : 0.3
        this.vDotA.getTransform().setLocalScale(new vec3(sc, sc, sc))
        this.vDotB.getTransform().setLocalScale(new vec3(sc, sc, sc))
        const grow = t < 0.25 ? 0 : Math.min(1, (t - 0.25) / 0.5)
        const len = Math.max(0.02, Math.abs(bx - ax) * grow)
        const dir = bx >= ax ? 1 : -1
        this.vWire.getTransform().setLocalPosition(new vec3(ax + (dir * len) / 2, 1.0, 0.5))
        this.vWire.getChild(0).getTransform().setLocalScale(new vec3(len, 0.12, 0.08))
        this.vWireMat.set(this.wireColor(st.pins[0] + st.pins[1]))
      }
      this.setBar((idx + (g.phase() === "success" ? 1 : e * 0.9)) / Math.max(1, total))
    }
    const mode = g.demoRunning() ? (g.demoPaused() ? "PAUSED" : "PLAYING x" + g.demoSpeed()) : "YOUR TURN"
    this.vTag.text = mode + (total > 0 ? "   step " + Math.min(total, idx + 1) + " of " + total : "")
  }

  private clip(s: string, n: number): string {
    return s.length > n ? s.substring(0, n - 1) + "." : s
  }

  private setBar(f: number) {
    const w = 7.4 * Math.max(0.01, Math.min(1, f))
    this.vBarFill.getTransform().setLocalScale(new vec3(w, 0.2, 0.05))
    this.vBarFill.getTransform().setLocalPosition(new vec3(-3.7 + w / 2, -2.0, 0.3))
    this.progress = f
  }

  // ------------------------------------------------------------------ outline guide in space
  private refreshOutline() {
    const g = this.g
    const st = g.step()
    const on = st !== null && g.phase() === "working"
    const showArrow = on && st !== null && st.kind === "place" && !!st.part && !!st.spot
    const showPins = on && st !== null && st.kind === "wire" && !!st.pins
    if (this.arrow.enabled !== showArrow) {
      this.arrow.enabled = showArrow
      this.arrowHead.enabled = showArrow
      this.tLabel.getSceneObject().enabled = showArrow
    }
    for (let i = 0; i < 2; i++) if (this.pinLabels[i].getSceneObject().enabled !== showPins) this.pinLabels[i].getSceneObject().enabled = showPins
    const bench = g.bench
    const up = bench.work.getTransform().getWorldRotation().multiplyVec3(new vec3(0, 1, 0))
    if (showArrow && st !== null) {
      const part = st.part as string
      const spot = st.spot as string
      const a = bench.partWorldPos(part).add(up.uniformScale(1.2))
      const b = bench.spotWorldPos(spot).add(up.uniformScale(2.0))
      const pulse = 0.55 + 0.35 * Math.sin(this.clock * 6)
      for (const m of this.arrowMats) m.set([0.3, 0.95, 1.0, pulse])
      placeSegment(this.arrow, a, b, 0.14, 1)
      this.arrowHead.getTransform().setWorldPosition(b)
      this.tLabel.text = g.partLabel(part) + " here"
      this.tLabel.getSceneObject().getTransform().setWorldPosition(bench.spotWorldPos(spot).add(up.uniformScale(5.0)))
    } else if (showPins && st !== null && st.pins) {
      for (let i = 0; i < 2; i++) {
        const key = st.pins[i]
        this.pinLabels[i].text = key.indexOf(".") >= 0 ? key.split(".")[0].toUpperCase() + " " + key.split(".")[1] : key
        this.pinLabels[i].getSceneObject().getTransform().setWorldPosition(bench.pinWorldPos(key).add(up.uniformScale(1.9)))
      }
    }
  }

  // ------------------------------------------------------------------ read-outs for tests
  progress = 0
  arrowVisible(): boolean {
    return this.arrow.enabled && this.arrowHead.enabled
  }
  arrowEndWorld(): vec3 {
    return this.arrowHead.getTransform().getWorldPosition()
  }
  targetLabelText(): string {
    return this.tLabel.getSceneObject().enabled ? this.tLabel.text : ""
  }
  pinLabelTexts(): string[] {
    return this.pinLabels.filter((l) => l.getSceneObject().enabled).map((l) => l.text)
  }
  videoCaption(): string {
    return this.vCaption.text
  }
  videoTag(): string {
    return this.vTag.text
  }
  /** World points of the showcase widgets that must be in the camera view. */
  viewPoints(): vec3[] {
    const out: vec3[] = []
    const r = this.root.getTransform().getWorldTransform()
    const pts = [VIDEO_AT, new vec3(PICK_ARROWS[0], PICK_ARROWS[2], -62), new vec3(PICK_ARROWS[1], PICK_ARROWS[2], -62)]
    for (const y of PILL_Y) pts.push(new vec3(COL_X, y, -62))
    for (const l of pts) out.push(r.multiplyPoint(l))
    return out
  }
  pillWorld(id: string): vec3 {
    return this.pills[id].root.getTransform().getWorldPosition()
  }
}
