// WizLeafG10.ts - LEAF g10: the ANALYSE page. Name tags are visible, the info is hidden until an "i" is pressed, one card at a time, a second tap /
// the X / a tap on the table closes it; the simulated hand clicks a few "i" buttons by itself.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, press} from "./WizLeafHelpers"
import {WizGuide} from "./WizGuide"

@component
export class WizLeafG10 extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("g10: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const g = WizGuide.instance as WizGuide
    if (g.active()) g.leave()
    g.enterAnalyse()
    await sleep(1000)
    const a = g.analyse
    check(a.tagCount() === 8 && a.tagsVisible(), "8 name tags are visible: " + a.tagNames().join(","))
    for (const n of ["ESP32", "L293D", "Servo", "Battery", "Motor", "Switch", "LED", "Resistor"]) check(a.tagNames().indexOf(n) >= 0, "tag " + n)
    check(!a.cardShown(), "no info is shown until an i is pressed")
    await press(it, "guide_an_hit_i_esp32", 700)
    check(a.cardShown() && a.openPart() === "esp32" && a.cardText().indexOf("ESP32 module") >= 0 && a.cardText().indexOf("WHAT") >= 0, "pressing the i of the ESP32 shows its info: " + a.cardText().substring(0, 40))
    await press(it, "guide_an_hit_i_l293d", 700)
    check(a.cardShown() && a.openPart() === "l293d" && a.cardText().indexOf("L293D") >= 0 && a.cardText().indexOf("ESP32") < 0, "one card at a time: now the L293D")
    await press(it, "guide_an_hit_i_l293d", 700)
    check(!a.cardShown(), "a second tap on the same i closes the card")
    await press(it, "guide_an_hit_i_battery", 700)
    check(a.cardShown() && a.openPart() === "battery", "the battery card opens")
    await press(it, "guide_an_hit_table", 700)
    check(!a.cardShown(), "a tap on the table closes the card")
    await press(it, "guide_an_hit_i_servo", 700)
    await press(it, "guide_an_hit_close", 700)
    check(!a.cardShown(), "the X closes the card")
    await press(it, "an_hit_demo", 800)
    check(a.demoRunning, "the demo started")
    const t0 = getTime()
    while (a.demoRunning && getTime() - t0 < 160) await sleep(300)
    check(!a.demoRunning && a.opened.length >= 8 && !a.cardShown(), "the hand opened " + a.opened.join(",") + " and the card is closed again")
    g.leave()
  }
}
