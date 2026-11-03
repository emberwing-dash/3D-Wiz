// WizGuide.ts - Circuit Guide orchestrator (video-guided building on a virtual table, then drive / control the finished model).
// Owns: the step state machine (guide glow -> check -> green -> next step, no Next button), the legacy-lab switch, Play, driving.
// Expects @inputs wired by the scene bootstrap: the unit meshes + materials (same assets WizRobot uses), optional user FBX prefab.
// Must not: contain step data (GuideData.ts), draw UI (GuideUI.ts), or check drops (GuideBench.ts).
// Offline by design: the Lens runs fully from the saved step list. The Gemini key field below is NEVER written anywhere.

import {PartKit} from "./WizParts"
import {RC_SAMPLE, GuidePack, GuideStep, parseGuidePack} from "./GuideData"
import {GuideBench, BenchResult} from "./GuideBench"
import {StepPanel, Orb, PlayButton, Controller} from "./GuideUI"
import {makeTap, label, TEXT_LIGHT} from "./GuideKit"
import {rrect} from "./WizUI"
import {mainCamera} from "./WizPlacement"
import {GuideDemo} from "./GuideDemo"
import {GuideVoice} from "./GuideVoiceUI"
import {GuideViz} from "./GuideViz"
import {GuideAnalyse} from "./GuideAnalyse"
import {GeminiClient, pickKey} from "./GuideVoice"
import {GEMINI_KEY_LOCAL} from "./GeminiKeyLocal"

export type GuidePhase = "idle" | "working" | "success" | "built" | "play"

