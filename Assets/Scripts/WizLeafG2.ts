// WizLeafG2.ts - LEAF g2 (done criterion 2): at each step the Lens shows the component + wires with glow on the exact drop spot / pins,
// and the steps are the ones in the saved step list. Walks every step perfectly and checks the panel text and the glow targets each time.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {check} from "./WizLeafHelpers"
import {freshGuide, doStepAndWait, near} from "./WizLeafGuideHelpers"

@component
export class WizLeafG2 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g2: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    await sleep(1500)
    const g = await freshGuide()
    check(g.stepCount() === 8, "saved step list has 8 steps: " + g.stepCount())
    for (let i = 0; i < g.stepCount(); i++) {
      check(g.stepIndex() === i && g.phase() === "working", "step " + (i + 1) + " is current: idx=" + g.stepIndex() + " phase=" + g.phase())
      const st = g.stepAt(i)
      check(g.panel.titleText() === st.title, "panel shows the step: " + g.panel.titleText())
      check(g.panel.bodyText().replace(/\n/g, " ") === st.text, "panel words: " + g.panel.bodyText())
      const c = g.bench.glowRgba()
      check(c.z > 0.8 && c.x < 0.5, "the guide glow is cyan: " + c.x.toFixed(2) + "," + c.y.toFixed(2) + "," + c.z.toFixed(2))
      if (st.kind === "place") {
        check(g.bench.glowSpots().length === 1 && g.bench.glowSpots()[0] === st.spot, "glow on exactly the drop spot " + st.spot + ": " + g.bench.glowSpots().join(","))
        check(g.bench.glowPins().length === 0, "no pin glow on a placement step")
        const sp = g.bench.spotWorldPos(st.spot as string)
        check(near(g.bench.spotGlowWorld(st.spot as string), sp, 0.3), "the glow sits on the spot")
        check(g.bench.partGrabbable(st.part as string), "the part to place can be grabbed")
      } else {
        const want = (st.pins as [string, string]).slice().sort().join("+")
        const got = g.bench.glowPins().sort().join("+")
        check(got === want, "glow on exactly the two pins " + want + ", got " + got)
        check(g.bench.glowSpots().length === 0, "no spot glow on a wire step")
      }
      await doStepAndWait(g)
    }
    check(g.phase() === "built", "after the last step the build is done: " + g.phase())
    check(g.bench.glowPins().length === 0 && g.bench.glowSpots().length === 0, "no glow left after the last step")
    check(g.bench.placedCount() === 3, "3 parts placed")
  }
}
