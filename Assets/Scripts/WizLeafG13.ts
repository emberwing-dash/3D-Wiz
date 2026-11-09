// WizLeafG13.ts - LEAF g13: tapping Visualize / Analyse / Build on the REAL title menu opens a page whose content is enabled AND inside the camera view,
// even when the user is looking in another direction (pages are anchored to the camera at the moment of the tap). Each page shows its one-line
// instruction, has BACK TO MENU, and the simulated hand starts by itself (HANDS AUTO on).

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, getMain, press, openMenu} from "./WizLeafHelpers"
import {WizGuide} from "./WizGuide"
import {mainCamera} from "./WizPlacement"

@component
export class WizLeafG13 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g13: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  /** In front of the camera and inside the 0..1 screen rectangle (with a small margin). */
  private inView(cam: Camera, w: vec3): string {
    const t = cam.getTransform()
    const fwd = t.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
    const ahead = w.sub(t.getWorldPosition()).dot(fwd)
    if (ahead <= 1) return "behind the camera (" + ahead.toFixed(1) + " cm ahead)"
    const s = cam.worldSpaceToScreenSpace(w)
    if (s.x < 0.01 || s.x > 0.99 || s.y < 0.01 || s.y > 0.99) return "outside the view at (" + s.x.toFixed(2) + ", " + s.y.toFixed(2) + ")"
    return ""
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const g = WizGuide.instance as WizGuide
    if (g.active()) g.leave()
    g.voice.setAuto(true)
    const main = getMain()
    const cam = mainCamera() as Camera
    for (const [icon, page, pageId] of [["menu_icon_viz3d", "viz", "VISUALIZE"], ["menu_icon_analyse", "analyse", "ANALYSE"], ["menu_icon_build", "build", "BUILD"]]) {
      main.toLaunch()
      await sleep(800)
      await openMenu(main)
      await press(it, icon, 700)
      check(g.active() && g.pageName() === page, pageId + " opened from the real menu: " + g.pageName())
      const pts = g.viewPoints()
      check(pts.length >= 2, pageId + " has view points")
      for (let i = 0; i < pts.length; i++) {
        const bad = this.inView(cam, pts[i])
        check(bad === "", pageId + " content point " + i + " is in view: " + bad)
      }
      if (page === "viz") check(g.viz.root.isEnabledInHierarchy && g.viz.instructionText().length > 10, "VISUALIZE page enabled with its instruction: " + g.viz.instructionText())
      if (page === "analyse") check(g.analyse.root.isEnabledInHierarchy && g.analyse.instructionText().length > 10, "ANALYSE page enabled with its instruction: " + g.analyse.instructionText())
      if (page === "build") check(g.panel.root.isEnabledInHierarchy && g.panel.bodyText().length > 5, "BUILD page enabled with its step instruction: " + g.panel.bodyText())
      await sleep(1200)
      check(g.demoRunning() || (page === "viz" && g.viz.demoRunning) || (page === "analyse" && g.analyse.demoRunning), pageId + ": the simulated hand started by itself")
      g.stopDemo()
      g.viz.stopDemo()
      g.analyse.stopDemo()
      g.exitToMenu()
      await sleep(500)
      check(!g.active() && main.getDebug().mode === "launch", pageId + ": BACK TO MENU returned to the title")
    }

    // the user is looking another way when tapping: the page still opens in front of them
    const t = cam.getTransform()
    const keep = t.getWorldRotation()
    t.setWorldRotation(quat.fromEulerVec(new vec3(0, 2.1, 0))) // about 120 degrees away from the start heading
    for (const page of ["viz", "analyse", "build"] as const) {
      g.voice.setAuto(false)
      g.enterFromMenu(page)
      const pts = g.viewPoints()
      for (let i = 0; i < pts.length; i++) {
        const bad = this.inView(cam, pts[i])
        check(bad === "", page + " opens in front of a user who turned away, point " + i + ": " + bad)
      }
      g.leave()
    }
    t.setWorldRotation(keep)
    g.voice.setAuto(true)
    main.toLaunch()
  }
}
