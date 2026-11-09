// WizLeafG14.ts - LEAF g14: the AUTO BUILD showcase. The simulated hand builds the whole guide by itself, and the test watches it do so:
// the hand reaches every target (part grabs and wire pins), the in-space outline guide (arrow + target label + pin labels) is visible at each target,
// each placement snaps and goes green, the wire reaches both pins, one deliberate wrong placement shows red and the part returns, the tutorial
// storyboard follows the step, and every showcase widget is inside the camera view.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {check, getMain} from "./WizLeafHelpers"
import {WizGuide} from "./WizGuide"
import {mainCamera} from "./WizPlacement"

@component
export class WizLeafG14 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g14: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private inView(cam: Camera, w: vec3): string {
    const t = cam.getTransform()
    const fwd = t.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
    if (w.sub(t.getWorldPosition()).dot(fwd) <= 1) return "behind the camera"
    const s = cam.worldSpaceToScreenSpace(w)
    if (s.x < 0.02 || s.x > 0.98 || s.y < 0.02 || s.y > 0.98) return "outside the view at (" + s.x.toFixed(2) + ", " + s.y.toFixed(2) + ")"
    return ""
  }

  private async body(): Promise<void> {
    await sleep(1500)
    const g = WizGuide.instance as WizGuide
    if (g.active()) g.leave()
    getMain()
    g.voice.setAuto(false)
    g.enter()
    await sleep(400)
    const cam = mainCamera() as Camera
    const pts = g.showcase.viewPoints()
    for (let i = 0; i < pts.length; i++) {
      const bad = this.inView(cam, pts[i])
      check(bad === "", "showcase widget " + i + " is in view: " + bad)
    }
    g.startDemo()
    // a faster run for the test: x2 (the pace of x1 is for the recording)
    if (g.demoSpeed() === 1) g.cycleDemoSpeed()
    check(g.demoRunning(), "the auto build started")
    let sawArrowOk = false
    let sawGreen = false
    let sawRed = false
    let sawWireLabels = false
    let sawCaption = false
    const t0 = Date.now()
    while (g.phase() !== "built" && Date.now() - t0 < 170000) {
      const st = g.step()
      if (st !== null && g.phase() === "working") {
        if (st.kind === "place" && st.spot && g.showcase.arrowVisible()) {
          const d = g.showcase.arrowEndWorld().sub(g.bench.spotWorldPos(st.spot)).length
          if (d < 4 && g.showcase.targetLabelText().length > 3) sawArrowOk = true
        }
        if (st.kind === "wire" && g.showcase.pinLabelTexts().length === 2) sawWireLabels = true
        if (g.showcase.videoCaption().length > 3) sawCaption = true
      }
      if (g.bench.glowName() === "ok") sawGreen = true
      if (g.bench.isWrongShown()) sawRed = true
      await sleep(80)
    }
    check(g.phase() === "built", "the auto build reached built (phase " + g.phase() + ", step " + g.stepIndex() + ")")
    const r = g.demo.reached
    for (let i = 0; i < g.stepCount(); i++) {
      const st = g.stepAt(i)
      if (st.kind === "place") check(r.indexOf("place:" + st.part) >= 0, "the hand placed " + st.part)
      else {
        const pins = st.pins as [string, string]
        for (let k = 0; k < 2; k++) check(r.indexOf("pin:" + pins[k]) >= 0, "the hand reached wire pin " + pins[k])
      }
    }
    check(g.bench.isPlaced("esp32") && g.bench.isPlaced("l293d"), "esp32 and l293d are placed")
    check(g.demo.stats.wrongShown >= 1 && sawRed, "one deliberate wrong placement was shown red (shown " + g.demo.stats.wrongShown + ")")
    check(sawGreen, "a placement snapped and went green")
    check(sawArrowOk, "the outline guide (arrow + target name) was visible at the target")
    check(sawWireLabels, "both pin names were labelled for a wire step")
    check(sawCaption, "the tutorial storyboard showed the step caption")
    check(g.showcase.progress >= 0.99, "the storyboard progress bar filled: " + g.showcase.progress.toFixed(2))
    check(g.showcase.videoTag().length > 3, "storyboard status: " + g.showcase.videoTag())
    g.stopDemo()
    g.pressPlay()
    check(g.phase() === "play", "Play opens the controller after the build")
    g.restart()
    g.demo.speed = 1
  }
}
