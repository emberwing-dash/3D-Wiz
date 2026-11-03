// WizLeafG3.ts - LEAF g3 (done criterion 3): a wrong connection turns red, the orb speaks the short hint with a caption, and the part
// (or wire end) returns to its previous position. Wrong part, right part on the wrong spot, wire end on a wrong pin, one good end + one wrong.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {check} from "./WizLeafHelpers"
import {freshGuide, doStepAndWait, near} from "./WizLeafGuideHelpers"

@component
export class WizLeafG3 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g3: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    await sleep(1500)
    const g = await freshGuide()
    const b = g.bench
    const st = g.step()!
    // ---- wrong part on the right spot
    const startL = b.partWorldPos("l293d")
    b.simDropPart("l293d", b.spotWorldPos(st.spot as string))
    check(b.glowName() === "wrong", "wrong part: the glow turns red")
    const c = b.glowRgba()
    check(c.x > 0.8 && c.y < 0.4, "red glow colour: " + c.x.toFixed(2) + "," + c.y.toFixed(2) + "," + c.z.toFixed(2))
    check(g.orb.lastHint === st.hint, "the orb speaks the step's hint: " + g.orb.lastHint)
    check(g.orb.caption().replace(/\n/g, " ") === st.hint, "the caption shows the hint: " + g.orb.caption())
    check(g.orb.speaking(), "the orb is speaking")
    await sleep(900)
    check(near(b.partWorldPos("l293d"), startL, 0.3), "the part returned to its previous position: " + b.partWorldPos("l293d").sub(startL).length.toFixed(2) + " cm off")
    check(!b.isPlaced("l293d") && g.stepIndex() === 0, "nothing was placed, still on step 1")
    await sleep(1200) // the red fades back to the cyan guide
    check(b.glowName() === "guide", "the guide comes back after the hint")

    // ---- right part, dropped far from the spot
    const startE = b.partWorldPos("esp32")
    b.simDropPart("esp32", b.spotWorldPos(st.spot as string).add(new vec3(9, 0, 5)))
    check(b.glowName() === "wrong" && g.mistakeCount() === 2, "right part, wrong place: red, mistakes=" + g.mistakeCount())
    await sleep(900)
    check(near(b.partWorldPos("esp32"), startE, 0.3), "the ESP32 went back to the tray")
    check(!b.isPlaced("esp32"), "not placed")
    await sleep(1200)

    // ---- now do steps 1-2 right, then a wrong wire
    await doStepAndWait(g)
    await doStepAndWait(g)
    check(g.stepIndex() === 2, "on the first wire step: " + g.stepIndex())
    const w = g.step()!
    const pins = w.pins as [string, string]
    b.simDropEnd(0, "esp32.IO13") // not a pin of this step
    check(b.glowName() === "wrong", "wire end on a wrong pin: red")
    check(g.orb.lastHint === w.hint && g.orb.caption().replace(/\n/g, " ") === w.hint, "wire hint spoken + captioned: " + g.orb.caption())
    await sleep(900)
    check(b.wireEndsSet() === 0, "the end went back, nothing connected")
    await sleep(1200)
    // one end right, the other wrong: the wrong end returns, the right end stays
    b.simDropEnd(0, pins[0])
    check(b.wireEndsSet() === 1 && g.stepIndex() === 2, "one end set is not enough to finish the step")
    b.simDropEnd(1, "l293d.7")
    check(b.glowName() === "wrong" && b.wireEndsSet() === 1, "second end on a wrong pin: red and returned")
    await sleep(2200)
    check(g.stepIndex() === 2 && g.phase() === "working", "step not completed by a wrong connection")
    // both ends right now: completes
    b.simDropEnd(1, pins[1])
    check(g.phase() === "success", "both endpoints set correctly: success")
  }
}
