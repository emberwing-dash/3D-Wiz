// WizMenu.ts - the title screen (animated 3D Wiz logo + swipe hint) and the SAO-style icon menu: a vertical stack of round
//              ICON-only items that opens when the hand makes the two-finger swipe-down, follows the hand and closes on a swipe up.
// Owns: launch visuals, icon stack (build, hover word, pop animation, hand-following), gesture polling through HandsService.
// Preview fallback (not a button): pinch-click or drag DOWN on the swipe-hint icon; "virtual hand" = playHandDemo() feeds
//   synthetic joints through the SAME detector. Must not decide what an icon does (WizMain handles onSelect).

import {Interactable, makeInteractable, toWorld} from "./WizInteract"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {PROJECT_PACK, RGBA} from "./ProjectPack"
import {PartKit} from "./WizParts"
import {makeLabel, LABEL_ACCENT, LABEL_COLOR} from "./WizLabelsUI"
import {makeIconQuad, tintIcon} from "./WizIcons"
import {HandsService} from "./WizHands"
import {ProjectCards, CardDef} from "./WizProjectCards"

const ICON_HIT = 2.4 // cm, hit box edge (>= 2 cm at 55 cm)
const ICON_PITCH = 3.4 // cm between icon centres (hit boxes 1.0 cm apart)
const ICON_BIAS = -0.5 // hit box sits a little low: pinches from a lower arm land high
const ICON_ANCHOR_Y = -7.5 // stack centre; 7 icons span 22.8 cm, so the stack stays inside +-19 cm
const MENU_Z = -54 // cm in front of the workbench origin
const MENU_X = -13 // cm: the icon column sits at the left edge of the view
const MAX_ICONS = 7
const MORE_ID = "menu_more"

export interface MenuItem {
  id: string
  icon: string
  state?: "normal" | "locked" | "active"
  label?: string // hover word (defaults to a built-in word for the id)
}

const LABELS: {[id: string]: string} = {
  visualize: "Visualize", build: "Build", play: "Play", wires: "Wires", pause: "Pause", resume: "Resume", home: "Home",
  save: "Save", show: "Show me", continue: "Continue", arrange: "Arrange", more: "More", explore: "Explore",
  walk: "Walk", wave: "Wave", dance: "Dance", bow: "Bow", rest: "Rest", stand: "Stand", cute: "Cute", freaky: "Freaky",
  worm: "Worm", shake: "Shake", shrug: "Shrug", dead: "Dead", crab: "Crab", swim: "Swim", point: "Point", pushup: "Pushup",
  back: "Back", left: "Left", right: "Right", projects: "Projects", mymodel: "My Model", template: "Circuit",
}

interface ItemRt {
  def: MenuItem
  root: SceneObject
  ring: StyledRing
  iconMat: Material
  label: Text
  hover: boolean
  pop: number
  scale: number
}

interface StyledRing {
  set: (c: RGBA) => void
}

