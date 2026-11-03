// WizLeafLiveE2E.ts - MANUAL live end-to-end check (needs the key pasted for the session and liveAi ON; not in any autoRun list).
// Voice flow -> search -> okay with the instant path while Gemini works in the background; AI badge; ANALYSE ask more; cache and call cap.
// Logs only statuses, latencies and counts. The key is never printed, echoed or stored.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, getMain, press} from "./WizLeafHelpers"
import {WizGuide} from "./WizGuide"
import {SCRIPTED_LINE} from "./GuideVoice"

@component
export class WizLeafLiveE2E extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("live-e2e: " + e)
    }
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const g = WizGuide.instance as WizGuide
    const gem = g.geminiClient()
    print("[e2e] key " + g.keyStatus() + ", liveAi " + g.liveAi + ", model " + g.geminiModel)
    check(g.liveAi && gem.available(), "live AI is on with a key")
    if (g.active() || g.voice.stage !== "idle") {
      g.stopDemo()
      g.voice.close()
      g.leave()
    }
    const main = getMain()
    main.toLaunch()
    await sleep(900)
    g.voice.setAuto(false)
    const c0 = gem.calls

    // voice -> search: instant path, Gemini only in the background
    let t = Date.now()
    g.voice.micTap()
    const tListen = Date.now() - t
    while (g.voice.stage !== "search" && Date.now() - t < 3000) await sleep(20)
    const tSearch = Date.now() - t
    print("[e2e] mic tap -> listening " + tListen + " ms; -> search page " + tSearch + " ms; intent source " + g.voice.intentSource + "; background calls started: " + (gem.calls - c0))
    check(tSearch < 1000 && g.voice.stage === "search", "search page within 1 s")

    // the UI stays instant while the calls are in flight
    g.perfReset()
    const lat: number[] = []
    for (const ch of ["r", "c", " "]) {
      t = Date.now()
      g.voice.typeChar(ch)
      lat.push(Date.now() - t)
      await sleep(150)
    }
    print("[e2e] typing while Gemini is working: " + lat.join(", ") + " ms per key")
    check(Math.max(...lat) < 100, "typing stays instant during the background calls")
    // wait for the cache (the AI badge)
    const w0 = Date.now()
    while (g.voice.aiBadgeText() === "" && Date.now() - w0 < 60000) await sleep(250)
    const p = g.perfSnapshot()
    print("[e2e] AI badge '" + g.voice.aiBadgeText() + "' after " + Math.round((Date.now() - w0) / 100) / 10 + " s; frame time while waiting: avg " + p.avgMs.toFixed(0) + " ms, max " + p.maxMs.toFixed(0) + " ms; last call " + gem.lastNote + " " + gem.lastStatus + " " + gem.lastMs + " ms; calls so far " + (gem.calls - c0))
    check(g.voice.aiBadgeText() === "AI ready", "the AI ready badge appeared")
    // pick + okay: still instant, and now uses the cached AI step list
    g.voice.backspace()
    g.voice.backspace()
    g.voice.backspace()
    t = Date.now()
    g.voice.pickCard(0)
    const tCard = Date.now() - t
    t = Date.now()
    g.voice.okay()
    const tOk = Date.now() - t
    print("[e2e] RC Car -> okay card " + tCard + " ms; OKAY -> Guide " + tOk + " ms; step list source: " + g.voice.stepsSource + " (" + g.packSource() + ", " + g.stepCount() + " steps)")
    check(g.active() && g.pageName() === "build" && tOk < 1000, "Guide started instantly")
    g.stopDemo()
    g.leave()
    await sleep(500)

    // ANALYSE: ASK MORE through the real button, UI not blocked
    g.enterAnalyse()
    await sleep(800)
    g.analyse.open("esp32")
    check(g.analyse.askShown(), "ASK MORE is offered (live AI on)")
    g.perfReset()
    const cAsk = gem.calls
    t = Date.now()
    await press(it, "guide_an_hit_ask", 100)
    print("[e2e] ASK MORE pressed: button shows '" + g.analyse.askLabel() + "' after " + (Date.now() - t) + " ms (cached answer would already be there); new calls " + (gem.calls - cAsk))
    const a0 = Date.now()
    while (g.analyse.cardBodyText().indexOf("GEMINI") < 0 && Date.now() - a0 < 25000) await sleep(100)
    const p2 = g.perfSnapshot()
    const body = g.analyse.cardBodyText()
    const ans = body.indexOf("GEMINI") >= 0 ? body.substring(body.indexOf("GEMINI")).replace(/\n/g, " ").substring(0, 110) : "NO ANSWER"
    print("[e2e] answer after " + (Date.now() - a0) + " ms; frame max while waiting " + p2.maxMs.toFixed(0) + " ms; new calls " + (gem.calls - cAsk) + " | " + ans)
    check(body.indexOf("GEMINI") >= 0, "the answer arrived on the card")
    g.leave()

    // cache + cap
    const cc = gem.calls
    t = Date.now()
    const r: string[] = []
    let n = gem.calls
    await gem.intent(SCRIPTED_LINE)
    r.push("intent " + (gem.calls - n))
    n = gem.calls
    await gem.steps("rc-car")
    r.push("steps " + (gem.calls - n))
    n = gem.calls
    await gem.ask("ESP32 module", "A Wi-Fi + Bluetooth microcontroller module.")
    r.push("ask " + (gem.calls - n))
    print("[e2e] new calls per repeated request: " + r.join(", "))
    print("[e2e] repeated requests: " + (gem.calls - cc) + " new calls, " + (Date.now() - t) + " ms")
    check(gem.calls === cc, "repeats come from the cache")
    const keepMax = gem.maxCalls
    gem.maxCalls = gem.calls // pretend the cap is reached: a NEW request must be refused without any network call
    let refused = "no error"
    try {
      await gem.ask("Zeta part", "an unrelated new request")
    } catch (e) {
      refused = String(e).substring(0, 60)
    }
    gem.maxCalls = keepMax
    print("[e2e] cap " + keepMax + ": a new request at the cap -> " + refused + "; calls " + gem.calls)
    check(refused.indexOf("cap") >= 0 && gem.calls === cc, "the call cap holds")
    print("[e2e] total network calls this session: " + gem.calls + " (cap " + gem.maxCalls + ")")
  }
}
