// GuideUI.ts - what the user reads and hears in the Circuit Guide: the left step panel, the voice orb with its caption, the narrator
// queue, the Play button and the virtual controller (joystick + buttons for a car, one slider per part for a servo hand).
// Owns: panel / orb / caption objects, narration timing (pause / hold / hint priority), controller input values.
// Must not: decide whether a step is right or wrong, or move the model (the orchestrator reads the controller values and drives).

import {PartKit} from "./WizParts"
import {rrect, makeAudio, SFX_PING, SFX_ERROR, SFX_OK} from "./WizUI"
import {GLOW_GUIDE, TEXT_DIM, TEXT_LIGHT, label, makeGrab, makeTap, wrap} from "./GuideKit"
import {mainCamera} from "./WizPlacement"
import {GuideStep} from "./GuideData"

// ------------------------------------------------------------------------------------------------ follow (lazy, yaw only)
function camYawPos(): {pos: vec3; yaw: number} {
  const c = mainCamera()
  if (!c) return {pos: vec3.zero(), yaw: 0}
  const t = c.getTransform()
  const d = t.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
  return {pos: t.getWorldPosition(), yaw: Math.atan2(-d.x, -d.z)}
}

/** Camera-relative anchor (x right, y up, z forward negative) -> world, using only the camera's yaw. */
export function anchorWorld(a: vec3): vec3 {
  const cy = camYawPos()
  return cy.pos.add(quat.fromEulerVec(new vec3(0, cy.yaw, 0)).multiplyVec3(a))
}

class Follower {
  private pos: vec3
  constructor(private obj: SceneObject, private anchor: vec3, private faceUser: boolean) {
    this.pos = anchorWorld(anchor)
    this.apply()
  }
  setAnchor(a: vec3) {
    this.anchor = a
  }
  update(dt: number) {
    const want = anchorWorld(this.anchor)
    const d = want.sub(this.pos)
    if (d.length > 14) this.pos = this.pos.add(d.uniformScale(Math.min(1, dt * 2))) // moves only once you have really turned away
    this.apply()
  }
  private apply() {
    const t = this.obj.getTransform()
    t.setWorldPosition(this.pos)
    if (this.faceUser) {
      const cam = camYawPos().pos
      const d = cam.sub(this.pos)
      t.setWorldRotation(quat.fromEulerVec(new vec3(0, Math.atan2(d.x, d.z), 0)))
    }
  }
}

// ------------------------------------------------------------------------------------------------ step panel (left)
export class StepPanel {
  root: SceneObject
  private head: Text
  private title: Text
  private body: Text
  private foot: Text
  private follow: Follower
  private widthCm: number

  constructor(kit: PartKit, widthCm: number, anchor: vec3) {
    this.widthCm = widthCm
    this.root = global.scene.createSceneObject("GuideStepPanel")
    rrect(this.root, "StepPanelPlate", widthCm, 10.4, 1.2, [0.1, 0.18, 0.3, 0.88], 0, {size: 0.18, color: [0.35, 0.95, 1, 0.9]})
    const hw = widthCm / 2
    void hw
    this.head = label(this.root, "StepPanelHead", "", 38, new vec3(0, 3.9, 0.3), TEXT_DIM)
    this.title = label(this.root, "StepPanelTitle", "", 50, new vec3(0, 2.2, 0.3), TEXT_LIGHT, true)
    this.body = label(this.root, "StepPanelBody", "", 38, new vec3(0, -0.9, 0.3), TEXT_LIGHT)
    this.foot = label(this.root, "StepPanelFoot", "", 26, new vec3(0, -4.2, 0.3), TEXT_DIM)
    this.follow = new Follower(this.root, anchor, true)
    void kit
  }

  show(idx: number, total: number, step: GuideStep | null, source: string) {
    if (step === null) {
      this.head.text = "CIRCUIT GUIDE"
      this.title.text = "All steps done"
      this.body.text = "Press Play to test it."
    } else {
      this.head.text = "STEP " + (idx + 1) + " OF " + total
      this.title.text = step.title
      this.body.text = wrap(step.text, Math.round(this.widthCm * 1.55))
    }
    this.foot.text = source
  }

