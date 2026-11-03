// WizLeafLiveInflight.ts - MANUAL live check of the in-flight handling of GeminiClient (needs the key and liveAi ON; not in any autoRun list).
// A: a call that times out for the caller still fills the cache when the answer arrives late, with no second call.
// B: two concurrent identical requests share one call.   C: three repeats after the answer make 0 new calls.   D: the cap counts only real calls.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {check} from "./WizLeafHelpers"
import {WizGuide} from "./WizGuide"

@component
export class WizLeafLiveInflight extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("inflight: " + e)
    }
  }

  private async body(): Promise<void> {
    await sleep(1500)
    const g = WizGuide.instance as WizGuide
    const gem = g.geminiClient()
    check(g.liveAi && gem.available(), "live AI on with a key: " + g.keyStatus())
    const c0 = gem.calls

    // A: caller gives up after 0.3 s; the answer must still land in the cache
    const t0 = Date.now()
    let a1 = "no error"
    try {
      await gem.ask("Test part A", "a first slow request", 0.3)
    } catch (e) {
      a1 = String(e).substring(0, 40)
    }
    print("[inflight] A: caller timeout -> " + a1 + " after " + (Date.now() - t0) + " ms; calls +" + (gem.calls - c0))
    check(a1.indexOf("timeout") >= 0 && gem.calls === c0 + 1, "the caller timed out and one real call is running")
    // re-join the running call (a repeat while in flight) until the answer arrives
    let ans = ""
    const w0 = Date.now()
    while (ans === "" && Date.now() - w0 < 40000) {
      try {
        ans = await gem.ask("Test part A", "a first slow request", 0.5)
      } catch (e) {
        await sleep(200)
      }
    }
    print("[inflight] A: late answer after " + (Date.now() - t0) + " ms from the first request; calls +" + (gem.calls - c0) + " (repeats while in flight made none); answer: " + ans.substring(0, 60).replace(/\n/g, " "))
    check(ans !== "" && gem.calls === c0 + 1, "the late answer filled the cache with no second call")
    const t1 = Date.now()
    await gem.ask("Test part A", "a first slow request")
    print("[inflight] A: repeat after the late answer: " + (Date.now() - t1) + " ms, calls +" + (gem.calls - c0))
    check(gem.calls === c0 + 1, "repeat after the late answer is free")

    // B: two concurrent identical requests share one call
    const c1 = gem.calls
    const tb = Date.now()
    const [x, y] = await Promise.all([gem.ask("Test part B", "a shared request", 40), gem.ask("Test part B", "a shared request", 40)])
    print("[inflight] B: two concurrent identical requests: calls +" + (gem.calls - c1) + ", " + (Date.now() - tb) + " ms, same answer " + (x === y))
    check(gem.calls === c1 + 1 && x === y, "concurrent identical requests share one call")

    // C: three repeats after the answer
    const c2 = gem.calls
    const rows: string[] = []
    for (let i = 0; i < 3; i++) {
      const tr = Date.now()
      await gem.ask("Test part B", "a shared request")
      rows.push(Date.now() - tr + " ms")
    }
    print("[inflight] C: 3 repeats after the answer: calls +" + (gem.calls - c2) + " (" + rows.join(", ") + ")")
    check(gem.calls === c2, "3 repeats made 0 new calls")

    // D: the cap counts only real calls
    const keep = gem.maxCalls
    gem.maxCalls = gem.calls
    let refused = "no error"
    try {
      await gem.ask("Test part C", "a brand new request")
    } catch (e) {
      refused = String(e).substring(0, 40)
    }
    await gem.ask("Test part B", "a shared request") // cached: still served at the cap
    gem.maxCalls = keep
    print("[inflight] D: new request at the cap -> " + refused + "; a cached one is still served; real calls this session " + gem.calls + " (cap " + keep + ")")
    check(refused.indexOf("cap") >= 0, "the cap refuses new requests and counts only real calls")
  }
}
