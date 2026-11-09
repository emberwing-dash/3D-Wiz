// WizLeafG4.ts - LEAF g4 (done criterion 4): a correct step glows green and the next step starts by itself (no Next button), with the
// narration continuing. Also: narration holds while the user works and carries on when the step is complete.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {findInteractablesByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {check} from "./WizLeafHelpers"
import {freshGuide, doStep} from "./WizLeafGuideHelpers"

@component
export class WizLeafG4 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g4: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    await sleep(1500)
    const g = await freshGuide()
    const s1 = g.stepAt(0)
    const s2 = g.stepAt(1)
    // the step intro is narrated (caption = the transcript line)
    check(g.orb.caption().replace(/\n/g, " ") === s1.say, "step 1 narration captioned: " + g.orb.caption())
    // narration holds while the user works
    g.orb.hold(true)
    g.orb.say("QUEUED LINE")
    await sleep(2500)
    check(g.orb.caption().replace(/\n/g, " ") !== "QUEUED LINE", "narration is on hold while the user works")
    check(g.orb.isHeld(), "hold is on")
    // correct step
    doStep(g)
    check(g.phase() === "success", "correct placement: success phase")
    const c = g.bench.glowRgba()
    check(c.y > 0.8 && c.x < 0.5 && c.z < 0.7, "green glow: " + c.x.toFixed(2) + "," + c.y.toFixed(2) + "," + c.z.toFixed(2))
    check(!g.orb.isHeld(), "narration carries on when the step is complete")
    // the line being spoken finishes first (about 0.06 s per character), then the queued lines go on
    for (let w = 0; w < 100 && !g.orb.log.some((l) => l === "say: " + s1.after); w++) await sleep(100)
    check(g.orb.log.some((l) => l === "say: " + s1.after) || g.orb.caption().replace(/\n/g, " ") === s1.after || g.orb.log.some((l) => l === "say: QUEUED LINE"), "narration carried on after the step: " + g.orb.log.join(" / "))
    // next step starts by itself
    await sleep((g.successHoldS + 0.4) * 1000)
    check(g.stepIndex() === 1 && g.phase() === "working", "the next step started on its own: idx=" + g.stepIndex())
    check(g.panel.titleText() === s2.title, "panel moved to step 2: " + g.panel.titleText())
    check(g.bench.glowSpots()[0] === s2.spot, "glow moved to the next spot")
    await sleep(9000) // the queued line, the 'after' line and the step 2 intro play out
    check(g.orb.log.some((l) => l === "say: " + s1.after), "the 'after' narration line of step 1 was spoken: " + g.orb.log.join(" / "))
    check(g.orb.log.some((l) => l === "say: " + s2.say), "step 2 narration spoken: " + g.orb.log.join(" / "))
    // no Next button anywhere
    for (const n of ["next", "guide_next", "btn_next", "guide_btn_next"]) {
      check(findInteractablesByName(n, undefined, true).length === 0, "no '" + n + "' control exists")
    }
  }
}