  text(): string {
    return this.head.text + "|" + this.title.text + "|" + this.body.text
  }
  titleText(): string {
    return this.title.text
  }
  bodyText(): string {
    return this.body.text
  }
  update(dt: number) {
    this.follow.update(dt)
  }
}

// ------------------------------------------------------------------------------------------------ voice orb + captions
interface Line {
  text: string
  clip: string
  dur: number
  hint: boolean
}

export class Orb {
  root: SceneObject
  private ball: SceneObject
  private ballMat: any
  private cap: Text
  private follow: Follower
  private audio: AudioComponent
  private aErr: AudioComponent
  private aPing: AudioComponent
  private aOk: AudioComponent
  private cur: Line | null = null
  private left = 0
  private queue: Line[] = []
  private held = false
  private clock = 0
  private clips: {[name: string]: AudioTrackAsset} = {}
  lineCount = 0
  lastHint = ""
  log: string[] = []

  constructor(kit: PartKit, anchor: vec3) {
    this.root = global.scene.createSceneObject("GuideOrb")
    const s = kit.shape(this.root, "sphere", [0, 0, 0], [2.2, 2.2, 2.2], [0.45, 0.95, 1, 0.85], "orb_ball", false)
    this.ball = s.obj
    this.ballMat = s.sm
    kit.shape(this.root, "sphere", [0, 0, 0], [3.2, 3.2, 3.2], [0.4, 0.9, 1, 0.22], "orb_halo", false)
    this.cap = label(this.root, "GuideOrbCaption", "", 22, new vec3(0, -3.0, 0.2), TEXT_LIGHT)
    this.audio = makeAudio(this.root, 0.7)
    // one audio component per cue, each with its track assigned once now, so the first mistake / success sound does not load a file mid-demo
    this.aErr = makeAudio(this.root, 0.7)
    this.aErr.audioTrack = SFX_ERROR
    this.aPing = makeAudio(this.root, 0.7)
    this.aPing.audioTrack = SFX_PING
    this.aOk = makeAudio(this.root, 0.7)
    this.aOk.audioTrack = SFX_OK
    this.follow = new Follower(this.root, anchor, true)
  }

  registerClip(name: string, a: AudioTrackAsset) {
    this.clips[name] = a
  }

  /** Narration from the video: queued, frozen while `hold` is on (the user is working). */
  say(text: string, clip: string = "") {
    if (text === "") return
    this.queue.push({text: text, clip: clip, dur: Math.max(1.6, text.length * 0.06), hint: false})
    this.next()
  }

  /** A mistake hint: speaks at once, even while the narration is on hold, then the narration goes on. */
  hint(text: string) {
    this.lastHint = text
    const line: Line = {text: text, clip: "", dur: Math.max(1.8, text.length * 0.06), hint: true}
    if (this.cur !== null && !this.cur.hint) this.queue.unshift(this.cur) // resume the interrupted line afterwards
    this.cur = null
    this.start(line)
    if (!isNull(SFX_ERROR)) {
      this.aErr.play(1)
    }
  }

  /** A fresh start (restart of the guide): drop whatever was queued or being said. The log is kept. */
  reset() {
    this.queue = []
    this.cur = null
    this.held = false
    this.cap.text = ""
  }

  hold(on: boolean) {
    this.held = on
    if (!on) this.next()
  }

  isHeld(): boolean {
    return this.held
  }

  caption(): string {
    return this.cap.text
  }

  speaking(): boolean {
    return this.cur !== null
  }

  idle(): boolean {
    return this.cur === null && this.queue.length === 0
  }

  private next() {
    if (this.cur !== null) return
    if (this.held && !(this.queue.length > 0 && this.queue[0].hint)) return
    const l = this.queue.shift()
    if (l) this.start(l)
  }

  private start(l: Line) {
    this.cur = l
    this.left = l.dur
    this.lineCount++
    this.cap.text = wrap(l.text, 20)
    this.log.push((l.hint ? "hint: " : "say: ") + l.text)
    const clip = l.clip !== "" ? this.clips[l.clip] : undefined
    if (clip) {
      this.audio.audioTrack = clip
      this.audio.play(1)
      this.left = Math.max(l.dur, 1)
    } else if (!l.hint && !isNull(SFX_PING)) {
      this.aPing.play(1) // audio in the preview can be missing: the caption is the real output
    }
  }

