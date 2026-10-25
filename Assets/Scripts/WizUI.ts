// WizUI.ts - small UI toolbox shared by the game-style panels (inventory, Phobo chips): the Inter fonts, the UI sounds and helpers for rounded
// panels (Spectacles UI Kit RoundedRectangle), text, pop animations and one-shot sound effects. Patterns follow the Snap template projects
// (AiAgent / MusicGen): rounded dark glass, soft coloured borders, eased scale pops, a sound on every action.
// Owns: look-and-feel helpers. Must not: hold app state or decide what a control does.

import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {RGBA} from "./ProjectPack"

export const FONT_REGULAR = requireAsset("../UI/Fonts/Inter_24pt-Regular.ttf") as Font
export const FONT_MEDIUM = requireAsset("../UI/Fonts/Inter_24pt-Medium.ttf") as Font
export const FONT_SEMIBOLD = requireAsset("../UI/Fonts/Inter_24pt-SemiBold.ttf") as Font

export const SFX_PICK = requireAsset("../UI/Audio/confirmDialog.wav") as AudioTrackAsset
export const SFX_OK = requireAsset("../UI/Audio/completed.wav") as AudioTrackAsset
export const SFX_ERROR = requireAsset("../UI/Audio/errorState.wav") as AudioTrackAsset
export const SFX_SPAWN = requireAsset("../UI/Audio/robotSpawn.wav") as AudioTrackAsset
export const SFX_PING = requireAsset("../UI/Audio/inputRecieved.wav") as AudioTrackAsset

export const COLOR_PLATE: RGBA = [0.06, 0.09, 0.14, 0.94]
export const COLOR_SLOT: RGBA = [0.1, 0.14, 0.21, 0.96]
export const COLOR_TEXT = new vec4(0.93, 0.97, 1, 1)
export const COLOR_DIM = new vec4(0.62, 0.72, 0.82, 1)
export const COLOR_GOOD = new vec4(0.35, 1.0, 0.55, 1)

export interface Rrect {
  obj: SceneObject
  rr: RoundedRectangle
}

/** A rounded rectangle (UI Kit visual) of `w` x `h` cm, optionally with a soft coloured border. */
export function rrect(parent: SceneObject, name: string, w: number, h: number, radius: number, color: RGBA, z: number = 0, border?: {size: number; color: RGBA}): Rrect {
  const obj = global.scene.createSceneObject(name)
  obj.setParent(parent)
  obj.getTransform().setLocalPosition(new vec3(0, 0, z))
  const rr = obj.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
  rr.size = new vec2(w, h)
  rr.cornerRadius = radius
  rr.backgroundColor = new vec4(color[0], color[1], color[2], color[3])
  if (border) {
    rr.border = true
    rr.borderSize = border.size
    rr.borderColor = new vec4(border.color[0], border.color[1], border.color[2], border.color[3])
  }
  rr.initialize()
  rr.renderMeshVisual.mainPass.blendMode = BlendMode.PremultipliedAlphaAuto
  rr.renderMeshVisual.mainPass.colorMask = new vec4b(true, true, true, true)
  return {obj: obj, rr: rr}
}

/** World-space text in the UI font with a dark outline. `size` is the Lens font size (cm about size / 44). */
export function uiText(parent: SceneObject, name: string, text: string, size: number, color: vec4 = COLOR_TEXT, pos: vec3 = vec3.zero(), font: Font = FONT_MEDIUM): Text {
  const so = global.scene.createSceneObject(name)
  so.setParent(parent)
  so.getTransform().setLocalPosition(pos)
  const t = so.createComponent("Component.Text") as Text
  t.text = text
  t.size = size
  t.font = font
  t.depthTest = true
  t.setRenderOrder(2)
  t.textFill.color = color
  t.outlineSettings.enabled = true
  t.outlineSettings.size = 0.5
  t.outlineSettings.fill.color = new vec4(0.02, 0.03, 0.06, 1)
  t.horizontalAlignment = HorizontalAlignment.Center
  t.verticalAlignment = VerticalAlignment.Center
  t.horizontalOverflow = HorizontalOverflow.Overflow
  t.verticalOverflow = VerticalOverflow.Overflow
  return t
}

export function makeAudio(parent: SceneObject, volume: number = 0.5): AudioComponent {
  const a = parent.createComponent("Component.AudioComponent") as AudioComponent
  a.volume = volume
  a.playbackMode = Audio.PlaybackMode.LowLatency
  return a
}

export function sfx(a: AudioComponent, track: AudioTrackAsset) {
  if (isNull(a)) return
  a.audioTrack = track
  a.play(1)
}

/** Smooth scale tween of an object (eased); a new tween on the same CancelSet replaces the running one. */
export function scaleTo(obj: SceneObject, to: number, duration: number, cancel: CancelSet, easing: "ease-out-cubic" | "ease-in-out-cubic" | "ease-out-back" = "ease-out-cubic") {
  cancel.cancel()
  const tr = obj.getTransform()
  const from = tr.getLocalScale().x
  animate({
    duration: duration,
    easing: easing,
    cancelSet: cancel,
    update: (t: number) => {
      if (isNull(obj)) return
      const s = from + (to - from) * t
      tr.setLocalScale(new vec3(s, s, s))
    },
  })
}

/** Overshoot pop: 1 -> peak -> 1. */
export function pop(obj: SceneObject, peak: number, duration: number, cancel: CancelSet) {
  cancel.cancel()
  const tr = obj.getTransform()
  animate({
    duration: duration,
    easing: "linear",
    cancelSet: cancel,
    update: (t: number) => {
      if (isNull(obj)) return
      const s = 1 + (peak - 1) * Math.sin(Math.PI * t)
      tr.setLocalScale(new vec3(s, s, s))
    },
    ended: () => {
      if (!isNull(obj)) tr.setLocalScale(vec3.one())
    },
  })
}
