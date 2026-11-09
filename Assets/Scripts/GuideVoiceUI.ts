// GuideVoiceUI.ts - the voice-to-build flow on the MAIN MENU: big VOICE button (bottom middle) -> transcript -> intent (Gemini when a key is set,
// local keywords otherwise) -> "Which video?" search panel with a virtual keyboard and result cards -> "RC Car - okay?" card -> the Circuit Guide.
// With HANDS AUTO ON the same simulated hand as the auto demo taps the mic, types the query key by key, taps the card and OKAY, then the
// Guide's auto demo carries on. Every control is also a normal tap target, so a click / real grab takes over.
// Owns: the voice UI objects, the flow stages, the hand script. Must not: store, log or show the API key.

import {PartKit} from "./WizParts"
import {rrect} from "./WizUI"
import {label, makeTap, TEXT_DIM, TEXT_LIGHT} from "./GuideKit"
import {DemoHand} from "./GuideDemo"
import {mainCamera} from "./WizPlacement"
import {packForProject} from "./GuideData"
import {CATALOGUE, Intent, SCRIPTED_LINE, Tutorial, GeminiClient, filterCatalogue, keywordIntent} from "./GuideVoice"
import type {WizGuide} from "./WizGuide"

declare const AsrModule: any

export type VoiceStage = "idle" | "listening" | "thinking" | "search" | "confirm" | "building"
type Op = (dt: number) => boolean

interface Card {
  root: SceneObject
  title: Text
  blurb: Text
  plate: {rr: any}
}

/** A small builder of timed hand ops (wait / call / until / move / pinch / tap). */
export class Seq {
  ops: Op[] = []
  constructor(private hand: DemoHand) {}
  wait(sec: number) {
    let t = 0
    this.ops.push((dt) => (t += dt) >= sec)
  }
  call(f: () => void) {
    this.ops.push(() => (f(), true))
  }
  until(c: () => boolean, max: number) {
    let t = 0
    this.ops.push((dt) => ((t += dt), c() || t >= max))
  }
  moveTo(target: () => vec3, dur: number, lift: number) {
    let t = 0
    let start: vec3 | null = null
    this.ops.push((dt) => {
      if (start === null) start = this.hand.pos
      t += dt
      const s = Math.min(1, t / dur)
      const e = s * s * (3 - 2 * s)
      this.hand.setPos(start.add(target().sub(start).uniformScale(e)).add(new vec3(0, Math.sin(Math.PI * e) * lift, 0)))
      return s >= 1
    })
  }
  pinch(on: boolean) {
    let t = 0
    let first = true
    this.ops.push((dt) => {
      if (first) {
        this.hand.setPinch(on)
        first = false
      }
      return (t += dt) >= 0.22
    })
  }
  tap(at: () => vec3, dur: number, then: () => void) {
    this.moveTo(() => at().add(new vec3(0.3, -0.2, 1.8)), dur, 0.6)
    this.pinch(true)
    this.call(then)
    this.pinch(false)
  }
}

export class GuideVoice {
  stage: VoiceStage = "idle"
  transcript = ""
  query = ""
  intent: Intent | null = null
  intentSource = ""
  results: Tutorial[] = []
  selected: Tutorial | null = null
  note = ""
  autoHands = true
  asrTimeoutS = 0.7
  usedAsr = false
  stepsSource = ""
  hand: DemoHand
  root: SceneObject
  private micRoot: SceneObject
  private micGlow: any
  private caption: Text
  private noteLabel: Text
  private youSaid!: Text
  private aiBadge!: Text
  private badgeTick = 0
  private queryLabel: Text
  private autoLabel: Text
  private autoRoot!: SceneObject
  private search: SceneObject
  private kb: SceneObject
  private confirm: SceneObject
  private confirmText: Text
  private keys: {[k: string]: SceneObject} = {}
  private cards: Card[] = []
  private tapNames: {[n: string]: SceneObject} = {}
  private ops: Op[] = []
  private oi = 0
  startedAt = -10
  private running = false
  private pending = false
  private clock = 0
  private asrStarted = 0
  private heard = false

