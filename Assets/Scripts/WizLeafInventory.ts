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
    await press(it, "vizpill_hit_explode", 800)
    check(main.robot.isExploded(), "EXPLODE pulls the parts apart")
  }
}
