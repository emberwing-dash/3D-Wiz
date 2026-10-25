// WizLeafPlay.ts - LEAF c5: Play = SIMULATED test lab driven by icon items (no buttons). Commands animate the real leg joints and show
// the firmware's OLED face; Pause freezes the simulation and dims the scene; Resume continues.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, getMain, openMenu, press, activeUiKitButtons, ensureProject} from "./WizLeafHelpers"

@component
export class WizLeafPlay extends Scenario {
  async run(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const main = getMain()
    await ensureProject(main, "sesame-quadruped")
    main.setPaused(false)
    main.lockPlay()
    main.enterMode("overview") // Play lives in the scene menu (Upload / Play / Wire up / Back), not on the title screen
    await sleep(500)
    await openMenu(main)
    await press(it, "menu_icon_play", 900)
    expect(main.getDebug().mode).toBe("test")
    expect(activeUiKitButtons()).toBe(0)
    check(main.menu.hasItem("wave") && main.menu.hasItem("walk") && main.menu.hasItem("more"), "command icons are shown")
    expect(main.robot.currentFace()).toBe("rest")
    const scr = main.robot.oledScreen()
    check(scr.litPixels() > 100, "real face bitmap shown")

    await press(it, "menu_icon_wave", 500)
    expect(main.getDebug().labCommand).toBe("wave")
    expect(main.robot.currentFace()).toBe("wave")
    let min = 999
    let max = -999
    for (let i = 0; i < 14; i++) {
      await sleep(250)
      const a = main.robot.getAngle("L3")
      min = Math.min(min, a)
      max = Math.max(max, a)
    }
    check(max - min > 60, "the L3 leg joint swings while waving: " + min.toFixed(0) + ".." + max.toFixed(0))
    // the Play menu shows at most 5 commands per page (Spectacles sizing): press() pages through the more icon to reach stand
    await press(it, "menu_icon_stand", 1500)
    check(main.robot.getDebug().lift > 2, "stand raises the body: " + main.robot.getDebug().lift.toFixed(2))

    // the "more" icon pages through the other firmware commands
    await press(it, "menu_icon_more", 700)
    check(main.menu.hasItem("freaky"), "second page of commands")
    await press(it, "menu_icon_dead", 500)
    expect(main.robot.currentFace()).toBe("dead")

    // pause freezes the simulation and dims the scene; resume continues
    await openMenu(main)
    main.setPaused(true)
    await sleep(500)
    expect(main.getDebug().paused).toBe(true)
    check(main.hud.isDimmed(), "pause dims the scene")
    const a0 = main.robot.getAngle("L3")
    main.getLab().run("wave")
    await sleep(1200)
    check(Math.abs(main.robot.getAngle("L3") - a0) < 0.5, "the simulation is frozen while paused")
    main.setPaused(false)
    await sleep(1200)
    check(!main.hud.isDimmed(), "resume undims")
  }
}
