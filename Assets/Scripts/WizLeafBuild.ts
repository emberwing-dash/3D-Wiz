// WizLeafBuild.ts - LEAF c2: the guided-map build game. Pick up the offered part -> it is identified -> the target region and
// insertion arrow show -> wrong place or wrong orientation springs back (amber) -> right place + right way up snaps; progress
// advances; wiring steps are won by pinching the glowing wires; finishing unlocks Play. Verified through SIK-level drop
// semantics (the same grab / move / release code path as a hand), NOT through the real tracked hand.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {PROJECT_PACK, getPartGuide, shortName} from "./ProjectPack"
import {check, getMain, textOf, openMenu, press, playStep, activeUiKitButtons, ensureProject} from "./WizLeafHelpers"

@component
export class WizLeafBuild extends Scenario {
  async run(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const main = getMain()
    await ensureProject(main, "sesame-quadruped")
    main.setPaused(false)
    main.lockPlay()
    main.toLaunch()
    await sleep(500)
    await openMenu(main)
    main.enterMode("build") // the Build game is not in the menu any more; the scenario enters it directly
    await sleep(600)
    expect(main.getDebug().mode).toBe("build")
    expect(main.getDebug().pick).toBe("frame")
    const steps = PROJECT_PACK.steps
    expect(steps.length).toBe(12)
    check(main.getDebug().hudLabel.indexOf("Frame") === 0 && main.getDebug().hudLabel.indexOf("1/12") > 0, "HUD is a short label + count: '" + main.getDebug().hudLabel + "'")
    expect(activeUiKitButtons()).toBe(0)

    // the part is offered turned the wrong way: amber target, not placed
    expect(main.robot.pickState()).toBe("wrong")
    check(main.robot.pickYawStep() > 0, "offered part starts in the wrong orientation")
    check(!main.robot.isPlacedVisible("frame"), "frame is not in the robot yet")
    const g = getPartGuide("frame")
    check(!!g && g.orientation.length > 0 && g.source.url.indexOf("http") === 0, "the guide pack supplies orientation + source for the part")

    // grab = identify (name + real size in the i card)
    main.robot.simulateDrag(0, 0)
    expect(main.getDebug().pick).toBe("frame")
    check(main.hud.infoVisible(), "grabbing identifies the part (i card)")
    expect(main.hud.infoTexts()[0]).toBe(shortName("frame"))
    check(main.hud.infoTexts()[2].indexOf("cm") >= 0, "real size shown: " + main.hud.infoTexts()[2])
    expect(main.robot.lastWrongReason()).toBe("far") // released at the tray: too far -> springs back
    expect(main.getDebug().pick).toBe("frame")

    // close to the target but the wrong way round: still refused (orientation)
    const d1 = main.robot.pickDeltaWorld()
    main.robot.simulateDrag(d1.x, d1.y)
    expect(main.robot.lastWrongReason()).toBe("orientation")
    check(!main.robot.isPlacedVisible("frame"), "wrong orientation is not accepted")

    // turn it (a plain pinch turns by 90 degrees) until it is right: the guide turns cyan, then release snaps it
    let guard = 0
    while (main.robot.pickYawStep() > 0 && guard++ < 4) main.robot.rotatePick()
    expect(main.robot.pickYawStep()).toBe(0)
    check(["close", "ready"].indexOf(main.robot.pickState()) >= 0, "turned the right way: guide is cyan/green, not amber: " + main.robot.pickState())
    const d2 = main.robot.pickDeltaWorld()
    main.robot.simulateDrag(d2.x, d2.y)
    check(main.robot.isPlacedVisible("frame"), "right place + right way up snaps in")
    await sleep(1400)
    expect(main.getDebug().step).toBe(2)

    // play the rest perfectly: parts snap, wiring steps are won by pinching the glowing wires
    for (let i = 1; i < steps.length; i++) {
      expect(main.getDebug().step).toBe(i + 1)
      await playStep(main, it)
    }
    let waited = 0
    while (!main.getDebug().buildComplete && waited < 4000) {
      await sleep(100)
      waited += 100
    }
    check(main.getDebug().buildComplete, "build complete")
    check(main.getDebug().playUnlocked, "completion unlocks Play")
    check(main.robot.confettiActive(), "celebration burst")
    await openMenu(main)
    check(main.menu.hasItem("play"), "Play icon present")
    void textOf
  }
}
