// WizLeafG18.ts - LEAF g18: circuits that come from somewhere else. (1) the LED Starter is a real guided build (place battery / switch on the model, resistor / LED on the
// breadboard, 4 wires) and Play lights the LED; (2) the KiCad sample schematic is imported at start and its pack has the parts and the 4 nets that were drawn;
// (3) the JSON a vision model returns for a photo becomes a pack (and a broken answer gives a readable error); (4) an imported pack plays through the same rules.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {check} from "./WizLeafHelpers"
import {getGuide, doStepAndWait} from "./WizLeafGuideHelpers"
import {packForProject, LED_SAMPLE} from "./GuideData"
import {circuitFromJson, packFromCircuit, circuitFromKicad} from "./GuideImport"
import {CATALOGUE} from "./GuideVoice"

@component
export class WizLeafG18 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g18: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    await sleep(1500)
    const g = getGuide()
    // 1. LED starter
    const led = CATALOGUE.filter((c) => c.id === "led-blink")[0]
    check(!!led && led.ready, "the LED Starter has a step list now")
    check(packForProject("led-blink") === LED_SAMPLE && LED_SAMPLE.steps.length === 8, "LED pack: 8 steps")
    g.usePack(LED_SAMPLE)
    g.enter()
    await sleep(400)
    g.setModelSource("rc")
    await sleep(500)
    check(g.stepCount() === 8, "the guide runs the 8 LED steps: " + g.stepCount())
    for (let i = 0; i < 8; i++) await doStepAndWait(g)
    check(g.phase() === "built", "LED circuit built: " + g.phase())
    check(g.bench.placedCount() === 4, "4 parts placed: " + g.bench.placedCount())
    g.pressPlay()
    await sleep(300)
    check(g.bench.isLedLit(), "Play lights the LED")
    check(g.phase() === "play", "phase is play: " + g.phase())

    // 2. KiCad sample (wired in the Inspector, imported at start)
    check(g.imported.length >= 1, "the KiCad sample was imported: " + g.imported.length + " (" + g.importNoteText() + ")")
    const k = g.imported[0]
    const kp = packForProject(k.id)
    check(kp.parts.length === 4, "KiCad pack has the 4 drawn parts: " + kp.parts.map((p) => p.id).join(","))
    const wires = kp.steps.filter((s) => s.kind === "wire").map((s) => (s.pins as [string, string]).slice().sort().join("+"))
    const want = ["bt1.+" + "+sw1.1", "r1.1+sw1.2", "d1.A+r1.2", "bt1.-+d1.K"].map((x) => x.split("+").length > 2 ? x : x)
    check(wires.length === 4, "KiCad pack has 4 wires (the 4 nets): " + wires.join(" ; "))
    const flat = wires.join(" ; ")
    for (const w of ["bt1.+", "sw1.1", "sw1.2", "r1.1", "r1.2", "d1.A", "d1.K", "bt1.-"]) check(flat.indexOf(w) >= 0, "KiCad pack wires use pin " + w)
    void want
    // the net structure: battery + goes with switch 1, switch 2 with resistor 1, resistor 2 with LED A, LED K with battery -
    const pair = (a: string, b: string) => kp.steps.some((s) => s.kind === "wire" && s.pins !== undefined && ((s.pins[0] === a && s.pins[1] === b) || (s.pins[0] === b && s.pins[1] === a)))
    check(pair("bt1.+", "sw1.1") && pair("sw1.2", "r1.1") && pair("r1.2", "d1.A") && pair("d1.K", "bt1.-"), "the nets are exactly the ones drawn in KiCad")

    // 3. a vision model's JSON for a photo (canned answer), and a broken one
    const photoJson = JSON.stringify({title: "Photo LED", parts: [{ref: "R1", type: "resistor"}, {ref: "LED1", type: "led"}, {ref: "BAT", type: "battery"}, {ref: "X1", type: "flux-capacitor"}], connections: [["BAT.+", "R1.1"], ["R1.2", "LED1.A"], ["LED1.K", "BAT.-"], ["R1.9", "LED1.A"]]})
    const c = circuitFromJson(photoJson)
    check(c.parts.length === 3 && c.skipped.length >= 2, "unknown part and unknown pin are left out and listed: " + c.skipped.join(" | "))
    const pp = packFromCircuit(c, "photo")
    check(pp.steps.filter((s) => s.kind === "wire").length === 3, "photo pack has 3 wires")
    let msg = ""
    try {
      circuitFromJson("this is not json")
    } catch (e) {
      msg = String(e)
    }
    check(msg.length > 0, "a broken answer gives a readable error: " + msg.substring(0, 40))
    let msg2 = ""
    try {
      circuitFromKicad("(not_kicad)")
    } catch (e) {
      msg2 = String(e)
    }
    check(msg2.indexOf("KiCad") >= 0, "a non-KiCad file is refused: " + msg2.substring(0, 50))

    // 4. an imported pack plays through the same rules
    g.usePack(kp)
    g.enter()
    await sleep(400)
    g.setModelSource("rc")
    await sleep(500)
    for (let i = 0; i < kp.steps.length; i++) await doStepAndWait(g)
    check(g.phase() === "built", "the KiCad circuit builds: " + g.phase())

    // 5. MY MODEL: a model of your own + the LED circuit. The spots on the model move onto its top surface; the build runs to the end.
    g.enterFromMenu("mymodel")
    await sleep(500)
    const pg = g.myModelPage()
    check(g.pageName() === "mymodel" && pg !== null && pg.isShown(), "MY MODEL page is open")
    check(g.modelCount() >= 2, "there is a model of your own besides the RC car: " + g.modelNames().join(", "))
    pg!.stepModel(1)
    pg!.selectCircuit("led-blink")
    const sel = pg!.selection()
    check(sel.model === 1 && sel.circuit === "led-blink", "the pickers moved: model " + sel.model + ", circuit " + sel.circuit)
    pg!.start()
    await sleep(1200)
    check(g.pageName() === "build" && g.stepCount() === 8, "START BUILD opens the guide with the LED steps: " + g.pageName() + " " + g.stepCount())
    check(g.modelIndex() === 1, "on the model you picked: " + g.modelName())
    const st0 = g.stepAt(0)
    const sp = g.bench.spotWorldPos(st0.spot as string)
    const loc = g.bench.model.root.getTransform().getInvertedWorldTransform().multiplyPoint(sp)
    const bb = g.bench.model.bounds()
    const inside = loc.x >= bb.min.x - 0.5 && loc.x <= bb.max.x + 0.5 && loc.z >= bb.min.z - 0.5 && loc.z <= bb.max.z + 0.5 && Math.abs(loc.y - bb.max.y) < 0.6
    check(inside, "the first spot sits on the top surface of your model: local " + loc.x.toFixed(1) + "," + loc.y.toFixed(1) + "," + loc.z.toFixed(1) + " bounds y max " + bb.max.y.toFixed(1))
    for (let i = 0; i < 8; i++) await doStepAndWait(g)
    check(g.phase() === "built", "LED circuit built on your own model: " + g.phase())
    g.pressPlay()
    await sleep(300)
    check(g.bench.isLedLit(), "Play lights the LED on your own model")
  }
}