  chime() {
    if (!isNull(SFX_OK)) {
      this.aOk.play(1)
    }
  }

  update(dt: number) {
    this.clock += dt
    this.follow.update(dt)
    const sp = this.cur !== null ? 1 + 0.12 * Math.sin(this.clock * 14) : 1 + 0.04 * Math.sin(this.clock * 2)
    this.ball.getTransform().setLocalScale(new vec3(sp, sp, sp))
    this.ball.getTransform().setLocalPosition(new vec3(0, 0.35 * Math.sin(this.clock * 1.6), 0))
    if (this.cur !== null) {
      this.left -= dt
      if (this.left <= 0) {
        this.cur = null
        this.next()
        if (this.cur === null) this.clearCaptionSoon = 3.5
      }
    } else if (this.clearCaptionSoon > 0) {
      this.clearCaptionSoon -= dt
      if (this.clearCaptionSoon <= 0 && this.cur === null) this.cap.text = ""
    }
  }
  private clearCaptionSoon = 0
}

// ------------------------------------------------------------------------------------------------ Play + controller
export class PlayButton {
  root: SceneObject
  constructor(kit: PartKit, parent: SceneObject, at: vec3, onPlay: () => void) {
    this.root = kit.obj(parent, "GuidePlay", [at.x, at.y, at.z])
    const face = kit.obj(this.root, "PlayFace")
    face.getTransform().setLocalRotation(quat.fromEulerVec(new vec3(-0.5, 0, 0)))
    rrect(face, "PlayPlate", 9, 3.6, 1.6, [0.1, 0.55, 0.35, 0.95], 0, {size: 0.2, color: [0.5, 1, 0.7, 1]})
    label(face, "PlayLabel", "PLAY", 70, new vec3(0, 0, 0.3), TEXT_LIGHT, true)
    const hit = kit.obj(face, "guide_play")
    makeTap(hit, new vec3(10, 4.4, 2.5), onPlay)
    this.root.enabled = false
  }
  show(on: boolean) {
    this.root.enabled = on
  }
}

export interface ControlValues {
  x: number // steer -1..1
  y: number // throttle -1..1
  boost: boolean
  sliders: number[] // 0..1 per part
}

export class Controller {
  root: SceneObject
  v: ControlValues = {x: 0, y: 0, boost: false, sliders: []}
  mode: "car" | "servo" = "car"
  private knob!: SceneObject
  private kit: PartKit
  private sliderKnobs: SceneObject[] = []
  private readonly R = 3.2

  constructor(kit: PartKit, parent: SceneObject, at: vec3) {
    this.kit = kit
    this.root = kit.obj(parent, "GuideController", [at.x, at.y, at.z])
    this.root.enabled = false
  }

  /** Build the controls for "car" (joystick + buttons) or "servo" (one slider per part). */
  open(mode: "car" | "servo", sliderCount: number) {
    this.mode = mode
    while (this.root.getChildrenCount() > 0) this.root.getChild(0).destroy()
    this.sliderKnobs = []
    this.v = {x: 0, y: 0, boost: false, sliders: []}
    const k = this.kit
    const face = k.obj(this.root, "ControllerFace")
    face.getTransform().setLocalRotation(quat.fromEulerVec(new vec3(-0.5, 0, 0)))
    if (mode === "car") {
      rrect(face, "ControllerPlate", 14, 7.6, 1.4, [0.1, 0.18, 0.3, 0.88], 0, {size: 0.16, color: [0.35, 0.95, 1, 0.9]})
      label(face, "ControllerTitle", "DRIVE", 36, new vec3(0, 3.1, 0.3), TEXT_DIM)
      const base = k.obj(face, "stick_base", [-3.6, -0.5, 0.2])
      k.shape(base, "cyl", [0, 0, 0], [this.R * 2, 0.3, this.R * 2], [0.25, 0.4, 0.6, 0.85], "ring", false, [90, 0, 0])
      this.knob = k.obj(base, "ctl_stick_knob", [0, 0, 0.9])
      k.shape(this.knob, "sphere", [0, 0, 0], [2.6, 2.6, 2.6], [0.45, 0.95, 1, 0.95], "knob", false)
      const hit = k.obj(this.knob, "ctl_stick")
      makeGrab(hit, new vec3(3.6, 3.6, 2.4), {
        move: (d) => this.moveStick(d.x, d.y),
        end: () => this.moveStick(0, 0, true),
      })
      this.button(face, "boost", "BOOST", new vec3(2.6, 0.9, 0.3), [0.95, 0.65, 0.2, 0.95], true)
      this.button(face, "stop", "STOP", new vec3(5.4, 0.9, 0.3), [0.9, 0.3, 0.3, 0.95], false)
    } else {
      const h = 2.6 + sliderCount * 2.2
      rrect(face, "ControllerPlate", 15, h, 1.4, [0.1, 0.18, 0.3, 0.88], 0, {size: 0.16, color: [0.35, 0.95, 1, 0.9]})
      label(face, "ControllerTitle", "ARM", 36, new vec3(0, h / 2 - 1.2, 0.3), TEXT_DIM)
      for (let i = 0; i < sliderCount; i++) {
        const y = h / 2 - 3.3 - i * 2.2
        k.shape(face, "box", [0, y, 0.25], [11, 0.35, 0.2], [0.35, 0.55, 0.8, 0.9], "track" + i, false)
        const knob = k.obj(face, "ctl_slider_knob_" + i, [0, y, 0.7])
        k.shape(knob, "sphere", [0, 0, 0], [1.6, 1.6, 1.6], [0.45, 0.95, 1, 0.95], "sk", false)
        const hit = k.obj(knob, "ctl_slider_" + i)
        makeGrab(hit, new vec3(2.4, 2.4, 2), {move: (d) => this.moveSlider(i, d.x)})
        this.sliderKnobs.push(knob)
        this.v.sliders.push(0.5)
      }
    }
  }

