// WizLeafG7.ts - LEAF g7: the AUTO DEMO. One real pinch on WATCH DEMO starts it; with no further input the simulated hand explodes and reassembles the
// model, carries it through free space, builds all 8 steps (one deliberate mistake: red, hint, part returns), presses Play and drives the car.
// Checks the end state: every step done, Play pressed, the car moved, a mistake shown, and that a real grab takes the demo over.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, press} from "./WizLeafHelpers"
import {freshGuide} from "./WizLeafGuideHelpers"

@component
export class WizLeafG7 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g7: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const g = await freshGuide()
    check(!g.demoRunning(), "no demo before the button")
    await press(it, "guide_btn_hit_demo", 1500)
    check(g.demoRunning(), "WATCH DEMO started the demo")
    const t0 = getTime()
    let sawWrong = false
    let sawMidStep = false
    while (g.demoRunning() && getTime() - t0 < 420) {
      if (g.bench.glowName() === "wrong") sawWrong = true
      if (g.stepIndex() >= 4 && g.stepIndex() < g.stepCount()) sawMidStep = true
      await sleep(250)
    }
    const dur = getTime() - t0
    const s = g.demo.stats
    check(!g.demoRunning(), "the demo ended by itself in " + dur.toFixed(0) + " s")
    check(dur > 90 && dur < 330, "paced for a video, about 3 minutes for the 19-step build: " + dur.toFixed(0) + " s")
    check(s.finished, "the demo script reached its last step")
    check(g.stepIndex() === g.stepCount(), "all " + g.stepCount() + " steps done: idx=" + g.stepIndex())
    check(g.bench.placedCount() === 8 && g.bench.wireDone("s3") && g.bench.wireDone("s8") && g.bench.wireDone("s15") && g.bench.wireDone("s19"), "8 parts placed, wires done: " + g.bench.placedCount())
    check(sawMidStep, "steps advanced one by one")
    check(sawWrong && s.wrongShown >= 1 && g.mistakeCount() >= 1, "one deliberate mistake was shown red: wrong=" + s.wrongShown + " mistakes=" + g.mistakeCount())
    check(g.orb.lastHint !== "", "the orb spoke the hint: " + g.orb.lastHint)
    check(s.exploded, "the model was exploded and reassembled by the hand")
    check(s.modelLiftMax > 6, "the model was carried through free space: lift " + s.modelLiftMax.toFixed(1) + " cm")
    check(s.playPressed && g.phase() === "play", "Play was pressed: " + g.phase())
    check(s.driveDistance > 2, "the car drove with the joystick: " + s.driveDistance.toFixed(1) + " cm")

    // taking over: a real grab (or a click) while the demo runs ends it
    g.restart()
    await sleep(500)
    await press(it, "guide_btn_hit_demo", 800)
    check(g.demoRunning(), "demo started again")
    await sleep(1500)
    await press(it, "guide_btn_hit_demo", 800) // STOP DEMO
    check(!g.demoRunning(), "STOP DEMO ends the demo")
    check(g.phase() === "working", "the guide is usable again: " + g.phase())
    g.setModelSource("rc")
  }
}