@component
export class WizGuide extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">WizGuide - Circuit Guide (video-guided build)</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Unit cube mesh (1 cm)")
  boxMesh!: RenderMesh
  @input
  @hint("Unit sphere mesh (1 cm)")
  sphereMesh!: RenderMesh
  @input
  @hint("Unit cylinder mesh (1 cm)")
  cylinderMesh!: RenderMesh
  @input
  @hint("Lit glTF material")
  litMaterial!: Material
  @input
  @hint("Unlit material (glow, panels)")
  unlitMaterial!: Material
  @input
  @allowUndefined
  @hint("Optional: the user's imported FBX prefab (Assets/UserModels). Used when Model source is FBX.")
  userModel!: ObjectPrefab
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("Main menu (3D Wiz)", "menu"), new ComboBoxItem("Circuit Guide directly", "guide")]))
  @hint("What opens on reset: the original 3D Wiz main menu (Lab / Circuit / Visualize), or the Circuit Guide directly")
  startMode: string = "menu"
  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("RC car (printed parts)", "rc"), new ComboBoxItem("User FBX prefab", "fbx")]))
  @hint("Model on the table: the RC car sample parts or the imported FBX")
  modelSource: string = "rc"
  @input
  @widget(new SliderWidget(0.7, 2.2, 0.1))
  @hint("Size of the work table content (1 = real size; larger is easier to grab)")
  benchScale: number = 0.9
  @input
  @widget(new SliderWidget(0, 60, 1))
  @hint("How far the table top is tilted toward you (degrees); 0 = flat")
  tableTiltDeg: number = 40
  @input
  @widget(new SliderWidget(16, 30, 1))
  @hint("Width of the left step panel in cm")
  panelWidthCm: number = 18
  @input
  @widget(new SliderWidget(35, 70, 1))
  @hint("Distance of the voice orb in front of you in cm (front-right)")
  orbDistanceCm: number = 50
  @input
  @widget(new SliderWidget(0.4, 3, 0.1))
  @hint("Seconds the green success glow shows before the next step starts")
  successHoldS: number = 1.1
  @input
  @hint("Gemini API key (optional). Better: put it in .env and run tools/apply-env.ps1 (see README). If you paste it here, CLEAR it before saving or committing. Never logged or echoed by the Lens. Empty here AND in .env = offline.")
  geminiKey: string = ""
  @input
  @hint("Live AI (Gemini). OFF = the demo is fully offline and instant: no network call is ever made. ON = Gemini only warms a cache in the background and powers ASK MORE; it never blocks or changes the demo.")
  liveAi: boolean = false
  @input
  @hint("Gemini model used for the intent and the step list (a small fast one)")
  geminiModel: string = "gemini-flash-latest"
  @input
  @hint("Log steps and results (debug)")
  debugLog: boolean = false
  @ui.group_end

  static instance: WizGuide | null = null

  bench!: GuideBench
  panel!: StepPanel
  orb!: Orb
  controller!: Controller
  private play!: PlayButton
  demo!: GuideDemo
  voice!: GuideVoice
  viz!: GuideViz
  analyse!: GuideAnalyse
  private gemini!: GeminiClient
  private page: "none" | "build" | "analyse" | "viz" = "none"
  /** Set by WizMain: opens an old 3D Wiz page (lab / projects / visualize) from a page button. */
  static onLegacy: ((id: string) => void) | null = null
  /** Set by WizMain: true while the 3D Wiz title screen is the current page. */
  static isTitle: () => boolean = () => false
  private demoLabel!: Text
  private pills: {[id: string]: {root: SceneObject; on: () => void}} = {}
  private pack: GuidePack = RC_SAMPLE
  private kit!: PartKit
  private idx = -1
  private ph: GuidePhase = "idle"
  private root!: SceneObject
  private legacyOff: SceneObject[] = []
  private oldBar!: SceneObject
  /** Set by WizMain: the Guide's MENU button returns to the 3D Wiz title screen. */
  static onExit: (() => void) | null = null
  private built = false
  private guideOn = false
  private timer = 0
  private resetTimer = 0
  private mistakes = 0
  private btnRoot!: SceneObject
  private lastSpeed = 0
  private servoBase: quat[] = []

  onAwake() {
    WizGuide.instance = this
    this.createEvent("OnStartEvent").bind(() => {
      this.ensureKit()
      this.gemini = new GeminiClient(() => this.effectiveKey(), () => this.geminiModel, (s, f) => this.later(s, f), () => this.liveAi)
      this.voice = new GuideVoice(this, this.kit, this.gemini)
      if (this.startMode === "guide") this.enter()
      else this.prewarm()
    })
    this.createEvent("UpdateEvent").bind(() => this.update(getDeltaTime()))
    // a mouse click / touch anywhere takes over from the auto demo (ignored for a moment after it starts: the click that started it)
    this.createEvent("TouchStartEvent").bind(() => {
      if (this.demo && this.demo.running && getTime() - this.demo.startedAt > 1.0) this.stopDemo()
      if (this.voice && this.voice.isRunning() && getTime() - this.voice.startedAt > 1.0) this.voice.takeOver()
      if (this.viz && this.viz.demoRunning && getTime() - this.viz.startedAt > 1.0) this.viz.stopDemo()
      if (this.analyse && this.analyse.demoRunning && getTime() - this.analyse.startedAt > 1.0) this.analyse.stopDemo()
    })
  }

  // ------------------------------------------------------------------ mode switch
  /** Root objects that belong to the original 3D Wiz (3DWiz, its HeadUI, Phobo). Only these are put to sleep: the SIK / animate / update
   *  dispatcher roots, the camera and the tests must keep running. */
  private legacyRoots(): SceneObject[] {
    const mine = ["3DWiz", "HeadUI", "Phobo"]
    const out: SceneObject[] = []
    const n = global.scene.getRootObjectsCount()
    for (let i = 0; i < n; i++) {
      const o = global.scene.getRootObject(i)
      if (mine.indexOf(o.name) >= 0 && o.enabled) out.push(o)
    }
    return out
  }

  /** Open the Circuit Guide: the original 3D Wiz scenes sleep, the guide shows on the table. */
  sleepLegacy(): void {
    if (this.legacyOff.length > 0) return
    this.legacyOff = this.legacyRoots()
    for (const o of this.legacyOff) o.enabled = false
  }

  wakeLegacy(): void {
    for (const o of this.legacyOff) if (!isNull(o)) o.enabled = true
    this.legacyOff = []
  }

  /** The voice flow starts on the title screen: the 3D Wiz scenes sleep while the search / confirm pages show. */
  beginVoiceFlow(): void {
    this.sleepLegacy()
  }

  endVoiceFlow(backToMenu: boolean): void {
    if (!backToMenu) return
    this.wakeLegacy()
    if (WizGuide.onExit !== null) WizGuide.onExit()
  }

  usePack(p: GuidePack): void {
    this.pack = p
    if (this.built) this.rebuildWorld()
  }

  setAutoHands(on: boolean): void {
    if (this.voice && this.voice.autoHands !== on) this.voice.setAuto(on)
  }

  later2(sec: number, f: () => void): void {
    this.later(sec, f)
  }

  private later(sec: number, f: () => void): void {
    const d = this.createEvent("DelayedCallbackEvent")
    d.bind(f)
    d.reset(sec)
  }

  enter(): void {
    const t0 = Date.now()
    this.sleepLegacy()
    if (!this.built) this.build()
    this.hidePages()
    this.page = "build"
    this.root.enabled = true
    this.guideOn = true
    this.restart()
    this.lastEnterMs = Date.now() - t0
  }

  private hidePages() {
    if (this.viz) this.viz.show(false)
    if (this.analyse) this.analyse.show(false)
    if (this.built) this.root.enabled = false
  }

  private ensurePages() {
    this.ensureViz()
    this.ensureAnalyse()
  }

  private ensureViz() {
    this.ensureKit()
    if (!this.viz) {
      this.viz = new GuideViz(this.kit, this.sceneRoot())
      this.viz.onMenu = () => this.exitToMenu()
      this.viz.onOldView = () => this.toOld("visualize")
    }
  }

  private ensureAnalyse() {
    this.ensureKit()
    if (!this.analyse) {
      this.analyse = new GuideAnalyse(this.kit, this.sceneRoot())
      this.analyse.onMenu = () => this.exitToMenu()
      this.analyse.askAvailable = () => this.gemini.available()
      this.analyse.ask = (p, w) => this.gemini.ask(p, w)
    }
  }

  private sceneRoot(): SceneObject {
    if (!this.pagesRoot) this.pagesRoot = global.scene.createSceneObject("GuidePages")
    return this.pagesRoot
  }
  private pagesRoot: SceneObject | null = null

  /** The VISUALIZE page: the printed RC car large on the table and real component models to attach. */
  enterViz(): void {
    const t0 = Date.now()
    this.sleepLegacy()
    this.ensurePages()
    this.hidePages()
    this.page = "viz"
    this.guideOn = true
    this.viz.show(true)
    this.lastEnterMs = Date.now() - t0
  }

  /** The ANALYSE page: name tags and info buttons over a real-looking RC car. */
  enterAnalyse(): void {
    const t0 = Date.now()
    this.sleepLegacy()
    this.ensurePages()
    this.hidePages()
    this.page = "analyse"
    this.guideOn = true
    this.analyse.show(true)
    this.lastEnterMs = Date.now() - t0
  }

  /** Menu entries: with HANDS AUTO on, the simulated hand starts working on the page by itself. */
  enterFromMenu(page: "build" | "analyse" | "viz"): void {
    if (page === "build") {
      this.enter()
      if (this.voice.autoHands) this.startDemo()
    } else if (page === "viz") {
      this.enterViz()
      if (this.voice.autoHands) this.viz.startDemo()
    } else {
      this.enterAnalyse()
      if (this.voice.autoHands) this.analyse.startDemo()
    }
  }

  /** Build the three page worlds hidden and a little apart, so entering a page from the menu costs no model loading (spreads the cost over the first seconds). */
  private prewarm() {
    this.later(1.2, () => {
      if (!this.built) {
        this.build()
        if (!this.guideOn) this.root.enabled = false
      }
    })
    this.later(2.6, () => this.ensureViz())
    this.later(4.0, () => this.ensureAnalyse())
  }

  // ------------------------------------------------------------------ frame-time probe (milliseconds)
  private perfN = 0
  private perfSum = 0
  private perfMax = 0
  private perfOver50 = 0
  lastEnterMs = 0

  perfReset() {
    this.perfN = 0
    this.perfSum = 0
    this.perfMax = 0
    this.perfOver50 = 0
  }

  perfSnapshot(): {frames: number; avgMs: number; maxMs: number; over50: number} {
    return {frames: this.perfN, avgMs: this.perfN > 0 ? this.perfSum / this.perfN : 0, maxMs: this.perfMax, over50: this.perfOver50}
  }

  geminiClient(): GeminiClient {
    return this.gemini
  }

  /** The key in use: the Inspector field first, else the generated local module (from .env, tools/apply-env.ps1), else none (offline). */
  private effectiveKey(): string {
    return pickKey(this.geminiKey, GEMINI_KEY_LOCAL)
  }

  /** For logs: never the key itself. */
  keyStatus(): string {
    const a = this.geminiKey.trim().length
    const b = GEMINI_KEY_LOCAL.trim().length
    if (a > 0) return "set, " + a + " chars (Inspector)"
    if (b > 0) return "set, " + b + " chars (.env module)"
    return "empty"
  }

  /** For tests: lengths of each source, never values. */
  keySources(): {inspector: number; local: number} {
    return {inspector: this.geminiKey.trim().length, local: GEMINI_KEY_LOCAL.trim().length}
  }

  pageName(): string {
    return this.page
  }

  /** From a page button: leave the Guide pages and open an old 3D Wiz scene (Circuit Lab, Library, the old Visualize). */
  toOld(id: string): void {
    this.leave()
    if (WizGuide.onLegacy !== null) WizGuide.onLegacy(id)
  }

  /** Close the Guide and wake the original 3D Wiz again (no title reset: see exitToMenu). */
  leave(): void {
    this.guideOn = false
    this.page = "none"
    this.hidePages()
    this.wakeLegacy()
  }

  /** The Guide's MENU button: back to the 3D Wiz main menu. */
  exitToMenu(): void {
    this.leave()
    if (WizGuide.onExit !== null) WizGuide.onExit()
  }

  active(): boolean {
    return this.guideOn
  }

  // ------------------------------------------------------------------ build
  /** Replace the step list (the pre-analysis output, JSON of GuidePack). Throws a readable error on a bad list. */
  loadPackJson(json: string): void {
    this.pack = parseGuidePack(json)
    if (this.built) this.rebuildWorld()
  }

  private ensureKit() {
    if (!this.kit) this.kit = new PartKit(this.boxMesh, this.sphereMesh, this.cylinderMesh, this.litMaterial, this.unlitMaterial)
  }

  private build() {
    this.built = true
    this.root = global.scene.createSceneObject("GuideRoot")
    this.ensureKit()
    this.buildWorld()
  }

  private buildWorld() {
    this.bench = new GuideBench(this.root, this.kit, this.pack, this.benchScale, this.tableTiltDeg)
    this.bench.buildModel(this.modelSource === "fbx" ? "fbx" : "rc", this.userModel ? this.userModel : null)
    this.bench.onResult = (r) => this.onResult(r)
    this.bench.onGrab = () => {
      if (this.ph === "working") this.orb.hold(true)
    }
    this.panel = new StepPanel(this.kit, this.panelWidthCm, new vec3(-2, 10.5, -60))
    const od = this.orbDistanceCm
    this.orb = new Orb(this.kit, new vec3(od * 0.152, od * 0.12, -od * 0.92))
    this.play = new PlayButton(this.kit, this.bench.work, new vec3(0, 0.6, 5.4), () => this.pressPlay())
    this.controller = new Controller(this.kit, this.bench.work, new vec3(0, 0.6, 5.6))
    this.buildModelButtons()
    this.demo = new GuideDemo(this, this.kit, this.root)
    this.demo.onEnd = () => this.onDemoEnd()
    this.bench.onBlockedGrab = () => this.stopDemo()
    this.root.getTransform()
    this.panel.root.setParent(this.root)
    this.orb.root.setParent(this.root)
  }

  private rebuildWorld() {
    this.bench.work.destroy()
    this.panel.root.destroy()
    this.orb.root.destroy()
    this.buildWorld()
    this.restart()
  }

  /** Explode / Reassemble pills that stay next to the model wherever it is placed. */
  private buildModelButtons() {
    this.btnRoot = this.kit.obj(this.bench.work, "GuideModelButtons")
    const mk = (id: string, text: string, x: number, on: () => void) => {
      const b = this.kit.obj(this.btnRoot, "guide_btn_" + id, [x, 0, 0])
      const face = this.kit.obj(b, "face")
      face.getTransform().setLocalRotation(quat.fromEulerVec(new vec3(-0.6, 0, 0)))
      rrect(face, "plate_" + id, 4.6, 2.1, 1.0, [0.12, 0.3, 0.5, 0.92], 0, {size: 0.14, color: [0.35, 0.95, 1, 0.9]})
      label(face, "label_" + id, text, 20, new vec3(0, 0, 0.3), TEXT_LIGHT, true)
      const hit = this.kit.obj(face, "guide_btn_hit_" + id)
      makeTap(hit, new vec3(5, 2.8, 2.2), on)
      this.pills[id] = {root: b, on: on}
    }
    mk("explode", "EXPLODE", -2.5, () => this.bench.model.explode())
    mk("assemble", "ASSEMBLE", 2.5, () => this.bench.model.assemble())
    // the earlier 3D Wiz pages stay reachable from here: a small row on the bottom edge of the view (nothing can hide it)
    this.oldBar = this.kit.obj(this.root, "GuideOldBar")
    const mkOld = (id: string, text: string, x: number, legacyId: string) => {
      const o = this.kit.obj(this.oldBar, "guide_btn_old_" + id, [x, 0, 0])
      const of = this.kit.obj(o, "face")
      rrect(of, "plate_" + id, id === "view" ? 3.8 : 4.4, 1.9, 0.9, [0.2, 0.3, 0.3, 0.95], 0, {size: 0.12, color: [0.8, 0.95, 1, 0.9]})
      label(of, "label_" + id, text, 17, new vec3(0, 0, 0.3), TEXT_LIGHT, true)
      makeTap(this.kit.obj(of, "guide_btn_hit_old_" + id), new vec3(4.8, 2.4, 2.2), () => this.toOld(legacyId))
    }
    mkOld("lab", "OLD LAB", -5.0, "lab")
    mkOld("library", "LIBRARY", 0, "projects")
    mkOld("view", "OLD VIEW", 5.0, "visualize")
    // a fixed MENU button on the table: every page can go back to the 3D Wiz main menu
    const m = this.kit.obj(this.bench.work, "guide_btn_menu_root", [8.6, 0.5, 7.4])
    const face = this.kit.obj(m, "face")
    face.getTransform().setLocalRotation(quat.fromEulerVec(new vec3(-0.6, 0, 0)))
    rrect(face, "plate_menu", 4.6, 2.1, 1.0, [0.6, 0.25, 0.25, 0.95], 0, {size: 0.14, color: [1, 0.65, 0.65, 0.95]})
    label(face, "label_menu", "MENU", 22, new vec3(0, 0, 0.3), TEXT_LIGHT, true)
    const hit = this.kit.obj(face, "guide_btn_hit_menu")
    makeTap(hit, new vec3(5.2, 2.8, 2.2), () => this.exitToMenu())
    // WATCH DEMO / STOP DEMO: one big pill; the auto demo plays the whole guide with a simulated hand
    const d = this.kit.obj(this.bench.work, "guide_btn_demo_root", [4.6, 0.5, -7.7])
    const df = this.kit.obj(d, "face")
    df.getTransform().setLocalRotation(quat.fromEulerVec(new vec3(-0.6, 0, 0)))
    rrect(df, "plate_demo", 7.6, 2.4, 1.1, [0.1, 0.5, 0.3, 0.95], 0, {size: 0.16, color: [0.55, 1, 0.7, 1]})
    this.demoLabel = label(df, "label_demo", "WATCH DEMO", 26, new vec3(0, 0, 0.3), TEXT_LIGHT, true)
    const dh = this.kit.obj(df, "guide_btn_hit_demo")
    makeTap(dh, new vec3(8.2, 3.0, 2.2), () => (this.demo.running ? this.stopDemo() : this.startDemo()))
  }

  // ------------------------------------------------------------------ auto demo
  startDemo(): void {
    if (this.demo.running) return
    this.restart()
    this.bench.setEnabled(false) // the simulated hand is the only hand; a real grab ends the demo
    this.demoLabel.text = "STOP DEMO"
    this.demo.start()
  }

  stopDemo(): void {
    if (!this.demo || !this.demo.running) return
    this.demo.stop()
  }

  private onDemoEnd() {
    this.bench.demoAbort()
    this.bench.setEnabled(true)
    this.demoLabel.text = "WATCH DEMO"
  }

  demoRunning(): boolean {
    return this.demo !== undefined && this.demo.running
  }

  pillWorld(id: string): vec3 {
    return this.pills[id].root.getTransform().getWorldPosition()
  }

  tapPill(id: string): void {
    this.pills[id].on()
  }

  playWorld(): vec3 {
    return this.play.root.getTransform().getWorldPosition()
  }

  // ------------------------------------------------------------------ the flow
  restart(): void {
    this.idx = -1
    this.mistakes = 0
    this.timer = 0
    this.controller.show(false)
    this.play.show(false)
    this.orb.reset()
    this.bench.reset()
    this.bench.model.assemble()
    this.bench.setEnabled(true)
    this.ph = "idle"
    this.advance()
  }

  private advance() {
    this.idx++
    if (this.idx >= this.pack.steps.length) {
      this.finish()
      return
    }
    const st = this.pack.steps[this.idx]
    this.ph = "working"
    this.bench.showStep(st)
    this.panel.show(this.idx, this.pack.steps.length, st, this.pack.source)
    this.orb.hold(false)
    this.orb.say(st.say, st.clip)
    if (this.debugLog) print("[WizGuide] step " + (this.idx + 1) + ": " + st.title)
  }

  private finish() {
    this.ph = "built"
    this.bench.showStep(null)
    this.panel.show(this.idx, this.pack.steps.length, null, this.pack.source)
    this.play.show(true)
    this.orb.hold(false)
    this.orb.say("The build is complete. Press Play to test it.")
  }

  step(): GuideStep | null {
    return this.idx >= 0 && this.idx < this.pack.steps.length ? this.pack.steps[this.idx] : null
  }

  private onResult(r: BenchResult) {
    const st = this.step()
    if (st === null || this.ph !== "working") return
    if (this.debugLog) print("[WizGuide] " + r.kind + " " + r.outcome + ": " + r.detail)
    if (r.outcome === "ok") {
      this.ph = "success"
      this.bench.showSuccess()
      this.orb.hold(false)
      this.orb.chime()
      this.orb.say(st.after)
      this.timer = this.successHoldS
    } else if (r.outcome === "wrong") {
      this.mistakes++
      this.orb.hint(st.hint)
      this.resetTimer = 1.6
    } else if (r.outcome === "miss") {
      this.orb.hint(st.kind === "wire" ? "Drop the wire end on a glowing pin." : "Drop it on the glowing spot.")
    } else {
      this.orb.chime()
    }
  }

  // ------------------------------------------------------------------ Play + drive
  pressPlay(): void {
    if (this.ph !== "built") return
    this.ph = "play"
    this.play.show(false)
    this.bench.model.assemble()
    const servo = this.pack.controller === "servo"
    this.controller.open(servo ? "servo" : "car", servo ? Math.min(4, this.bench.model.parts.length) : 0)
    this.controller.show(true)
    this.servoBase = this.bench.model.parts.map((p) => p.obj.getTransform().getLocalRotation())
    this.orb.say(servo ? "Use the sliders to move the arm." : "Use the joystick to drive. Boost is a hold button.")
  }

  /** Open the controller in a given mode on the current model (the FBX test uses it for the servo sliders). */
  openController(mode: "car" | "servo"): void {
    this.ph = "play"
    this.bench.model.assemble()
    this.controller.open(mode, mode === "servo" ? Math.min(4, this.bench.model.parts.length) : 0)
    this.controller.show(true)
    this.servoBase = this.bench.model.parts.map((p) => p.obj.getTransform().getLocalRotation())
  }

  /** Switch the model on the table (rc | fbx) and restart the guide. */
  setModelSource(src: "rc" | "fbx"): void {
    this.modelSource = src
    this.bench.buildModel(src, this.userModel ? this.userModel : null)
    this.restart()
  }

  private update(dt: number) {
    const ms = dt * 1000
    if (ms > 0) {
      this.perfN++
      this.perfSum += ms
      if (ms > this.perfMax) this.perfMax = ms
      if (ms > 50) this.perfOver50++
    }
    if (this.voice) {
      const show = (WizGuide.isTitle() && !this.guideOn) || this.voice.stage !== "idle"
      if (this.voice.root.enabled !== show) this.voice.root.enabled = show
      if (show) this.voice.update(dt)
    }
    if (this.viz && this.viz.root.enabled) this.viz.update(dt)
    if (this.analyse && this.analyse.root.enabled) this.analyse.update(dt)
    if (this.oldBar && this.page === "build") {
      const cam = mainCamera()
      if (cam) this.oldBar.getTransform().setWorldPosition(cam.screenSpaceToWorldSpace(new vec2(0.5, 0.95), 44))
    }
    if (!this.guideOn || !this.built || this.page !== "build") return
    this.bench.update(dt)
    this.demo.update(dt)
    this.panel.update(dt)
    this.orb.update(dt)
    const m = this.bench.model
    // the Explode / Assemble pills stay under the model
    const ml = m.root.getTransform().getLocalPosition()
    this.btnRoot.getTransform().setLocalPosition(new vec3(ml.x, 0.5, Math.min(7.6, ml.z + 7.4)))
    if (this.ph === "success") {
      this.timer -= dt
      if (this.timer <= 0) this.advance()
    }
    if (this.resetTimer > 0) {
      this.resetTimer -= dt
      if (this.resetTimer <= 0) this.bench.resetGuideColor()
    }
    if (this.ph === "play") this.drive(dt)
  }

  private drive(dt: number) {
    const m = this.bench.model
    const v = this.controller.v
    if (this.controller.mode === "car") {
      const speed = v.y * (v.boost ? 18 : 9)
      this.lastSpeed = speed
      if (Math.abs(speed) > 0.05) {
        m.drive(speed * dt, -v.x * dt * 1.8 * (speed >= 0 ? 1 : -1))
        m.spinWheels((speed * dt) / 2.4)
      }
    } else {
      const parts = m.parts
      for (let i = 0; i < v.sliders.length && i < parts.length; i++) {
        const ang = ((v.sliders[i] - 0.5) * 2 * 60 * Math.PI) / 180
        parts[i].obj.getTransform().setLocalRotation(this.servoBase[i].multiply(quat.fromEulerVec(new vec3(0, 0, ang))))
      }
    }
  }

  // ------------------------------------------------------------------ read-outs for tests
  phase(): GuidePhase {
    return this.ph
  }
  stepIndex(): number {
    return this.idx
  }
  stepCount(): number {
    return this.pack.steps.length
  }
  mistakeCount(): number {
    return this.mistakes
  }
  speed(): number {
    return this.lastSpeed
  }
  packSource(): string {
    return this.pack.source
  }
  pinKey(step: number): [string, string] {
    return this.pack.steps[step].pins as [string, string]
  }
  stepAt(i: number): GuideStep {
    return this.pack.steps[i]
  }
}
