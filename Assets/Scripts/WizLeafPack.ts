// WizLeafPack.ts - LEAF c7: the pack is the single source of truth. Repo facts (typed here independently), the generic guide-pack
// schema is filled for every part (attach point, orientation, source), scene objects match the pack ids, and no UIKit text
// buttons exist anywhere.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep, findSceneObjectsByName} from "Leaf.lspkg/Utils/common/Utils"
import {findInteractablesByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {PROJECT_PACK, SERVO_MAP, QUESTS, BUILD_PLAN} from "./ProjectPack"
import {baseline, check, activeUiKitButtons} from "./WizLeafHelpers"

@component
export class WizLeafPack extends Scenario {
  async run(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const main = await baseline(it)

    // facts from firmware/sesame-firmware-main.ino + movement-sequences.h + the wiring guide
    expect(PROJECT_PACK.mcu.servoPins.join(",")).toBe("1,2,4,6,8,10,13,14")
    expect(PROJECT_PACK.mcu.oled.i2cAddr).toBe(0x3c)
    expect(PROJECT_PACK.mcu.oled.sda).toBe(33)
    expect(PROJECT_PACK.mcu.oled.scl).toBe(35)
    const order = ["R1", "R2", "L1", "L2", "R4", "R3", "L3", "L4"] // ServoNames[] in movement-sequences.h
    for (let i = 0; i < 8; i++) check(SERVO_MAP[i].name === order[i] && SERVO_MAP[i].gpio === PROJECT_PACK.mcu.servoPins[i], "servo " + i + " is " + order[i])
    const printed = ["frame", "bottom_cover", "top_cover_cat", "joint_r1", "joint_r2", "joint_l1", "joint_l2", "joint_r3", "joint_r4", "joint_l3", "joint_l4"]
    const elec = ["mcu_s2mini", "buck_converter", "battery", "power_switch", "servo_header_strip", "oled", "servo_r1", "servo_r2", "servo_r3", "servo_r4", "servo_l1", "servo_l2", "servo_l3", "servo_l4"]
    expect(PROJECT_PACK.components.length).toBe(printed.length + elec.length)
    for (const id of printed) {
      check(!isNull(main.robot.partObject(id)), "robot object for printed part " + id)
      check(findInteractablesByName("hit_" + id).length === 1, id + " is selectable")
    }
    for (const id of elec) {
      check(!isNull(main.robot.partObject(id)) && !isNull(main.bench.partObject(id)), "electronics " + id + " exist on the robot and on the bench")
      check(findSceneObjectsByName(id).length >= 2, "scene objects named " + id)
      check(findInteractablesByName("hit_" + id).length === 1 && findInteractablesByName("bhit_" + id).length === 1, id + " selectable in robot and bench")
    }

    // generic guide-pack schema: every component has an attach point, an orientation (<= 6 words) and a source
    const g = PROJECT_PACK.guide
    expect(g.schema).toBe("3dwiz-pack/1")
    expect(g.parts.length).toBe(PROJECT_PACK.components.length)
    for (const p of g.parts) {
      check(p.attach.hostId !== "" && p.attach.faceDir.length === 3, p.partId + " has a host + insertion direction")
      check(p.orientation.split(" ").length <= 6 && p.orientation.length > 0, p.partId + " orientation is short: '" + p.orientation + "'")
      check(p.source.url.indexOf("https://") === 0 && p.source.doc.length > 0, p.partId + " names its guide source")
      check(p.stepId !== "" && !!BUILD_PLAN[p.stepId], p.partId + " belongs to a build step")
    }
    check(g.screwHoles.length >= 3 && g.fasteners.length >= 4 && g.tools.length >= 3, "holes, fasteners and screwdrivers are data")
    // quests keep the repo order and cover every step once
    const flat: string[] = []
    for (const q of QUESTS) for (const s of q.steps) flat.push(s)
    expect(flat.join(",")).toBe(PROJECT_PACK.steps.map((s) => s.id).join(","))

    check(PROJECT_PACK.notSpecified.join("|").indexOf("Assembly positions") >= 0, "pack flags unspecified items")
    expect(main.bench.wireCount()).toBe(PROJECT_PACK.connections.length)
    expect(PROJECT_PACK.identity.app).toBe("3D Wiz")
    expect(activeUiKitButtons()).toBe(0)
  }
}
