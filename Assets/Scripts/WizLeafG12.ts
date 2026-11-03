// WizLeafG12.ts - LEAF g12: every demo action shows its result in under 1 second, with no network call (liveAi is off), and the page entries do not hitch.
// Times are real CPU milliseconds of the handler (Date.now), checked against 1000 ms, plus the frame-time probe of WizGuide. The numbers are printed.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {check, getMain, openMenu} from "./WizLeafHelpers"
import {WizGuide} from "./WizGuide"

@component
export class WizLeafG12 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g12: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private rows: string[] = []
  private ms(label: string, t0: number, limit: number = 1000): number {
    const d = Date.now() - t0
    this.rows.push(label + ": " + d + " ms")
    check(d < limit, label + " took " + d + " ms (limit " + limit + ")")
    return d
  }

  private async waitFor(c: () => boolean, maxMs: number): Promise<number> {
    const t0 = Date.now()
    while (!c() && Date.now() - t0 < maxMs) await sleep(30)
    return Date.now() - t0
  }

  private async body(): Promise<void> {
    await sleep(1500)
    const g = WizGuide.instance as WizGuide
    const live = g.liveAi
    this.rows.push(live ? "liveAi ON: background calls allowed, actions must stay instant" : "liveAi OFF: no network call")
    if (g.active() || g.voice.stage !== "idle") {
      g.stopDemo()
      g.voice.close()
      g.leave()
    }
    const main = getMain()
    main.toLaunch()
    await sleep(900)
    g.voice.setAuto(false)
    // baseline: the idle title screen (the preview itself, no page running)
    await sleep(1500)
    g.perfReset()
    await sleep(3000)
    const base = g.perfSnapshot()
    this.rows.push("idle title baseline: avg " + base.avgMs.toFixed(1) + " ms, max " + base.maxMs.toFixed(0) + " ms, over 50 ms: " + base.over50 + " of " + base.frames)
    g.perfReset()

    // voice tap -> listening feedback, then the search page (the spoken line stands in after 0.7 s in the preview)
    let t = Date.now()
    g.voice.micTap()
    this.ms("mic tap -> listening", t)
    check(g.voice.stage === "listening" && g.voice.captionText().indexOf("Listening") >= 0, "listening shown")
    t = Date.now()
    const w = await this.waitFor(() => g.voice.stage === "search", 1500)
    this.rows.push("mic tap -> search page visible (incl. the 0.7 s stand-in wait): " + (w + 0) + " ms after listening")
    check(w < 1000, "search page within 1 s: " + w)
    check((g.voice.intentSource === "local" || (live && g.voice.intentSource === "gemini")) && (live || g.geminiClient().calls === 0), "intent local (instant); Gemini calls so far " + g.geminiClient().calls)
    // keyboard
    t = Date.now()
    g.voice.typeChar("x")
    this.ms("typing a key -> query shows it", t)
    check(g.voice.query.slice(-1) === "x", "key typed")
    g.voice.backspace()
    // card -> okay card -> build
    t = Date.now()
    g.voice.pickCard(0)
    this.ms("tap RC Car -> 'okay?' card", t)
    check(g.voice.confirmTextValue() === "RC Car - okay?", "confirm card")
    t = Date.now()
    g.voice.okay()
    this.ms("OKAY -> Circuit Guide started (step 1 visible)", t)
    check(g.active() && g.pageName() === "build" && g.stepIndex() === 0 && (live || g.voice.stepsSource === "sample"), "guide at step 1: " + g.voice.stepsSource)
    this.rows.push("page entry cost (BUILD, includes world build if not pre-warmed): " + g.lastEnterMs + " ms")

    // step validation + glow
    const st = g.step()!
    t = Date.now()
    g.bench.simDropPart(st.part as string, g.bench.spotWorldPos(st.spot as string))
    this.ms("drop on the glowing spot -> green glow", t)
    check(g.bench.glowName() === "ok" || g.phase() === "success", "green after a correct drop: " + g.bench.glowName())
    await sleep(1800)
    check(g.stepIndex() === 1, "next step started by itself")
    g.leave()
    await sleep(400)

    // analyse tag -> info card
    t = Date.now()
    g.enterAnalyse()
    this.ms("ANALYSE page entry", t, 1000)
    t = Date.now()
    g.analyse.toggle("esp32")
    this.ms("tap an i -> info card", t)
    check(g.analyse.cardShown(), "info card shown")
    g.leave()
    await sleep(400)

    // visualize attach
    t = Date.now()
    g.enterViz()
    this.ms("VISUALIZE page entry", t, 1000)
    t = Date.now()
    g.viz.simDrop("esp32", g.viz.mountWorld("esp32"))
    this.ms("drop a component on its mount -> snapped + labelled", t)
    check(g.viz.isAttached("esp32") && g.viz.nameOf("esp32") === "ESP32", "attached with its label")
    // steady state with the hand working on VISUALIZE
    g.viz.startDemo()
    await sleep(1500)
    g.perfReset()
    await sleep(5000)
    const steady = g.perfSnapshot()
    this.rows.push("VISUALIZE with the hand running: avg " + steady.avgMs.toFixed(1) + " ms, max " + steady.maxMs.toFixed(0) + " ms, over 50 ms: " + steady.over50 + " of " + steady.frames)
    g.viz.stopDemo()
    g.leave()

    const p = g.perfSnapshot()
    this.rows.push("frame time over the run: avg " + p.avgMs.toFixed(1) + " ms, max " + p.maxMs.toFixed(0) + " ms, frames over 50 ms: " + p.over50 + " of " + p.frames)
    print("[g12] " + this.rows.join(" | "))
    this.rows.push("Gemini network calls in this session: " + g.geminiClient().calls)
    check(live || g.geminiClient().calls === 0, "no Gemini call was made in the whole run")
    void openMenu
  }
}
