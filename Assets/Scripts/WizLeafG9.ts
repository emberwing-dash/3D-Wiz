// WizLeafG9.ts - LEAF g9: the VISUALIZE page. Real-model components are attached to the printed RC car: snap to the own mount, name label, pins, wires;
// a wrong spot sends the part back; SEE-THRU and RESET pills work through real pinches; the simulated hand attaches everything by itself.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, press} from "./WizLeafHelpers"
import {WizGuide} from "./WizGuide"
import {VIZ_PARTS} from "./GuideParts"

@component
export class WizLeafG9 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g9: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const g = WizGuide.instance as WizGuide
    if (g.active()) g.leave()
    g.enterViz()
    await sleep(1000)
    const v = g.viz
    check(v.partCount() === 11 && v.attachedCount() === 0, "11 components wait in the tray: " + v.partCount())
    for (const p of VIZ_PARTS) check(v.meshCount(p.id) >= 1, p.id + " has real meshes: " + v.meshCount(p.id))
    check(VIZ_PARTS.filter((p) => p.source === "KiCad" || p.source === "Adafruit").length >= 7, "7 or more are real KiCad / Adafruit CAD models")
    // a wrong spot: the L293D on the ESP32 spot is refused, red, back to the tray
    const start = v.partWorld("l293d")
    v.simDrop("l293d", v.mountWorld("esp32"))
    check(v.lastResult === "wrong:l293d" && !v.isAttached("l293d"), "wrong spot refused: " + v.lastResult)
    check(v.noteValue().indexOf("ESP32") >= 0, "the note says why: " + v.noteValue())
    await sleep(900)
    check(v.partWorld("l293d").sub(start).length < 0.4, "the part went back to the tray")
    // the right spot snaps, labels and shows its pins
    v.simDrop("esp32", v.mountWorld("esp32"))
    check(v.isAttached("esp32") && v.nameOf("esp32") === "ESP32" && v.pinsShown("esp32"), "ESP32 snapped, labelled, pins shown: " + v.nameOf("esp32"))
    check(v.partWorld("esp32").sub(v.mountWorld("esp32")).length < 0.3, "it sits exactly on its mount")
    // the rest, then the wires of the circuit
    for (const p of VIZ_PARTS) if (!v.isAttached(p.id)) v.simDrop(p.id, v.mountWorld(p.id))
    check(v.attachedCount() === 11, "all 11 attached: " + v.attachedCount())
    check(v.wireCount() === 12, "the 12 wires of the circuit are drawn: " + v.wireCount())
    // real pinches on the pills
    await press(it, "viz_hit_xray", 800)
    check(v.model.isXray(), "SEE-THRU toggled")
    await press(it, "viz_hit_xray", 600)
    check(!v.model.isXray(), "SEE-THRU toggled back")
    await press(it, "viz_hit_reset", 800)
    check(v.attachedCount() === 0 && v.wireCount() === 0, "RESET put every component back in the tray")
    // the simulated hand does it by itself
    await press(it, "viz_hit_demo", 800)
    check(v.demoRunning, "the demo started")
    const t0 = getTime()
    while (v.demoRunning && getTime() - t0 < 200) await sleep(300)
    check(!v.demoRunning && v.attachedCount() === 11 && v.wireCount() === 12, "the hand attached all 11 components, wires drawn: " + v.attachedCount() + " / " + v.wireCount())
    g.leave()
  }
}
