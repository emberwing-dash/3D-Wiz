// WizMain.ts - 3D Wiz orchestrator: title screen, SAO icon menu actions, the build game (quests), the wire game,
//              Visualize (try-before-you-build), Play (simulated test lab), pause + save / continue.
// Owns: mode state, build progress, persistence (PersistentStorageSystem), what each menu icon does, HUD content, project switching.
// Reads ALL data from PROJECT_PACK. Expects @inputs wired by the bootstrap. There are NO buttons: direct manipulation + the menu.
// Must not: build UI widgets, own component/connection data, or mix the simulated test lab with the wiring check.

import {PROJECT_PACK, getComponent, getConnection, BUILD_PLAN, QUESTS, questOf, shortName, blurb, V3, RGBA} from "./ProjectPack"
import {SesameLab} from "./WizLab"
import {CircuitValidator} from "./WizValidator"
import {WizRobot} from "./WizRobot"
import {WizBench} from "./WizBench"
import {WizMover} from "./WizMover"
import {WizDrive} from "./WizDrive"
import {WizPhobo} from "./WizPhobo"
import {WizPlacement, mainCamera} from "./WizPlacement"
import {WizInventory} from "./WizInventory"
import {WizVizBar} from "./WizVizBar"
import {WizArView} from "./WizArView"
import {makeAudio, sfx, SFX_PICK, SFX_OK, SFX_ERROR, SFX_SPAWN, SFX_PING, SFX_OPEN, SFX_CLOSE, SFX_THUNK, SFX_FLAG, SFX_ZAP, SFX_STEP, SFX_MOTOR, SFX_ON, SFX_OFF, SFX_BLIP} from "./WizUI"
import {WizPhoboAI, PhoboContext} from "./WizPhoboAI"
import {WizVisualize} from "./WizVisualize"
import {WizMenu, MenuItem} from "./WizMenu"
import {WizHud} from "./WizHud"
import {packSizeLabel} from "./WizParts"
import {PACKS, TEMPLATE_IDS, cardDefs, activateProject, nextTemplate, currentTemplate, MY_MODEL_ID, packEntry} from "./PackRegistry"
import {WizCircuitLab} from "./WizCircuitLab"
import {toWorld, isSpectacles, uiPressedWithin} from "./WizInteract"
import {WizRoute} from "./WizRoute"
import {WizGuide} from "./WizGuide"

// The guided Build game is no longer offered in the menu (the Circuit lab + Drive replace it); its code stays for the LEAF tests.
const BUILD_IN_MENU = false

type Mode = "launch" | "overview" | "build" | "circuit" | "test" | "visualize" | "lab" | "drive"

const SAVE_KEY = "3dwiz_session_v1"
const PLAY_PAGES: string[][] = [
  ["walk", "wave", "dance", "bow", "rest", "stand", "cute"],
  ["freaky", "worm", "shake", "shrug", "dead", "crab", "swim"],
  ["point", "pushup", "back", "left", "right"],
]
const CMD_ICON: {[id: string]: string} = {
  walk: "directions_walk", wave: "waving_hand", dance: "music_note", bow: "accessibility_new", rest: "hotel", stand: "accessibility",
  cute: "favorite", freaky: "mood", worm: "cable", shake: "sync_alt", shrug: "help", dead: "sentiment_very_dissatisfied", crab: "apps",
  swim: "pool", point: "touch_app", pushup: "fitness_center", back: "arrow_back", left: "turn_left", right: "turn_right",
}

