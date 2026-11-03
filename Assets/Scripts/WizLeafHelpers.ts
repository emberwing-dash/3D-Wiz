// WizLeafHelpers.ts - shared helpers for the 3D Wiz LEAF scenarios (test code only).
// Owns: finding WizMain, pressing SIK interactables by name, reading Text by object name, baseline reset, a scene scan for UIKit
//       buttons, and a "perfect player" for one build step.
// Must not: contain assertions about the app (scenarios do that) or any app logic.

import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {findInteractablesByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {WizMain} from "./WizMain"
import {PROJECT_PACK, BUILD_PLAN} from "./ProjectPack"
import {WizGuide} from "./WizGuide"

export function getMain(): WizMain {
  // the Circuit Guide sleeps the old lab; a lab scenario wakes it again (run lab scenarios with WizGuide.startMode = lab for a clean start)
  if (WizGuide.instance !== null && WizGuide.instance.active()) WizGuide.instance.leave()
  const so = findSceneObjectByName("3DWiz")
  if (!so) throw new Error('SceneObject "3DWiz" not found')
  const m = so.getComponent(WizMain.getTypeName()) as WizMain
  if (isNull(m)) throw new Error("WizMain component not found on 3DWiz")
  return m
}

/** Anything with trigger(): DefaultLeafInteractor or the IK interactor. */
export interface Presser {
  trigger(target: any, ...rest: any[]): Promise<void>
}

export async function press(it: Presser, name: string, settleMs: number = 300): Promise<void> {
  const find = (n: string) => findInteractablesByName(n, undefined, true).filter((x: any) => !isNull(x) && !isNull(x.getSceneObject()))
  let all = findInteractablesByName(name, undefined, true)
  let live = find(name)
  // the icon menu shows at most 7 icons: if the icon is on another page, pinch the "more" icon until its page is up
  for (let page = 0; live.length === 0 && name.indexOf("menu_icon_") === 0 && name !== "menu_icon_menu_more" && name !== "menu_icon_more" && page < 6; page++) {
    const more = find("menu_icon_menu_more")[0] || find("menu_icon_more")[0] // main menu pages: menu_more; the Play menu keeps its own more icon
    if (!more) break
    await it.trigger(more)
    await sleep(900)
    all = findInteractablesByName(name, undefined, true)
    live = find(name)
  }
  const target = live[0]
  if (!target) throw new Error('Interactable "' + name + '" not found or not enabled (' + all.length + " stale)")
  try {
    await it.trigger(target)
  } catch (e) {
    throw new Error("trigger " + name + " failed: " + e)
  }
  await sleep(settleMs)
}

export function textOf(objectName: string): string {
  const so = findSceneObjectByName(objectName)
  if (!so) throw new Error('SceneObject "' + objectName + '" not found')
  const t = so.getComponent("Component.Text") as Text
  if (isNull(t)) throw new Error('No Text on "' + objectName + '"')
  return t.text
}

export function enabledInHierarchy(objectName: string): boolean {
  const so = findSceneObjectByName(objectName)
  return !!so && so.isEnabledInHierarchy
}

/** Number of ENABLED UIKit Button components anywhere in the scene. */
export function activeUiKitButtons(): number {
  let n = 0
  const walk = (so: SceneObject) => {
    if (so.isEnabledInHierarchy) {
      const b = so.getComponent(Button.getTypeName())
      if (!isNull(b) && b) n++
    }
    for (let i = 0; i < so.getChildrenCount(); i++) walk(so.getChild(i))
  }
  const roots = global.scene.getRootObjectsCount()
  for (let i = 0; i < roots; i++) walk(global.scene.getRootObject(i))
  return n
}

/** Make sure `id` is the loaded project (the original scenarios assume the Sesame Quadruped; the project scenarios load the others). */
export async function ensureProject(main: WizMain, id: string): Promise<void> {
  if (main.projectId() !== id) {
    main.loadProject(id)
    await sleep(900)
  }
}

/** AR overview with Play unlocked (scenarios that do not play the build use this). */
export async function baseline(it: Presser): Promise<WizMain> {
  const main = getMain()
  await ensureProject(main, "sesame-quadruped")
  main.setPaused(false)
  main.unlockPlay()
  main.enterMode("overview")
  await sleep(400)
  return main
}

export function check(cond: boolean, message: string): void {
  if (!cond) throw new Error("ASSERT: " + message)
}

export function dist(a: vec3, b: vec3): number {
  return a.sub(b).length
}

/** Open the SAO menu the way the preview fallback does and wait until the icons are up. */
export async function openMenu(main: WizMain): Promise<void> {
  main.menu.openMenu("test")
  await sleep(900)
}

/** One build step played perfectly through the real game rules (turn, carry, drop / pinch the glowing wire). */
export async function playStep(main: WizMain, it: Presser): Promise<void> {
  const d = main.getDebug()
  const s = PROJECT_PACK.steps[d.step - 1]
  if (s.wires.length > 0) {
    for (const w of s.wires) await press(it, "whit_" + w, 250)
  } else {
    let guard = 0
    while (main.robot.pickYawStep() > 0 && guard++ < 4) main.robot.rotatePick()
    const delta = main.robot.pickDeltaWorld()
    main.robot.simulateDrag(delta.x, delta.y)
  }
  await sleep(1300)
  void BUILD_PLAN
}
