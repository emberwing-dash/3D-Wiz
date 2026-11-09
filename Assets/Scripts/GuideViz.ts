// GuideViz.ts - the VISUALIZE page: the project's 3D model (the RC car, solid "3D printed" look, optional see-through) large on the table and a tray of
// real-looking electronic components (GuideParts.ts) that you drag onto its mount points. A part snaps to its own mount, gets a name label and the
// wires of the circuit are drawn between the pins as soon as both ends are on the model.
// Owns: table, model, tray parts, mount markers, labels, wires, the attach rules, the simulated-hand demo.
// Must not: contain component data (GuideParts.ts). The drop path is shared by the real drag and by the simulated hand (demoGrab / demoMove / demoRelease).

import {PartKit} from "./WizParts"
import {rrect} from "./WizUI"
import {buildTable, label, makeGrab, makeTap, ontoPlane, placeSegment, TEXT_DIM, TEXT_LIGHT, v3, GLOW_GUIDE, GLOW_OK, GLOW_WRONG} from "./GuideKit"
import {GuideModel} from "./GuideModel"
import {DemoHand} from "./GuideDemo"
import {Seq} from "./GuideVoiceUI"
import {anchorWorld} from "./GuideUI"
import {VIZ_PARTS, RC_MOUNTS, RC_WIRES, buildPart, vizPart, Mount} from "./GuideParts"
import {DemoCtl} from "./GuideDemoCtl"

/** The order the simulated hand attaches the components in. */
const DEMO_ORDER = ["esp32", "l293d", "servo", "battery", "motor", "led", "resistor", "npn", "diode", "capacitor", "switch"]

const TRAY_NAME: {[id: string]: string} = {esp32: "ESP32", l293d: "L293D", servo: "Servo", battery: "Batt.", motor: "Motor", switch: "Switch", led: "LED", resistor: "Res.", npn: "NPN", diode: "Diode", capacitor: "Cap."}

interface TrayPart {
  id: string
  root: SceneObject
  pins: {[id: string]: SceneObject}
  hit: SceneObject
  tray: vec3 // table-local rest position
  mount: string // "" = in the tray
  grab: boolean
  moved: number
  prev: vec3
  prevParent: SceneObject
  goal: vec3 | null
  trayLabel: Text
  nameLabel: Text | null
}

interface MountRt {
  m: Mount
  ring: SceneObject
  mat: any
  taken: boolean
}

interface WireRt {
  a: string
  b: string
  holder: SceneObject
  mat: any
}

export class GuideViz {
  root: SceneObject
  work: SceneObject
  model: GuideModel
  hand: DemoHand
  demoRunning = false
  startedAt = -10
  lastResult = ""
  onMenu: (() => void) | null = null
  onOldView: (() => void) | null = null
  onDemoEnd: (() => void) | null = null
  private kit: PartKit
  private parts: TrayPart[] = []
  private mounts: MountRt[] = []
  private wires: WireRt[] = []
  private pills: {[id: string]: SceneObject} = {}
  private ops: ((dt: number) => boolean)[] = []
  private oi = 0
  private clock = 0
  private flash: SceneObject
  private flashT = 0
  private locked = false
  private noteText: Text
  private scale = 1.25
  private bar!: SceneObject
  private instr!: Text
  private hint!: Text
  private demoLabel!: Text
  private pauseLabel!: Text
  private speedLabel!: Text
  private tgt!: Text
  private ctl = new DemoCtl()

