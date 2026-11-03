// WizLeafG6.ts - LEAF g6: the 3D Wiz main menu offers exactly VISUALIZE / ANALYSE / BUILD. Real pinches on the icons route to each page and every page
// has a way back to the main menu (MENU pills). The earlier Lab, Library and Visualize stay reachable from the BUILD page pills.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep, findSceneObjectByName} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, getMain, press, openMenu} from "./WizLeafHelpers"
import {WizGuide} from "./WizGuide"

@component
export class WizLeafG6 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g6: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const g = WizGuide.instance as WizGuide
    if (g.active()) g.leave()
    g.voice.setAuto(false) // the page routes are tested here; the hands have their own scenarios
    await sleep(500)
    const main = getMain()
    main.setPaused(false)
    main.toLaunch()
    await sleep(600)
    await openMenu(main)
    const ids = main.menu.itemIds().filter((i) => i !== "continue")
    check(ids.length === 3 && ids.indexOf("viz3d") >= 0 && ids.indexOf("analyse") >= 0 && ids.indexOf("build") >= 0, "the main menu is exactly Visualize / Analyse / Build: " + ids.join(","))
    const root = findSceneObjectByName("3DWiz")
    check(!!root && root.isEnabledInHierarchy && !g.active(), "the original 3D Wiz is showing, the pages are asleep")

    // BUILD
    await press(it, "menu_icon_build", 1200)
    check(g.active() && g.pageName() === "build" && g.phase() === "working", "BUILD opened the Circuit Guide: " + g.pageName() + " " + g.phase())
    check(!root!.enabled, "the original 3D Wiz sleeps while a page runs")
    check(!!findSceneObjectByName("guide_btn_hit_old_lab") && !!findSceneObjectByName("guide_btn_hit_old_library") && !!findSceneObjectByName("guide_btn_hit_old_view"), "OLD LAB / LIBRARY / OLD VIEW pills exist")
    await press(it, "guide_btn_hit_menu", 1500)
    check(!g.active() && root!.enabled && main.getDebug().mode === "launch", "MENU returned to the main menu from BUILD")
    await openMenu(main)

    // VISUALIZE
    await press(it, "menu_icon_viz3d", 1500)
    check(g.active() && g.pageName() === "viz", "VISUALIZE opened its page: " + g.pageName())
    await press(it, "viz_hit_menu", 1500)
    check(!g.active() && main.getDebug().mode === "launch", "MENU returned to the main menu from VISUALIZE")
    await openMenu(main)

    // ANALYSE
    await press(it, "menu_icon_analyse", 1500)
    check(g.active() && g.pageName() === "analyse", "ANALYSE opened its page: " + g.pageName())
    await press(it, "an_hit_menu", 1500)
    check(!g.active() && main.getDebug().mode === "launch", "MENU returned to the main menu from ANALYSE")
    await openMenu(main)

    // the old Lab and old Visualize through the BUILD pills, each with its own Back
    await press(it, "menu_icon_build", 1200)
    await press(it, "guide_btn_hit_old_lab", 1500)
    check(!g.active() && (main.getDebug().mode === "lab" || main.getDebug().mode === "circuit"), "OLD LAB opened the Circuit Lab: " + main.getDebug().mode)
    await openMenu(main)
    check(main.menu.hasItem("back"), "the Lab has its Back icon")
    await press(it, "menu_icon_back", 1500)
    check(main.getDebug().mode === "launch", "Lab Back returned to the main menu")
    await openMenu(main)
    await press(it, "menu_icon_build", 1200)
    await press(it, "guide_btn_hit_old_view", 1500)
    check(main.getDebug().mode === "visualize", "OLD VIEW opened the old Visualize: " + main.getDebug().mode)
    await openMenu(main)
    await press(it, "menu_icon_back", 1500)
    check(main.getDebug().mode === "launch", "Visualize Back returned to the main menu")
    g.voice.setAuto(true)
    await openMenu(main)
    await sleep(2000)
  }
}
