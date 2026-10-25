// WizLeafPet.ts - LEAF c13: the cat-like OLED desktop pet. Wires are made with real pinches (part -> pin picker -> pin) and checked against the
// pack's VERIFIED pin connections: a wrong pair turns red and Phobo explains, a verified pair turns green and the counter goes up. The
// virtual test then simulates touch / motion inputs and the OLED shows the matching expression; finishing the three inputs activates the pet.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, getMain, press, ensureProject, openMenu} from "./WizLeafHelpers"

@component
export class WizLeafPet extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("c13: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const main = getMain()
    main.setPaused(false)
    await ensureProject(main, "esp32-pet")
    const lab = main.circuitLab()
    main.enterMode("overview")
    await openMenu(main)
    check(main.menu.hasItem("lab") && main.menu.hasItem("play") && !main.menu.hasItem("drive"), "the pet menu has Wire it + Play, no Drive: " + main.menu.itemIds().join(","))
    await press(it, "menu_icon_lab", 1200)
    expect(main.getDebug().mode).toBe("lab")
    check(lab.verifyMode(), "the pet has no simulator: wires are checked against verified pins")
    expect(lab.verifyTotal()).toBe(6)
    expect(lab.verifiedCount()).toBe(0)

    // ---- a WRONG pair through real pinches: GPIO9 -> OLED SDA (the pack's known swap)
    await press(it, "shit_esp32c3", 600)
    await press(it, "fanhit_GPIO9", 500)
    await press(it, "shit_oled", 600)
    await press(it, "fanhit_SDA", 700)
    expect(lab.wireCount()).toBe(1)
    expect(lab.verifiedCount()).toBe(0)
    check(lab.verifyPair("esp32c3/GPIO9", "oled/SDA").state === "wrong", "GPIO9 to the OLED SDA is a known wrong pair")
    check(main.phoboControl().speaking(), "Phobo explains the wrong pin")
    expect(main.phoboControl().mood).toBe("worried")
    // pinching the wire removes it, then the right pair: GPIO8 -> OLED SDA
    lab.wireTapped(lab.wireList()[0].id)
    expect(lab.wireCount()).toBe(0)
    await press(it, "shit_esp32c3", 600)
    await press(it, "fanhit_GPIO8", 500)
    await press(it, "shit_oled", 600)
    await press(it, "fanhit_SDA", 700)
    expect(lab.verifiedCount()).toBe(1)
    check(lab.verifyPair("esp32c3/GPIO8", "oled/SDA").state === "ok", "GPIO8 to the OLED SDA is verified")
    check(main.getDebug().hudLabel === "1/6", "the completion counter shows 1/6: " + main.getDebug().hudLabel)
    // the rest through Wire all: 6 of 6 verified -> Circuit Master badge
    lab.autoWire(true)
    expect(lab.verifiedCount()).toBe(6)
    check(main.getDebug().badges.indexOf("wired") >= 0, "all six verified: the Circuit Master badge")

    // ---- virtual test: simulated touch / motion inputs -> OLED expressions
    main.enterMode("test")
    await sleep(600)
    await openMenu(main)
    await press(it, "menu_icon_touch", 2600)
    check(main.robot.currentFace().indexOf("happy") >= 0 || main.getDebug().labFace.indexOf("happy") >= 0 || main.getDebug().labCommand === "touch", "the touch input shows an expression: " + main.getDebug().labFace)
    await openMenu(main)
    await press(it, "menu_icon_shake", 2600)
    await openMenu(main)
    await press(it, "menu_icon_lift", 2600)
    check(main.virtualTestsDone() >= 3, "three inputs tested: " + main.virtualTestsDone())
    check(main.getDebug().badges.indexOf("pet") >= 0, "the pet is activated")
  }
}
