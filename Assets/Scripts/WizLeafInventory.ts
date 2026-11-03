// WizLeafInventory.ts - LEAF c14: VISUALIZE = the 3D object with its circuit drawn on it in AR. Wires run between the real pins of the parts on
// the model; the POWER / WIRES / EXPLODE pills (real pinches) toggle the layers.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, getMain, ensureProject, press} from "./WizLeafHelpers"

@component
export class WizLeafInventory extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("c14: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const main = getMain()
    main.setPaused(false)
    await ensureProject(main, "forrc-car")
    main.enterMode("visualize")
    await sleep(900)
    // first visit: the model is put on the table first (look at the table, pinch it)
    const pl = main.placementControl()
    if (!pl.hasPlaced()) {
      check(pl.isPlacing(), "Visualize starts by asking where to put the model")
      await press(it, "placehit", 800)
      check(pl.hasPlaced() && !pl.isPlacing(), "a pinch on the table places the model")
    }
    check(main.arWireCount() >= 5, "the circuit is drawn on the model: " + main.arWireCount() + " wires")
    check(main.vizBarControl().isShown(), "the layer toggles are shown")
    check(!main.arPower(), "power starts off")
    await press(it, "vizpill_hit_power", 600)
    check(main.arPower(), "the POWER pill sends current along the wires")
    await press(it, "vizpill_hit_wires", 500)
    check(!main.vizBarControl().isOn("wires"), "the WIRES pill turns the wires off")
    await press(it, "vizpill_hit_wires", 500)
    // checkpoints: the model leaves its spot and drives to the flags (the RC car has wheels)
    const rt = main.routeControl()
    check(rt.canMove(), "the RC car can travel to checkpoints")
    rt.add(9, -6)
    rt.add(-8, 5)
    check(rt.count() === 2, "two checkpoints dropped")
    const p0 = rt.poseNow()
    rt.go()
    await sleep(2500)
    const p1 = rt.poseNow()
    check(Math.abs(p1.x - p0.x) + Math.abs(p1.z - p0.z) > 3, "the model moved across the table (not in place): " + p1.x.toFixed(1) + "," + p1.z.toFixed(1))
    rt.clear()
    rt.resetPose()
    await press(it, "vizpill_hit_explode", 800)
    check(main.robot.isExploded(), "EXPLODE pulls the parts apart")
  }
}
