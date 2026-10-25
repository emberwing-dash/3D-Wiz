// WizLeafMyModel.ts - LEAF c9: My Model. The imported FBX (Assets/UserModels, wired to the userModel inputs by the importer) appears on the desk, its
// interior is measured from the real meshes, the template circuit parts are test-fitted, the template can be switched with the menu icon,
// the circuit opens on the bench and the simulated circuit test runs.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {PROJECT_PACK} from "./ProjectPack"
import {MY_MODEL_ID} from "./PackRegistry"
import {check, getMain, openMenu, press, ensureProject, activeUiKitButtons} from "./WizLeafHelpers"

@component
export class WizLeafMyModel extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("c9: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const main = getMain()
    await ensureProject(main, "sesame-quadruped")
    main.setPaused(false)
    main.loadProject(MY_MODEL_ID, "esp32-pet")
    await sleep(1200)
    expect(main.projectId()).toBe(MY_MODEL_ID)
    check(!isNull(main.robot.partObject("usermodel")), "the user's model is on the desk")
    check(main.robot.userModelNote().length > 0, "the model was measured / fitted: " + main.robot.userModelNote())
    main.enterMode("visualize")
    await sleep(800)
    main.visualize.cancelDemo()
    expect(main.visualize.source()).toBe("your model") // the Visualize userModel input is wired to the imported FBX wrapper
    expect(main.visualize.interiorBasis()).toBe("estimated")
    const inte = main.visualize.interiorCm()
    check(inte[0] > 0.5 && inte[1] > 0.5 && inte[2] > 0.5, "interior measured from the real bounds: " + inte.map((v) => v.toFixed(1)).join(" x "))
    for (const id of ["esp32c3", "oled", "mpu6050"]) check(main.visualize.itemIds().indexOf(id) >= 0, "template part on the shelf: " + id)
    check(main.visualize.itemIds().some((x) => x.indexOf("fx_") === 0) && main.visualize.itemIds().some((x) => x.indexOf("tool_") === 0), "screws and screwdrivers are on the shelf")
    expect(activeUiKitButtons()).toBe(0)
    // the menu: no Build for My Model, a template icon switches the circuit
    await openMenu(main)
    check(!main.menu.hasItem("build") && main.menu.hasItem("template"), "My Model menu: " + main.menu.itemIds().join(","))
    main.visualize.arrangeNow()
    await sleep(500)
    const fc = main.visualize.fitCount()
    check(fc.count === fc.total && fc.total >= 4, "Arrange fits the template parts in the measured interior: " + fc.count + "/" + fc.total)
    main.visualize.startTest()
    check(main.visualize.testResults() !== null, "the simulated circuit test runs")
    // switch template through the menu icon
    await press(it, "menu_icon_template", 1800)
    expect(main.projectId()).toBe(MY_MODEL_ID)
    main.enterMode("visualize")
    await sleep(600)
    main.visualize.cancelDemo()
    check(main.visualize.itemIds().indexOf("l298n") >= 0 || main.visualize.itemIds().indexOf("mega") >= 0 || main.visualize.itemIds().indexOf("mcu_s2mini") >= 0, "the circuit template changed: " + main.visualize.itemIds().join(","))
    // wires on the bench
    main.enterMode("circuit")
    await sleep(500)
    expect(main.bench.wireCount()).toBe(PROJECT_PACK.connections.length)
    check(main.bench.wireCount() > 5, "the template circuit has wires: " + main.bench.wireCount())
  }
}
