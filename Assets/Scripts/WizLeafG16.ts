// WizLeafG16.ts - LEAF g16: the MODEL picker (LOAD MODEL). A real pinch on the next / previous arrow switches the model; the chosen model is fitted,
// split into grabbable parts, works with EXPLODE / ASSEMBLE, and the RC car comes back with the previous arrow.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, getMain, press} from "./WizLeafHelpers"
import {WizGuide} from "./WizGuide"

@component
export class WizLeafG16 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g16: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
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
    await sleep(400)
    g.stopDemo()
    const names = g.modelNames()
    check(names.length >= 2 && names[0] === "RC car", "the picker lists RC car and at least one more model: " + names.join(", "))
    check(g.modelName() === "RC car", "starts on the RC car")
    const rcParts = g.bench.model.parts.length
    await press(it, "show_btn_hit_model_next", 600)
    check(g.modelName() === names[1], "next arrow switched to " + names[1] + " (now " + g.modelName() + ")")
    check(g.bench.model.source === "fbx", "the model is the imported prefab")
    const n = g.bench.model.parts.length
    check(n >= 1, "the model was split into " + n + " grabbable parts")
    g.bench.model.explode()
    await sleep(900)
    check(g.bench.model.isExploded(), "EXPLODE works on the loaded model")
    g.bench.model.assemble()
    await sleep(900)
    check(g.bench.model.isAssembled(), "ASSEMBLE puts it back together")
    const p0 = g.bench.model.worldPos()
    g.bench.model.moveBy(new vec3(2, 1, 0))
    check(g.bench.model.worldPos().sub(p0).length > 1.5, "the whole model can be moved")
    await press(it, "show_btn_hit_model_prev", 600)
    check(g.modelName() === "RC car" && g.bench.model.source === "rc" && g.bench.model.parts.length === rcParts, "previous arrow brings the RC car back")
  }
}