  constructor(private g: WizGuide, private kit: PartKit, private gemini: GeminiClient) {
    this.root = global.scene.createSceneObject("GuideVoiceRoot")
    this.hand = new DemoHand(kit, this.root)
    this.hand.root.getTransform().setLocalScale(new vec3(0.55, 0.55, 0.55))
    const k = kit
    // ---- the VOICE button: a pill at the bottom middle of the title screen (mic glyph + word), HANDS pill beside it
    this.micRoot = k.obj(this.root, "GuideMic", [-3.9, -10.2, -40])
    const face = k.obj(this.micRoot, "face")
    const pill = rrect(face, "micplate", 7.2, 1.9, 0.9, [0.1, 0.35, 0.5, 0.97], 0, {size: 0.14, color: [0.35, 0.95, 1, 0.95]})
    this.micGlow = {sm: {set: (c: [number, number, number, number]) => (pill.rr.borderColor = new vec4(c[0], c[1], c[2], c[3]))}, obj: face}
    const gl = k.obj(face, "glyph", [-2.4, 0, 0.3])
    gl.getTransform().setLocalScale(new vec3(0.38, 0.38, 0.38))
    k.shape(gl, "cyl", [0, 0.5, 0], [1.2, 2.0, 1.2], [1, 1, 1, 1], "mic_body", false)
    k.shape(gl, "sphere", [0, 1.5, 0], [1.2, 1.2, 1.2], [1, 1, 1, 1], "mic_top", false)
    k.shape(gl, "sphere", [0, -0.5, 0], [1.2, 1.2, 1.2], [1, 1, 1, 1], "mic_bot", false)
    k.shape(gl, "cyl", [0, -1.3, 0], [0.25, 1.0, 0.25], [1, 1, 1, 1], "mic_stem", false)
    k.shape(gl, "box", [0, -1.9, 0], [1.8, 0.25, 0.3], [1, 1, 1, 1], "mic_base", false)
    label(face, "mic_label", "VOICE", 22, new vec3(0.8, 0, 0.3), TEXT_LIGHT, true)
    makeTap(k.obj(face, "guide_voice_hit_mic"), new vec3(7.6, 2.4, 3), () => (this.takeOver(), this.micTap()))
    this.tapNames["mic"] = this.micRoot
    this.autoLabel = this.button(this.root, "auto", "HANDS: ON", 6.0, 1.9, new vec3(3.4, -10.2, -40), [0.1, 0.35, 0.3, 0.95], () => this.toggleAuto(), 16)
    this.autoRoot = this.tapNames["auto"]
    this.caption = label(this.root, "VoiceCaption", "", 38, new vec3(0, -5.6, -44), TEXT_LIGHT, true)
    this.noteLabel = label(this.root, "VoiceNote", "", 22, new vec3(0, -7.4, -44), TEXT_DIM)
    // ---- search panel
    this.search = k.obj(this.root, "VoiceSearch", [0, 3.3, -48])
    rrect(this.search, "plate", 21, 16, 1.4, [0.1, 0.18, 0.3, 0.92], 0, {size: 0.16, color: [0.35, 0.95, 1, 0.9]})
    label(this.search, "t", "WHICH VIDEO?", 34, new vec3(0.5, 6.9, 0.3), TEXT_LIGHT, true)
    const q = k.obj(this.search, "queryField", [0, 4.3, 0.1])
    rrect(q, "qplate", 18, 2.4, 1.0, [0.05, 0.12, 0.22, 0.95], 0, {size: 0.1, color: [0.6, 0.8, 1, 0.9]})
    this.queryLabel = label(q, "qtext", "", 40, new vec3(0, 0, 0.3), TEXT_LIGHT)
    for (let i = 0; i < 3; i++) this.cards.push(this.makeCard(i))
    label(this.search, "honest", "Local catalogue (Gemini ranks it when a key is set). Not YouTube.", 15, new vec3(0, -7.3, 0.3), TEXT_DIM)
    this.aiBadge = label(this.search, "aibadge", "", 17, new vec3(4.6, 6.9, 0.3), new vec4(0.5, 1, 0.7, 1))
    this.youSaid = label(this.search, "yousaid", "", 18, new vec3(0, -6.2, 0.3), TEXT_LIGHT)
    this.button(this.search, "close", "CLOSE", 3.8, 1.6, new vec3(8.0, 6.9, 0.3), [0.5, 0.2, 0.2, 0.95], () => this.close(), 20)
    // ---- virtual keyboard (rows of letters + space / delete)
    this.kb = k.obj(this.root, "VoiceKeyboard", [0, -9.0, -46])
    const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"]
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      for (let c = 0; c < row.length; c++) {
        const ch = row[c]
        const x = (c - (row.length - 1) / 2) * 2.05
        const o = this.button(this.kb, "key_" + ch, ch.toUpperCase(), 1.85, 2.0, new vec3(x, 3.4 - r * 2.35, 0), [0.15, 0.3, 0.5, 0.95], () => this.typeChar(ch), 32)
        this.keys[ch] = o.getSceneObject().getParent()
      }
    }
    this.keys[" "] = this.button(this.kb, "key_space", "SPACE", 8.2, 2.0, new vec3(-1.4, -3.6, 0), [0.15, 0.3, 0.5, 0.95], () => this.typeChar(" "), 26).getSceneObject().getParent()
    this.button(this.kb, "key_del", "DEL", 3.6, 2.0, new vec3(5.2, -3.6, 0), [0.5, 0.25, 0.2, 0.95], () => this.backspace(), 26)
    // ---- confirm card
    this.confirm = k.obj(this.root, "VoiceConfirm", [0, 2, -44.5])
    rrect(this.confirm, "plate", 15, 8, 1.4, [0.1, 0.2, 0.34, 0.97], 0, {size: 0.2, color: [0.5, 1, 0.7, 1]})
    this.confirmText = label(this.confirm, "ctext", "", 54, new vec3(0, 1.8, 0.3), TEXT_LIGHT, true)
    this.button(this.confirm, "okay", "OKAY", 6.2, 2.8, new vec3(-3.6, -2, 0.3), [0.1, 0.55, 0.3, 0.97], () => this.okay(), 40)
    this.button(this.confirm, "cancel", "CANCEL", 6.2, 2.8, new vec3(3.6, -2, 0.3), [0.55, 0.2, 0.2, 0.97], () => this.cancel(), 40)
    this.hideAll()
    this.root.enabled = false
  }

  // ------------------------------------------------------------------ small UI helpers
  /** A pill with a label and a tap target named guide_voice_hit_<name>. Returns the label (its scene object's parent is the pill root). */
  private button(parent: SceneObject, name: string, text: string, w: number, h: number, at: vec3, color: [number, number, number, number], onTap: () => void, size: number): Text {
    const b = this.kit.obj(parent, "vb_" + name, [at.x, at.y, at.z])
    const rr = rrect(b, "plate_" + name, w, h, Math.min(1.0, h / 2.2), color, 0, {size: 0.1, color: [0.8, 0.95, 1, 0.9]})
    void rr
    const l = label(b, "label_" + name, text, size, new vec3(0, 0, 0.3), TEXT_LIGHT, true)
    makeTap(this.kit.obj(b, "guide_voice_hit_" + name), new vec3(w + 0.4, h + 0.4, 2), () => (this.takeOver(), onTap()))
    this.tapNames[name] = b
    return l
  }

  private makeCard(i: number): Card {
    const root = this.kit.obj(this.search, "card" + i, [0, 1.5 - i * 2.9, 0.2])
    const plate = rrect(root, "cplate", 18, 2.6, 0.9, [0.14, 0.26, 0.42, 0.95], 0, {size: 0.1, color: [0.5, 0.8, 1, 0.9]})
    const title = label(root, "ctitle", "", 42, new vec3(-0.6, 0.45, 0.3), TEXT_LIGHT, true)
    const blurb = label(root, "cblurb", "", 19, new vec3(-0.6, -0.6, 0.3), TEXT_DIM)
    this.kit.shape(root, "box", [-7.6, 0, 0.2], [2.2, 2.0, 0.2], [0.4, 0.8, 1, 0.9], "thumb", false) // thumbnail-style block (no video picture)
    makeTap(this.kit.obj(root, "guide_voice_hit_card" + i), new vec3(18.4, 3.0, 2), () => (this.takeOver(), this.pickCard(i)))
    this.tapNames["card" + i] = root
    return {root: root, title: title, blurb: blurb, plate: plate}
  }

  private hideAll() {
    this.search.enabled = false
    this.kb.enabled = false
    this.confirm.enabled = false
    this.caption.text = ""
    this.noteLabel.text = ""
    this.youSaid.text = ""
  }

  tapWorld(name: string): vec3 {
    return this.tapNames[name].getTransform().getWorldPosition()
  }

  // ------------------------------------------------------------------ flow
  toggleAuto() {
    this.autoHands = !this.autoHands
    this.autoLabel.text = this.autoHands ? "HANDS: ON" : "HANDS: OFF"
    this.g.setAutoHands(this.autoHands)
  }

  setAuto(on: boolean) {
    this.autoHands = on
    this.autoLabel.text = on ? "HANDS: ON" : "HANDS: OFF"
  }

  /** The mic button (a real tap or the hand's tap). */
  micTap() {
    if (this.stage !== "idle") return
    this.g.beginVoiceFlow()
    this.transcript = ""
    this.query = ""
    this.selected = null
    this.intent = null
    this.heard = false
    this.stage = "listening"
    this.caption.text = "Listening..."
    this.note = ""
    if (this.autoHands) {
      this.runHands()
    } else {
      this.tryAsr()
    }
  }

  /** Real speech if ASR works (needs a microphone and internet); otherwise after a short wait the scripted line stands in. */
  private tryAsr() {
    this.asrStarted = this.clock
    try {
      if (typeof AsrModule === "undefined") throw new Error("no asr")
      const asr: any = require("LensStudio:AsrModule")
      const o = AsrModule.AsrTranscriptionOptions.create()
      o.silenceUntilTerminationMs = 1200
      o.mode = AsrModule.AsrMode.HighAccuracy
      o.onTranscriptionUpdateEvent.add((e: any) => {
        if (this.stage !== "listening") return
        this.caption.text = e.text
        if (e.isFinal && e.text.trim().length > 0) {
          this.heard = true
          this.usedAsr = true
          asr.stopTranscribing()
          this.gotTranscript(e.text.trim())
        }
      })
      o.onTranscriptionErrorEvent.add(() => (this.asrStarted = -100))
      asr.startTranscribing(o)
    } catch (e) {
      this.asrStarted = -100 // no ASR here: fall back right away
    }
  }

  private gotTranscript(t: string) {
    this.transcript = t
    this.caption.text = 'You said: "' + t + '"'
    this.resolveIntent()
  }

  /** Instant: the local keyword match decides at once (well under 100 ms). Live AI, when switched on, only warms a cache in the background. */
  private resolveIntent() {
    const t = this.transcript
    const aiIt = this.gemini.available() ? this.gemini.cachedIntent(t) : null
    this.intent = aiIt !== null ? aiIt : keywordIntent(t)
    this.intentSource = aiIt !== null ? "gemini" : "local"
    this.pending = false
    this.noteLabel.text = aiIt !== null ? "Intent from the AI cache" : "Intent from local keyword match"
    if (this.gemini.available()) {
      this.gemini.warmIntent(t)
      this.gemini.warmSteps("rc-car")
    }
    this.stage = "thinking"
    if (!this.autoHands) this.openSearch()
  }

  private openSearch() {
    this.stage = "search"
    this.search.enabled = true
    this.kb.enabled = true
    this.micRoot.enabled = false
    this.caption.text = ""
    this.noteLabel.text = ""
    this.youSaid.text = 'You said: "' + this.transcript + '"'
    this.autoRoot.setParent(this.search)
    this.autoRoot.getTransform().setLocalPosition(new vec3(-7.0, 6.9, 0.3))
    if (!this.autoHands && this.intent !== null) {
      this.query = this.intent.search_query // prefilled for the user, who can edit it on the keyboard
    }
    this.aiBadge.text = this.gemini.available() && this.gemini.cachedSteps("rc-car") !== null ? "AI ready" : ""
    this.refresh()
  }

  typeChar(c: string) {
    if (this.stage !== "search") return
    if (this.query.length < 24) this.query += c
    this.refresh()
  }

  backspace() {
    if (this.stage !== "search") return
    this.query = this.query.slice(0, -1)
    this.refresh()
  }

  private refresh() {
    this.queryLabel.text = this.query + (Math.floor(this.clock * 2) % 2 === 0 ? "|" : " ")
    this.results = filterCatalogue(this.query)
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i]
      const t = this.results[i]
      c.root.enabled = t !== undefined
      if (t) {
        c.title.text = t.title
        c.blurb.text = t.blurb
        c.plate.rr.backgroundColor = t === this.selected ? new vec4(0.2, 0.5, 0.35, 0.95) : new vec4(0.14, 0.26, 0.42, 0.95)
      }
    }
  }

  pickCard(i: number) {
    if (this.stage !== "search") return
    const t = this.results[i]
    if (!t) return
    this.selected = t
    this.stage = "confirm"
    this.confirm.enabled = true
    this.kb.enabled = false
    this.confirmText.text = t.title + " - okay?"
    this.refresh()
  }

  cancel() {
    if (this.stage !== "confirm") return
    this.selected = null
    this.stage = "search"
    this.confirm.enabled = false
    this.kb.enabled = true
    this.refresh()
  }

  okay() {
    if (this.stage !== "confirm" || this.selected === null) return
    const t = this.selected
    if (!t.ready) {
      this.note = "No step list for this one yet."
      this.noteLabel.text = this.note
      this.cancel()
      return
    }
    this.stage = "building"
    this.confirm.enabled = false
    this.search.enabled = false
    this.caption.text = "Building the " + t.title + " guide..."
    // never wait for the network: the bundled sample step list starts at once; an AI step list is used only if it is already cached
    const pack = this.gemini.available() ? this.gemini.cachedSteps(t.id) : null
    this.stepsSource = pack ? "gemini" : "sample"
    this.g.usePack(pack ? pack : packForProject(t.id))
    this.endUi()
    this.g.enter()
    if (this.autoHands) this.g.startDemo()
  }

  /** Leave the flow without building (CLOSE): wake the main menu again. */
  close() {
    this.running = false
    this.ops = []
    this.hand.show(false)
    this.autoHome()
    this.stage = "idle"
    this.hideAll()
    this.micRoot.enabled = true
    this.g.endVoiceFlow(true)
  }

  private autoHome() {
    this.autoRoot.setParent(this.root)
    this.autoRoot.getTransform().setLocalPosition(new vec3(3.4, -10.2, -40))
  }

  private endUi() {
    this.autoHome()
    this.running = false
    this.ops = []
    this.hand.show(false)
    this.stage = "idle"
    this.hideAll()
    this.micRoot.enabled = true
  }

  /** Any real click or grab takes over from the hands. */
  takeOver() {
    if (!this.running) return
    this.running = false
    this.ops = []
    this.hand.show(false)
    this.autoHands = false
    this.autoLabel.text = "HANDS: OFF"
    this.g.setAutoHands(false)
    if (this.stage === "listening") this.tryAsr()
  }

  isRunning(): boolean {
    return this.running
  }

  // ------------------------------------------------------------------ the hands script
  private seq(): Seq {
    return new Seq(this.hand)
  }

  private runHands() {
    const s = this.seq()
    const tap = (name: string, dur: number, then: () => void) => s.tap(() => this.tapWorld(name), dur, then)
    s.call(() => {
      this.hand.setPos(new vec3(14, -17, -36))
      this.hand.show(true)
      this.hand.setPinch(false)
    })
    tap("mic", 1.6, () => (this.caption.text = "Listening..."))
    s.wait(1.6)
    s.call(() => {
      this.caption.text = 'You said: "' + SCRIPTED_LINE + '"'
      this.noteLabel.text = "(presenter voice: a laptop preview has no microphone input)"
      this.transcript = SCRIPTED_LINE
    })
    s.wait(2.6)
    s.call(() => this.resolveIntent())
    s.until(() => !this.pending, 12)
    s.wait(0.8)
    s.call(() => this.openSearch())
    s.wait(1.0)
    // type the query key by key (the ops are made when the query is known, then spliced in right here)
    s.ops.push(() => {
      const q = this.intent ? this.intent.search_query : "rc car"
      const t = this.seq()
      for (let i = 0; i < q.length; i++) {
        const ch = q[i]
        t.tap(() => this.tapWorld("key_" + (ch === " " ? "space" : ch)).add(new vec3(0, 0, 0)), 0.4, () => this.typeChar(ch))
      }
      this.ops.splice(this.oi + 1, 0, ...t.ops)
      return true
    })
    s.wait(1.8) // the results list has filtered
    tap("card0", 1.4, () => this.pickCard(0))
    s.wait(2.0)
    tap("okay", 1.2, () => this.okay())
    s.wait(0.4)
    this.ops = s.ops
    this.oi = 0
    this.running = true
    this.startedAt = getTime()
  }

  // ------------------------------------------------------------------ per frame
  /** Keep the VOICE / HANDS pills on the bottom edge of whatever view is showing (any panel shape), below the robot and the Lv bar. */
  private placePills() {
    const cam = mainCamera()
    if (!cam) return
    const p = cam.screenSpaceToWorldSpace(new vec2(0.5, 0.9), 40)
    this.micRoot.getTransform().setWorldPosition(new vec3(p.x, p.y, p.z))
    // the title keeps only the three page buttons and the voice button: the HANDS switch shows once the flow is open
    const showAuto = this.stage !== "idle"
    if (this.autoRoot.enabled !== showAuto) this.autoRoot.enabled = showAuto
    if (this.stage === "idle" || this.stage === "listening" || this.stage === "thinking") this.autoRoot.getTransform().setWorldPosition(new vec3(p.x + 7.6, p.y, p.z))
  }

  aiBadgeText(): string {
    return this.aiBadge.text
  }

  update(dt: number) {
    this.clock += dt
    this.placePills()
    // the "AI ready" badge appears when the background step list reaches the cache (checked a few times a second, never blocking)
    if (this.stage === "search" && ++this.badgeTick % 20 === 0 && this.aiBadge.text === "") {
      if (this.gemini.available() && this.gemini.cachedSteps("rc-car") !== null) this.aiBadge.text = "AI ready"
    }
    this.hand.update(dt)
    if (this.stage === "idle" || this.stage === "search") {
      if (this.stage === "search") this.queryLabel.text = this.query + (Math.floor(this.clock * 2) % 2 === 0 ? "|" : " ")
    }
    // listening pulse
    if (this.stage === "listening") {
      const s = 1 + 0.12 * Math.sin(this.clock * 9)
      this.micGlow.obj.getTransform().setLocalScale(new vec3(s, s, 1))
      this.micGlow.sm.set([1, 0.35, 0.3, 0.95])
      if (!this.autoHands && !this.heard && this.clock - this.asrStarted > this.asrTimeoutS) {
        this.heard = true
        this.noteLabel.text = "No speech heard (preview has no microphone): using the scripted line"
        this.gotTranscript(SCRIPTED_LINE)
      }
    } else if (this.stage === "idle") this.micGlow.sm.set([0.35, 0.95, 1, 0.9])
    if (!this.running) return
    const op = this.ops[this.oi]
    if (op === undefined) {
      this.running = false
      return
    }
    if (op(dt)) this.oi++
  }

  /** Test read-outs. */
  cardTitle(i: number): string {
    return this.cards[i].root.enabled ? this.cards[i].title.text : ""
  }
  captionText(): string {
    return this.caption.text
  }
  confirmTextValue(): string {
    return this.confirm.enabled ? this.confirmText.text : ""
  }
  keyboardShown(): boolean {
    return this.kb.enabled
  }
  catalogueSize(): number {
    return CATALOGUE.length
  }
}
