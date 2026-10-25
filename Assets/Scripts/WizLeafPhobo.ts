// WizLeafPhobo.ts - LEAF c12: Phobo (companion bot), the menu tab / hide handle / Back, and the table placement.
// Every pinch goes through the real colliders (menu tab, icons, Phobo, the placement table).

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep, findSceneObjectByName} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, getMain, press, ensureProject, enabledInHierarchy} from "./WizLeafHelpers"

@component
export class WizLeafPhobo extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("c12: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const main = getMain()
    main.setPaused(false)
    await ensureProject(main, "forrc-car")
    const phobo = main.phoboControl()

    // ---- Phobo is there, speaks, reacts
    check(!!findSceneObjectByName("Phobo"), "Phobo is in the scene")
    check(!!findSceneObjectByName("PhoboScreen"), "Phobo has its analog-TV screen")
    phobo.say("Test line", 3)
    await sleep(300)
    check(phobo.speaking(), "the dialogue box shows a line")
    await press(it, "phobo_hit", 400)
    expect(phobo.mood).toBe("happy")

    main.toLaunch() // start from the title: Back history begins here
    await sleep(500)

    // ---- menu: tab opens it in a scene, the hide handle closes it, Back goes one step back
    main.enterMode("overview")
    main.menu.openAfter(-1) // cancel a pending auto-open left over from an earlier scenario
    main.menu.closeMenu("test")
    await sleep(700)
    check(enabledInHierarchy("menu_tab"), "the menu tab shows while the menu is closed (open=" + main.menu.isOpen() + " launch=" + main.menu.launchVisible() + " mode=" + main.getDebug().mode + " items=" + main.menu.itemIds().join(",") + ")")
    await press(it, "menu_tab_hit", 900)
    expect(main.menu.isOpen()).toBe(true)
    await press(it, "menu_icon_hide", 900)
    expect(main.menu.isOpen()).toBe(false)
    await sleep(500)
    check(enabledInHierarchy("menu_tab"), "and the tab is back")
    await press(it, "menu_tab_hit", 900)
    await press(it, "menu_icon_lab", 1200)
    expect(main.getDebug().mode).toBe("lab")
    await press(it, "menu_tab_hit", 900)
    await press(it, "menu_icon_back", 1200)
    expect(main.getDebug().mode).toBe("overview")
    await press(it, "menu_tab_hit", 900)
    await press(it, "menu_icon_back", 1200)
    expect(main.getDebug().mode).toBe("launch")

    // ---- Phobo steps aside while driving and returns afterwards
    main.enterMode("lab")
    await sleep(300)
    main.circuitLab().autoWire(true)
    main.enterMode("drive")
    await sleep(700)
    check(phobo.isAside(), "Phobo steps aside in Drive")
    main.enterMode("overview")
    await sleep(500)
    check(!phobo.isAside(), "and comes back")

    // ---- placement: look at the table, pinch it, the workspace lands on the ring
    main.menu.closeMenu("test")
    const root = findSceneObjectByName("3DWiz") as SceneObject
    const before = root.getTransform().getWorldPosition()
    const pl = main.placementControl()
    pl.begin()
    await sleep(500)
    check(pl.isPlacing(), "placement is on")
    check(enabledInHierarchy("PlacePlane"), "the virtual table is shown")
    await press(it, "placehit", 700)
    check(!pl.isPlacing(), "a pinch on the table places the workspace")
    const after = root.getTransform().getWorldPosition()
    check(after.sub(before).length > 5, "the workspace moved onto the ring: " + after.sub(before).length.toFixed(1) + " cm")
    check(pl.hasPlaced(), "placement is remembered")
  }
}
