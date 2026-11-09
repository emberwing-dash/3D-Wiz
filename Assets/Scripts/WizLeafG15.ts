// WizLeafG15.ts - LEAF g15: YOUR TURN. The MODE pill (a real pinch on show_btn_hit_mode) switches from the auto demo to the user's own turn; the same
// outline guide stays; the user's own drops are judged by the same rules: a wrong drop goes red and the part returns, the right drop snaps and goes green.
// Also pauses / steps / changes the speed of the demo with the real pills.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, getMain, press} from "./WizLeafHelpers"
import {WizGuide} from "./WizGuide"

@component
export class WizLeafG15 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g15: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const g = WizGuide.instance as WizGuide
    if (g.active()) g.leave()
    getMain()
    g.voice.setAuto(false)
    g.enter()
    g.startDemo()
    await sleep(600)
    check(g.demoRunning() && !g.demoPaused(), "demo plays by itself")
    await press(it, "show_btn_hit_pause", 300)
    check(g.demoPaused(), "PAUSE holds the demo")
    const i0 = g.stepIndex()
    await sleep(800)
    check(g.stepIndex() === i0, "paused: the step does not move")
    await press(it, "show_btn_hit_speed", 200)
    check(g.demoSpeed() === 2, "SPEED x2")
    await press(it, "show_btn_hit_speed", 200)
    check(g.demoSpeed() === 1, "SPEED x1 again")
    await press(it, "show_btn_hit_step", 200)
    const t0 = Date.now()
    while (g.stepIndex() === i0 && Date.now() - t0 < 60000) await sleep(100)
    await sleep(300)
    check(g.stepIndex() > i0 && g.demoPaused(), "STEP ran one step and held (step " + g.stepIndex() + ")")
    await press(it, "show_btn_hit_mode", 400)
    check(!g.demoRunning() && g.yourTurn(), "MODE switched to YOUR TURN")
    g.restart()
    check(g.stepIndex() === 0 && g.phase() === "working", "YOUR TURN starts at step 1 with the same guide")
    const st = g.stepAt(0)
    const part = st.part as string
    check(g.bench.partGrabbable(part), "the part is a grab target")
    g.bench.simDropPart(part, g.bench.tableToWorld(new vec3(0.2, 0, 2.6)))
    await sleep(150)
    check(g.bench.isWrongShown() && !g.bench.isPlaced(part), "a wrong drop goes red and the part is not placed")
    await sleep(2600)
    check(!g.bench.isPlaced(part) && g.bench.partWorldPos(part).sub(g.bench.spotWorldPos(st.spot as string)).length > 2, "the part returned to the tray")
    g.bench.simDropPart(part, g.bench.spotWorldPos(st.spot as string))
    await sleep(300)
    check(g.bench.isPlaced(part) && g.bench.glowName() === "ok", "the right drop snapped and went green")
    await press(it, "show_btn_hit_mode", 400)
    check(g.demoRunning(), "MODE switches back to DEMO")
    g.stopDemo()
    g.restart()
  }
}