  private button(parent: SceneObject, id: string, text: string, at: vec3, c: [number, number, number, number], hold: boolean) {
    const b = this.kit.obj(parent, "ctl_btn_" + id, [at.x, at.y, at.z])
    rrect(b, "plate_" + id, 2.6, 2.4, 1.0, c, 0)
    label(b, "label_" + id, text, 22, new vec3(0, 0, 0.3), TEXT_LIGHT, true)
    const hit = this.kit.obj(b, "ctl_btn_hit_" + id)
    makeTap(
      hit,
      new vec3(3.6, 3.2, 2.2),
      () => {
        if (!hold) this.stop()
      },
      () => {
        if (hold) this.v.boost = true
      },
      () => {
        if (hold) this.v.boost = false
      },
    )
  }

  stop() {
    this.v.x = 0
    this.v.y = 0
    this.moveStick(0, 0, true)
  }

  /** Joystick: per-frame world deltas move the knob inside a circle; the output is the knob offset / radius. */
  moveStick(dx: number, dy: number, centre: boolean = false) {
    if (!this.knob) return
    const t = this.knob.getTransform()
    const cur = t.getLocalPosition()
    // the face is a flat panel facing the user: deltas are in the panel plane (world x / y)
    let nx = centre ? 0 : cur.x + dx
    let ny = centre ? 0 : cur.y + dy
    const len = Math.sqrt(nx * nx + ny * ny)
    if (len > this.R) {
      nx = (nx / len) * this.R
      ny = (ny / len) * this.R
    }
    t.setLocalPosition(new vec3(nx, ny, cur.z))
    this.v.x = nx / this.R
    this.v.y = ny / this.R
  }

  moveSlider(i: number, dx: number) {
    const knob = this.sliderKnobs[i]
    if (!knob) return
    const t = knob.getTransform()
    const p = t.getLocalPosition()
    const nx = Math.max(-5.5, Math.min(5.5, p.x + dx))
    t.setLocalPosition(new vec3(nx, p.y, p.z))
    this.v.sliders[i] = (nx + 5.5) / 11
  }

  show(on: boolean) {
    this.root.enabled = on
  }
  knobWorld(): vec3 {
    return this.knob ? this.knob.getTransform().getWorldPosition() : this.root.getTransform().getWorldPosition()
  }
  /** Where the joystick centre sits now, in the same local units moveStick uses. */
  stickLocal(): vec3 {
    return this.knob ? this.knob.getTransform().getLocalPosition() : vec3.zero()
  }
  stickRadius(): number {
    return this.R
  }
  isOpen(): boolean {
    return this.root.enabled
  }
}

export const UI_CYAN = GLOW_GUIDE
