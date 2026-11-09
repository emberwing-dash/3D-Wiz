// WizLeafG17.ts - LEAF g17: the auto showcase of the VISUALIZE and ANALYSE pages. Each shows a live status line ("AUTO DEMO 3 / 11: ...") and a floating
// label at the place the hand is working on; PAUSE really freezes the demo, SPEED x2 / x1 changes its time scale, neither ends the demo, and TAKE OVER
// ends it and puts the controls back to PAUSE / x1. All pills are pressed with real pinches.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, press} from "./WizLeafHelpers"
import {WizGuide} from "./WizGuide"

@component
export class WizLeafG17 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g17: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async until(f: () => boolean, maxMs: number): Promise<boolean> {
    const t0 = Date.now()
    while (!f() && Date.now() - t0 < maxMs) await sleep(100)
    return f()
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const g = WizGuide.instance as WizGuide
    if (g.active()) g.leave()

    // ---------------------------------------------------------------- ANALYSE
    g.enterAnalyse()
    await sleep(800)
    const a = g.analyse
    if (a.demoRunning) a.stopDemo()
    await press(it, "an_hit_demo", 500)
    check(a.demoRunning, "ANALYSE: the demo runs")
    check(await this.until(() => a.statusText().indexOf("1 / 8") >= 0, 9000), "ANALYSE: the status line names the first part: " + a.statusText())
    check(a.tapLabelText().indexOf("tap the i") >= 0, "ANALYSE: a floating label shows where the hand taps: " + a.tapLabelText())
    await press(it, "an_hit_pause", 300)
    check(a.demoPaused() && a.demoRunning, "ANALYSE: PAUSE holds the demo but does not end it")
    const frozen = a.statusText() + "|" + a.openPart()
    await sleep(2600)
    check(a.statusText() + "|" + a.openPart() === frozen && a.demoRunning, "ANALYSE: nothing moves while paused: " + frozen)
    await press(it, "an_hit_speed", 200)
    check(a.demoSpeed() === 2 && a.demoRunning, "ANALYSE: SPEED x2")
    await press(it, "an_hit_speed", 200)
    check(a.demoSpeed() === 1, "ANALYSE: SPEED x1 again")
    await press(it, "an_hit_pause", 300)
    check(!a.demoPaused(), "ANALYSE: RESUME")
    check(await this.until(() => a.statusText().indexOf("2 / 8") >= 0, 30000), "ANALYSE: the demo went on to the second part: " + a.statusText())
    await press(it, "an_hit_demo", 500) // TAKE OVER
    check(!a.demoRunning && !a.demoPaused() && a.demoSpeed() === 1 && a.statusText() === "" && a.tapLabelText() === "", "ANALYSE: TAKE OVER ends the demo and resets the controls")
    g.leave()

    // ---------------------------------------------------------------- VISUALIZE
    await sleep(500)
    g.enterViz()
    await sleep(800)
    const v = g.viz
    if (v.demoRunning) v.stopDemo()
    await press(it, "viz_hit_demo", 500)
    check(v.demoRunning, "VISUALIZE: the demo runs")
    check(await this.until(() => v.statusText().indexOf("1 / 11") >= 0, 12000), "VISUALIZE: the status line names the first part: " + v.statusText())
    check(v.targetText().indexOf("goes here") >= 0, "VISUALIZE: a floating label shows where the part goes: " + v.targetText())
    await press(it, "viz_hit_pause", 300)
    check(v.demoPaused() && v.demoRunning, "VISUALIZE: PAUSE holds the demo but does not end it")
    const n0 = v.attachedCount()
    const s0 = v.statusText()
    await sleep(2600)
    check(v.attachedCount() === n0 && v.statusText() === s0 && v.demoRunning, "VISUALIZE: nothing moves while paused (attached " + n0 + ")")
    await press(it, "viz_hit_speed", 200)
    check(v.demoSpeed() === 2, "VISUALIZE: SPEED x2")
    await press(it, "viz_hit_pause", 300)
    check(!v.demoPaused(), "VISUALIZE: RESUME")
    check(await this.until(() => v.attachedCount() >= 1, 30000), "VISUALIZE: the hand attached its first part at x2: " + v.attachedCount())
    await press(it, "viz_hit_demo", 500) // TAKE OVER
    check(!v.demoRunning && !v.demoPaused() && v.demoSpeed() === 1 && v.statusText() === "" && v.targetText() === "", "VISUALIZE: TAKE OVER ends the demo and resets the controls")
    g.leave()
  }
}
