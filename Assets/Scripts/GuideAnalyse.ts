// GuideAnalyse.ts - the ANALYSE page: an overlay over what you are looking at. Subject: a real-looking RC car (printed body + the real component models)
// on the table. Every component gets a small tag with its NAME and an "i" button; the info (what it is, role, specs, pins, DIY tip) appears ONLY
// when an "i" is pinched / clicked, one card at a time. A second tap on the same "i", the X, or a tap on the table closes it.
// STAND-IN: there is no camera feed in the Lens Studio preview, so the subject is a modelled RC car. On a device, real object recognition would
// decide which component you are looking at and place these tags; the tag + info layer is the same.
// Data: GuideInfo.ts (local, complete offline). "ASK MORE" calls Gemini only when a key is set.

import {PartKit} from "./WizParts"
import {rrect} from "./WizUI"
import {buildTable, label, makeTap, placeSegment, wrap, TEXT_DIM, TEXT_LIGHT, v3, GLOW_GUIDE} from "./GuideKit"
import {GuideModel} from "./GuideModel"
import {DemoHand} from "./GuideDemo"
import {Seq} from "./GuideVoiceUI"
import {RC_MOUNTS, buildPart, vizPart} from "./GuideParts"
import {infoOf} from "./GuideInfo"
import {anchorWorld} from "./GuideUI"

// tag layout: which side the name plate sits on and where along the table depth (table-local z)
const TAGS: {part: string; side: -1 | 1; z: number}[] = [
  {part: "servo", side: -1, z: -5.6},
  {part: "esp32", side: -1, z: -3.0},
  {part: "led", side: -1, z: -0.4},
  {part: "switch", side: -1, z: 2.2},
  {part: "l293d", side: 1, z: -4.6},
  {part: "resistor", side: 1, z: -2.0},
  {part: "motor", side: 1, z: 0.6},
  {part: "battery", side: 1, z: 3.2},
]

interface TagRt {
  part: string
  dot: SceneObject
  leader: SceneObject
  plate: SceneObject
  iBtn: SceneObject
  iLabel: Text
  at: vec3 // plate position (table-local)
}

export class GuideAnalyse {
  root: SceneObject
  work: SceneObject
  model: GuideModel
  hand: DemoHand
  demoRunning = false
  startedAt = -10
  opened: string[] = []
  onMenu: (() => void) | null = null
  onDemoEnd: (() => void) | null = null
  /** Set by WizGuide when a Gemini key is set: returns a short extra answer, or null. */
  ask: ((part: string, what: string) => Promise<string>) | null = null
  askAvailable: () => boolean = () => false
  private kit: PartKit
  private tags: TagRt[] = []
  private card: SceneObject
  private cardTitle: Text
  private cardBody: Text
  private cardAsk: SceneObject
  private cardMore: Text
  private current = ""
  private pills: {[id: string]: SceneObject} = {}
  private ops: ((dt: number) => boolean)[] = []
  private oi = 0
  private scale = 0.9
  private bar!: SceneObject
  private clock = 0
  private frame = 0
  private leadersDirty = true
  private moreFor = ""

  constructor(kit: PartKit, parent: SceneObject) {
    this.kit = kit
    this.root = kit.obj(parent, "GuideAnalyseRoot")
    this.work = buildTable(kit, this.root, "AnalyseWork", new vec3(0, -5, -50), this.scale, 40, 26, 19)
    // the subject: printed RC car with every component of the circuit on it
    this.model = new GuideModel(this.work, kit)
    this.model.build("rc", null)
    this.model.root.getTransform().setLocalPosition(new vec3(0, 3.9, -1.5))
    for (const m of RC_MOUNTS) {
      const b = buildPart(kit, this.model.root, vizPart(m.part).id)
      b.root.getTransform().setLocalPosition(v3(m.at))
      for (const k in b.pins) b.pins[k].getChild(0).enabled = false
    }
    // tags
    for (const t of TAGS) this.tags.push(this.makeTag(t.part, t.side, t.z))
    // the info card (hidden until an "i" is pressed)
    this.card = kit.obj(this.root, "GuideInfoCard")
    rrect(this.card, "plate", 18.5, 10.4, 1.3, [0.1, 0.18, 0.3, 0.96], 0, {size: 0.16, color: [0.35, 0.95, 1, 0.95]})
    this.cardTitle = label(this.card, "title", "", 40, new vec3(-1.0, 4.2, 0.3), TEXT_LIGHT, true)
    this.cardBody = label(this.card, "body", "", 23, new vec3(0, -0.8, 0.3), TEXT_LIGHT)
    this.cardBody.horizontalAlignment = HorizontalAlignment.Left
    this.cardBody.getSceneObject().getTransform().setLocalPosition(new vec3(0, -0.8, 0.3))
    const x = kit.obj(this.card, "closeX", [8.0, 4.2, 0.3])
    rrect(x, "p", 1.8, 1.8, 0.9, [0.5, 0.2, 0.2, 0.95], 0)
    label(x, "l", "X", 26, new vec3(0, 0, 0.3), TEXT_LIGHT, true)
    makeTap(kit.obj(x, "guide_an_hit_close"), new vec3(2.4, 2.4, 2), () => (this.takeOver(), this.close()))
    this.cardAsk = kit.obj(this.card, "ask", [6.0, -4.2, 0.3])
    rrect(this.cardAsk, "p", 5.6, 1.8, 0.9, [0.15, 0.4, 0.5, 0.95], 0, {size: 0.1, color: [0.6, 0.9, 1, 0.9]})
    this.cardMore = label(this.cardAsk, "l", "ASK MORE", 19, new vec3(0, 0, 0.3), TEXT_LIGHT, true)
    makeTap(kit.obj(this.cardAsk, "guide_an_hit_ask"), new vec3(6, 2.2, 2), () => (this.takeOver(), this.askMore()))
    this.card.enabled = false
    // tap on the table closes the card
    const th = kit.obj(this.work, "guide_an_hit_table", [0, 0.2, 0])
    makeTap(th, new vec3(26, 0.6, 19), () => this.close())
    label(this.work, "standin", "DEMO SUBJECT: an RC car model. On glasses, real recognition replaces it.", 14, new vec3(0, 0.4, 8.8), TEXT_DIM)
    this.hand = new DemoHand(kit, this.root)
    this.model.onMoved = () => (this.leadersDirty = true)
    this.hand.root.getTransform().setLocalScale(new vec3(0.7, 0.7, 0.7))
    this.buildPills()
    this.root.enabled = false
  }

