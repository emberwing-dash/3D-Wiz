// WizLeafKeySrc.ts - MANUAL: prints the LENGTH of each key source (Inspector, .env module). Never the value.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {WizGuide} from "./WizGuide"

@component
export class WizLeafKeySrc extends Scenario {
  async run(): Promise<void> {
    await sleep(1200)
    const g = WizGuide.instance as WizGuide
    const k = g.keySources()
    print("[keysrc] Inspector: " + (k.inspector > 0 ? "set, " + k.inspector + " chars" : "empty") + " | .env module: " + (k.local > 0 ? "set, " + k.local + " chars" : "empty") + " | in use: " + g.keyStatus() + " | client available: " + g.geminiClient().available())
  }
}
