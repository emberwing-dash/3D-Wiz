// WizLeafMenu.ts - LEAF c1: title screen + SAO menu. The gesture is detected from joint data (synthetic virtual-hand frames go
// through the SAME detector the real hand uses); icons open modes; and NO UIKit button is active anywhere in the scene.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {SaoDetector, SaoSynth} from "./WizHands"
import {check, getMain, press, textOf, enabledInHierarchy, activeUiKitButtons, openMenu, ensureProject} from "./WizLeafHelpers"

@component
export class WizLeafMenu extends Scenario {
  async run(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const main = getMain()
    await ensureProject(main, "sesame-quadruped")
    main.setPaused(false)
    main.toLaunch()
    await sleep(600)

    // title screen: just the logo + tagline, no menu yet
    expect(main.getDebug().mode).toBe("launch")
    expect(textOf("MenuTitle")).toBe("3D Wiz")
    expect(textOf("MenuTagline")).toBe("Visualize it. Build it. Test it.")
    expect(main.menu.isOpen()).toBe(false)
    expect(activeUiKitButtons()).toBe(0)

    // detector (pure): peace pose sweeping down opens, up closes; a fist or a still hand does nothing
    const det = new SaoDetector()
    let t = 0
    let opened = ""
    for (let i = 0; i < 40; i++) {
      t += 0.02
      const ev = det.feed(t, 0.02, SaoSynth.frame("fist", 6 - i * 0.5))
      if (ev) opened += ev
    }
    check(opened === "", "a fist sweeping down does not open the menu: '" + opened + "'")
    const det2 = new SaoDetector()
    t = 0
    for (let i = 0; i < 40; i++) {
      t += 0.02
      const ev = det2.feed(t, 0.02, SaoSynth.frame("peace", 0))
      if (ev) opened += ev
    }
    check(opened === "", "a still peace pose does nothing")
    const det3 = new SaoDetector()
    t = 0
    let down = ""
    for (let i = 0; i < 40; i++) {
      t += 0.02
      const ev = det3.feed(t, 0.02, SaoSynth.frame("peace", 6 - i * 0.5))
      if (ev) down += ev
    }
    check(down === "open", "peace pose sweeping down opens: '" + down + "'")
    let up = ""
    for (let i = 0; i < 40; i++) {
      t += 0.02
      const ev = det3.feed(t, 0.02, SaoSynth.frame("peace", -14 + i * 0.5))
      if (ev) up += ev
    }
    check(up === "close", "peace pose sweeping up closes: '" + up + "'")

    // virtual hand through the real service: swipe down opens the icon stack, swipe up closes it
    main.menu.openAfter(-1) // cancel the title screen's auto-open so only the virtual hand opens it
    main.menu.closeMenu("test")
    await sleep(500)
    main.menu.playHandDemo(true)
    await sleep(1500)
    expect(main.menu.isOpen()).toBe(true)
    expect(main.menu.lastGesture()).toBe("open:hand")
    const ids = main.menu.itemIds()
    for (const need of ["visualize", "projects"]) check(ids.indexOf(need) >= 0, "the title menu has the " + need + " icon: " + ids.join(","))
    check(ids.filter((i) => i !== "continue").length === 2, "the title menu is just Visualize + Library: " + ids.join(","))
    main.menu.playHandDemo(false)
    await sleep(1500)
    expect(main.menu.isOpen()).toBe(false)

    // pinch an icon -> its mode starts (icons only, no text buttons)
    await openMenu(main)
    await press(it, "menu_icon_visualize", 900)
    expect(main.getDebug().mode).toBe("visualize")
    expect(main.menu.isOpen()).toBe(false)
    expect(activeUiKitButtons()).toBe(0)
    await openMenu(main)
    for (const need of ["upload", "lab", "back"]) check(main.menu.hasItem(need), "Visualize offers " + need + ": " + main.menu.itemIds().join(","))
    check(main.menu.hasItem("play") || main.menu.hasItem("drive"), "Visualize offers Play: " + main.menu.itemIds().join(","))
    check(main.menu.itemIds().length <= 5, "Visualize has at most 5 icons: " + main.menu.itemIds().join(","))
    await press(it, "menu_icon_back", 900)
    expect(main.getDebug().mode).toBe("launch")
    check(enabledInHierarchy("MenuTitle"), "Home returns to the title screen")
    await sleep(1500)
    expect(main.menu.isOpen()).toBe(true) // the menu also opens by itself shortly after the title appears
  }
}