  private makeTag(part: string, side: -1 | 1, z: number): TagRt {
    const kit = this.kit
    const def = vizPart(part)
    const m = RC_MOUNTS.filter((x) => x.part === part)[0]
    const at = new vec3(side * 9.4, 3.2, z)
    const dot = kit.obj(this.model.root, "tagdot_" + part, m.at)
    kit.shape(dot, "sphere", [0, def.sizeCm[1] + 0.3, 0], [0.45, 0.45, 0.45], GLOW_GUIDE, "d", false)
    const leader = kit.obj(this.work, "leader_" + part)
    kit.shape(leader, "cyl", [0, 0, 0], [0.06, 1, 0.06], [0.35, 0.95, 1, 0.8], "l", false)
    const plate = kit.obj(this.work, "tag_" + part, [at.x, at.y, at.z])
    const face = kit.obj(plate, "face")
    face.getTransform().setLocalRotation(quat.fromEulerVec(new vec3(-0.5, 0, 0)))
    rrect(face, "p", 5.6, 1.9, 0.9, [0.1, 0.22, 0.36, 0.95], 0, {size: 0.1, color: [0.35, 0.95, 1, 0.9]})
    label(face, "name", def.short, 21, new vec3(-0.7 * side * -1 * 0.0 + (side === -1 ? 0.5 : -0.5), 0, 0.3), TEXT_LIGHT, true)
    const ib = kit.obj(face, "ibtn", [side === -1 ? -2.0 : 2.0, 0, 0.35])
    rrect(ib, "p", 1.5, 1.5, 0.75, [0.2, 0.55, 0.8, 0.98], 0, {size: 0.08, color: [1, 1, 1, 0.95]})
    const il = label(ib, "i", "i", 26, new vec3(0, 0, 0.25), TEXT_LIGHT, true)
    makeTap(kit.obj(face, "guide_an_hit_i_" + part), new vec3(6.0, 2.4, 1.6), () => (this.takeOver(), this.toggle(part)))
    return {part: part, dot: dot, leader: leader, plate: plate, iBtn: ib, iLabel: il, at: at}
  }

  private pill(id: string, text: string, x: number, z: number, w: number, color: [number, number, number, number], on: () => void) {
    const b = this.kit.obj(this.bar, "an_pill_" + id, [x, 0, 0])
    const f = this.kit.obj(b, "face")
    rrect(f, "plate", w, 2.0, 0.9, color, 0, {size: 0.12, color: [0.8, 0.95, 1, 0.9]})
    label(f, "l", text, 19, new vec3(0, 0, 0.3), TEXT_LIGHT, true)
    makeTap(this.kit.obj(f, "an_hit_" + id), new vec3(w + 0.4, 2.6, 2), () => (this.takeOver(), on()))
    this.pills[id] = b
  }

  private buildPills() {
    this.bar = this.kit.obj(this.root, "AnalyseToolbar")
    this.pill("menu", "MENU", -8.6, 0, 4.4, [0.6, 0.25, 0.25, 0.95], () => this.onMenu && this.onMenu())
    this.pill("demo", "WATCH DEMO", 8.0, 0, 6.0, [0.1, 0.5, 0.3, 0.95], () => (this.demoRunning ? this.stopDemo() : this.startDemo()))
  }

  // ------------------------------------------------------------------ the info card
  toggle(part: string) {
    if (this.current === part) this.close()
    else this.open(part)
  }

