// WizLeafG1.ts - LEAF g1 (done criterion 1): load a model (RC car parts and the user's FBX), pull its parts apart, put them back
// together, and place the model anywhere in space with a grab (a real SIK drag through the LEAF hand interactor).

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {findInteractablesByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, press} from "./WizLeafHelpers"
import {freshGuide} from "./WizLeafGuideHelpers"
import {WizGuide} from "./WizGuide"

function spread(g: WizGuide): number {
  const m = g.bench.model
  let mx = 0
  for (const p of m.parts) mx = Math.max(mx, p.obj.getTransform().getLocalPosition().sub(p.home).length)
  return mx
}

@component
export class WizLeafG1 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g1: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const g = await freshGuide()
    const m = g.bench.model
    // ---- the RC car is on the table, split into its printed parts, assembled
    check(m.source === "rc" && m.parts.length >= 6, "RC car split into parts: " + m.parts.length)
    check(m.isAssembled() && !m.isExploded(), "starts assembled")
    // ---- pull apart with the real EXPLODE pinch
    await press(it, "guide_btn_hit_explode", 1200)
    check(m.isExploded(), "explode pinch")
    check(spread(g) > 2.5, "parts are pulled apart: max offset " + spread(g).toFixed(1) + " cm")
    check(!m.isAssembled(), "not assembled while exploded")
    // ---- a single part can be pulled away and snaps back near its slot
    const w = m.parts.filter((p) => p.id === "wheel_fr")[0]
    const far = w.home.add(new vec3(6, 3, 0))
    m.simDragPart("wheel_fr", far)
    await sleep(500)
    check(w.obj.getTransform().getLocalPosition().sub(far).length < 0.5, "a dropped part stays where it was dropped")
    m.simDragPart("wheel_fr", w.home.add(new vec3(0.6, 0, 0)))
    await sleep(600)
    check(w.obj.getTransform().getLocalPosition().sub(w.home).length < 0.3, "a part dropped near its slot snaps back")
    // ---- put back together with the real ASSEMBLE pinch
    await press(it, "guide_btn_hit_assemble", 1500)
    check(m.isAssembled() && !m.isExploded(), "reassembled: all parts home")
    // ---- grab the model and place it in free space (real SIK drag on the model grab target)
    const p0 = m.worldPos()
    const grab = findInteractablesByName("guide_model_grab", undefined, true).filter((x: any) => !isNull(x) && x.getSceneObject().isEnabledInHierarchy)[0]
    check(!!grab, "the model grab target is live")
    await it.drag(grab, new vec3(0.6, 0.35, 0), 900)
    await sleep(300)
    const p1 = m.worldPos()
    check(p1.sub(p0).length > 3, "a mouse / pinch grab moved the model by " + p1.sub(p0).length.toFixed(1) + " cm")
    // free space: well above the table, away from it (programmatic grab path = same moveBy as the drag)
    m.moveBy(new vec3(0, 20, 12))
    const p2 = m.worldPos()
    check(p2.y - p1.y > 10, "the model floats in free space, above the table: dy=" + (p2.y - p1.y).toFixed(1))
    m.moveBy(p0.sub(p2)) // put it back on the table for the next tests
    await sleep(300)

    // ---- the same with the imported FBX model
    g.setModelSource("fbx")
    await sleep(900)
    const f = g.bench.model
    check(f.source === "fbx" && f.parts.length >= 1, "FBX loaded and split into parts: " + f.parts.length + " (" + f.note + ")")
    f.explode()
    await sleep(900)
    check(spread(g) > 1, "FBX parts pulled apart: " + spread(g).toFixed(1) + " cm")
    f.assemble()
    await sleep(900)
    check(f.isAssembled(), "FBX reassembled")
    const q0 = f.worldPos()
    f.moveBy(new vec3(5, 4, 0))
    check(f.worldPos().sub(q0).length > 4, "FBX placed elsewhere")
    g.setModelSource("rc")
    await sleep(500)
  }
}
