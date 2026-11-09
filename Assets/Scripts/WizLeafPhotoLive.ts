// WizLeafPhotoLive.ts - LEAF x-photo-live (MANUAL: needs a Gemini key and CircuitGuide > liveAi ON, makes ONE network call). CONVERT PHOTO on MY MODEL:
// the Inspector picture (CircuitGuide > circuitPhoto) is read by Gemini and becomes a guided build with the parts and nets drawn in the picture.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {check} from "./WizLeafHelpers"
import {getGuide} from "./WizLeafGuideHelpers"
import {packForProject} from "./GuideData"

@component
export class WizLeafPhotoLive extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("x-photo-live: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    await sleep(1500)
    const g = getGuide()
    g.enterFromMenu("mymodel")
    await sleep(500)
    const pg = g.myModelPage()
    check(pg !== null, "MY MODEL page exists")
    const before = g.imported.length
    pg!.photo() // the button
    for (let i = 0; i < 60 && pg!.isBusy(); i++) await sleep(500)
    check(!pg!.isBusy(), "the photo read finished: " + pg!.statusText())
    check(g.imported.length === before + 1, "one more circuit in the list: " + g.imported.length + " (status: " + pg!.statusText() + ")")
    const p = packForProject(g.imported[g.imported.length - 1].id)
    check(p.parts.length === 4, "the 4 drawn parts: " + p.parts.map((x) => x.id).join(","))
    check(p.steps.filter((s) => s.kind === "wire").length === 4, "the 4 drawn wires")
    check(pg!.selection().circuit === g.imported[g.imported.length - 1].id, "the new circuit is selected for START BUILD")
  }
}
