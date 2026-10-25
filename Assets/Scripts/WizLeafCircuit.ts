// WizLeafCircuit.ts - LEAF c3: Wires = Tinkercad-style bench + wire game. The wires drawn must match the Sesame diagram (table typed
// independently from the diagram + firmware, NOT read from the pack); pinching a glowing wire connects it and the glow moves on.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {PROJECT_PACK} from "./ProjectPack"
import {check, dist, press, openMenu, getMain, enabledInHierarchy, ensureProject} from "./WizLeafHelpers"

const DIAGRAM: string[][] = [
  ["battery/+", "power_switch/A"],
  ["power_switch/B", "buck_converter/IN+"],
  ["battery/-", "buck_converter/IN-"],
  ["buck_converter/OUT+", "servo_header_strip/5V_R"],
  ["buck_converter/OUT-", "servo_header_strip/GND_R"],
  ["mcu_s2mini/VBUS", "servo_header_strip/5V_L"],
  ["mcu_s2mini/GND", "servo_header_strip/GND_L"],
  ["oled/VCC", "servo_header_strip/5V_R"],
  ["oled/GND", "servo_header_strip/GND_R"],
  ["mcu_s2mini/GPIO33", "oled/SDA"],
  ["mcu_s2mini/GPIO35", "oled/SCL"],
]
const SERVO_GPIO = [1, 2, 4, 6, 8, 10, 13, 14] // firmware servoPins, header slots 1..8

@component
export class WizLeafCircuit extends Scenario {
  async run(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const main = getMain()
    await ensureProject(main, "sesame-quadruped")
    main.setPaused(false)
    main.unlockPlay()
    main.toLaunch()
    await sleep(500)
    await openMenu(main)
    main.enterMode("circuit") // the guided Wires game is not in the menu any more (the Circuit Lab replaced it)
    await sleep(1000)
    expect(main.getDebug().mode).toBe("circuit")
    expect(enabledInHierarchy("hit_frame")).toBe(true) // the locator robot stays for cross-highlight

    const want: string[] = []
    for (const w of DIAGRAM) want.push(w[0] + ">" + w[1])
    for (let i = 0; i < SERVO_GPIO.length; i++) want.push("mcu_s2mini/GPIO" + SERVO_GPIO[i] + ">servo_header_strip/S" + (i + 1))
    const segs = main.bench.wireEndpointsWorld().filter((s) => s.id.indexOf("plug_") !== 0)
    check(segs.length === want.length, "wire count " + segs.length + " == " + want.length)
    const got = segs.map((s) => s.from + ">" + s.to)
    for (const w of want) check(got.indexOf(w) >= 0, "bench wire matches diagram: " + w)
    for (const g of got) check(want.indexOf(g) >= 0, "no extra wire: " + g)
    for (const s of main.bench.wireEndpointsWorld()) {
      check(s.shown, "wire " + s.id + " shown")
      const f = s.from.split("/")
      const t = s.to.split("/")
      check(dist(s.a, main.bench.pinWorld(f[0], f[1])) < 0.3 && dist(s.b, main.bench.pinWorld(t[0], t[1])) < 0.3, "wire " + s.id + " ends on its pins")
    }
    const labs = main.bench.labelTexts()
    for (const l of ["VBUS", "GND", "33 SDA", "35 SCL", "IN+", "OUT+", "VCC", "SDA", "SCL"]) check(labs.indexOf(l) >= 0, "pin label '" + l + "' exists")

    // the wire game: a glowing wire is offered; pinching it connects it and the glow moves on
    const first = main.getDebug().selectedWire
    check(first !== "", "a wire glows: " + first)
    expect(main.getDebug().validatorCorrect).toBe(0)
    await press(it, "whit_" + first, 500)
    expect(main.getDebug().validatorCorrect).toBe(1)
    check(main.bench.isConnected(first), first + " drawn connected")
    check(main.getDebug().selectedWire !== first && main.getDebug().selectedWire !== "", "the glow moved to the next wire")
    check(main.getDebug().xp >= 5, "XP for a wire")
    check(main.getDebug().hudLabel === "1/19", "HUD shows progress only: " + main.getDebug().hudLabel)
    // cross-highlight: the wire's parts glow in the robot too
    const hl = main.robot.highlightedParts()
    check(hl.length >= 2, "the robot highlights the wire's parts: " + hl.join(","))
    await press(it, "whit_" + first, 400) // pinching again disconnects
    expect(main.getDebug().validatorCorrect).toBe(0)

    // pinch a component on the bench -> the i card (name + one line + size)
    await press(it, "bhit_oled", 500)
    expect(main.getDebug().selectedPart).toBe("oled")
    check(main.bench.highlightedParts().indexOf("oled") >= 0 && main.robot.highlightedParts().indexOf("oled") >= 0, "OLED highlighted on bench AND robot")
    expect(main.hud.infoTexts()[0]).toBe("OLED")

    // finish all 19: COMPLETE + badge
    for (const id of PROJECT_PACK.validation.expected) {
      if (!main.bench.isConnected(id) || main.getDebug().validatorStatus !== "COMPLETE") await press(it, "whit_" + id, 120)
    }
    await sleep(400)
    expect(main.getDebug().validatorStatus).toBe("COMPLETE")
    check(main.getDebug().badges.indexOf("wired") >= 0, "wired badge")
  }
}
