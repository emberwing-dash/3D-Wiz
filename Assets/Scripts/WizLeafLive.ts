// WizLeafLive.ts - MANUAL live Gemini check (not in autoRun lists; needs the key pasted for the session AND the Inspector switch liveAi ON).
// It makes at most 3 distinct calls (intent, step list, ask more), then repeats them to prove the cache (no further call). Logs only statuses,
// latencies and short notes; the key is never printed, echoed or stored.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {check} from "./WizLeafHelpers"
import {WizGuide} from "./WizGuide"
import {SCRIPTED_LINE} from "./GuideVoice"

@component
export class WizLeafLive extends Scenario {
  async run(): Promise<void> {
    const g = WizGuide.instance as WizGuide
    const was = g.liveAi
    try {
      await this.body(g)
    } catch (e) {
      throw new Error("live: " + e)
    } finally {
      g.liveAi = was
    }
  }

  private async body(g: WizGuide): Promise<void> {
    await sleep(1500)
    print("[live] key " + g.keyStatus() + ", model " + g.geminiModel + ", liveAi was " + g.liveAi)
    g.liveAi = true
    const gem = g.geminiClient()
    check(gem.available(), "a key is set")
    const c0 = gem.calls
    const it = await gem.intent(SCRIPTED_LINE)
    print("[live] intent: " + (it ? it.project + " '" + it.search_query + "'" : "null") + " | " + gem.lastNote + " " + gem.lastStatus + " " + gem.lastMs + " ms")
    const pack = await gem.steps("rc-car")
    print("[live] steps: " + (pack ? pack.steps.length + " steps accepted" : "fell back") + " | " + gem.stepsNote + " | " + gem.lastMs + " ms")
    const ans = await gem.ask("ESP32 module", "A Wi-Fi + Bluetooth microcontroller module.")
    print("[live] ask: " + ans.substring(0, 100).replace(/\n/g, " "))
    const c1 = gem.calls
    const t0 = Date.now()
    await gem.intent(SCRIPTED_LINE)
    await gem.steps("rc-car")
    await gem.ask("ESP32 module", "A Wi-Fi + Bluetooth microcontroller module.")
    print("[live] repeat: " + (gem.calls - c1) + " new calls, " + (Date.now() - t0) + " ms total; calls this session " + gem.calls + " (cap " + gem.maxCalls + "), first round " + (c1 - c0))
    check(gem.calls === c1, "the repeat came from the cache: no new network call")
  }
}
