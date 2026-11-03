// WizLeafG11.ts - LEAF g11: BUILD from the main menu with HANDS AUTO on: a real pinch on the BUILD icon opens the Circuit Guide and the simulated hand
// starts tinkering (picking parts and wiring) on its own; a stop takes over.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, getMain, press, openMenu} from "./WizLeafHelpers"
import {WizGuide} from "./WizGuide"

@component
export class WizLeafG11 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g11: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const g = WizGuide.instance as WizGuide
    if (g.active()) g.leave()
    g.voice.setAuto(true)
    const main = getMain()
    main.toLaunch()
    await sleep(800)
    await openMenu(main)
    await press(it, "menu_icon_build", 1500)
    check(g.active() && g.pageName() === "build", "BUILD opened the Circuit Guide")
    check(g.demoRunning(), "HANDS AUTO is on: the simulated hand started working by itself")
    const t0 = getTime()
    while (g.stepIndex() < 3 && getTime() - t0 < 90) await sleep(300)
    check(g.stepIndex() >= 3, "the hand is building: step " + (g.stepIndex() + 1))
    g.stopDemo()
    check(!g.demoRunning(), "stop takes over")
    g.leave()
  }
}
