// WizIcons.ts - icon textures (Material Symbols imported with the IconSelector tool under Assets/Icons) + a flat icon quad.
// Owns: the name -> texture table (requireAsset needs string literals) and creation of textured quads on the unlit face material.
// Must not: hold app state. Icons carry meaning instead of text.

import {RGBA} from "./ProjectPack"

export function iconTexture(name: string): Texture | null {
  switch (name) {
    case "view_in_ar":
      return requireAsset("../Icons/view_in_ar.png") as Texture
    case "build":
      return requireAsset("../Icons/build.png") as Texture
    case "play_arrow":
      return requireAsset("../Icons/play_arrow.png") as Texture
    case "cable":
      return requireAsset("../Icons/cable.png") as Texture
    case "home":
      return requireAsset("../Icons/home.png") as Texture
    case "apps":
      return requireAsset("../Icons/apps.png") as Texture
    case "more_horiz":
      return requireAsset("../Icons/more_horiz.png") as Texture
    case "directions_walk":
      return requireAsset("../Icons/directions_walk.png") as Texture
    case "waving_hand":
      return requireAsset("../Icons/waving_hand.png") as Texture
    case "music_note":
      return requireAsset("../Icons/music_note.png") as Texture
    case "accessibility_new":
      return requireAsset("../Icons/accessibility_new.png") as Texture
    case "hotel":
      return requireAsset("../Icons/hotel.png") as Texture
    case "accessibility":
      return requireAsset("../Icons/accessibility.png") as Texture
    case "favorite":
      return requireAsset("../Icons/favorite.png") as Texture
    case "mood":
      return requireAsset("../Icons/mood.png") as Texture
    case "help":
      return requireAsset("../Icons/help.png") as Texture
    case "sentiment_very_dissatisfied":
      return requireAsset("../Icons/sentiment_very_dissatisfied.png") as Texture
    case "pool":
      return requireAsset("../Icons/pool.png") as Texture
    case "touch_app":
      return requireAsset("../Icons/touch_app.png") as Texture
    case "fitness_center":
      return requireAsset("../Icons/fitness_center.png") as Texture
    case "arrow_back":
      return requireAsset("../Icons/arrow_back.png") as Texture
    case "turn_left":
      return requireAsset("../Icons/turn_left.png") as Texture
    case "turn_right":
      return requireAsset("../Icons/turn_right.png") as Texture
    case "check_circle":
      return requireAsset("../Icons/check_circle.png") as Texture
    case "cancel":
      return requireAsset("../Icons/cancel.png") as Texture
    case "bolt":
      return requireAsset("../Icons/bolt.png") as Texture
    case "sync_alt":
      return requireAsset("../Icons/sync_alt.png") as Texture
    case "settings":
      return requireAsset("../Icons/settings.png") as Texture
    case "pause":
      return requireAsset("../Icons/pause.png") as Texture
    case "save":
      return requireAsset("../Icons/save.png") as Texture
    case "school":
      return requireAsset("../Icons/school.png") as Texture
    case "history":
      return requireAsset("../Icons/history.png") as Texture
    case "star":
      return requireAsset("../Icons/star.png") as Texture
    case "swipe_down":
      return requireAsset("../Icons/swipe_down.png") as Texture
    case "folder_open":
      return requireAsset("../Icons/folder_open.png") as Texture
    case "pets":
      return requireAsset("../Icons/pets.png") as Texture
    case "smart_toy":
      return requireAsset("../Icons/smart_toy.png") as Texture
    case "directions_car":
      return requireAsset("../Icons/directions_car.png") as Texture
    case "back_hand":
      return requireAsset("../Icons/back_hand.png") as Texture
    case "lightbulb":
      return requireAsset("../Icons/lightbulb.png") as Texture
    case "upload_file":
      return requireAsset("../Icons/upload_file.png") as Texture
    case "sentiment_satisfied":
      return requireAsset("../Icons/sentiment_satisfied.png") as Texture
    case "mood_bad":
      return requireAsset("../Icons/mood_bad.png") as Texture
    case "bedtime":
      return requireAsset("../Icons/bedtime.png") as Texture
    case "visibility":
      return requireAsset("../Icons/visibility.png") as Texture
    case "arrow_upward":
      return requireAsset("../Icons/arrow_upward.png") as Texture
    case "arrow_downward":
      return requireAsset("../Icons/arrow_downward.png") as Texture
    case "stop":
      return requireAsset("../Icons/stop.png") as Texture
    case "radar":
      return requireAsset("../Icons/radar.png") as Texture
    case "autorenew":
      return requireAsset("../Icons/autorenew.png") as Texture
    case "pan_tool":
      return requireAsset("../Icons/pan_tool.png") as Texture
    case "sports_mma":
      return requireAsset("../Icons/sports_mma.png") as Texture
    case "thumb_up":
      return requireAsset("../Icons/thumb_up.png") as Texture
    case "radio_button_checked":
      return requireAsset("../Icons/radio_button_checked.png") as Texture
    case "flash_on":
      return requireAsset("../Icons/flash_on.png") as Texture
    case "add_circle":
      return requireAsset("../Icons/add_circle.png") as Texture
    case "swap_horiz":
      return requireAsset("../Icons/swap_horiz.png") as Texture
  }
  return null
}

/** A flat square showing an icon (white glyph, tinted by `color`) facing +Z. `faceMat` = unlit material with Base Texture on. */
export function makeIconQuad(parent: SceneObject, boxMesh: RenderMesh, faceMat: Material, name: string, icon: string, size: number, color: RGBA): {obj: SceneObject; mat: Material} {
  const so = global.scene.createSceneObject(name)
  so.setParent(parent)
  so.getTransform().setLocalScale(new vec3(size, size, 0.04))
  const rmv = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
  rmv.mesh = boxMesh
  const mat = faceMat.clone()
  const tex = iconTexture(icon)
  if (tex !== null) mat.mainPass.baseTex = tex
  mat.mainPass.baseColor = new vec4(color[0], color[1], color[2], color[3])
  mat.mainPass.blendMode = BlendMode.Normal
  mat.mainPass.depthWrite = false
  rmv.mainMaterial = mat
  return {obj: so, mat: mat}
}

export function tintIcon(mat: Material, color: RGBA): void {
  mat.mainPass.baseColor = new vec4(color[0], color[1], color[2], color[3])
}
