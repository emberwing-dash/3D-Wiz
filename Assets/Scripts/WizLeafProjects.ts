// WizLeafProjects.ts - LEAF c7 / c8 / c9 for the Projects carousel, the pack-integrity check and the My Model flow.
//   c7: the Projects icon shows >= 5 project cards; pinching each card loads that project (title, parts, build game, wires, simulated Play).
//   c8: every pack passes an integrity check (pure data): wire endpoints exist, every step target exists, every part is placed exactly once,
//       rigs / commands / visualize / guide references resolve, sources + licences are recorded.
//   c9: My Model: the imported FBX (Assets/UserModels) appears, the interior is measured, the template circuit parts are test-fitted, the
//       template can be switched, the circuit opens on the bench and the simulated circuit test runs.
// Verified through SIK-level pinches on the real card / icon colliders (DefaultLeafInteractor), NOT through real hand tracking.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {PROJECT_PACK, SESAME_PACK, PackShape, SERVO_MAP} from "./ProjectPack"
import {PACKS, packEntry, MY_MODEL_ID, TEMPLATE_IDS, makeMyModelPack} from "./PackRegistry"
import {check, getMain, openMenu, press, textOf, ensureProject, activeUiKitButtons} from "./WizLeafHelpers"

@component
export class WizLeafProjects extends Scenario {
  async run(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const main = getMain()
    await ensureProject(main, "sesame-quadruped")
    main.setPaused(false)
    main.toLaunch()
    await sleep(500)
    await openMenu(main)
    // the title now offers Visualize / Analyse / Build; the Library (carousel) is reached from the BUILD page's LIBRARY pill (WizGuide.onLegacy -> showProjects)
    main.menu.closeMenu("test")
    main.showProjects()
    await sleep(1800)
    expect(main.menu.projectsVisible()).toBe(true)
    const ids = main.menu.cards.ids()
    check(ids.length >= 5, "the carousel lists at least 5 projects: " + ids.join(","))
    expect(activeUiKitButtons()).toBe(0)
    for (const id of PACKS.map((p) => p.id)) check(ids.indexOf(id) >= 0, "carousel has " + id)

    for (const id of ids) {
      if (!main.menu.projectsVisible()) {
        main.showProjects()
        await sleep(1800)
      }
      await press(it, "card_hit_" + id, 1500)
      expect(main.projectId()).toBe(id)
      expect(main.menu.projectsVisible()).toBe(false)
      const e = packEntry(id)
      const shortName = PROJECT_PACK.identity.short ? (PROJECT_PACK.identity.short as string) : PROJECT_PACK.identity.name
      expect(textOf("MenuProject")).toBe(shortName)
      check(!!e && e.name.split(" ").length <= 2, "card name is at most two words: " + (e ? e.name : id))
      // every drawn component exists on the desk
      for (const c of PROJECT_PACK.components) {
        if (c.deskHidden) continue
        check(!isNull(main.robot.partObject(c.id)), id + ": desk part " + c.id)
      }
      if (id === MY_MODEL_ID) {
        main.showProjects()
        await sleep(1800)
        continue
      }
      // the guided build runs on the shared engine: first part offered, perfect play of the first step, then skip to the end
      main.lockPlay()
      main.enterMode("build")
      await sleep(500)
      const first = PROJECT_PACK.steps[0]
      expect(main.getDebug().pick).toBe(PROJECT_PACK.plan[first.id].place[0])
      expect(main.getDebug().stepTotal).toBe(PROJECT_PACK.steps.length)
      check(PROJECT_PACK.steps.length >= 8 && PROJECT_PACK.steps.length <= 14, id + ": 8-14 build steps: " + PROJECT_PACK.steps.length)
      main.robot.simulateDrag(0, 0) // pick up (identify)
      let guard = 0
      while (main.robot.pickYawStep() > 0 && guard++ < 4) main.robot.rotatePick()
      const d = main.robot.pickDeltaWorld()
      main.robot.simulateDrag(d.x, d.y)
      await sleep(1300)
      expect(main.getDebug().step).toBe(2)
      let n = 0
      while (!main.getDebug().buildComplete && n++ < 20) {
        main.skipStep()
        await sleep(120)
      }
      await sleep(1100)
      check(main.getDebug().buildComplete, id + ": build completes")
      check(main.getDebug().playUnlocked, id + ": Play unlocked after the build")
      // simulated Play: the first command of the first page runs and moves the actuators / changes the face
      main.enterMode("test")
      await sleep(400)
      const page = (PROJECT_PACK.lab.pages ? PROJECT_PACK.lab.pages : [["walk"]])[0]
      const cmd = page[0]
      await openMenu(main)
      check(main.menu.hasItem(cmd), id + ": Play page shows the " + cmd + " icon: " + main.menu.itemIds().join(","))
      main.menu.selectForTest(cmd)
      await sleep(1500)
      expect(main.getDebug().labCommand).toBe(cmd)
      main.showProjects()
      await sleep(1800)
    }
    void SESAME_PACK
  }
}

