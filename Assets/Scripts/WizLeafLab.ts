// WizLeafLab.ts - LEAF c10: the Circuit Lab on the FORRC RC Car. A part opens its pin picker, a pinch on a pin button starts a wire, the second pin
// completes it; hints and auto-wiring follow the reference design; the function tests (Power, Drive, Steer, Lights) pass on the finished wiring,
// fail with a reason when a wire is removed, and a short / LED without a resistor is flagged as a hazard.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {PROJECT_PACK} from "./ProjectPack"
import {check, getMain, openMenu, press, ensureProject} from "./WizLeafHelpers"

@component
export class WizLeafLab extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("c10: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const main = getMain()
    main.setPaused(false)
    await ensureProject(main, "forrc-car")
    expect(main.projectId()).toBe("forrc-car")
    const lab = main.circuitLab()
    check(lab.available(), "the RC Car has electronics with an electrical model")
    check(PROJECT_PACK.components.filter((c) => c.elec).length >= 18, "all BOM parts have a model: " + PROJECT_PACK.components.filter((c) => c.elec).length)

    // the Lab icon in the menu
    main.enterMode("overview")
    await openMenu(main)
    check(main.menu.hasItem("lab"), "the menu has the Circuit lab icon: " + main.menu.itemIds().join(","))
    await press(it, "menu_icon_lab", 900)
    expect(main.getDebug().mode).toBe("lab")
    await sleep(500)
    check(main.bench.isLab(), "the bench is in Lab mode")
    const ids = main.menu.itemIds()
    for (const need of ["labtest", "hint", "auto", "autoall", "labclear", "back"]) check(ids.indexOf(need) >= 0, "the Lab menu has " + need + ": " + ids.join(","))
    expect(lab.wireCount()).toBe(0)

    // ---- a real wire through the pin picker: boost OUT+ -> ESP32 5V
    await press(it, "shit_boost", 500) // the real diagram symbol collider, as a user pinches it
    expect(main.bench.fanOpenFor()).toBe("boost")
    check(main.bench.fanPinKeys().indexOf("boost/OUT+") >= 0, "the boost converter's picker lists its pins: " + main.bench.fanPinKeys().join(","))
    await press(it, "fanhit_OUT+", 400)
    expect(lab.pendingPin()).toBe("boost/OUT+")
    await press(it, "shit_esp", 500)
    check(main.bench.fanPinKeys().indexOf("esp/5V") >= 0, "the ESP32 picker lists 5V")
    await press(it, "fanhit_5V", 500)
    expect(lab.wireCount()).toBe(1)
    check(lab.hasWire("boost/OUT+", "esp/5V"), "the wire boost OUT+ - ESP32 5V exists")
    check(main.bench.userWireList().length === 1, "the bench draws it")

    // ---- hint + auto wire
    const hinted = lab.hint()
    check(hinted !== "", "a hint names the next missing wire: " + hinted)
    const missing0 = lab.missingCount()
    lab.autoWire(false)
    expect(lab.missingCount()).toBe(missing0 - 1)
    // a wire the user made that the reference also uses counts as done (the first reference wire is battery +, or already satisfied)
    lab.autoWire(true)
    expect(lab.missingCount()).toBe(0)
    check(lab.wireCount() >= 12, "the 13 signal / choice wires are in place (the rails are automatic): " + lab.wireCount())
    check(lab.hazards().length === 0, "no hazards on the reference wiring: " + lab.hazards().join("; "))

    // ---- the tests: everything passes
    lab.runTests()
    let rep = lab.reportList()
    expect(rep.length).toBe(4)
    for (const r of rep) check(r.pass, "function " + r.id + " passes on the finished wiring (" + r.done + "/" + r.total + ") " + r.missing.join("; "))
    expect(lab.allPass()).toBe(true)
    await sleep(1800)
    check(main.bench.fxOf("mot") !== null || main.bench.fxOf("srv") !== null || main.bench.fxOf("led1") !== null, "the playback drives effects on the bench")
    // the simulation really drives the parts: motor forward / reverse, LED lit, servo moving
    const gpio: {[k: string]: number} = {"esp/IO12": 1, "esp/IO13": 0}
    const fwd = lab.probe({gpio: gpio, sr: {}, pressed: {}})
    check(fwd.parts["mot"].spin > 0.2, "IO12 high / IO13 low spins the motor forward: " + fwd.parts["mot"].spin.toFixed(2))
    const back = lab.probe({gpio: {"esp/IO12": 0, "esp/IO13": 1}, sr: {}, pressed: {}})
    check(back.parts["mot"].spin < -0.2, "the opposite levels reverse it: " + back.parts["mot"].spin.toFixed(2))
    const stop = lab.probe({gpio: {"esp/IO12": 0, "esp/IO13": 0}, sr: {}, pressed: {}})
    check(stop.parts["mot"].spin === 0, "both low: the motor stops")
    const led = lab.probe({gpio: {}, sr: {sr: 1}, pressed: {}})
    check(led.parts["led1"].lit > 0.15 && led.parts["led2"].lit === 0, "shift-register bit 0 lights LED 1 only: " + led.parts["led1"].lit.toFixed(2))
    const srv = lab.probe({gpio: {"esp/IO15": 1}, sr: {}, pressed: {}})
    check(srv.parts["srv"].moves, "the servo is powered and driven by IO15")
    check(srv.parts["boost"].powered && srv.parts["esp"].powered, "boost converter and ESP32 are powered")

    // ---- break it: remove the motor wire -> Drive fails with a reason, the others still pass
    const motWire = lab.wireList().find((w) => (w.a === "drv/3" && w.b === "mot/M+") || (w.b === "drv/3" && w.a === "mot/M+"))
    check(!!motWire, "found the motor wire")
    lab.wireTapped((motWire as {id: string}).id)
    await sleep(300)
    lab.runTests()
    rep = lab.reportList()
    check(!rep.find((r) => r.id === "drive")!.pass, "Drive fails without the motor wire")
    check(rep.find((r) => r.id === "drive")!.missing.length > 0, "and says why: " + rep.find((r) => r.id === "drive")!.missing.join("; "))
    check(rep.find((r) => r.id === "steer")!.pass && rep.find((r) => r.id === "lights")!.pass, "Steer and Lights still pass")
    await sleep(600)
    // wire it again (toggle) -> passes
    lab.addWire("drv/3", "mot/M+")
    lab.runTests()
    check(lab.allPass(), "restoring the wire restores Drive")

    // ---- hazards: an LED straight across 5 V
    lab.addWire("boost/OUT+", "led1/A") // (its cathode is already on ground in the reference wiring; wiring the same pair again would remove a wire)
    check(lab.hazards().some((h) => h.indexOf("led1") === 0), "an LED straight on 5 V is flagged: " + lab.hazards().join("; "))
    // ---- 595 on 5 V: the ESP32's 3.3 V logic is not enough -> Lights fail
    lab.clearAll()
    expect(lab.wireCount()).toBe(0)
    lab.autoWire(true)
    lab.removeWire(lab.wireList().find((w) => w.a === "esp/3V3" && w.b === "sr/16")!.id)
    lab.addWire("boost/OUT+", "sr/16")
    lab.runTests()
    const lights = lab.reportList().find((r) => r.id === "lights")!
    check(!lights.pass, "74HC595 on 5 V with 3.3 V logic: Lights fail (" + lights.missing.join("; ") + ")")
    check(lab.reportList().find((r) => r.id === "drive")!.pass, "Drive still passes")

    // ---- leaving the Lab clears the bench wires from view, wires are remembered
    const before = lab.wireCount()
    main.enterMode("overview")
    await sleep(500)
    check(!main.bench.isLab(), "the bench left Lab mode")
    main.enterMode("lab")
    await sleep(500)
    expect(lab.wireCount()).toBe(before)
    check(main.bench.userWireList().length === before, "the wires come back on re-entry: " + main.bench.userWireList().length)
  }
}