  open(part: string) {
    const info = infoOf(part)
    const def = vizPart(part)
    this.current = part
    this.opened.push(part)
    this.cardTitle.text = def.name
    const sec = (h: string, t: string) => h + "  " + wrap(t, 46 - h.length).replace(/\n/g, "\n" + " ".repeat(Math.round(h.length * 1.4)))
    this.cardBody.text = [sec("WHAT", info.what), sec("ROLE", info.role), sec("SPECS", info.specs), sec("PINS", info.pins), sec("TIP", info.tip), "SOURCE  " + (def.source === "KiCad" ? "real KiCad CAD model" : def.source === "Adafruit" ? "real Adafruit CAD model" : def.source === "Fast3D" ? "AI-generated model" : "code-modelled")].join("\n")
    this.cardAsk.enabled = this.askAvailable()
    this.cardMore.text = "ASK MORE"
    this.moreFor = part
    this.card.enabled = true
    for (const t of this.tags) t.iLabel.text = t.part === part ? "x" : "i"
  }

  close() {
    if (this.current === "") return
    this.current = ""
    this.card.enabled = false
    for (const t of this.tags) t.iLabel.text = "i"
  }

  private askMore() {
    if (!this.ask || this.current === "") return
    const part = this.current
    this.cardMore.text = "..."
    this.ask(vizPart(part).name, infoOf(part).what)
      .then((t) => {
        if (this.current !== part) return
        this.cardBody.text = this.cardBody.text + "\nGEMINI  " + wrap(t, 38)
        this.cardMore.text = "ASK MORE"
      })
      .catch(() => (this.cardMore.text = "OFFLINE"))
  }

  askLabel(): string {
    return this.cardMore.text
  }
  cardBodyText(): string {
    return this.cardBody.text
  }
  askShown(): boolean {
    return this.cardAsk.enabled
  }

  openPart(): string {
    return this.current
  }
  cardShown(): boolean {
    return this.card.enabled
  }
  cardText(): string {
    return this.cardTitle.text + "|" + this.cardBody.text
  }
  tagCount(): number {
    return this.tags.length
  }
  tagNames(): string[] {
    return this.tags.map((t) => vizPart(t.part).short)
  }
  tagsVisible(): boolean {
    return this.root.enabled && this.tags.every((t) => t.plate.isEnabledInHierarchy)
  }

  show(on: boolean) {
    this.root.enabled = on
    this.leadersDirty = true
    if (!on) {
      this.stopDemo()
      this.close()
    }
  }

  // ------------------------------------------------------------------ simulated hand: clicks a few "i" buttons
  takeOver() {
    if (this.demoRunning) this.stopDemo()
  }

  startDemo() {
    if (this.demoRunning) return
    this.close()
    this.opened = []
    const s = new Seq(this.hand)
    const world = (l: vec3) => this.work.getTransform().getWorldTransform().multiplyPoint(l)
    s.call(() => {
      this.hand.setPos(world(new vec3(13, 7, 11)))
      this.hand.show(true)
      this.hand.setPinch(false)
    })
    s.wait(2.0)
    for (const part of ["esp32", "l293d", "battery", "servo"]) {
      const tag = this.tags.filter((t) => t.part === part)[0]
      s.tap(() => tag.iBtn.getTransform().getWorldPosition().add(new vec3(0, 0.3, 0.8)), 1.8, () => this.open(part))
      s.wait(5.5) // read the card
      s.tap(() => tag.iBtn.getTransform().getWorldPosition().add(new vec3(0, 0.3, 0.8)), 1.0, () => this.toggle(part)) // second tap closes
      s.wait(1.2)
    }
    s.tap(() => world(new vec3(0, 1.5, 7.5)), 1.4, () => undefined) // a tap on the table
    s.wait(1.5)
    this.ops = s.ops
    this.oi = 0
    this.demoRunning = true
    this.startedAt = getTime()
  }

  stopDemo() {
    if (!this.demoRunning) return
    this.demoRunning = false
    this.ops = []
    this.hand.show(false)
    if (this.onDemoEnd) this.onDemoEnd()
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    this.clock += dt
    this.hand.update(dt)
    this.bar.getTransform().setWorldPosition(anchorWorld(new vec3(0, 4.6, -52)))
    // leader lines: from the component to its name plate; plates billboard with the table
    this.frame++
    if (this.leadersDirty || this.frame % 12 === 0) {
      for (const t of this.tags) {
        const a = t.dot.getChild(0).getTransform().getWorldPosition()
        const b = t.plate.getTransform().getWorldPosition()
        placeSegment(t.leader, a, b, 0.06, this.scale)
      }
      this.leadersDirty = false
    }
    // the card sits above the table, facing you
    if (this.card.enabled || this.root.enabled) {
      const w = anchorWorld(new vec3(0, 12.0, -58))
      this.card.getTransform().setWorldPosition(w)
    }
    if (this.demoRunning) {
      const op = this.ops[this.oi]
      if (op === undefined) this.stopDemo()
      else if (op(dt)) this.oi++
    }
  }
}
