// WizLeafG5.ts - LEAF g5 (done criterion 5): after the last step Play appears; pressing it (a real SIK pinch) opens the virtual controller;
// the joystick drives the car; and the servo-hand style sliders drive model parts (checked on the FBX model).

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {findInteractablesByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, press} from "./WizLeafHelpers"
import {freshGuide, doStepAndWait} from "./WizLeafGuideHelpers"

@component
export class WizLeafG5 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g5: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const g = await freshGuide()
    check(findInteractablesByName("guide_play", undefined, true).filter((x: any) => !isNull(x) && x.getSceneObject().isEnabledInHierarchy).length === 0, "no Play button during the build")
    check(!g.controller.isOpen(), "no controller during the build")
    for (let i = 0; i < g.stepCount(); i++) await doStepAndWait(g)
    check(g.phase() === "built", "build complete: " + g.phase())
    check(!g.controller.isOpen(), "controller still hidden before Play")
    await sleep(300)
    // Play: one big pinch
    await press(it, "guide_play", 900)
    check(g.phase() === "play" && g.controller.isOpen(), "Play opened the controller: " + g.phase())
    // joystick: real drag on the knob
    const m = g.bench.model
    const p0 = m.worldPos()
    const stick = findInteractablesByName("ctl_stick", undefined, true).filter((x: any) => !isNull(x) && x.getSceneObject().isEnabledInHierarchy)[0]
    check(!!stick, "joystick is live")
    const dragging = it.drag(stick, new vec3(0, 0.25, 0), 1800) // push forward and hold (a real pinch-drag)
    await sleep(900)
    check(g.controller.v.y > 0.5, "joystick pushed forward by the hand: y=" + g.controller.v.y.toFixed(2))
    check(g.speed() > 3, "car speed from the stick: " + g.speed().toFixed(1))
    check(m.worldPos().sub(p0).length > 2, "the car drove: moved " + m.worldPos().sub(p0).length.toFixed(1) + " cm")
    await dragging
    await sleep(300)
    check(g.controller.v.y < 0.2 || g.controller.v.y === 0, "the stick springs back home on release: y=" + g.controller.v.y.toFixed(2))
    // steering turns the heading, boost is faster
    const f0 = m.forwardWorld()
    g.controller.moveStick(2, 2) // throttle + steer right
    await sleep(900)
    check(m.forwardWorld().sub(f0).length > 0.2, "steering turned the car")
    g.controller.stop()
    g.controller.moveStick(0, 3.5)
    g.controller.v.boost = true
    await sleep(100)
    check(g.speed() >= 15, "boost: speed " + g.speed().toFixed(1))
    g.controller.v.boost = false
    g.controller.stop()
    await sleep(300)
    check(g.controller.v.y === 0 && Math.abs(g.speed()) < 0.5, "stop brings the stick home")

    // servo-hand style: one slider per part drives that part (on the FBX model)
    g.setModelSource("fbx")
    await sleep(800)
    g.openController("servo")
    await sleep(300)
    const nSl = g.controller.v.sliders.length
    check(nSl >= 1, "one slider per movable part: " + nSl)
    const part = g.bench.model.parts[0]
    const r0 = part.obj.getTransform().getLocalRotation()
    g.controller.moveSlider(0, 4.5)
    await sleep(500)
    const r1 = part.obj.getTransform().getLocalRotation()
    check(Math.abs(r1.x - r0.x) + Math.abs(r1.y - r0.y) + Math.abs(r1.z - r0.z) + Math.abs(r1.w - r0.w) > 0.05, "moving the slider turned the part")
    g.setModelSource("rc")
    await sleep(500)
  }
}
