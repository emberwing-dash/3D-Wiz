// WizPhobo.ts - Phobo, the companion bot: floats beside the user, holds still while the user only looks around, follows when the user walks,
// steps aside during tests, and talks through a dialogue box above its head. Its screen is an analog-TV face (see WizPhoboFace).
// Owns: the Phobo model instance, follow / hold / step-aside motion, tap reaction. Must not: decide modes (WizMain) or hold app data.

const PHOBO_PREFAB = requireAsset("../Models/Phobo/Phobo_cm.prefab") as ObjectPrefab

const DIST = 48 // cm in front of the user (default)
const SIDE = 10 // cm to the right of the view centre (default): inside the narrow view
const DROP = 0 // cm relative to the view centre (default): clear of the menu column
const FOLLOW_LAG = 3.2
const OUT_ANGLE = 38 // degrees off the view centre before Phobo swings back into view

import {makeInteractable} from "./WizInteract"
import {WizPhoboFace, FaceMood} from "./WizPhoboFace"
import {makeLabel, LABEL_ACCENT} from "./WizLabelsUI"
import {rrect, uiText, COLOR_SLOT, COLOR_TEXT, FONT_SEMIBOLD, pop} from "./WizUI"
import {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"

export type PhoboMood = FaceMood

export class WizPhobo {
  readonly root: SceneObject
  private model: SceneObject
  private cam: Camera | null = null
  private anchor = new vec3(0, 0, -50)
  private placed = false
  private clock = 0
  private away = 0 // 0 = beside the user, 1 = stepped aside
  private awayTarget = 0
  private tapPop = 0
  private active = true
  mood: PhoboMood = "idle"
  private face: WizPhoboFace | null = null
  private moodT = 0
  private bubble: SceneObject | null = null
  private bubbleText: Text | null = null
  private bubbleT = 0
  onTap: () => void = () => {}
  onChip: (id: string) => void = () => {}
  private chipRoot: SceneObject | null = null
  private chipT = 0
  private chipPops: CancelSet[] = []

  constructor() {
    this.root = global.scene.createSceneObject("Phobo")
    this.model = PHOBO_PREFAB.instantiate(this.root)
    this.model.name = "PhoboModel"
    // the model faces +X (its eyes and screen): turn it so +X looks at the user when the root faces +Z
    this.model.getTransform().setLocalRotation(quat.angleAxis(-Math.PI / 2, vec3.up()))
    this.model.getTransform().setLocalScale(new vec3(0.5, 0.5, 0.5))
  }

  /** Phobo's analog-TV screen (a textured quad on the front of its head), its tap target and its dialogue box. */
  attachFace(box: RenderMesh, faceMat: Material) {
    // hide the model's own eye meshes: the TV draws the expression
    this.hideByName(this.model, "Cube.001")
    this.face = new WizPhoboFace()
    const q = global.scene.createSceneObject("PhoboScreen")
    q.setParent(this.root)
    q.getTransform().setLocalPosition(new vec3(0, 0, 2.08))
    q.getTransform().setLocalScale(new vec3(3.3, 2.5, 0.05))
    const rmv = q.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = box
    const m = faceMat.clone()
    m.mainPass.baseTex = this.face.texture
    m.mainPass.baseColor = new vec4(1, 1, 1, 1)
    m.mainPass.blendMode = BlendMode.Normal
    rmv.mainMaterial = m
    // tap target: a pinch on Phobo makes it react
    const hit = global.scene.createSceneObject("phobo_hit")
    hit.setParent(this.root)
    const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
    const sh = Shape.createBoxShape()
    sh.size = new vec3(5, 5, 5)
    col.shape = sh
    const it = makeInteractable(hit)
    it.targetingMode = 3
    it.onTriggerEnd.add(() => {
      this.pop()
      this.react("happy", 2.2)
      this.onTap()
    })
    // dialogue box above the head
    const b = global.scene.createSceneObject("PhoboBubble")
    b.setParent(this.root)
    b.getTransform().setLocalPosition(new vec3(-4.5, -4.2, 0.3)) // below-left of the head: stays inside the narrow view
    this.bubbleText = makeLabel(b, "bubbleText", "", 26, [0, 0, 0.1], new vec4(0.85, 1, 1, 1))
    this.bubble = b
    b.enabled = false
  }

  private hideByName(o: SceneObject, name: string) {
    if (o.name === name) o.enabled = false
    for (let i = 0; i < o.getChildrenCount(); i++) this.hideByName(o.getChild(i), name)
  }

  /** Quick-question chips under the dialogue box (like the suggestion chips of the Snap agent template). Empty list = hide. */
  setChips(list: {id: string; label: string}[], seconds: number = 16) {
    if (this.chipRoot && !isNull(this.chipRoot)) this.chipRoot.destroy()
    this.chipRoot = null
    this.chipPops = []
    if (list.length === 0) return
    const root = global.scene.createSceneObject("PhoboChips")
    root.setParent(this.root)
    root.getTransform().setLocalPosition(new vec3(-4.6, -5.6, 0.5))
    for (let i = 0; i < list.length; i++) {
      const c = list[i]
      const o = global.scene.createSceneObject("chip_" + c.id)
      o.setParent(root)
      o.getTransform().setLocalPosition(new vec3((i - (list.length - 1) / 2) * 3.5, 0, 0))
      rrect(o, "bg", 3.2, 1.2, 0.6, COLOR_SLOT, 0, {size: 0.09, color: [0.35, 0.9, 1.0, 0.85]})
      uiText(o, "t", c.label, 20, COLOR_TEXT, new vec3(0, 0, 0.1), FONT_SEMIBOLD)
      const hit = global.scene.createSceneObject("chiphit_" + c.id)
      hit.setParent(o)
      const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
      const sh = Shape.createBoxShape()
      sh.size = new vec3(3.2, 1.6, 0.9)
      col.shape = sh
      const it = makeInteractable(hit)
      it.targetingMode = 3
      const cancel = new CancelSet()
      this.chipPops.push(cancel)
      it.onTriggerEnd.add(() => {
        pop(o, 1.2, 0.22, cancel)
        this.onChip(c.id)
      })
    }
    this.chipRoot = root
    this.chipT = seconds
  }

  chipsShown(): boolean {
    return this.chipRoot !== null && !isNull(this.chipRoot) && this.chipRoot.enabled
  }

  /** A short expression, then back to idle. */
  react(m: PhoboMood, seconds: number) {
    this.setMood(m)
    this.moodT = seconds
  }

  /** The dialogue box above Phobo's head: one short line for a few seconds (empty = hide). */
  say(text: string, seconds: number = 5) {
    if (!this.bubble || !this.bubbleText) return
    this.bubbleText.text = text
    this.bubble.enabled = text !== ""
    this.bubbleT = seconds
    if (text !== "") this.react("think", Math.min(seconds, 1.6))
  }

  speaking(): boolean {
    return this.bubble !== null && this.bubble.enabled
  }

  private findCamera(): Camera | null {
    if (this.cam && !isNull(this.cam)) return this.cam
    const n = global.scene.getRootObjectsCount()
    for (let i = 0; i < n; i++) {
      const c = this.scan(global.scene.getRootObject(i))
      if (c) {
        this.cam = c
        return c
      }
    }
    return null
  }

  private scan(o: SceneObject): Camera | null {
    const c = o.getComponent("Component.Camera") as Camera
    if (!isNull(c)) return c
    for (let i = 0; i < o.getChildrenCount(); i++) {
      const r = this.scan(o.getChild(i))
      if (r) return r
    }
    return null
  }

  /** Where Phobo wants to hover: ahead and to the right of the user, a little below eye level, level with the floor plane. */
  private desired(cam: Camera): vec3 {
    const t = cam.getTransform()
    const f = t.getWorldRotation().multiplyVec3(new vec3(0, 0, -1)) // the camera looks down its own -Z
    let flat = new vec3(f.x, 0, f.z)
    if (flat.length < 0.01) flat = new vec3(0, 0, -1)
    flat = flat.normalize()
    const right = new vec3(-flat.z, 0, flat.x)
    const p = t.getWorldPosition()
    const away = this.away
    return p.add(flat.uniformScale(DIST)).add(right.uniformScale(SIDE + away * 3)).add(new vec3(0, DROP + away * 4, 0))
  }

  /** Per frame. `busy` = the user is dragging or pressing something (Phobo holds still and keeps clear). */
  tick(dt: number) {
    if (!this.active) return
    this.clock += dt
    if (this.face) this.face.tick(dt)
    if (this.moodT > 0) {
      this.moodT -= dt
      if (this.moodT <= 0 && this.mood !== "idle") this.setMood("idle")
    }
    if (this.chipT > 0) {
      this.chipT -= dt
      if (this.chipT <= 0) this.setChips([])
    }
    if (this.bubbleT > 0) {
      this.bubbleT -= dt
      if (this.bubbleT <= 0 && this.bubble) this.bubble.enabled = false
    }
    const cam = this.findCamera()
    if (!cam) return
    const ct = cam.getTransform()
    const want = this.desired(cam)
    if (!this.placed) {
      this.anchor = want
      this.placed = true
    }
    // hold still while the user only looks around: follow only when Phobo is far from the user or outside the view cone
    const cp = ct.getWorldPosition()
    const toP = this.anchor.sub(cp)
    const dist = toP.length
    const fwd = ct.getWorldRotation().multiplyVec3(new vec3(0, 0, -1)) // view direction
    const ang = (Math.acos(Math.max(-1, Math.min(1, toP.normalize().dot(fwd)))) * 180) / Math.PI
    if (dist > DIST + 40 || dist < DIST - 25 || ang > OUT_ANGLE) {
      this.anchor = this.anchor.add(want.sub(this.anchor).uniformScale(Math.min(1, dt * FOLLOW_LAG)))
    }
    this.away += (this.awayTarget - this.away) * Math.min(1, dt * 3)
    const bob = Math.sin(this.clock * 1.6) * 0.8
    const pos = this.anchor.add(new vec3(0, bob, 0))
    this.root.getTransform().setWorldPosition(pos)
    // face the user (yaw only)
    const dx = cp.x - pos.x
    const dz = cp.z - pos.z
    const yaw = Math.atan2(dx, dz)
    this.root.getTransform().setWorldRotation(quat.angleAxis(yaw, vec3.up()))
    if (this.tapPop > 0) this.tapPop = Math.max(0, this.tapPop - dt)
    const s = 1 + this.tapPop * 0.6 - this.away * 0.4
    this.root.getTransform().setWorldScale(new vec3(s, s, s))
  }

  /** Step aside (during Play / Drive) or come back. */
  stepAside(on: boolean) {
    this.awayTarget = on ? 1 : 0
  }

  isAside(): boolean {
    return this.awayTarget > 0.5
  }

  pop() {
    this.tapPop = 0.3
  }

  setMood(m: PhoboMood) {
    this.mood = m
    if (this.face) this.face.setMood(m)
  }

  setVisible(on: boolean) {
    this.active = on
    this.root.enabled = on
  }

  worldPosition(): vec3 {
    return this.root.getTransform().getWorldPosition()
  }
}