  constructor(kit: PartKit, parent: SceneObject) {
    this.kit = kit
    this.root = kit.obj(parent, "GuideVizRoot")
    this.work = buildTable(kit, this.root, "VizWork", new vec3(0, -5, -50), this.scale, 40, 19, 22)
    this.model = new GuideModel(this.work, kit)
    this.model.build("rc", null)
    this.model.root.getTransform().setLocalPosition(new vec3(0, 3.9, -0.4))
    this.hand = new DemoHand(kit, this.root)
    this.model.onMoved = () => (this.wiresDirty = true)
    this.hand.root.getTransform().setLocalScale(new vec3(0.7, 0.7, 0.7))
    this.flash = kit.obj(this.work, "VizFlash")
    kit.shape(this.flash, "sphere", [0, 0, 0], [1, 1, 1], GLOW_WRONG, "flash", false)
    this.flash.enabled = false
    // mount markers (flat rings on the car), one per mount
    for (const m of RC_MOUNTS) {
      const ring = kit.obj(this.model.root, "mount_" + m.id, m.at)
      const def = vizPart(m.part)
      const w = Math.max(def.sizeCm[0], 0.9) + 0.3
      const d = Math.max(def.sizeCm[2], 0.9) + 0.3
      const sms = [
        kit.shape(ring, "box", [0, 0.05, -d / 2], [w, 0.07, 0.1], [0.3, 0.95, 1, 1], "n", false).sm,
        kit.shape(ring, "box", [0, 0.05, d / 2], [w, 0.07, 0.1], [0.3, 0.95, 1, 1], "s", false).sm,
        kit.shape(ring, "box", [-w / 2, 0.05, 0], [0.1, 0.07, d], [0.3, 0.95, 1, 1], "w", false).sm,
        kit.shape(ring, "box", [w / 2, 0.05, 0], [0.1, 0.07, d], [0.3, 0.95, 1, 1], "e", false).sm,
      ]
      const s = {sm: {set: (c: [number, number, number, number]) => sms.forEach((x) => x.set(c))}}
      this.mounts.push({m: m, ring: ring, mat: s.sm, taken: false})
    }
    // the tray: big parts in the back row, small parts in the front row, each with a short name under it
    const rowB = ["esp32", "servo", "battery", "motor"]
    const rowA = ["l293d", "switch", "led", "resistor", "npn", "diode", "capacitor"]
    const place = (ids: string[], z: number) => {
      const w = ids.map((id) => Math.max(vizPart(id).sizeCm[0], vizPart(id).sizeCm[2] * 0.6, 1.1) + 0.5)
      const total = w.reduce((a, b) => a + b, 0)
      let x = -total / 2
      ids.forEach((id, i) => {
        this.parts.push(this.makeTrayPart(id, new vec3(x + w[i] / 2, 0.3, z)))
        x += w[i]
      })
    }
    place(rowB, 7.6)
    place(rowA, 9.8)
    this.noteText = label(this.work, "VizNote", "", 18, new vec3(0, 0.4, 6.2), TEXT_LIGHT)
    this.buildPills()
    this.root.enabled = false
  }

  // ------------------------------------------------------------------ build
  private makeTrayPart(id: string, tray: vec3): TrayPart {
    const b = buildPart(this.kit, this.work, id)
    b.root.getTransform().setLocalPosition(tray)
    const def = vizPart(id)
    const hit = this.kit.obj(b.root, "viz_part_" + id, [0, def.sizeCm[1] / 2, 0])
    const rt: TrayPart = {id: id, root: b.root, pins: b.pins, hit: hit, tray: tray, mount: "", grab: false, moved: 0, prev: vec3.zero(), prevParent: this.work, goal: null, trayLabel: label(this.work, "tl_" + id, TRAY_NAME[id], 14, new vec3(tray.x, 0.4, tray.z + 1.1), TEXT_DIM), nameLabel: null}
    for (const k in b.pins) b.pins[k].getChild(0).enabled = false // pin dots show once the part is on the model
    const sz = new vec3(Math.max(def.sizeCm[0] + 0.8, 1.9), Math.max(def.sizeCm[1] + 0.6, 1.4), Math.max(def.sizeCm[2] + 0.8, 1.9))
    makeGrab(hit, sz, {start: () => this.begin(rt), move: (d) => this.move(rt, d), end: () => this.end(rt)})
    return rt
  }

  /** `takes` = a tap on this pill ends the auto demo first (every pill except PAUSE / SPEED, which steer the running demo). */
  private pill(id: string, text: string, x: number, z: number, w: number, color: [number, number, number, number], on: () => void, y: number = 0, takes: boolean = true): Text {
    const b = this.kit.obj(this.bar, "viz_pill_" + id, [x, y, 0])
    const f = this.kit.obj(b, "face")
    rrect(f, "plate", w, 2.0, 0.9, color, 0, {size: 0.12, color: [0.8, 0.95, 1, 0.9]})
    const lab = label(f, "l", text, 17, new vec3(0, 0, 0.3), TEXT_LIGHT, true)
    makeTap(this.kit.obj(f, "viz_hit_" + id), new vec3(w + 0.4, 2.6, 2), () => {
      if (takes) this.takeOver()
      on()
    })
    this.pills[id] = b
    return lab
  }

