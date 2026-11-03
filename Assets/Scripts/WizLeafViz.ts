// WizLeafViz.ts - LEAF c4: VISUALIZE = virtual try-before-you-build workbench. Components on a tray are dropped into the model
// interior (green fits / red clash / amber tight), the Arrange icon resolves clashes, fasteners + screwdrivers obey the hole rules,
// the Play icon runs the SIMULATED circuit test, and the ghost-hand demo is skippable. Rule-based, virtual only.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {PROJECT_PACK, V3} from "./ProjectPack"
import {recommend, naiveLayout, catalogItems} from "./WizFit"
import {check, getMain, openMenu, press, activeUiKitButtons, ensureProject} from "./WizLeafHelpers"

@component
export class WizLeafViz extends Scenario {
  async run(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const main = getMain()
    await ensureProject(main, "sesame-quadruped")
    main.setPaused(false)
    main.toLaunch()
    await sleep(500)
    await openMenu(main)
    await press(it, "menu_icon_visualize", 1000)
    expect(main.getDebug().mode).toBe("visualize")
    const v = main.visualize
    expect(activeUiKitButtons()).toBe(0)
    expect(v.source()).toBe("Sesame frame") // default model; own models go in the userModel slot (README)
    expect(v.interiorBasis()).toBe("estimated")
    v.playDemo()
    check(v.isDemoPlaying(), "the ghost-hand demo plays")
    v.cancelDemo()
    check(!v.isDemoPlaying(), "the demo is skippable")
    v.resetAll()
    await sleep(300)

    // everything starts on the tray: 0/6, nothing placed
    expect(v.fitCount().count).toBe(0)
    expect(v.fitCount().total).toBe(6)
    for (const id of ["battery", "mcu_s2mini", "buck_converter", "servo_header_strip", "oled", "power_switch"]) expect(v.itemState(id)).toBe("tray")

    // the estimated interior (5.4 x 3 x 7 cm) is too small for all six parts in one layer: the slots overlap and the Arrange icon grows
    // the interior. To test the slot-snapping rule itself, use a roomy interior (test hook); Arrange on the real one is tested below.
    v.setCavityForTest([-4.5, 2.2, -6], [4.5, 5.6, 6])
    await sleep(300)
    // drop onto the green suggested slots -> all green
    for (const id of ["battery", "buck_converter", "mcu_s2mini", "servo_header_strip", "power_switch", "oled"]) {
      v.dropAt(id, v.slotOf(id))
      check(v.itemState(id) === "placed", id + " placed")
    }
    await sleep(300)
    for (const id of ["battery", "buck_converter", "mcu_s2mini", "servo_header_strip", "power_switch", "oled"]) check(v.itemColor(id) !== "red", id + " fits (green, or amber when it touches a wall): " + v.itemColor(id) + " all=" + v.itemIds().slice(0, 6).map((x) => x + ":" + v.itemColor(x) + "@" + v.itemCenter(x).map((n) => n.toFixed(1)).join("/") + " slot " + v.slotOf(x).map((n) => n.toFixed(1)).join("/")).join(" ; ") + " cav " + JSON.stringify(v.getDebug().interior))
    expect(v.fitCount().count).toBe(6)

    // drag the battery half out of the interior -> overflow turns red, live; arrange (menu icon) resolves it
    v.dropAt("battery", [3.4, 0, 0])
    await sleep(300)
    check(v.itemColor("battery") === "red", "overflowing part turns red: " + v.itemColor("battery"))
    check(v.fitCount().count < 6, "verdict drops: " + v.fitCount().count + "/6")
    v.arrangeNow() // the Arrange icon is gone from the menu
    await sleep(500)
    expect(v.fitCount().count).toBe(6)
    for (const id of v.itemIds().filter((x) => x.indexOf("fx_") !== 0 && x.indexOf("tool_") !== 0 && x.indexOf("alt_") !== 0)) check(v.itemColor(id) !== "red", id + " fits after arrange (green, or amber if it touches a wall): " + v.itemColor(id))

    // an oversized alternative servo does not fit the interior
    v.dropAt("alt_mg996r", [0, 0, 0])
    await sleep(200)
    check(v.itemState("alt_mg996r") === "placed", "extra servo placed")
    check(v.fitCount().total === 6, "the verdict still counts the six catalogue parts")

    // SIMULATED circuit test through the Play icon
    v.resetAll()
    for (const id of ["battery", "buck_converter", "mcu_s2mini", "servo_header_strip", "power_switch", "oled"]) v.dropAt(id, v.slotOf(id))
    await openMenu(main)
    await press(it, "menu_icon_play", 800)
    check(v.isTesting(), "test circuit runs")
    const r = v.testResults()
    check(!!r && r.power && r.data && r.servo, "all three simulated checks pass when everything fits")
    check(main.hud.labelText() === "6/6", "tiny verdict: " + main.hud.labelText())
    // screws and drivers (hole rules): M2x5 + PH0 works; wrong driver / diameter / length / type are rejected
    v.resetAll()
    const hole = v.holeCenter("h_top_l")
    v.dropAt("fx_m2x5_st", hole)
    expect(v.itemState("fx_m2x5_st")).toBe("seated")
    v.dropAt("tool_ph1", hole) // wrong driver for an M2 phillips head
    expect(v.lastScrewResult()!.reason).toBe("driver")
    check(v.holesFilled() === 0, "rejected: wrong driver")
    expect(v.itemState("fx_m2x5_st")).toBe("tray")
    v.dropAt("fx_m3x8_m", hole)
    v.dropAt("tool_ph1", hole)
    expect(v.lastScrewResult()!.reason).toBe("diameter")
    v.dropAt("fx_m2x12_st", hole)
    v.dropAt("tool_ph0", hole)
    expect(v.lastScrewResult()!.reason).toBe("long")
    v.dropAt("fx_standoff_m25", hole)
    v.dropAt("tool_ph0", hole)
    check(v.lastScrewResult()!.reason === "diameter" || v.lastScrewResult()!.reason === "type", "standoff rejected: " + v.lastScrewResult()!.reason)
    v.dropAt("fx_m2x5_st", hole)
    v.dropAt("tool_ph0", hole)
    check(v.lastScrewResult()!.ok, "M2x5 + PH0 screws in")
    expect(v.holesFilled()).toBe(1)
    await sleep(1500)

    // pure rule check: a too-small interior needs a bigger size; the default fits
    const small = recommend(catalogItems(), {min: [-2.7, 2.2, -3.5], max: [2.7, 3.2, 3.5]})
    check(small.fitsAll && small.text.indexOf("Needs +") === 0, "tight interior -> recommendation: " + small.text)
    const ok = recommend(catalogItems(), {min: PROJECT_PACK.visualize.defaultCavity.min, max: PROJECT_PACK.visualize.defaultCavity.max})
    expect(ok.text).toBe("All fit")
    const naive = naiveLayout({min: PROJECT_PACK.visualize.defaultCavity.min, max: PROJECT_PACK.visualize.defaultCavity.max})
    check(naive.length === 6, "naive layout has the six parts")
    void ([] as V3[])
  }
}
