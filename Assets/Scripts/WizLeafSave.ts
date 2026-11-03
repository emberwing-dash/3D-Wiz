// WizLeafSave.ts - LEAF c6: Save session / Continue. Progress (mode, build step, wires, Visualize layout) is written to the
// Lens persistent store; after a (simulated) reload the title screen offers Continue and restores it.
// NOTE: this proves the store round-trip inside the preview run; surviving a full Lens restart is checked by the README procedure.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, getMain, openMenu, press, playStep, ensureProject} from "./WizLeafHelpers"

@component
export class WizLeafSave extends Scenario {
  async run(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const main = getMain()
    await ensureProject(main, "sesame-quadruped")
    main.setPaused(false)
    main.clearSave()
    main.lockPlay()
    main.toLaunch()
    await sleep(500)
    check(!main.menu.hasItem("continue"), "no Continue before anything is saved")
    main.enterMode("build") // a fresh build (the Build icon would show the finished robot if an earlier scenario completed it)
    await sleep(500)
    for (let i = 0; i < 3; i++) await playStep(main, it) // three steps of progress
    const step = main.getDebug().step
    check(step === 4, "progress made: step " + step)

    main.saveSession() // saving is automatic when the Library opens; the scenario saves directly
    expect(main.getDebug().saved).toBe(true)
    check(!!global.persistentStorageSystem && global.persistentStorageSystem.store.has("3dwiz_session_v1"), "the persistent store holds the session")

    // "reload": go to the title screen, forget in-memory progress by re-reading the store
    main.toLaunch()
    main.reloadSave()
    await sleep(500)
    await openMenu(main)
    check(main.menu.hasItem("continue"), "the title screen offers Continue")
    await press(it, "menu_icon_continue", 1200)
    expect(main.getDebug().mode).toBe("build")
    expect(main.getDebug().step).toBe(step)

    // the saved scene (Visualize) comes back with Continue
    main.toLaunch()
    await sleep(300)
    await openMenu(main)
    main.menu.closeMenu("test") // the title no longer has the old Visualize icon; enter that scene directly
    main.enterMode("visualize")
    await sleep(900)
    main.saveSession()
    main.reloadSave()
    main.toLaunch()
    await openMenu(main)
    await press(it, "menu_icon_continue", 1000)
    expect(main.getDebug().mode).toBe("visualize")
    main.clearSave()
  }
}