  private buildPills() {
    this.bar = this.kit.obj(this.root, "VizToolbar")
    // one line that says what to do, always visible; BACK TO MENU on the left
    this.instr = label(this.bar, "instr", "Drag a part from the tray onto its glowing outline", 24, new vec3(0, 2.8, 0), TEXT_LIGHT, true)
    // the live status line of the auto demo (which part, how far), above the instruction (below the toolbar it would sit on the car)
    this.hint = label(this.bar, "hint", "AUTO DEMO", 17, new vec3(0, 5.4, 0), TEXT_DIM)
    this.hint.getSceneObject().enabled = false
    this.tgt = label(this.work, "VizTarget", "", 18, vec3.zero(), TEXT_LIGHT, true)
    this.tgt.getSceneObject().enabled = false
    this.pill("menu", "BACK TO MENU", -6.95, 0, 6.4, [0.6, 0.25, 0.25, 0.95], () => this.onMenu && this.onMenu())
    this.pill("xray", "SEE-THRU", -1.15, 0, 4.2, [0.12, 0.3, 0.5, 0.95], () => this.toggleXray())
    this.pill("reset", "RESET", 3.15, 0, 3.4, [0.12, 0.3, 0.5, 0.95], () => this.resetParts())
    // the demo pill toggles the demo itself (WATCH DEMO <-> TAKE OVER): with `takes` it would stop the demo and then start it again
    this.demoLabel = this.pill("demo", "WATCH DEMO", 7.75, 0, 4.8, [0.1, 0.5, 0.3, 0.95], () => (this.demoRunning ? this.stopDemo() : this.startDemo()), 0, false)
    // second row: steer the running demo (they never end it)
    // (a column at the right edge, where nothing else is: a row under the toolbar would sit on top of the car)
    this.pauseLabel = this.pill("pause", "PAUSE", 11.4, 0, 3.8, [0.12, 0.3, 0.5, 0.95], () => {
      this.ctl.togglePause()
      this.syncCtl()
    }, -3.0, false)
    this.speedLabel = this.pill("speed", "SPEED x1", 11.4, 0, 3.8, [0.12, 0.3, 0.5, 0.95], () => {
      this.ctl.cycleSpeed()
      this.syncCtl()
    }, -5.6, false)
  }

  private syncCtl() {
    this.pauseLabel.text = this.ctl.paused ? "RESUME" : "PAUSE"
    this.speedLabel.text = "SPEED x" + this.ctl.speed
  }

  /** The demo status line + the floating "goes here" label at the part's mount. */
  private demoStep(i: number, id: string) {
    this.hint.text = "AUTO DEMO " + (i + 1) + " / " + DEMO_ORDER.length + ": " + vizPart(id).name + " goes on its glowing outline"
    const l = this.toLocal(this.mountWorld(id))
    this.tgt.getTransform().setLocalPosition(new vec3(l.x, l.y + 4.2, l.z))
    this.tgt.text = vizPart(id).short + " goes here"
    this.tgt.getSceneObject().enabled = true
  }

  private demoStepDone() {
    this.tgt.getSceneObject().enabled = false
  }

  demoPaused(): boolean {
    return this.ctl.paused
  }
  demoSpeed(): number {
    return this.ctl.speed
  }
  statusText(): string {
    return this.hint.getSceneObject().enabled ? this.hint.text : ""
  }
  targetText(): string {
    return this.tgt.getSceneObject().enabled ? this.tgt.text : ""
  }