@component
export class WizMain extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">WizMain - 3D Wiz orchestrator (no buttons)</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Sesame robot (real parts, AR desk view, guided map)")
  robot!: WizRobot
  @input
  @hint("Tinkercad-style circuit bench")
  bench!: WizBench
  @input
  @hint("VISUALIZE workbench")
  visualize!: WizVisualize
  @input
  @hint("Title screen + SAO icon menu")
  menu!: WizMenu
  @input
  @hint("Tiny HUD (pips, i card)")
  hud!: WizHud
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Log mode changes and inputs (debug)")
  debugLog: boolean = false
  @input
  @hint("Debug: start in this mode (launch | visualize | build | overview | circuit | test)")
  debugStartMode: string = ""
  @input
  @hint("Debug: action run 1.5 s after the debug start, e.g. menu | pick | select:oled | wire:i2c_sda | cmd:wave | arrange | demo | pause")
  debugAction: string = ""
  @ui.group_end

  private mode: Mode = "launch"
  private lab!: SesameLab
  private clab!: WizCircuitLab
  private validator = new CircuitValidator()
  private exploded: boolean = false
  private enlarged: boolean = false
  private step: number = 0
  private selectedPart: string = ""
  private selectedWire: string = ""
  private placed: string[] = []
  private buildConnected: string[] = []
  private buildToken: number = 0
  private buildComplete: boolean = false
  private playUnlocked: boolean = false
  private paused: boolean = false
  private playPage: number = -1
  private hudLine: string = ""
  private questMistakes: number[] = [0, 0, 0, 0]
  private petCelebrated = false
  private snaps: number = 0
  private demoSeen: boolean = false
  private mover: WizMover | null = null
  private history: Mode[] = []
  private goingBack = false
  private drive!: WizDrive
  private phobo!: WizPhobo
  private placement!: WizPlacement
  private inventory!: WizInventory
  private vizBar!: WizVizBar
  private ar!: WizArView
  private route!: WizRoute
  private moveBar!: WizVizBar
  private uiAudio!: AudioComponent
  private motorAudio!: AudioComponent
  private motorOn = false
  private stepT = 0
  private menuWasOpen = false
  private idleT = 0
  private introSeen: {[mode: string]: boolean} = {}
  private testedInputs: {[id: string]: boolean} = {}
  private lastProblem = ""
  private saved: boolean = false
  private saveCache: {[k: string]: any} | null = null
  private statusAcc: number = 0
  private clock: number = 0

  onAwake() {
    this.lab = new SesameLab({
      setAngle: (s, d) => this.robot.setAngle(s, d),
      setFace: (n, m) => this.robot.setFace(n, m),
    })
    this.clab = new WizCircuitLab(this.bench, this.hud)
    this.clab.onProgress = (fn, first) => {
      if (first) {
        void 0
      }
    }
    this.clab.onWireCount = () => (this.idleT = 0)
    this.clab.onFail = (why) => {
      this.lastProblem = why
      this.phoboSay(why, "worried")
      this.phobo.setChips([{id: "why", label: "Why?"}, {id: "next", label: "Next?"}])
    }
    this.clab.onVerified = (n, total) => {
      void 0
      this.phoboSay(n + " of " + total + " verified", "happy")
    }
    this.clab.onAllPassed = () => {
      void 0
      void 0
      if (this.clab.verifyMode()) {
        this.phoboSay("Pet activated!", "wow")
        this.robot.celebrate()
      } else this.phoboSay("Car works!", "wow")
    }
    this.createEvent("OnStartEvent").bind(() => {
      // nothing but the title shows until the first state is set (the bench, desk model and workbench are built hidden)
      this.robot.setLoaded(false)
      this.bench.setLoaded(false)
      this.visualize.setActive(false)
      this.placeAll()
      this.bind()
      const d = this.createEvent("DelayedCallbackEvent")
      d.bind(() => this.initialState())
      d.reset(0.4)
    })
    this.createEvent("UpdateEvent").bind(() => this.update(getDeltaTime()))
  }

  private later(sec: number, fn: () => void) {
    const d = this.createEvent("DelayedCallbackEvent")
    d.bind(fn)
    d.reset(sec)
  }

  // ------------------------------------------------------------- setup
  private placeAll() {
    const pl = PROJECT_PACK.placement
    this.robot.setPresentation("desk", new vec3(pl.desk[0], pl.desk[1], pl.desk[2]), new vec3(pl.locator[0], pl.locator[1], pl.locator[2]))
    this.bench.getSceneObject().getTransform().setWorldPosition(toWorld(this.bench.getSceneObject(), new vec3(pl.bench[0], pl.bench[1], pl.bench[2])))
    this.visualize.getSceneObject().getTransform().setWorldPosition(toWorld(this.visualize.getSceneObject(), new vec3(0, -11, -68)))
    this.hud.getSceneObject().getTransform().setWorldPosition(toWorld(this.hud.getSceneObject(), new vec3(0, 5, -55)))
  }

  private initialState() {
    this.loadSave() // reads persisted progress (if any) so the menu can offer Continue
    this.toLaunch()
    if (this.debugStartMode !== "" && this.debugStartMode !== "launch") {
      this.enterMode(this.debugStartMode as Mode)
      if (this.debugAction !== "") this.runChain(this.debugAction.split(";"), 0)
    } else if (this.debugAction !== "") this.runChain(this.debugAction.split(";"), 0)
    else this.menu.openAfter(PROJECT_PACK.gesture.autoOpenS)
  }

  /** Debug: run "a;b;c" one action every 1.3 s (screenshots of multi-step flows). */
  private runChain(list: string[], i: number) {
    if (i >= list.length) return
    this.later(1.3, () => {
      this.runDebugAction(list[i])
      this.runChain(list, i + 1)
    })
  }

  private runDebugAction(a: string) {
    const parts = a.split(":")
    const arg = parts.length > 1 ? parts[1] : ""
    if (parts[0] === "menu") this.menu.openMenu("debug")
    else if (parts[0] === "select") this.onMenuSelect(arg)
    else if (parts[0] === "part") this.onPartSelected(arg)
    else if (parts[0] === "wire") this.onWireTap(arg)
    else if (parts[0] === "cmd") this.runCommand(arg)
    else if (parts[0] === "arrange") this.visualize.arrangeNow()
    else if (parts[0] === "demo") this.visualize.playDemo()
    else if (parts[0] === "voice") WizGuide.instance?.voice.micTap()
    else if (parts[0] === "guideback") WizGuide.instance?.exitToMenu()
    else if (parts[0] === "pause") this.setPaused(true)
    else if (parts[0] === "unlock") this.unlockPlay()
    else if (parts[0] === "hand") this.menu.playHandDemo(arg !== "up")
    else if (parts[0] === "drop") this.robot.simulateDrag(this.robot.pickDeltaWorld().x, this.robot.pickDeltaWorld().y)
    else if (parts[0] === "turn") this.robot.rotatePick()
    else if (parts[0] === "project") this.loadProject(arg)
    else if (parts[0] === "projects") this.showProjects()
    else if (parts[0] === "mode") this.enterMode(arg as Mode)
    else if (parts[0] === "template") this.onMenuSelect("template")
    else if (parts[0] === "step") this.skipStep()
    else if (parts[0] === "labauto") this.clab.autoWire(arg !== "one")
    else if (parts[0] === "labtest") this.clab.runTests()
    else if (parts[0] === "labview") this.bench.setLabView(arg === "3d" ? "3d" : arg === "diagram" ? "diagram" : "both")
    else if (parts[0] === "labasm") this.bench.assemble()
    else if (parts[0] === "place") this.placement.begin()
    else if (parts[0] === "placeok") this.placement.confirm()
    else if (parts[0] === "say") this.phobo.say(arg, 8)
    else if (parts[0] === "chips") {
      this.lastProblem = "Pin 7 needs a resistor"
      this.phobo.say("Stuck? Tap a chip", 14)
      this.phobo.setChips([{id: "why", label: "Why?"}, {id: "next", label: "Next?"}, {id: "what", label: "What?"}], 14)
    } else if (parts[0] === "chipwhy") this.phoboAnswer("why")
    else if (parts[0] === "cp") this.route.add(parseFloat(arg.split(",")[0]), parseFloat(arg.split(",")[1]))
    else if (parts[0] === "routego") this.moveToggle("go", true)
    else if (parts[0] === "vizpower") this.vizBar.set("power", true), this.vizToggle("power", true)
    else if (parts[0] === "viztap") this.vizTap(arg)
    else if (parts[0] === "mood")this.phobo.react(arg as any, 8)
    else if (parts[0] === "drivehold") this.drive.setHeld(arg as any, true)
    else if (parts[0] === "move" && this.mover) this.mover.moveBy(new vec3(10, 0, 0))
    else if (parts[0] === "labfan") this.clab.partTapped(arg)
  }

  private headUI!: SceneObject
  private headYaw = 0
  private headPitch = 0
  private headFit = 1
  private headPos = new vec3(0, 0, 0)
  private headInit = false

  /** The menu, the HUD and the layer pills ride on the head (they follow where you look); the model, bench and wires stay on the table. */
  private buildHeadUI() {
    this.headUI = global.scene.createSceneObject("HeadUI")
    for (const so of [this.menu.getSceneObject(), this.hud.getSceneObject()]) {
      const w = so.getTransform().getWorldPosition()
      so.setParent(this.headUI)
      so.getTransform().setWorldPosition(w)
    }
  }

  /** Lazy follow: the UI turns after you only once you look well away from it, and eases in (a dead zone, then a smooth catch-up). */
  private updateHeadUI(dt: number) {
    const cam = mainCamera()
    if (!cam || !this.headUI) return
    const t = cam.getTransform()
    const p = t.getWorldPosition()
    const dir = t.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
    const yawCam = Math.atan2(-dir.x, -dir.z)
    const pitchCam = Math.max(-0.7, Math.min(0.45, Math.asin(Math.max(-1, Math.min(1, dir.y)))))
    if (!this.headInit) {
      this.headInit = true
      this.headPos = p
      this.headYaw = yawCam
      this.headPitch = pitchCam
    }
    // yaw and pitch: a small dead zone so the UI does not jitter with every head movement, then a quick ease-in once you look away
    let d = yawCam - this.headYaw
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    const dead = 0.12
    if (Math.abs(d) > dead) this.headYaw += (d - Math.sign(d) * dead) * Math.min(1, dt * 7)
    const dp = pitchCam - this.headPitch
    if (Math.abs(dp) > dead) this.headPitch += (dp - Math.sign(dp) * dead) * Math.min(1, dt * 7)
    // walking: it keeps up with you (faster the farther behind it is)
    const lag = p.sub(this.headPos).length
    this.headPos = this.headPos.add(p.sub(this.headPos).uniformScale(Math.min(1, dt * (6 + lag * 0.1))))
    // narrow views (portrait panels): shrink the UI in x / y (not in depth) so every control stays inside the picture
    const halfH = Math.tan(cam.fov / 2) * 54
    const halfW = halfH * Math.max(0.3, cam.aspect)
    const fit = Math.max(0.5, Math.min(1, halfW / 17, halfH / 19.5))
    this.headFit += (fit - this.headFit) * Math.min(1, dt * 4)
    const ht = this.headUI.getTransform()
    ht.setLocalScale(new vec3(this.headFit, this.headFit, 1))
    ht.setWorldPosition(this.headPos)
    const yawQ = quat.fromEulerVec(new vec3(0, this.headYaw, 0))
    ht.setWorldRotation(yawQ.multiply(quat.fromEulerVec(new vec3(this.headPitch, 0, 0))))
    // until the model is put on a table it stays with you too (it is only anchored once placed)
    if (!this.placement.hasPlaced() && !this.placement.isPlacing()) {
      const rt = this.sceneObject.getTransform()
      // level, but raised or lowered with your pitch so it keeps the same place in your view when you look down at it
      rt.setWorldPosition(this.headPos.add(new vec3(0, Math.tan(this.headPitch) * 58, 0)))
      rt.setWorldRotation(yawQ)
    }
  }

  private bind() {
    this.buildHeadUI()
    // the Circuit Guide's MENU button comes back to this title screen
    WizGuide.onError = (msg) => {
      this.toLaunch()
      this.menu.openAfter(0.8)
      this.hud.toast("page failed", new vec4(1.0, 0.45, 0.4, 1))
      this.phoboSay("That page did not open: " + msg, "worried")
    }
    WizGuide.isTitle = () => this.mode === "launch"
    WizGuide.onLegacy = (id) => {
      this.menu.closeMenu("select")
      this.onMenuSelect(id)
    }
    WizGuide.onExit = () => {
      this.toLaunch()
      this.menu.openAfter(0.8)
    }
    this.menu.onSelect.add((id) => this.onMenuSelect(id))
    this.menu.onProject.add((id) => this.loadProject(id))
    this.robot.onPartSelected.add((id) => this.onPartSelected(id))
    this.robot.onPartHover.add((id) => this.onPartHover(id))
    this.robot.onGrab.add((id) => this.onGrab(id))
    this.robot.onSnap.add((id) => this.onSnap(id))
    this.robot.onWrongDrop.add((id) => this.onWrongDrop(id))
    this.robot.onRotate.add((id) => this.onRotate(id))
    this.robot.onPull.add((d) => this.onPull(d))
    this.robot.onDeskTap.add(() => this.onDeskTap())
    this.bench.onPartSelected.add((id) => this.onPartSelected(id))
    this.bench.onPartHover.add((id) => this.onPartHover(id))
    this.bench.onWireSelected.add((id) => this.onWireTap(id))
    this.bench.onPinPicked.add((key) => this.clab.pinPicked(key))
    if (isSpectacles()) this.mover = new WizMover(this.bench.getKit(), this.sceneObject)
    this.drive = new WizDrive(this.bench.getKit(), this.sceneObject, this.robot, this.clab, this.hud, this.bench.getKit().box, this.visualize.faceMat())
    this.phobo = new WizPhobo()
    this.uiAudio = makeAudio(this.sceneObject, 0.5)
    this.motorAudio = makeAudio(this.sceneObject, 0.25)
    this.motorAudio.audioTrack = SFX_MOTOR
    this.ar = new WizArView(this.bench.getKit(), this.robot)
    this.vizBar = new WizVizBar(this.headUI, 13.2, [
      {id: "body", text: "BODY", on: true},
      {id: "wires", text: "WIRES", on: true},
      {id: "power", text: "POWER", on: false},
      {id: "explode", text: "EXPLODE", on: false},
    ])
    this.vizBar.onToggle = (id, on) => this.vizToggle(id, on)
    this.route = new WizRoute(this.bench.getKit(), this.robot)
    this.moveBar = new WizVizBar(this.headUI, 16.4, [
      {id: "flag", text: "+ CHECKPOINT", on: false},
      {id: "go", text: "GO", on: false, action: true},
      {id: "clear", text: "CLEAR", on: false, action: true},
    ])
    this.moveBar.onToggle = (id, on) => this.moveToggle(id, on)
    this.route.onGait = (moving) => this.routeGait(moving)
    this.route.onReach = (n, total) => {
      this.snd("ok")
      void 0
      this.phoboSay("Checkpoint " + n + " of " + total, "happy")
    }
    this.route.onDone = () => {
      this.phoboSay("Route complete!", "wow")
      void 0
      this.robot.celebrate()
    }
    this.inventory = new WizInventory(this.bench.getKit(), this.sceneObject, this.visualize)
    this.placement = new WizPlacement(this.bench.getKit(), this.sceneObject, new vec3(0, -12, -60))
    this.placement.makeCursor(this.bench.getKit().box, this.visualize.faceMat())
    this.createEvent("TouchStartEvent").bind((e: TouchStartEvent) => {
      // a bare mouse click / tap (not on a button or part): a click on the table, or on the schematic sheet (zoom)
      const uv = e.getTouchPosition()
      this.later(0.12, () => {
        if (uiPressedWithin(0.5)) return
        const cam = mainCamera()
        if (this.mode === "lab" && cam && this.bench.sheetClick(cam, uv)) return
        this.placement.click()
      })
    })
    this.placement.onPlaced = () => {
      this.snd("thunk")
      this.phoboSay("Placed! Grab the bar to move", "happy")
      void 0
    }
    this.phobo.attachFace(this.bench.getKit().box, this.visualize.faceMat())
    this.phobo.onChip = (id) => {
      this.snd("pick")
      this.phoboAnswer(id)
    }
    this.phobo.onTap = () => this.snd("ping")
    this.drive.onRing = () => void 0
    this.drive.onAllRings = () => {
      void 0
      void 0
    }
    this.visualize.onChanged.add(() => this.refreshViz())
    this.visualize.onScrew.add((r) => this.onScrew(r))
  }

  // ------------------------------------------------------------- mode plumbing
  /** Title screen: logo, the robot idling on the desk, a swipe hint. The menu opens by itself after a moment. */
  toLaunch() {
    this.history = []
    this.enterModeSilent("launch")
    this.mode = "launch"
    this.robot.setLoaded(true)
    this.robot.setPartsInteractive(false)
    this.robot.setDimsVisible(false)
    this.robot.setBob(true)
    this.robot.setFace(this.faceFor("idle"), "boomerang")
    this.menu.setProjectName(PROJECT_PACK.identity.short ? (PROJECT_PACK.identity.short as string) : PROJECT_PACK.identity.name)
    this.menu.showLaunch(true)
    this.menu.setHintVisible(true)
    this.phoboSay("Hi! I'm Phobo", "happy")
    this.hud.setLabel("")
    this.hud.setPips([])
    this.hud.setChip("")
    this.refreshHudGame()
    this.refreshMenu()
    if (this.debugLog) print("[WizMain] launch")
  }

  /** Reset every per-mode visual to the neutral state. */
  private enterModeSilent(m: Mode) {
    this.buildToken++
    this.visualize.setActive(false)
    this.inventory.show(false)
    this.vizBar.show(false)
    this.moveBar.show(false)
    this.route.stop()
    this.route.show(false)
    this.route.resetPose()
    this.placement.endPoints()
    this.ar.end()
    this.robot.setScaleMul(1)
    this.robot.setPrintedHidden(false)
    this.robot.setPrintedXray(false)
    this.hud.hideInfo()
    this.hud.setResults(null)
    this.selectedPart = ""
    this.selectedWire = ""
    this.exploded = false
    this.robot.endGame()
    this.robot.setBob(false)
    this.robot.setExploded(false)
    this.robot.select("")
    this.robot.setAllPartStyle("normal")
    this.robot.setPartsInteractive(true)
    this.robot.setCoverVisible(true)
    this.robot.setAllAngles(90)
    this.robot.setPropsVisible(false)
    this.robot.setFace(this.faceFor("rest"), "boomerang")
    this.clab.end()
    this.drive.end()
    this.bench.setLoaded(false)
    this.bench.select("")
    this.bench.showWires("off")
    this.bench.setActiveWire("")
    this.bench.setConnected(null)
    this.bench.setWiresInteractive(false)
    const pl = PROJECT_PACK.placement
    this.robot.setPresentation("desk", new vec3(pl.desk[0], pl.desk[1], pl.desk[2]), new vec3(pl.locator[0], pl.locator[1], pl.locator[2]))
    this.robot.setEnlarged(this.enlarged)
    this.robot.setDimsVisible(true)
    this.menu.showLaunch(false)
    this.playPage = -1
    this.mode = m
  }

  enterMode(m: Mode) {
    if (m === "launch") {
      this.toLaunch()
      return
    }
    if (m === "build" && PROJECT_PACK.steps.length === 0) m = "overview" // My Model has no guided build
    if (m === "lab" && !this.clab.available()) m = "circuit"
    if (m === "drive" && !this.clab.available()) m = "overview"
    if (!this.goingBack && this.mode !== m) {
      this.history.push(this.mode)
      if (this.history.length > 12) this.history.shift()
    }
    this.enterModeSilent(m)
    this.lab.reset()
    this.robot.setLoaded(true)
    this.hud.setChip(m === "visualize" || m === "test" ? "virtual" : "")
    if (m === "overview") {
      this.hud.setLabel("")
      this.hud.setPips([])
    } else if (m === "circuit") {
      const pl = PROJECT_PACK.placement
      this.robot.setPresentation("locator", new vec3(pl.desk[0], pl.desk[1], pl.desk[2]), new vec3(pl.locator[0], pl.locator[1], pl.locator[2]))
      this.robot.setCoverVisible(false)
      this.robot.setAllPartStyle("dim")
      this.robot.setDimsVisible(false)
      this.bench.setLoaded(true)
      this.bench.setPartsInteractive(true)
      this.bench.setWiresInteractive(true)
      this.bench.showWires("all")
      this.refreshCircuit()
      const first = this.nextUnconnected("")
      if (first !== "") this.selectWire(first)
    } else if (m === "lab") {
      const pl = PROJECT_PACK.placement
      this.robot.setPresentation("locator", new vec3(pl.desk[0], pl.desk[1], pl.desk[2]), new vec3(pl.locator[0], pl.locator[1], pl.locator[2]))
      this.robot.setCoverVisible(false)
      this.robot.setAllPartStyle("dim")
      this.robot.setDimsVisible(false)
      this.bench.setLoaded(true)
      this.bench.setPartsInteractive(true)
      this.clab.begin()
      this.hud.setChip("virtual")
    } else if (m === "drive") {
      this.robot.setDimsVisible(false)
      this.hud.setChip("virtual")
      this.drive.begin()
    } else if (m === "build") {
      this.robot.setDimsVisible(false)
      this.buildComplete = false
      this.step = 0
      this.buildConnected = []
      this.applyStep()
    } else if (m === "test") {
      this.robot.setDimsVisible(false)
      this.robot.setPropsVisible(true)
      this.robot.setFace(this.faceFor("rest"), "boomerang")
      this.hud.setLabel("")
      this.hud.setPips([])
      this.playPage = 0
    } else if (m === "visualize") {
      this.beginModelView()
    }
    this.refreshHudGame()
    this.refreshMenu()
    this.phoboForMode(m)
    if (this.debugLog) print("[WizMain] mode -> " + m)
  }

  // ------------------------------------------------------------- menu
  // ---- per-project command pages / icons (Sesame defaults live in PLAY_PAGES / CMD_ICON) ----
  private playPages(): string[][] {
    const src = PROJECT_PACK.lab.pages ? PROJECT_PACK.lab.pages : PLAY_PAGES
    // the Play menu shows a page of commands + more + home: at most 5 commands so the icon column stays at 7 (Spectacles sizing)
    const out: string[][] = []
    for (let p = 0; p < src.length; p++) {
      const parts = Math.ceil(src[p].length / 5)
      const per = Math.ceil(src[p].length / Math.max(1, parts))
      for (let k = 0; k < src[p].length; k += per) out.push(src[p].slice(k, k + per))
    }
    return out.length > 0 ? out : [[]]
  }

  private cmdIcon(id: string): string | undefined {
    const ic = PROJECT_PACK.lab.icons
    if (ic && ic[id] !== undefined) return ic[id]
    return PROJECT_PACK.identity.id === "sesame-quadruped" ? CMD_ICON[id] : undefined
  }

  private cmdLabel(id: string): string | undefined {
    const c = PROJECT_PACK.lab.commands.find((x) => x.id === id)
    return c ? c.label : undefined
  }

  private faceFor(kind: "rest" | "idle" | "done"): string {
    const l = PROJECT_PACK.lab
    if (kind === "rest") return l.restFace !== undefined ? l.restFace : "rest"
    if (kind === "idle") return l.idleFace !== undefined ? l.idleFace : "idle"
    return l.doneFace !== undefined ? l.doneFace : "cute"
  }

  private menuItems(): MenuItem[] {
    const out: MenuItem[] = []
    if (this.mode === "test" && this.playPage >= 0) {
      const pages = this.playPages()
      const page = pages[Math.min(this.playPage, pages.length - 1)]
      for (let i = 0; i < page.length; i++) {
        const ic = this.cmdIcon(page[i])
        out.push({id: page[i], icon: ic !== undefined ? ic : "help", label: this.cmdLabel(page[i]), state: this.lab.lastCommand === page[i] ? "active" : "normal"})
      }
      if (pages.length > 1) out.push({id: "more", icon: "more_horiz"})
      out.push({id: "back", icon: "arrow_back", label: "Back"})
      return out
    }
    if (this.mode === "drive") {
      out.push({id: "lab", icon: "flash_on", label: "Circuit lab"})
      out.push({id: "back", icon: "arrow_back", label: "Back"})
      return out
    }
    if (this.mode === "lab" && this.clab.verifyMode()) {
      out.push({id: "hint", icon: "lightbulb", label: "Hint"})
      out.push({id: "autoall", icon: "flash_on", label: "Wire all"})
      out.push(this.bench.labViewMode() === "3d" ? {id: "view3d", icon: "visibility", state: "active"} : {id: "view3d", icon: "visibility"})
      out.push({id: "assemble", icon: "back_hand", label: "Assemble"})
      out.push({id: "labclear", icon: "cancel", label: "Clear"})
      out.push({id: "back", icon: "arrow_back", label: "Back"})
      return out
    }
    if (this.mode === "lab") {
      out.push({id: "labtest", icon: "play_arrow", label: "Test"})
      out.push({id: "hint", icon: "lightbulb", label: "Hint"})
      out.push({id: "autoall", icon: "flash_on", label: "Wire all"})
      out.push(this.bench.labViewMode() === "3d" ? {id: "view3d", icon: "visibility", state: "active"} : {id: "view3d", icon: "visibility"})
      out.push({id: "assemble", icon: "back_hand", label: "Assemble"})
      out.push({id: "labclear", icon: "cancel", label: "Clear"})
      out.push({id: "drive", icon: "directions_car", label: "Drive"})
      out.push({id: "auto", icon: "autorenew", label: "Wire next"})
      out.push({id: "visualize", icon: "view_in_ar"})
      out.push({id: "back", icon: "arrow_back", label: "Back"})
      return out
    }
    // Title: just Visualize and Library (Continue only when progress is saved). Every other scene: Upload, Play, Wire up, Back.
    if (this.mode === "launch") {
      if (this.saved) out.push({id: "continue", icon: "history"})
      // the three pages of the product (WizGuide.ts): VISUALIZE (attach real components to the 3D model), ANALYSE (tags + info), BUILD (the guide)
      // The earlier Lab / Library / Visualize pages stay reachable from the page buttons.
      out.push({id: "viz3d", icon: "view_in_ar", label: "Visualize"})
      out.push({id: "analyse", icon: "visibility", label: "Analyse"})
      out.push({id: "build", icon: "build", label: "Build"})
      out.push({id: "mymodel", icon: "upload_file", label: "My Model"})
      return out
    }
    const myModel = PROJECT_PACK.identity.id === MY_MODEL_ID
    const hasLab = this.clab.available()
    const sim = hasLab && !this.clab.verifyMode()
    out.push({id: "upload", icon: "upload_file", label: "Upload"})
    out.push({id: "place", icon: "touch_app", label: "Place"}) // bring the model to where you are looking and put it down again
    out.push(sim ? {id: "drive", icon: "play_arrow", label: "Play", state: "normal"} : {id: "play", icon: "play_arrow", label: "Play", state: this.mode === "test" ? "active" : "normal"})
    out.push({id: hasLab ? "lab" : "wires", icon: "flash_on", label: "Wire up"})
    if (myModel) {
      const e = packEntry(this.nextTemplateId())
      out.push({id: "template", icon: e ? e.icon : "lightbulb", label: e ? e.name : "Circuit"})
    }
    out.push({id: "back", icon: "arrow_back", label: "Back"})
    return out
  }

  private refreshMenu() {
    this.hud.setStatusVisible(this.mode !== "lab") // the Lab shows the sheet and the parts on the table: no bars over them
    this.menu.setBig(this.mode === "launch") // the title menu (Lab / Circuit / Visualize / Library) is drawn larger
    if (this.mode === "lab" || this.mode === "drive") this.menu.setLift(0, -14.5)
    else if (this.mode === "launch") this.menu.setLift(7.3, -10.5)
    else this.menu.setLift(0)
    this.menu.setItems(this.menuItems())
  }

  /** One UI sound: tap / ping (small reward) / ok (success) / error / spawn (new project). */
  private snd(kind: "pick" | "ping" | "ok" | "error" | "spawn" | "open" | "close" | "thunk" | "flag" | "zap" | "step" | "on" | "off" | "blip") {
    if (!this.uiAudio) return
    const t = {pick: SFX_PICK, ping: SFX_PING, ok: SFX_OK, error: SFX_ERROR, spawn: SFX_SPAWN, open: SFX_OPEN, close: SFX_CLOSE, thunk: SFX_THUNK, flag: SFX_FLAG, zap: SFX_ZAP, step: SFX_STEP, on: SFX_ON, off: SFX_OFF, blip: SFX_BLIP}[kind]
    sfx(this.uiAudio, t)
  }

  /** Footsteps while a legged model walks the route, a motor hum (looping) while a wheeled one drives; menu whoosh when it opens or closes. */
  private soundscape(dt: number) {
    const open = this.menu.isOpen()
    if (open !== this.menuWasOpen) {
      this.menuWasOpen = open
      this.snd(open ? "open" : "close")
    }
    const moving = this.route.isRunning()
    const wheels = WizRoute.kind() === "wheels"
    if (moving && !wheels) {
      this.stepT -= dt
      if (this.stepT <= 0) {
        this.stepT = 0.38
        sfx(this.motorAudio, SFX_STEP)
      }
    }
    const wantMotor = moving && wheels
    if (wantMotor !== this.motorOn) {
      this.motorOn = wantMotor
      if (wantMotor) {
        this.motorAudio.audioTrack = SFX_MOTOR
        this.motorAudio.play(-1)
      } else this.motorAudio.stop(true)
    }
  }

  private onMenuSelect(id: string) {
    this.idleT = 0
    this.snd("pick")
    if (this.debugLog) print("[WizMain] menu " + id)
    // play-page commands
    if (this.mode === "test" && this.cmdIcon(id) !== undefined) {
      this.runCommand(id)
      return
    }
    if (id === "more") {
      this.playPage = (this.playPage + 1) % this.playPages().length
      this.refreshMenu()
      return
    }
    if (id === "lab") {
      this.menu.closeMenu("select")
      this.enterMode("lab")
      return
    }
    if (id === "guide" || id === "build" || id === "viz3d" || id === "analyse" || id === "mymodel") {
      this.menu.closeMenu("select")
      const g = WizGuide.instance
      if (g !== null) g.enterFromMenu(id === "viz3d" ? "viz" : id === "analyse" ? "analyse" : id === "mymodel" ? "mymodel" : "build")
      else {
        // never fail silently
        print("[WizMain] the page scripts are not running (WizGuide missing): recompile / check the CircuitGuide object")
        this.hud.toast("page not loaded", new vec4(1.0, 0.45, 0.4, 1))
        this.phoboSay("That page did not load. Recompile and try again.", "worried")
      }
      return
    }
    if (id === "drive") {
      this.menu.closeMenu("select")
      this.enterMode("drive")
      return
    }
    if (this.mode === "lab") {
      if (id === "labtest") {
        this.menu.closeMenu("select")
        this.clab.runTests()
        return
      } else if (id === "hint") {
        this.clab.hint()
        return
      } else if (id === "auto") {
        this.clab.autoWire(false)
        return
      } else if (id === "autoall") {
        this.clab.autoWire(true)
        return
      } else if (id === "labclear") {
        this.clab.clearAll()
        return
      } else if (id === "view3d") {
        this.bench.setLabView(this.bench.labViewMode() === "both" ? "3d" : this.bench.labViewMode() === "3d" ? "diagram" : "both")
        this.refreshMenu()
        return
      } else if (id === "assemble") {
        this.menu.closeMenu("select")
        this.bench.assemble()
        this.refreshMenu()
        return
      }
    }
    if (id === "projects") {
      this.menu.closeMenu("select")
      if (this.step > 0 || this.buildComplete) this.saveSession() // the Library is where progress is kept: save on the way in
      this.showProjects()
      return
    }
    if (id === "place") {
      this.menu.closeMenu("select")
      const d = PROJECT_PACK.placement.desk
      this.placement.setDesk(new vec3(d[0], d[1], d[2]))
      this.placement.begin()
      this.phoboSay("Look at the table, then pinch", "think")
      return
    }
    if (id === "upload") {
      // the Lens cannot open a file picker: the model is dropped on My Model in Lens Studio (tools/import-model.md); this prompts for it
      this.menu.closeMenu("select")
      if (PROJECT_PACK.identity.id !== MY_MODEL_ID) this.loadProject(MY_MODEL_ID, "forrc-car")
      this.enterMode("visualize")
      this.hud.showInfo("Upload CAD", "FBX  GLB  OBJ  STEP  STL", "drop it on My Model")
      this.later(7, () => this.hud.hideInfo())
      // the moment a model is uploaded the user is asked where to put it
      const d = PROJECT_PACK.placement.desk
      this.placement.setDesk(new vec3(d[0], d[1], d[2]))
      this.placement.begin()
      this.phoboSay("Where should it go? Look, then pinch", "wow")
      return
    }
    if (id === "template") {
      const t = nextTemplate()
      this.menu.closeMenu("select")
      this.loadProject(MY_MODEL_ID, t)
      this.enterMode("visualize")
      return
    }
    if (id === "visualize") {
      this.menu.closeMenu("select")
      this.enterMode("visualize")
    } else if (id === "build") {
      this.menu.closeMenu("select")
      if (this.buildComplete) this.enterMode("overview")
      else this.enterMode("build")
    } else if (id === "wires") {
      this.menu.closeMenu("select")
      this.enterMode("circuit")
    } else if (id === "play") {
      if (this.playUnlocked || !BUILD_IN_MENU) {
        this.menu.closeMenu("select")
        this.enterMode("test")
        this.menu.openMenu("select")
      } else {
        this.hud.toast("locked", new vec4(1.0, 0.75, 0.25, 1))
        this.robot.setBob(false)
      }
    } else if (id === "arrange") {
      this.visualize.arrangeNow()
    } else if (id === "show") {
      this.visualize.playDemo()
      this.menu.closeMenu("select")
    } else if (id === "pause") this.setPaused(true)
    else if (id === "resume") this.setPaused(false)
    else if (id === "save") this.saveSession()
    else if (id === "continue") this.continueSession()
    else if (id === "back" || id === "home") this.goBack()
  }

  /** Back: one step to the previous scene (the Play command pages first close their page); from the first scene it returns to the title. */
  private goBack() {
    if (this.mode === "test" && this.playPage >= 0) {
      this.playPage = -1
      this.refreshMenu()
      return
    }
    this.setPaused(false)
    this.menu.closeMenu("select")
    const prev = this.history.pop()
    if (prev === undefined || prev === "launch") {
      this.toLaunch()
      this.menu.openAfter(1.2)
      return
    }
    this.goingBack = true
    this.enterMode(prev)
    this.goingBack = false
  }

  // ------------------------------------------------------------- projects (the carousel + switching)
  private nextTemplateId(): string {
    const ids = TEMPLATE_IDS
    return ids[(ids.indexOf(currentTemplate()) + 1) % ids.length]
  }

  /** The Projects icon: a row of 3D cards; pinch one to load that project. */
  showProjects() {
    this.toLaunch()
    this.menu.showProjects(cardDefs(), PROJECT_PACK.identity.id)
  }

  projectId(): string {
    return PROJECT_PACK.identity.id
  }

  projectIds(): string[] {
    return PACKS.map((p) => p.id)
  }

  /** Load another project: swap the pack, rebuild the robot / bench / workbench, reset the per-project session, back to the title. */
  loadProject(id: string, template?: string) {
    const p = activateProject(id, template)
    if (!p) return
    this.snd("spawn")
    this.setPaused(false)
    this.menu.hideProjects()
    this.robot.reload()
    this.bench.reload()
    this.visualize.reload()
    this.inventory.reset()
    this.visualize.setActive(false)
    this.step = 0
    this.placed = []
    this.buildConnected = []
    this.buildComplete = false
    this.playUnlocked = false
    this.questMistakes = [0, 0, 0, 0]
    this.petCelebrated = false
    this.snaps = 0
    this.demoSeen = false
    this.exploded = false
    this.enlarged = false
    this.selectedPart = ""
    this.selectedWire = ""
    this.playPage = -1
    this.validator = new CircuitValidator()
    this.lab.reset()
    this.clab.end()
    this.clab.reset()
    this.placeAll()
    this.toLaunch()
    this.menu.openAfter(PROJECT_PACK.gesture.autoOpenS)
    this.hud.toast(PROJECT_PACK.identity.short ? (PROJECT_PACK.identity.short as string) : p.identity.name, new vec4(0.35, 1.0, 1.0, 1))
    if (this.debugLog) print("[WizMain] project -> " + id)
  }

  setPaused(on: boolean) {
    this.paused = on
    this.robot.setPaused(on)
    this.visualize.setPaused(on)
    this.hud.setPaused(on)
    this.menu.setPaused(on)
    this.hud.setDim(on)
    this.refreshMenu()
  }

  isPaused(): boolean {
    return this.paused
  }

  /** The Circuit Lab controller (LEAF tests / debugging). */
  circuitLab(): WizCircuitLab {
    return this.clab
  }

  // ------------------------------------------------------------- persistence (PersistentStorageSystem)
  private store(): GeneralDataStore | null {
    const ps = global.persistentStorageSystem
    return ps ? ps.store : null
  }

  saveSession() {
    const st = this.store()
    if (!st) {
      this.hud.toast("no save", new vec4(1.0, 0.45, 0.4, 1))
      return
    }
    const data: {[k: string]: any} = {
      v: 2,
      project: PROJECT_PACK.identity.id,
      template: currentTemplate(),
      mode: this.mode === "launch" ? "build" : this.mode,
      step: this.step,
      placed: this.placed,
      buildConnected: this.buildConnected,
      buildComplete: this.buildComplete,
      playUnlocked: this.playUnlocked,
      mistakes: this.questMistakes,
      connected: this.connectedIds(),
      viz: this.visualize.serialize(),
      labWires: this.clab.serialize(),
    }
    st.putString(SAVE_KEY, JSON.stringify(data))
    this.saved = true
    this.saveCache = data
    this.hud.toast("saved", new vec4(0.3, 1.0, 0.5, 1))
    this.refreshMenu()
    if (this.debugLog) print("[WizMain] session saved (" + JSON.stringify(data).length + " chars)")
  }

  private loadSave() {
    const st = this.store()
    this.saved = false
    this.saveCache = null
    if (!st || !st.has(SAVE_KEY)) return
    try {
      this.saveCache = JSON.parse(st.getString(SAVE_KEY)) as {[k: string]: any}
      this.saved = true
    } catch (e) {
      print("[WizMain] save unreadable: " + e)
    }
  }

  hasSave(): boolean {
    return this.saved
  }

  /** Restore progress and jump back to where the player was. */
  continueSession() {
    const d = this.saveCache
    if (!d) return
    if (d.project && d.project !== PROJECT_PACK.identity.id) this.loadProject(d.project as string, d.template as string)
    // older saves may carry xp / badges / stars fields: they are ignored
    this.questMistakes = d.mistakes ? d.mistakes : [0, 0, 0, 0]
    this.buildComplete = !!d.buildComplete
    this.playUnlocked = !!d.playUnlocked
    this.menu.closeMenu("select")
    const m = d.mode as Mode
    this.clab.restore(d.labWires as string[][] | undefined)
    this.validator.clear()
    const conns = d.connected as string[]
    if (conns) for (let i = 0; i < conns.length; i++) this.validator.setSelected(conns[i], true)
    if (m === "visualize") {
      this.demoSeen = true
      this.enterMode("visualize")
      this.visualize.restore(d.viz)
    } else if (m === "build" && !this.buildComplete) {
      this.enterModeSilent("build")
      this.lab.reset()
      this.robot.setLoaded(true)
      this.robot.setDimsVisible(false)
      this.buildConnected = d.buildConnected ? d.buildConnected : []
      this.step = d.step ? d.step : 0
      this.mode = "build"
      this.applyStep()
      this.refreshHudGame()
      this.refreshMenu()
    } else {
      this.enterMode(this.buildComplete ? "overview" : (m === "launch" ? "overview" : m))
    }
    this.hud.toast("continue", new vec4(0.35, 1.0, 1.0, 1))
  }

  // ------------------------------------------------------------- HUD (the level / XP / star / badge system was removed)
  /** Kept as a hook for the idle timer: actions that used to award XP still count as activity. */
  private refreshHudGame() {}

  // ------------------------------------------------------------- AR view (overview)
  private onPull(dir: number) {
    if (this.mode !== "overview") return
    this.exploded = dir > 0
    this.robot.setExploded(this.exploded)
  }

  private onDeskTap() {
    if (this.mode !== "overview") return
    this.enlarged = !this.enlarged
    this.robot.setEnlarged(this.enlarged)
  }

  // ------------------------------------------------------------- Visualize: the 3D object with its circuit, in AR
  /** The model large on the table with the circuit drawn on it: parts at their mount points, wires between their pins, optional power flow. */
  private beginModelView() {
    this.robot.setDimsVisible(false)
    this.robot.setCoverVisible(false) // lid off: the circuit inside is in view
    // table-top scale: the model longest side about 22 cm, so it sits on the table at a readable size and still fits the view
    const dims = this.robot.robotDimsCm()
    const longest = Math.max(dims[0], dims[1], dims[2], 1)
    this.robot.setScaleMul(Math.max(0.4, Math.min(2.2, 22 / longest)))
    this.robot.setPrintedXray(true) // see-through body: the circuit inside is the subject
    this.ar.begin()
    this.vizBar.reset(["body", "wires"])
    this.vizBar.show(true)
    this.moveBar.reset([])
    this.moveBar.show(this.route.canMove())
    this.route.show(true)
    this.hud.setLabel("")
    this.hud.setPips([])
    // first time here: put the model on a surface (look at the table, pinch). Later visits keep the model where it was placed.
    if (!this.placement.hasPlaced() && !this.placement.isPlacing()) {
      const d = PROJECT_PACK.placement.desk
      this.placement.setDesk(new vec3(d[0], d[1], d[2]))
      // the preview's view point looks level: the old "look down at the table, then pinch" put the model 39 cm below the frame.
      // It now starts on the table in view; the Place icon in the menu still lets you move it.
      this.placement.placeDefault()
      this.phoboSay("Your model is on the table. Tap a part", "happy")
    }
  }

  private vizToggle(id: string, on: boolean) {
    this.snd(id === "power" && on ? "zap" : on ? "on" : "off")
    if (id === "body") this.robot.setPrintedHidden(!on)
    else if (id === "wires") this.ar.setWires(on)
    else if (id === "power") {
      this.ar.setPower(on)
      if (on) {
        void 0
        this.phoboSay("Power flows through the wires", "wow")
      }
    } else if (id === "explode") this.robot.setExploded(on)
  }

  private moveToggle(id: string, on: boolean) {
    this.snd(id === "flag" ? (on ? "on" : "off") : id === "go" ? "open" : "close")
    if (id === "flag") {
      if (!on) {
        this.placement.endPoints()
        return
      }
      if (this.placement.isPlacing()) {
        this.moveBar.set("flag", false)
        this.phoboSay("Place the model first", "think")
        return
      }
      this.placement.onPoint = (w) => {
        if (this.route.addWorld(w)) this.snd("flag")
        else this.phoboSay("That is enough checkpoints", "think")
      }
      this.placement.beginPoints()
      this.phoboSay("Aim, then click to drop a flag", "happy")
    } else if (id === "go") {
      if (this.route.count() === 0) {
        this.phoboSay("Add a checkpoint first", "think")
        return
      }
      this.moveBar.set("flag", false)
      this.placement.endPoints()
      this.vizBar.set("power", true)
      this.vizToggle("power", true)
      this.route.go()
    } else if (id === "clear") {
      this.route.clear()
      this.route.resetPose()
      this.moveBar.set("flag", false)
      this.placement.endPoints()
    }
  }

  /** The gait while the route runs: the legged robot keeps walking (its own walk command), wheels are turned by WizRoute. */
  private routeGait(moving: boolean) {
    if (WizRoute.kind() !== "legs") return
    if (moving && !this.lab.running) this.lab.run("walk")
  }

  /** Tap a part: it lights up with its wires; tap it again to clear. */
  private vizTap(id: string) {
    if (this.ar.focusId() === id) {
      this.ar.setFocus("")
      this.robot.select("")
      this.hud.hideInfo()
      return
    }
    this.ar.setFocus(id)
    this.robot.select(id)
    this.showInfo(id)
  }

  // ------------------------------------------------------------- part card (the "i")
  private onPartSelected(id: string) {
    this.idleT = 0
    if (this.mode === "drive") return
    if (this.mode === "lab") {
      this.clab.partTapped(id)
      return
    }
    if (this.mode === "visualize") {
      this.vizTap(id)
      return
    }
    if (this.mode === "build" || this.mode === "launch") return
    this.selectedPart = id
    if (this.mode === "circuit") {
      this.bench.select(id)
      this.robot.setAllPartStyle("dim")
      this.robot.setPartStyle(id, "highlight")
    } else this.robot.select(id)
    this.showInfo(id)
  }

  private showInfo(id: string) {
    const c = getComponent(id)
    this.hud.showInfo(shortName(id), blurb(id), packSizeLabel(c.sizeCm))
  }

  private onPartHover(id: string) {
    if (this.mode === "build" || this.mode === "launch" || this.mode === "visualize") return
    if (id !== "") this.showInfo(id)
    else if (this.selectedPart !== "") this.showInfo(this.selectedPart)
    else this.hud.hideInfo()
  }

  // ------------------------------------------------------------- wire game (Wires)
  private expectedIds(): string[] {
    return PROJECT_PACK.validation.expected
  }

  private connectedIds(): string[] {
    const out: string[] = []
    const cs = PROJECT_PACK.connections
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].group === "plug" || this.validator.isSelected(cs[i].id)) out.push(cs[i].id)
    }
    return out
  }

  private refreshCircuit() {
    this.bench.setConnected(this.connectedIds())
    const ids = this.expectedIds()
    const states: number[] = []
    for (let i = 0; i < ids.length; i++) states.push(this.validator.isSelected(ids[i]) ? 4 : ids[i] === this.selectedWire ? 2 : 3)
    this.hud.setPips(states)
    const n = this.validator.report().correct.length
    this.hud.setLabel(n + "/" + ids.length)
  }

  private nextUnconnected(after: string): string {
    const ids = this.expectedIds()
    const start = after === "" ? -1 : ids.indexOf(after)
    for (let k = 1; k <= ids.length; k++) {
      const id = ids[(start + k + ids.length) % ids.length]
      if (!this.validator.isSelected(id)) return id
    }
    return ""
  }

  private selectWire(id: string) {
    if (this.mode !== "circuit") return
    this.selectedWire = id
    this.bench.setActiveWire(id)
    this.bench.setAllPartStyle("normal")
    this.robot.setAllPartStyle("dim")
    const c = getConnection(id)
    if (c) {
      this.bench.setPartStyle(c.from.component, "highlight")
      this.bench.setPartStyle(c.to.component, "highlight")
      this.robot.setPartStyle(c.from.component, "highlight")
      this.robot.setPartStyle(c.to.component, "highlight")
    }
    this.refreshCircuit()
  }

  /** A wire was pinched on the bench: Wires connects/disconnects it, Build connects the step's wires. */
  private onWireTap(id: string) {
    if (this.mode === "lab") {
      this.clab.wireTapped(id)
      return
    }
    if (this.mode === "circuit") {
      const c = getConnection(id)
      if (!c || c.group === "plug") {
        this.selectWire(id)
        return
      }
      const was = this.validator.isSelected(id)
      this.validator.toggle(id)
      if (!was) {
        void 0
        this.snaps++
      }
      const nxt = this.nextUnconnected(id)
      this.selectedWire = ""
      if (nxt !== "") this.selectWire(nxt)
      else {
        this.refreshCircuit()
        if (this.validator.report().status === "COMPLETE") {
          void 0
          this.hud.toast("19/19", new vec4(0.3, 1.0, 0.5, 1))
          this.robot.celebrate()
        }
      }
    } else if (this.mode === "build") this.buildWireTap(id)
  }

  // ------------------------------------------------------------- build game
  private stepPlaced(i: number): string[] {
    const steps = PROJECT_PACK.steps
    const out: string[] = []
    for (let k = 0; k < i; k++) {
      const pl = BUILD_PLAN[steps[k].id].place
      for (let j = 0; j < pl.length; j++) out.push(pl[j])
    }
    return out
  }

  private hud12() {
    const steps = PROJECT_PACK.steps
    const states: number[] = []
    for (let i = 0; i < steps.length; i++) states.push(i < this.step || (i === this.step && this.buildComplete) ? 1 : i === this.step ? 2 : 0)
    this.hud.setPips(states)
    const s = steps[Math.min(this.step, steps.length - 1)]
    this.hud.setLabel(BUILD_PLAN[s.id].title + "  " + (this.step + 1) + "/" + steps.length)
    this.hudLine = BUILD_PLAN[s.id].title
  }

  private applyStep() {
    this.buildToken++
    const steps = PROJECT_PACK.steps
    const s = steps[this.step]
    const plan = BUILD_PLAN[s.id]
    const pl = PROJECT_PACK.placement
    this.placed = this.stepPlaced(this.step)
    this.hud.hideInfo()
    this.robot.setAllPartStyle("normal")
    if (s.wires.length > 0) {
      this.robot.setPresentation("locator", new vec3(pl.desk[0], pl.desk[1], pl.desk[2]), new vec3(pl.locator[0], pl.locator[1], pl.locator[2]))
      this.robot.offerPart("", this.placed)
      this.robot.setPartsInteractive(false)
      this.bench.setLoaded(true)
      this.bench.setPartsInteractive(false)
      this.bench.setWiresInteractive(true)
      this.bench.showWires("ids", s.wires)
      this.bench.setConnected(this.buildConnected)
      this.bench.setAllPartStyle("normal")
      for (const c of s.components) this.bench.setPartStyle(c, "highlight")
      this.bench.setActiveWire(this.nextBuildWire())
    } else {
      this.robot.setPresentation("desk", new vec3(pl.desk[0], pl.desk[1], pl.desk[2]), new vec3(pl.locator[0], pl.locator[1], pl.locator[2]))
      this.bench.setLoaded(false)
      this.robot.setPartsInteractive(true)
      this.robot.offerPart(plan.place[0], this.placed)
      this.robot.setPartStyle(plan.place[0], "highlight") // "pick me": the offered part glows cyan
    }
    this.hud12()
    this.refreshHudGame()
    if (this.debugLog) print("[WizMain] step " + (this.step + 1))
  }

  private nextBuildWire(): string {
    const s = PROJECT_PACK.steps[this.step]
    for (const w of s.wires) if (this.buildConnected.indexOf(w) < 0) return w
    return ""
  }

  private onGrab(id: string) {
    if (this.mode !== "build") return
    this.robot.setPartStyle(id, "highlight") // bright cyan glow on the part in hand
    this.showInfo(id) // the Lens identifies it: name, one line, real size
  }

  private onRotate(id: string) {
    if (this.mode !== "build") return
    this.hud.toast("turn", new vec4(0.35, 1.0, 1.0, 1))
  }

  private onSnap(id: string) {
    if (this.mode !== "build") return
    const s = PROJECT_PACK.steps[this.step]
    const plan = BUILD_PLAN[s.id]
    this.robot.placeParts(plan.place)
    this.robot.setPartStyle(id, "normal")
    this.hud.hideInfo()
    this.snaps++
    void 0
    if (this.snaps === 1) void 0
    this.completeStep()
  }

  private onWrongDrop(id: string) {
    if (this.mode !== "build") return
    const q = questOf(PROJECT_PACK.steps[this.step].id)
    this.questMistakes[q] = this.questMistakes[q] + 1
    this.robot.setPartStyle(id, "normal")
    this.hud.toast(this.robot.lastWrongReason() === "orientation" ? "turn" : "closer", new vec4(1.0, 0.75, 0.25, 1))
  }

  private buildWireTap(id: string) {
    const s = PROJECT_PACK.steps[this.step]
    if (s.wires.indexOf(id) < 0) return
    if (this.buildConnected.indexOf(id) < 0) {
      this.buildConnected.push(id)
      void 0
    }
    this.bench.setConnected(this.buildConnected)
    const next = this.nextBuildWire()
    this.bench.setActiveWire(next)
    if (next === "") this.completeStep()
  }

  private completeStep() {
    const token = this.buildToken
    const cur = this.step
    const steps = PROJECT_PACK.steps
    const q = questOf(steps[cur].id)
    const last = QUESTS[q].steps[QUESTS[q].steps.length - 1] === steps[cur].id
    if (last) {
    }
    this.hud.setPips(this.pipStatesAfter(cur))
    this.later(0.9, () => {
      if (this.mode === "build" && this.buildToken === token && this.step === cur) this.gotoStep(cur + 1)
    })
  }

  private pipStatesAfter(cur: number): number[] {
    const n = PROJECT_PACK.steps.length
    const out: number[] = []
    for (let i = 0; i < n; i++) out.push(i <= cur ? 1 : 0)
    return out
  }

  private gotoStep(i: number) {
    if (this.mode !== "build") return
    const n = PROJECT_PACK.steps.length
    if (i >= n) {
      this.finishBuild()
      return
    }
    this.step = Math.max(0, i)
    this.buildComplete = false
    this.applyStep()
  }

  /** Test helper: skip the current step the way a perfect player would (parts snap, wires connect). */
  skipStep() {
    if (this.mode !== "build" || this.buildComplete) return
    const s = PROJECT_PACK.steps[this.step]
    if (s.wires.length > 0) {
      for (const w of s.wires) if (this.buildConnected.indexOf(w) < 0) this.buildConnected.push(w)
      this.bench.setConnected(this.buildConnected)
    } else this.robot.placeParts(BUILD_PLAN[s.id].place)
    this.gotoStep(this.step + 1)
  }

  private finishBuild() {
    this.buildToken++
    this.buildComplete = true
    this.bench.setLoaded(false)
    this.bench.setConnected(null)
    const pl = PROJECT_PACK.placement
    this.robot.setPresentation("desk", new vec3(pl.desk[0], pl.desk[1], pl.desk[2]), new vec3(pl.locator[0], pl.locator[1], pl.locator[2]))
    this.robot.endGame()
    this.robot.setPartsInteractive(true)
    this.robot.setFace(this.faceFor("done"), "once")
    this.robot.celebrate()
    void 0
    this.unlockPlay()
    const n = PROJECT_PACK.steps.length
    this.step = n - 1
    this.hud.setLabel("")
    const st: number[] = []
    for (let i = 0; i < n; i++) st.push(1)
    this.hud.setPips(st)
    this.hud.toast("done", new vec4(0.3, 1.0, 0.5, 1))
    this.refreshMenu()
    if (this.debugLog) print("[WizMain] build complete")
  }

  /** Unlock Play (the simulated test lab). */
  unlockPlay() {
    this.playUnlocked = true
    this.refreshMenu()
  }

  lockPlay() {
    this.playUnlocked = false
    this.refreshMenu()
  }

  // ------------------------------------------------------------- visualize
  private refreshViz() {
    if (this.mode !== "visualize") return
    const v = this.visualize.verdictStates()
    const h = this.visualize.holeStates()
    const states: number[] = []
    for (let i = 0; i < v.length; i++) states.push(v[i])
    for (let i = 0; i < h.length; i++) states.push(h[i])
    this.hud.setPips(states)
    const fc = this.visualize.fitCount()
    this.hud.setLabel(fc.count + "/" + fc.total)
    const r = this.visualize.testResults()
    this.hud.setResults(r === null ? null : [r.power, r.data, r.servo])
  }

  private onScrew(reason: string) {
    if (reason === "ok") {
      void 0
      void 0
      this.hud.toast("ok", new vec4(0.3, 1.0, 0.5, 1))
    } else this.hud.toast(reason, new vec4(1.0, 0.3, 0.25, 1))
    this.refreshViz()
  }

  // ------------------------------------------------------------- test lab (Play)
  private runCommand(id: string) {
    if (this.mode !== "test") return
    if (this.lab.run(id)) {
      this.hud.setLabel(this.lab.face)
      this.refreshMenu()
      if (this.debugLog) print("[WizMain] command " + id)
      this.noteVirtualTest(id)
    }
  }

  /** The virtual test sequence (simulated touch, motion and sound inputs -> OLED expressions): finishing the three inputs activates the pet. */
  private noteVirtualTest(id: string) {
    const inputs = PROJECT_PACK.identity.id === "esp32-pet" ? ["touch", "shake", "lift"] : []
    if (inputs.indexOf(id) < 0) return
    this.testedInputs[id] = true
    let n = 0
    for (const k of inputs) if (this.testedInputs[k] === true) n++
    if (n < inputs.length) {
      this.phoboSay(n + " of " + inputs.length + " inputs tested", "happy")
      return
    }
    if (!this.petCelebrated) {
      this.petCelebrated = true
      this.phoboSay("Pet activated!", "wow")
      this.robot.celebrate()
    }
  }

  virtualTestsDone(): number {
    return Object.keys(this.testedInputs).length
  }

  /** Phobo speaks (one short line in the dialogue box) and reacts on its TV. */
  private phoboSay(text: string, mood: "idle" | "happy" | "think" | "worried" | "wow" | "sleep" | "go" = "think") {
    if (mood === "worried") this.snd("error")
    else if (mood === "wow") this.snd("ok")
    if (mood !== "worried" && mood !== "wow") this.snd("blip")
    this.phobo.say(text, 5)
    this.phobo.react(mood, 2.5)
  }

  /** One-line welcome the first time a scene is entered; Phobo steps aside while a test or a drive runs. */
  private phoboForMode(m: Mode) {
    this.idleT = 0
    if (this.introSeen[m] === true) return
    this.introSeen[m] = true
    const intro: {[k: string]: string} = {
      overview: "Tap me or swipe down",
      visualize: "Tap a part. Try POWER",
      lab: "Tap a part, pick a pin",
      drive: "Hold the arrows to drive",
      build: "Drag each part in place",
      circuit: "Pinch a wire",
      test: "Pick a touch or motion",
    }
    if (intro[m]) this.phoboSay(intro[m], "happy")
  }

  /** What Phobo knows right now (sent with a question to the AI, and used by the scripted answers). */
  private phoboContext(): PhoboContext {
    return {
      scene: this.mode,
      project: PROJECT_PACK.identity.short ? (PROJECT_PACK.identity.short as string) : PROJECT_PACK.identity.name,
      next: this.mode === "lab" ? this.clab.nextWireLabel() : "",
      problem: this.lastProblem,
    }
  }

  /** A chip was tapped: answer at once from the script, then improve it with the AI when a token is set. */
  private phoboAnswer(q: string) {
    const ctx = this.phoboContext()
    this.phoboSay(WizPhoboAI.scripted(q, ctx), "think")
    if (!WizPhoboAI.available()) return
    const text = q === "why" ? "Why is this wrong? Explain simply." : q === "next" ? "What should I do next?" : q === "where" ? "Where should this part go?" : "What is this?"
    WizPhoboAI.ask(text, ctx).then((t) => {
      if (t !== "") this.phoboSay(t, "happy")
    })
  }

  /** Stuck for a while in a guided scene: Phobo offers the next step. */
  private phoboHint() {
    let text = ""
    if (this.mode === "lab") {
      const l = this.clab.nextWireLabel()
      text = l !== "" ? "Try: " + l : "All wired! Press Test"
    } else if (this.mode === "build") text = "Next: " + BUILD_PLAN[PROJECT_PACK.steps[this.step].id].title
    else if (this.mode === "visualize") text = this.placement.isPlacing() ? "Look at the table, then pinch" : this.ar.isPower() ? "Tap a part to inspect it" : "Tap POWER to see the current"
    else if (this.mode === "circuit") text = "Pinch the glowing wire"
    if (text !== "") {
      this.phoboSay(text, "think")
      this.phobo.setChips(this.mode === "lab" ? [{id: "why", label: "Why?"}, {id: "next", label: "Next?"}, {id: "what", label: "What?"}] : this.mode === "visualize" ? [{id: "what", label: "What?"}] : [{id: "where", label: "Where?"}, {id: "next", label: "Next?"}])
    }
  }

  private update(dt: number) {
    this.clock += dt
    if (this.paused) return
    if (this.mode === "lab") this.clab.tick(dt)
    if (this.mode === "drive") this.drive.tick(dt)
    // Phobo: out of the way while a test or a drive runs; offers a hint after 20 s without progress in a guided scene
    this.phobo.stepAside(this.mode === "drive" || this.mode === "test" || (this.mode === "lab" && this.clab.isPlaying()))
    this.phobo.tick(dt)
    this.placement.update(dt)
    this.inventory.update(dt)
    this.ar.update(dt)
    this.route.update(dt)
    this.soundscape(dt)
    if (this.route.isRunning()) this.lab.tick(dt)
    this.updateHeadUI(dt)
    if (this.mode === "lab" || this.mode === "build" || this.mode === "visualize" || this.mode === "circuit") {
      if (!this.phobo.speaking()) this.idleT += dt
      if (this.idleT > 20) {
        this.idleT = 0
        this.phoboHint()
      }
    }
    if (this.mode === "test") {
      this.lab.tick(dt)
      this.statusAcc += dt
      if (this.statusAcc > 0.4) {
        this.statusAcc = 0
        this.hud.setLabel(this.lab.face)
      }
    }
  }

  // ------------------------------------------------------------- inspection (LEAF tests / debugging)
  driveState(): {[k: string]: any} {
    return {...this.drive.debug()}
  }

  /** Test hooks: the AR view's wires and which layers are on. */
  arWireCount(): number {
    return this.ar.wireCount()
  }

  arPower(): boolean {
    return this.ar.isPower()
  }

  routeControl(): WizRoute {
    return this.route
  }

  vizBarControl(): WizVizBar {
    return this.vizBar
  }

  inventoryControl(): WizInventory {
    return this.inventory
  }

  phoboControl(): WizPhobo {
    return this.phobo
  }

  placementControl(): WizPlacement {
    return this.placement
  }

  driveControl(): WizDrive {
    return this.drive
  }

  getDebug(): {[k: string]: any} {
    const rep = this.validator.report()
    return {
      mode: this.mode,
      loaded: this.mode !== "launch",
      exploded: this.exploded,
      enlarged: this.enlarged,
      selectedPart: this.selectedPart,
      selectedWire: this.selectedWire,
      step: this.step + 1,
      stepTotal: PROJECT_PACK.steps.length,
      pick: this.robot.currentPick(),
      placedCount: this.placed.length,
      buildComplete: this.buildComplete,
      playUnlocked: this.playUnlocked,
      paused: this.paused,
      saved: this.saved,
      hudLabel: this.hud.labelText(),
      labFace: this.lab.face,
      labCommand: this.lab.lastCommand,
      robotFace: this.robot.currentFace(),
      validatorStatus: rep.status,
      validatorCorrect: rep.correct.length,
      project: PROJECT_PACK.identity.id,
      projectsVisible: this.menu.projectsVisible(),
      menuOpen: this.menu.isOpen(),
      menuItems: this.menu.itemIds(),
      viz: this.visualize.getDebug(),
    }
  }

  getLab(): SesameLab {
    return this.lab
  }

  /** Test helper: select a part exactly as a pinch would. */
  testSelectPart(id: string) {
    this.onPartSelected(id)
  }

  /** Test helper: wipe the stored session (and the in-memory copy). */
  clearSave() {
    const st = this.store()
    if (st && st.has(SAVE_KEY)) st.remove(SAVE_KEY)
    this.saved = false
    this.saveCache = null
    this.refreshMenu()
  }

  /** Test helper: re-read the stored session as the title screen does after a reload. */
  reloadSave() {
    this.loadSave()
    this.refreshMenu()
  }
}