@component
export class WizMenu extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">WizMenu - title screen + SAO icon menu</span>')
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
  @hint("Unlit material")
  unlitMaterial!: Material
  @input
  @hint("Unlit material with Base Texture enabled (icons)")
  faceMaterial!: Material
  @ui.group_end

  private kit!: PartKit
  readonly hands = new HandsService()
  private launch!: SceneObject
  private hint!: SceneObject
  private hintMat!: Material
  private orbit: SceneObject[] = []
  private stack!: SceneObject
  private items: ItemRt[] = []
  private openT: number = 0
  private wantOpen: boolean = false
  // Spectacles sizing (z ~ 54 cm: view is ~23 x 38 cm): icon hit box >= 2 cm, >= 1 cm between hit boxes, <= 7 icons per page,
  // stack kept inside the view.
  /** Title menu: icons, words and hit boxes are drawn larger (1 = the in-scene size). */
  private bigK = 1
  setBig(on: boolean): void {
    this.bigK = on ? 1.15 : 1
  }
  private anchor = new vec3(MENU_X, ICON_ANCHOR_Y, MENU_Z)
  private anchorCur = new vec3(MENU_X, ICON_ANCHOR_Y, MENU_Z)
  // the Circuit lab bench fills the lower view; the stack moves up so no icon collider sits in front of a bench part
  setLift(y: number, x: number = MENU_X) {
    this.anchor = new vec3(x, ICON_ANCHOR_Y + y, this.anchor.z)
  }
  private fullList: MenuItem[] = []
  private hideRoot: SceneObject | null = null
  private tab: SceneObject | null = null
  private page = 0
  private followHand: boolean = false
  private followSide: string = "right"
  private autoOpenIn: number = -1
  private clock: number = 0
  // old icon roots wait here before destroy(): an icon may be rebuilt from inside its own trigger handler
  private graveyard: {obj: SceneObject; at: number}[] = []
  private paused: boolean = false
  private lastEvent: string = ""
  cards!: ProjectCards
  private projectLabel!: Text

  private _onSelect = new Event<string>()
  private _onOpened = new Event<void>()
  private _onClosed = new Event<void>()
  readonly onSelect: PublicApi<string> = this._onSelect.publicApi()
  readonly onOpened: PublicApi<void> = this._onOpened.publicApi()
  readonly onClosed: PublicApi<void> = this._onClosed.publicApi()
  private _onProject = new Event<string>()
  readonly onProject: PublicApi<string> = this._onProject.publicApi()

  onAwake() {
    try {
      this.kit = new PartKit(this.boxMesh, this.sphereMesh, this.cylinderMesh, this.litMaterial, this.unlitMaterial)
      this.buildLaunch()
      this.stack = this.kit.obj(this.sceneObject, "Stack")
      this.stack.getTransform().setWorldPosition(toWorld(this.stack, this.anchorCur))
      this.cards = new ProjectCards(this.kit, this.sceneObject, this.boxMesh, this.faceMaterial)
      this.cards.root.getTransform().setWorldPosition(toWorld(this.cards.root, new vec3(0, -9, -54.6)))
      this.cards.onPick.add((id) => this._onProject.invoke(id))
    } catch (e) {
      print("[WizMenu] build failed: " + e + " " + (e && (e as any).stack ? (e as any).stack : ""))
    }
    this.createEvent("UpdateEvent").bind(() => this.update(getDeltaTime()))
  }

  // ---------------------------------------------------------------- title screen
  private buildLaunch() {
    this.launch = this.kit.obj(this.sceneObject, "Launch")
    this.launch.getTransform().setWorldPosition(toWorld(this.launch, new vec3(0, 0, -55)))
    makeLabel(this.launch, "MenuTitle", PROJECT_PACK.identity.app, 72, [0, 15.5, 0], LABEL_ACCENT)
    makeLabel(this.launch, "MenuTagline", PROJECT_PACK.identity.tagline, 28, [0, 13.0, 0], LABEL_COLOR)
    this.projectLabel = makeLabel(this.launch, "MenuProject", PROJECT_PACK.identity.short ? (PROJECT_PACK.identity.short as string) : PROJECT_PACK.identity.name, 32, [0, 10.9, 0], LABEL_ACCENT)
    const cols: RGBA[] = [[0.35, 1.0, 1.0, 1], [1, 1, 1, 1], [1.0, 0.75, 0.25, 1]]
    for (let i = 0; i < 3; i++) this.orbit.push(this.kit.shape(this.launch, "sphere", [0, 0, 0], [0.55, 0.55, 0.55], cols[i], "orbit" + i, false).obj)
    // swipe hint (also the mouse fallback: pinch-click it, or drag it downward)
    const q = makeIconQuad(this.launch, this.boxMesh, this.faceMaterial, "SwipeHint", "swipe_down", 3.2, [0.35, 1.0, 1.0, 1])
    this.hint = q.obj
    this.hintMat = q.mat
    this.hint.getTransform().setLocalPosition(new vec3(0, -15.5, 0)) // bottom edge: the middle of the view belongs to the model
    this.buildTab()
    const hit = this.kit.obj(this.hint, "hint_open")
    const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
    const box = Shape.createBoxShape()
    box.size = new vec3(3.0, 3.0, 6) // >= 2 degrees at ~64 cm (Spectacles target sizing); was 1.4 cm
    col.shape = box
    const it = makeInteractable(hit)
    it.targetingMode = 3
    let acc = 0
    this.createEvent("OnStartEvent").bind(() => {
      it.onTriggerStart.add(() => {
        acc = 0
      })
      it.onDragUpdate.add((e) => {
        const d = e.planecastDragVector ? e.planecastDragVector : e.dragVector
        if (d) acc += d.y
      })
      it.onTriggerEnd.add(() => {
        if (acc < -2.5 || Math.abs(acc) < 0.3) this.openMenu("pinch") // downward drag or a plain click
      })
    })
  }

  /** The menu tab: a small down-arrow ring that is on screen whenever the menu is closed (any scene). Click it or drag it down = swipe down. */
  private buildTab() {
    const root = this.kit.obj(this.sceneObject, "menu_tab")
    this.kit.shape(root, "cyl", [0, 0, -0.05], [2.0, 0.1, 2.0], [0.35, 0.95, 1.0, 1], "ring", false, [90, 0, 0])
    this.kit.shape(root, "cyl", [0, 0, 0], [1.8, 0.2, 1.8], [0.05, 0.1, 0.16, 1], "disc", false, [90, 0, 0])
    const q = makeIconQuad(root, this.boxMesh, this.faceMaterial, "icon", "swipe_down", 1.2, [1, 1, 1, 1])
    q.obj.getTransform().setLocalPosition(new vec3(0, 0, 0.14))
    const hit = this.kit.obj(root, "menu_tab_hit", [0, 0, 0])
    const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
    const box = Shape.createBoxShape()
    box.size = new vec3(2.4, 2.4, 0.8)
    col.shape = box
    const it = makeInteractable(hit)
    it.targetingMode = 3
    let acc = 0
    this.createEvent("OnStartEvent").bind(() => {
      it.onTriggerStart.add(() => {
        acc = 0
      })
      it.onDragUpdate.add((e) => {
        const d = e.planecastDragVector ? e.planecastDragVector : e.dragVector
        if (d) acc += d.y
      })
      it.onTriggerEnd.add(() => {
        if (acc < -2.0 || Math.abs(acc) < 0.3) this.openMenu("pinch")
      })
    })
    root.enabled = false
    this.tab = root
  }

  showLaunch(on: boolean) {
    this.launch.enabled = on
    if (on) this.cards.hide()
  }

  /** The current project's short name on the title screen (at most two words). */
  setProjectName(name: string) {
    if (this.projectLabel) this.projectLabel.text = name
  }

  /** Projects carousel: a row of 3D cards. Pinch one to load that project. */
  showProjects(defs: CardDef[], current: string) {
    this.launch.enabled = false
    this.hint.enabled = false
    this.closeMenu("projects")
    this.cards.show(defs, current)
  }

  hideProjects() {
    this.cards.hide()
  }

  projectsVisible(): boolean {
    return this.cards.isVisible()
  }

  launchVisible(): boolean {
    return this.launch.enabled
  }

  // ---------------------------------------------------------------- items
  /** Items beyond one page go behind a more icon (at most MAX_ICONS shown at once, the more icon included). */
  private pageCount(): number {
    const pinned = this.fullList.filter((x) => x.id === "back").length
    const rest = this.fullList.length - pinned
    if (rest + pinned <= MAX_ICONS) return 1
    return Math.ceil(rest / (MAX_ICONS - 1 - pinned))
  }

  /** Back stays on every page (last icon); the rest is split over pages behind the more icon. */
  private pageSlice(): MenuItem[] {
    const pages = this.pageCount()
    if (pages === 1) return this.fullList
    if (this.page >= pages) this.page = 0
    const back = this.fullList.filter((x) => x.id === "back")
    const rest = this.fullList.filter((x) => x.id !== "back")
    const per = Math.ceil(rest.length / pages)
    const out = rest.slice(this.page * per, (this.page + 1) * per)
    out.push({id: MORE_ID, icon: "more_horiz"})
    for (const x of back) out.push(x)
    return out
  }

  /** The hide handle above the stack: the mouse / preview twin of the swipe-up gesture (click it or drag it upward). */
  private buildHideHandle(n: number) {
    if (this.hideRoot) {
      this.hideRoot.enabled = false
      this.graveyard.push({obj: this.hideRoot, at: this.clock + 1.0})
    }
    const y = ((n - 1) / 2) * ICON_PITCH * this.bigK + (this.bigK > 1 ? 3.0 : ICON_PITCH + 0.1)
    const root = this.kit.obj(this.stack, "menu_hide", [0, y, 0])
    root.getTransform().setLocalScale(new vec3(this.bigK, this.bigK, this.bigK))
    this.kit.shape(root, "cyl", [0, 0, -0.05], [2.0, 0.1, 2.0], [0.35, 0.95, 1.0, 1], "ring", false, [90, 0, 0])
    this.kit.shape(root, "cyl", [0, 0, 0], [1.8, 0.2, 1.8], [0.05, 0.1, 0.16, 1], "disc", false, [90, 0, 0])
    const q = makeIconQuad(root, this.boxMesh, this.faceMaterial, "icon", "arrow_upward", 1.1, [1, 1, 1, 1])
    q.obj.getTransform().setLocalPosition(new vec3(0, 0, 0.14))
    const hit = this.kit.obj(root, "menu_icon_hide", [0, 0, 0])
    const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
    const box = Shape.createBoxShape()
    box.size = new vec3(2.2, 2.2, 0.8)
    col.shape = box
    const it = makeInteractable(hit)
    it.targetingMode = 3
    let acc = 0
    it.onTriggerStart.add(() => {
      acc = 0
    })
    it.onDragUpdate.add((e) => {
      const d = e.planecastDragVector ? e.planecastDragVector : e.dragVector
      if (d) acc += d.y
    })
    it.onTriggerEnd.add(() => {
      if (this.openT < 0.5) return
      if (acc > 2.0 || Math.abs(acc) < 0.3) this.closeMenu("pinch") // upward drag or a plain click
    })
    this.hideRoot = root
  }

  setItems(all: MenuItem[]) {
    this.fullList = all
    const list = this.pageSlice()
    this.buildHideHandle(list.length)
    for (let i = 0; i < this.items.length; i++) {
      this.items[i].root.enabled = false
      this.graveyard.push({obj: this.items[i].root, at: this.clock + 1.0})
    }
    this.items = []
    const n = list.length
    const gap = ICON_PITCH * this.bigK
    const always = n <= 5 // a short menu shows every word next to its icon (long ones show it on hover)
    for (let i = 0; i < n; i++) {
      const def = list[i]
      const root = this.kit.obj(this.stack, "menu_" + def.id, [0, ((n - 1) / 2 - i) * gap, 0])
      const rg = this.kit.shape(root, "cyl", [0, 0, -0.05], [2.55, 0.1, 2.55], [0.35, 0.95, 1.0, 1], "ring", false, [90, 0, 0])
      this.kit.shape(root, "cyl", [0, 0, 0], [2.3, 0.2, 2.3], [0.05, 0.1, 0.16, 1], "disc", false, [90, 0, 0])
      const q = makeIconQuad(root, this.boxMesh, this.faceMaterial, "icon", def.icon, 1.5, [1, 1, 1, 1])
      q.obj.getTransform().setLocalPosition(new vec3(0, 0, 0.14))
      const label = makeLabel(root, "word", def.label !== undefined ? def.label : LABELS[def.id] !== undefined ? LABELS[def.id] : def.id, 34, [4.6, 0, 0.1], LABEL_COLOR)
      label.getSceneObject().enabled = always
      const hit = this.kit.obj(root, "menu_icon_" + def.id, [0, ICON_BIAS, 0]) // biased downward: pinches from a lower arm land high
      const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
      const box = Shape.createBoxShape()
      box.size = new vec3(ICON_HIT, ICON_HIT, 0.8)
      col.shape = box
      const it = makeInteractable(hit)
      it.targetingMode = 3
      const rt: ItemRt = {def: def, root: root, ring: {set: (c: RGBA) => rg.sm.set(c)}, iconMat: q.mat, label: label, hover: false, pop: 0, scale: 0}
      this.items.push(rt)
      this.paintItem(rt)
      // setItems runs after Start (items are rebuilt per page), so bind directly: an OnStart event would never fire
      it.onHoverEnter.add(() => {
        rt.hover = true
        rt.label.getSceneObject().enabled = true
      })
      it.onHoverExit.add(() => {
        rt.hover = false
        rt.label.getSceneObject().enabled = always
      })
      it.onTriggerEnd.add(() => {
        if (this.openT < 0.5) return
        rt.pop = 0.28
        if (rt.def.id === MORE_ID) {
          this.page = (this.page + 1) % this.pageCount()
          this.setItems(this.fullList)
          return
        }
        this.pickLog.push(rt.def.id)
        this._onSelect.invoke(rt.def.id)
      })
    }
  }

  private paintItem(rt: ItemRt) {
    const st = rt.def.state !== undefined ? rt.def.state : "normal"
    if (st === "locked") {
      rt.ring.set([1.0, 0.75, 0.25, 1])
      tintIcon(rt.iconMat, [0.55, 0.55, 0.55, 1])
    } else if (st === "active") {
      rt.ring.set([0.4, 1.0, 0.55, 1])
      tintIcon(rt.iconMat, [1, 1, 1, 1])
    } else {
      rt.ring.set([0.35, 0.95, 1.0, 1])
      tintIcon(rt.iconMat, [1, 1, 1, 1])
    }
  }

  setItemState(id: string, state: "normal" | "locked" | "active") {
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].def.id === id) {
        this.items[i].def.state = state
        this.paintItem(this.items[i])
      }
    }
  }

  itemIds(): string[] {
    return this.fullList.map((it) => it.id)
  }

  hasItem(id: string): boolean {
    return this.itemIds().indexOf(id) >= 0
  }

  /** Test helper: select an item exactly as a pinch on its icon does. */
  selectForTest(id: string) {
    if (this.hasItem(id)) this._onSelect.invoke(id)
  }

  // ---------------------------------------------------------------- open / close
  openMenu(source: string) {
    if (this.wantOpen) return
    this.wantOpen = true
    this.lastEvent = "open:" + source
    this.followHand = source === "hand"
    this.hint.enabled = false
    this._onOpened.invoke()
  }

  closeMenu(source: string) {
    if (!this.wantOpen) return
    this.wantOpen = false
    this.lastEvent = "close:" + source
    this._onClosed.invoke()
  }

  isOpen(): boolean {
    return this.wantOpen
  }

  isFullyOpen(): boolean {
    return this.openT > 0.95
  }

  /** Ids pinched since start (diagnostics for the LEAF reach scenario). */
  pickLog: string[] = []

  lastGesture(): string {
    return this.lastEvent
  }

  openAfter(seconds: number) {
    this.autoOpenIn = seconds
  }

  setHintVisible(on: boolean) {
    this.hint.enabled = on
  }

  setPaused(on: boolean) {
    this.paused = on
  }

  /** Virtual hand: a synthetic two-finger sweep fed through the same detector the real hand uses. */
  playHandDemo(down: boolean) {
    this.hands.playSynthetic(down)
  }

  anchorWorld(): vec3 {
    return this.stack.getTransform().getWorldPosition()
  }

  // ---------------------------------------------------------------- per frame
  private update(dt: number) {
    if (dt > 0.1) dt = 0.1
    this.clock += dt
    this.cards.update(dt, this.clock)
    for (let g = this.graveyard.length - 1; g >= 0; g--) {
      if (this.clock >= this.graveyard[g].at) {
        if (!isNull(this.graveyard[g].obj)) this.graveyard[g].obj.destroy()
        this.graveyard.splice(g, 1)
      }
    }
    const r = this.hands.update(dt)
    if (r !== null) {
      if (r.event === "open") {
        if (this.wantOpen) this.closeMenu("hand")
        else {
          this.followSide = r.side
          this.openMenu("hand")
        }
      } else if (r.event === "close") this.closeMenu("hand")
    }
    if (this.autoOpenIn >= 0 && !this.paused) {
      this.autoOpenIn -= dt
      if (this.autoOpenIn < 0) {
        this.autoOpenIn = -1
        this.openMenu("auto")
      }
    }
    // title-screen life: orbiting dots + bobbing hint, hint fades when the hand is idle
    if (this.launch.enabled) {
      for (let i = 0; i < this.orbit.length; i++) {
        const a = this.clock * 1.3 + (i * Math.PI * 2) / 3
        this.orbit[i].getTransform().setLocalPosition(new vec3(Math.cos(a) * 6.5, 15.5 + Math.sin(a) * 1.0, Math.sin(a) * 0.5))
      }
      const bob = Math.abs(Math.sin(this.clock * 2.0))
      this.hint.getTransform().setLocalPosition(new vec3(0, -15.5 - bob * 1.5, 0))
      const fade = this.hands.idleSeconds() > PROJECT_PACK.gesture.idleFadeS ? 0.35 : 1.0
      tintIcon(this.hintMat, [0.35, 1.0, 1.0, fade])
    }
    // menu tab: shown (at the top of where the stack opens) while the menu is closed and no title / carousel is up
    if (this.tab) {
      const show = !this.wantOpen && this.openT < 0.05 && !this.launch.enabled && !this.projectsVisible()
      this.tab.enabled = show
      if (show) {
        const n = Math.max(1, this.items.length)
        const ty = ((n - 1) / 2) * ICON_PITCH * this.bigK + (this.bigK > 1 ? 3.0 : ICON_PITCH + 0.1)
        this.tab.getTransform().setWorldPosition(toWorld(this.tab, new vec3(this.anchorCur.x, this.anchorCur.y + ty, this.anchorCur.z)))
      }
    }
    // stack: follow the hand (smoothly) or sit at its default place
    let target = this.anchor
    if (this.followHand && this.hands.anyTracked() && this.hands.lastAnchor !== null) {
      const a = this.hands.lastAnchor
      const off = this.followSide === "right" ? -7 : 7
      target = new vec3(Math.max(-9, Math.min(9, a.x + off)), Math.max(-7, Math.min(-3, a.y + 2)), MENU_Z)
    }
    const sm = PROJECT_PACK.gesture.followSmooth
    this.anchorCur = this.anchorCur.add(target.sub(this.anchorCur).uniformScale(sm))
    this.stack.getTransform().setWorldPosition(toWorld(this.stack, this.anchorCur))
    // open / close animation + per-item pop, hover growth
    const dir = this.wantOpen ? 1 : -1
    this.openT = Math.max(0, Math.min(1, this.openT + dir * dt * 3.2))
    this.stack.enabled = this.openT > 0.001
    const n = this.items.length
    for (let i = 0; i < n; i++) {
      const it = this.items[i]
      const k = Math.max(0, Math.min(1, this.openT * (n + 2) - i * 0.9))
      const ease = k * k * (3 - 2 * k)
      if (it.pop > 0) it.pop = Math.max(0, it.pop - dt)
      const s = ease * (it.hover ? 1.18 : 1) * (1 + (it.pop > 0 ? 0.35 * (it.pop / 0.28) : 0))
      it.scale = s
      const sk = Math.max(0.001, s * this.bigK)
      it.root.getTransform().setLocalScale(new vec3(sk, sk, sk))
    }
  }
}