  // ------------------------------------------------------------------ geometry helpers (table-local frame)
  private toLocal(w: vec3): vec3 {
    return this.work.getTransform().getWorldTransform().inverse().multiplyPoint(w)
  }
  private toWorld(l: vec3): vec3 {
    return this.work.getTransform().getWorldTransform().multiplyPoint(l)
  }
  private normal(): vec3 {
    return this.work.getTransform().getWorldRotation().multiplyVec3(new vec3(0, 1, 0))
  }
  private lifted(w: vec3, lift: number): vec3 {
    const l = this.toLocal(w)
    return ontoPlane(w, this.toWorld(new vec3(l.x, lift, l.z)), this.normal())
  }
  private flat(a: vec3, b: vec3): number {
    const p = this.toLocal(a)
    const q = this.toLocal(b)
    return Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.z - q.z) * (p.z - q.z))
  }

  // ------------------------------------------------------------------ drag (real hand) and the shared drop rules
  private begin(p: TrayPart) {
    if (this.locked && !this.demoGrabbing) {
      this.takeOver()
      return
    }
    if (p.mount !== "") this.detach(p)
    p.grab = true
    p.moved = 0
    p.goal = null
    p.prev = p.root.getTransform().getWorldPosition()
    p.prevParent = p.root.getParent()
    p.root.setParent(this.work)
    p.root.getTransform().setWorldPosition(this.lifted(p.prev, 3.2))
    this.highlight(p.id, true)
  }
  private demoGrabbing = false

  private move(p: TrayPart, d: vec3) {
    if (!p.grab) return
    p.moved += d.length
    p.root.getTransform().setWorldPosition(this.lifted(p.root.getTransform().getWorldPosition().add(d), 3.2))
  }

  private end(p: TrayPart) {
    if (!p.grab) return
    p.grab = false
    this.highlight(p.id, false)
    if (p.moved < 0.4) {
      p.root.getTransform().setWorldPosition(p.prev)
      return
    }
    this.judge(p)
  }

  /** The rule: the part's own mount within the snap radius takes it; another mount or empty table sends it back. */
  private judge(p: TrayPart) {
    const pw = p.root.getTransform().getWorldPosition()
    let best: MountRt | null = null
    let bd = 1e9
    for (const m of this.mounts) {
      const d = this.flat(pw, this.model.spotWorld(m.m.at))
      if (d < bd) {
        bd = d
        best = m
      }
    }
    if (best !== null && bd <= 2.6 && best.m.part === p.id && !best.taken) {
      this.attach(p, best)
      this.lastResult = "ok:" + p.id
    } else if (best !== null && bd <= 2.6) {
      this.wrong(p, best.m.part === p.id ? "That spot is taken" : "That is the " + vizPart(best.m.part).name + " spot, not the " + vizPart(p.id).name)
    } else {
      p.goal = p.prev
      p.root.setParent(this.work)
      this.lastResult = "miss:" + p.id
      this.say("Drop it on the glowing ring of its own spot.")
    }
  }

  private attach(p: TrayPart, m: MountRt) {
    m.taken = true
    m.ring.enabled = false
    p.mount = m.m.id
    p.root.setParent(this.model.root)
    p.root.getTransform().setLocalPosition(v3(m.m.at))
    p.root.getTransform().setLocalRotation(quat.fromEulerVec(new vec3(0, (m.m.rotY * Math.PI) / 180, 0)))
    p.trayLabel.getSceneObject().enabled = false
    for (const k in p.pins) p.pins[k].getChild(0).enabled = true
    if (p.nameLabel === null) {
      const LH: {[id: string]: [number, number]} = {servo: [0, 2.8], esp32: [-0.6, 2.6], l293d: [0.8, 2.6], led: [-0.6, 2.0], resistor: [0, 3.8], npn: [0.2, 2.0], diode: [0.4, 3.8], capacitor: [1.0, 2.0], switch: [-1.0, 2.0], battery: [2.2, 4.4], motor: [0.9, 2.4]}
      const off = LH[p.id] ? LH[p.id] : [0, 2.6]
      const lab = label(this.model.root, "name_" + p.id, vizPart(p.id).short, 15, new vec3(m.m.at[0] + off[0], m.m.at[1] + off[1], m.m.at[2]), TEXT_LIGHT, true)
      p.nameLabel = lab
    }
    p.nameLabel.getSceneObject().enabled = true
    this.say(vizPart(p.id).name + " attached")
    this.updateWires()
  }

  private detach(p: TrayPart) {
    const m = this.mounts.filter((x) => x.m.id === p.mount)[0]
    if (m) {
      m.taken = false
      m.ring.enabled = true
    }
    p.mount = ""
    if (p.nameLabel) p.nameLabel.getSceneObject().enabled = false
    this.updateWires()
  }

  private wrong(p: TrayPart, why: string) {
    this.lastResult = "wrong:" + p.id
    this.flash.enabled = true
    this.flash.getTransform().setWorldPosition(p.root.getTransform().getWorldPosition())
    this.flash.getChild(0).getTransform().setLocalScale(new vec3(2.2, 2.2, 2.2))
    this.flashT = 0.8
    p.goal = p.prev
    p.root.setParent(this.work)
    this.say(why)
  }

  private highlight(partId: string, on: boolean) {
    for (const m of this.mounts) {
      if (m.taken) continue
      m.mat.set(on && m.m.part === partId ? GLOW_OK : GLOW_GUIDE)
    }
  }

  private say(t: string) {
    this.noteText.text = t
    this.noteTimer = 3.5
  }
  private noteTimer = 0
  private wiresDirty = true

  // ------------------------------------------------------------------ wires
  private pinWorld(key: string): vec3 | null {
    const [pid, pin] = key.split(".")
    const p = this.parts.filter((x) => x.id === pid)[0]
    if (!p || p.mount === "" || !p.pins[pin]) return null
    return p.pins[pin].getTransform().getWorldPosition()
  }

  private updateWires() {
    for (const w of RC_WIRES) {
      const a = this.pinWorld(w.a)
      const b = this.pinWorld(w.b)
      let rt = this.wires.filter((x) => x.a === w.a && x.b === w.b)[0]
      if (a === null || b === null) {
        if (rt) rt.holder.enabled = false
        continue
      }
      if (!rt) {
        const h = this.kit.obj(this.work, "vizwire_" + w.a + "_" + w.b)
        const s = this.kit.shape(h, "cyl", [0, 0, 0], [0.12, 1, 0.12], w.color, "w", false)
        rt = {a: w.a, b: w.b, holder: h, mat: s.sm}
        this.wires.push(rt)
      }
      rt.holder.enabled = true
      placeSegment(rt.holder, a, b, 0.12, this.scale)
    }
  }

  wireCount(): number {
    return this.wires.filter((w) => w.holder.enabled).length
  }

  // ------------------------------------------------------------------ pills / state
  toggleXray() {
    this.model.setXray(!this.model.isXray())
  }

  resetParts() {
    for (const p of this.parts) {
      if (p.mount !== "") this.detach(p)
      p.root.setParent(this.work)
      p.root.getTransform().setLocalPosition(p.tray)
      p.root.getTransform().setLocalRotation(quat.quatIdentity())
      p.trayLabel.getSceneObject().enabled = true
      for (const k in p.pins) p.pins[k].getChild(0).enabled = false
      p.goal = null
    }
    this.updateWires()
    this.say("All components are back in the tray")
  }

  show(on: boolean) {
    this.root.enabled = on
    if (!on) this.stopDemo()
  }

  /** World points that must be inside the camera view when the page is open (table centre, toolbar). */
  viewPoints(): vec3[] {
    return [this.work.getTransform().getWorldPosition(), this.bar.getTransform().getWorldPosition()]
  }
  instructionText(): string {
    return this.instr.text
  }

  attachedCount(): number {
    return this.parts.filter((p) => p.mount !== "").length
  }
  partCount(): number {
    return this.parts.length
  }
  isAttached(id: string): boolean {
    return this.parts.filter((p) => p.id === id)[0].mount !== ""
  }
  nameOf(id: string): string {
    const p = this.parts.filter((x) => x.id === id)[0]
    return p && p.nameLabel && p.nameLabel.getSceneObject().enabled ? p.nameLabel.text : ""
  }
  mountWorld(partId: string): vec3 {
    const m = this.mounts.filter((x) => x.m.part === partId)[0]
    return this.model.spotWorld(m.m.at)
  }
  partWorld(id: string): vec3 {
    return this.parts.filter((x) => x.id === id)[0].root.getTransform().getWorldPosition()
  }
  pinsShown(id: string): boolean {
    const p = this.parts.filter((x) => x.id === id)[0]
    for (const k in p.pins) return p.pins[k].getChild(0).enabled
    return false
  }
  /** How many real meshes a component is made of (a component with zero would be an empty placeholder). */
  meshCount(id: string): number {
    let n = 0
    const walk = (o: SceneObject) => {
      if (!isNull(o.getComponent("Component.RenderMeshVisual"))) n++
      for (let i = 0; i < o.getChildrenCount(); i++) walk(o.getChild(i))
    }
    walk(this.parts.filter((x) => x.id === id)[0].root)
    return n
  }
  noteValue(): string {
    return this.noteText.text
  }

  /** Test hook: the same path as a real drag (grab, move, release) for one part. */
  simDrop(id: string, world: vec3) {
    const p = this.parts.filter((x) => x.id === id)[0]
    this.demoGrabbing = true
    this.begin(p)
    this.demoGrabbing = false
    p.moved = 5
    p.root.getTransform().setWorldPosition(world)
    this.end(p)
  }

  // ------------------------------------------------------------------ simulated hand
  takeOver() {
    if (this.demoRunning) this.stopDemo()
  }

  startDemo() {
    if (this.demoRunning) return
    this.resetParts()
    const s = new Seq(this.hand)
    s.call(() => {
      this.hand.setPos(this.toWorld(new vec3(11, 6, 10)))
      this.hand.show(true)
      this.hand.setPinch(false)
      this.say("Auto demo: the hand attaches the real components to the printed car")
    })
    s.wait(2.4)
    this.ctl.reset()
    this.syncCtl()
    DEMO_ORDER.forEach((id, i) => {
      const p = this.parts.filter((x) => x.id === id)[0]
      s.call(() => this.demoStep(i, id))
      s.moveTo(() => p.root.getTransform().getWorldPosition().add(new vec3(0, 0.6, 0)), 1.5, 1.2)
      s.pinch(true)
      s.call(() => {
        this.demoGrabbing = true
        this.begin(p)
        this.demoGrabbing = false
        p.moved = 5
      })
      s.ops.push(this.carryOp(p, () => this.mountWorldLift(id), 2.0))
      s.call(() => this.end(p))
      s.call(() => this.demoStepDone())
      s.pinch(false)
      s.wait(0.5)
    })
    s.call(() => (this.hint.text = "AUTO DEMO: now the see-through view"))
    s.tap(() => this.pillWorld("xray"), 1.4, () => this.toggleXray())
    s.wait(2.5)
    s.tap(() => this.pillWorld("xray"), 1.0, () => this.toggleXray())
    s.wait(2.5)
    this.ops = s.ops
    this.oi = 0
    this.demoRunning = true
    this.locked = true
    this.startedAt = getTime()
    this.demoLabel.text = "TAKE OVER"
    this.hint.text = "AUTO DEMO - tap TAKE OVER to do it yourself"
    this.hint.getSceneObject().enabled = true
  }

  private pillWorld(id: string): vec3 {
    return this.pills[id].getTransform().getWorldPosition().add(new vec3(0, 0.4, 1.2))
  }

  private mountWorldLift(id: string): vec3 {
    const l = this.toLocal(this.mountWorld(id))
    return this.toWorld(new vec3(l.x, 3.2, l.z))
  }

  private carryOp(p: TrayPart, target: () => vec3, dur: number): (dt: number) => boolean {
    let t = 0
    let start: vec3 | null = null
    return (dt) => {
      if (start === null) start = this.hand.pos
      t += dt
      const s = Math.min(1, t / dur)
      const e = s * s * (3 - 2 * s)
      const pos = start.add(target().sub(start).uniformScale(e)).add(new vec3(0, Math.sin(Math.PI * e) * 2.0, 0))
      this.hand.setPos(pos)
      p.root.getTransform().setWorldPosition(pos.sub(new vec3(0, 0.6, 0)))
      return s >= 1
    }
  }

  stopDemo() {
    if (!this.demoRunning) return
    this.demoRunning = false
    this.locked = false
    this.ops = []
    this.hand.show(false)
    this.demoLabel.text = "WATCH DEMO"
    this.hint.getSceneObject().enabled = false
    this.tgt.getSceneObject().enabled = false
    this.ctl.reset()
    this.syncCtl()
    for (const p of this.parts) {
      if (p.grab) {
        p.grab = false
        p.goal = p.prev
        p.root.setParent(this.work)
        this.highlight(p.id, false)
      }
    }
    if (this.onDemoEnd) this.onDemoEnd()
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    this.clock += dt
    this.hand.update(dt)
    this.bar.getTransform().setWorldPosition(anchorWorld(new vec3(0, 10.4, -52)))
    const pulse = 1 + 0.12 * Math.sin(this.clock * 4)
    for (const m of this.mounts) if (m.ring.enabled) m.ring.getTransform().setLocalScale(new vec3(pulse, 1, pulse))
    const k = Math.min(1, dt * 10)
    for (const p of this.parts) {
      if (p.goal !== null) {
        const t = p.root.getTransform()
        const c = t.getWorldPosition()
        const d = p.goal.sub(c)
        if (d.length < 0.05) {
          t.setWorldPosition(p.goal)
          p.goal = null
        } else t.setWorldPosition(c.add(d.uniformScale(k)))
      }
    }
    // the wires only need redrawing when something moved (a part attached / detached / returning, or the car was moved)
    let moving = this.wiresDirty
    for (const p of this.parts) if (p.goal !== null || p.grab) moving = true
    if (this.wires.length > 0 && moving) {
      this.updateWires()
      this.wiresDirty = false
    }
    if (this.flashT > 0) {
      this.flashT -= dt
      if (this.flashT <= 0) this.flash.enabled = false
    }
    if (this.noteTimer > 0) {
      this.noteTimer -= dt
      if (this.noteTimer <= 0) this.noteText.text = ""
    }
    if (this.demoRunning) {
      const op = this.ops[this.oi]
      if (op === undefined) this.stopDemo()
      else if (op(this.ctl.step(dt))) this.oi++
    }
  }
}
