// WizLeafG8.ts - LEAF g8: voice-to-build on the main menu, OFFLINE path (no Gemini key). Real pinches on the VOICE button, the result card and OKAY.
//   A) unit-style checks of the Gemini JSON validation with FAKE responses (the live Gemini call is not made here)
//   B) hands auto ON: mic tap -> transcript "I want build car" -> search typed key by key -> RC Car card -> OKAY -> Guide step 1, demo carries on
//   C) hands auto OFF: mic tap -> (no ASR in the preview) scripted line -> prefilled query, edited with DEL + a key -> real card + OKAY pinches -> Guide

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, getMain, press} from "./WizLeafHelpers"
import {WizGuide} from "./WizGuide"
import {RC_SAMPLE} from "./GuideData"
import {pickKey, parseIntentJson, keywordIntent, geminiText, parseStepsJson, filterCatalogue, SCRIPTED_LINE} from "./GuideVoice"

async function until(c: () => boolean, maxS: number, what: string): Promise<void> {
  const t0 = getTime()
  while (!c()) {
    if (getTime() - t0 > maxS) throw new Error("timeout waiting for " + what)
    await sleep(200)
  }
}

@component
export class WizLeafG8 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g8: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private unit(): void {
    const ok = '{"intent":"build","project":"rc-car","search_query":"rc car build"}'
    check(parseIntentJson(ok) !== null && parseIntentJson(ok)!.project === "rc-car", "a valid intent parses")
    check(parseIntentJson("```json\n" + ok + "\n```") !== null, "a fenced intent parses")
    check(parseIntentJson("not json") === null, "non-JSON is rejected")
    check(parseIntentJson('{"intent":"delete","project":"rc-car","search_query":"x"}') === null, "wrong intent rejected")
    check(parseIntentJson('{"intent":"build","project":"rocket","search_query":"x"}') === null, "unknown project rejected")
    check(parseIntentJson('{"intent":"build","project":"rc-car"}') === null, "missing search_query rejected")
    check(parseIntentJson('{"intent":"build","project":"rc-car","search_query":"<script>"}') === null, "odd characters rejected")
    const fake = {candidates: [{content: {parts: [{text: ok}]}}]}
    check(parseIntentJson(geminiText(fake)) !== null, "a fake Gemini response is read")
    check(geminiText({error: "x"}) === "" && geminiText(null) === "", "a wrong response shape gives empty text")
    check(keywordIntent(SCRIPTED_LINE).project === "rc-car", "keyword fallback: car -> RC car")
    check(keywordIntent("I want a servo hand").project === "servo-hand", "keyword fallback: hand -> servo hand")
    check(filterCatalogue("rc")[0].id === "rc-car" && filterCatalogue("zzz").length === 0 && filterCatalogue("").length >= 4, "catalogue filter")
    check(pickKey("insp-fake-0000", "env-fake-0000") === "insp-fake-0000", "key order: the Inspector field wins")
    check(pickKey("  ", "env-fake-0000") === "env-fake-0000" && pickKey("", "env-fake-0000") === "env-fake-0000", "key order: else the .env module")
    check(pickKey("", "") === "", "key order: else none (offline)")
    const steps = JSON.stringify({steps: RC_SAMPLE.steps})
    const p = parseStepsJson(steps)
    check(p !== null && p.steps.length === 8 && p.source.indexOf("Gemini") >= 0, "a valid fake step list is accepted")
    const bad1 = JSON.stringify({steps: RC_SAMPLE.steps.map((s, i) => (i === 2 ? {...s, pins: ["esp32.IO99", "l293d.2"]} : s))})
    const bad2 = JSON.stringify({steps: RC_SAMPLE.steps.map((s, i) => (i === 0 ? {...s, part: "warpcore"} : s))})
    check(parseStepsJson(bad1) === null, "a step with an unknown pin is rejected")
    check(parseStepsJson(bad2) === null, "a step with an unknown part is rejected")
    check(parseStepsJson("[]") === null && parseStepsJson("garbage") === null, "empty / garbage step list rejected")
  }

  private async toTitle(g: WizGuide) {
    if (g.active() || g.voice.stage !== "idle") {
      g.stopDemo()
      g.voice.close()
      g.leave()
    }
    await sleep(500)
    const main = getMain()
    main.toLaunch()
    await sleep(900)
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    this.unit()
    const g = WizGuide.instance as WizGuide
    const live = g.liveAi // with live AI on, Gemini only warms a cache in the background: the visible flow below must be the same
    if (!live) check(g.keySources().inspector === 0 && g.keySources().local === 0, "no Gemini key anywhere (Inspector or .env): this is the offline path")
    // ---- B) hands auto ON
    await this.toTitle(g)
    g.voice.setAuto(true)
    await press(it, "guide_voice_hit_mic", 600)
    check(g.voice.stage === "listening" || g.voice.stage === "thinking", "mic tap: listening: " + g.voice.stage)
    check(!g.voice.hand.root.enabled || g.voice.isRunning(), "the hand runs")
    await until(() => g.voice.transcript === SCRIPTED_LINE, 20, "the transcript")
    check(g.voice.captionText().indexOf(SCRIPTED_LINE) >= 0, "transcript shown as caption: " + g.voice.captionText())
    await until(() => g.voice.stage === "search", 25, "the search page")
    check(g.voice.keyboardShown() && (g.voice.intentSource === "local" || (live && g.voice.intentSource === "gemini")), "search page with the keyboard, intent from local keywords: " + g.voice.intentSource)
    const q = () => (g.voice.intent ? g.voice.intent.search_query : "rc car")
    await until(() => g.voice.query === q(), 40, "the hand typing the query")
    check(g.voice.cardTitle(0) === "RC Car", "RC Car is the top result: " + g.voice.cardTitle(0))
    await until(() => g.voice.stage === "confirm", 20, "the confirm card")
    check(g.voice.confirmTextValue() === "RC Car - okay?", "confirm card: " + g.voice.confirmTextValue())
    await until(() => g.active() && g.phase() === "working", 20, "the Guide")
    check(g.stepIndex() === 0 || g.stepIndex() === 1, "Circuit Guide started at step 1: idx=" + g.stepIndex())
    check(live || (g.voice.stepsSource === "sample" && g.packSource().indexOf("SAMPLE") >= 0), "step list = the sample (offline), or a cached AI list when live AI is on: " + g.voice.stepsSource)
    check(g.demoRunning(), "the hands carry on with the build (auto demo)")
    g.stopDemo()

    // ---- C) hands auto OFF: real pinches
    await this.toTitle(g)
    g.voice.setAuto(false)
    g.voice.asrTimeoutS = 1
    await press(it, "guide_voice_hit_mic", 600)
    check(g.voice.stage !== "idle" && !g.voice.isRunning(), "mic tap without hands: " + g.voice.stage)
    await until(() => g.voice.stage === "search", 20, "the search page (manual)")
    check(g.voice.transcript === SCRIPTED_LINE, "no microphone in the preview: the scripted line stands in")
    const q2 = g.voice.intent ? g.voice.intent.search_query : "rc car"
    check(g.voice.query === q2, "query prefilled: " + g.voice.query)
    await press(it, "guide_voice_hit_key_del", 400)
    check(g.voice.query === q2.slice(0, -1), "DEL key: " + g.voice.query)
    await press(it, "guide_voice_hit_key_r", 400)
    check(g.voice.query === q2, "R key: " + g.voice.query)
    await press(it, "guide_voice_hit_card0", 500)
    check(g.voice.stage === "confirm" && g.voice.confirmTextValue() === "RC Car - okay?", "card pinch opens the confirm card")
    await press(it, "guide_voice_hit_cancel", 500)
    check(g.voice.stage === "search", "CANCEL goes back to the results")
    await press(it, "guide_voice_hit_card0", 500)
    await press(it, "guide_voice_hit_okay", 1500)
    check(g.active() && g.phase() === "working" && g.stepIndex() === 0, "OKAY opened the Circuit Guide")
    check(!g.demoRunning(), "no auto demo when hands are off")
    g.voice.setAuto(true)
    await this.toTitle(g)
  }
}
