// WizLeafDrive.ts - LEAF c11: DRIVE mode on the FORRC RC Car. The pad buttons are pinched (held) like a hand does; what each button does comes from
// simulating the user's own wiring. A complete wiring drives forward / reverse, steers, lights the headlights and collects rings; a missing
// motor wire turns the forward / reverse buttons off with a reason.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {findInteractablesByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {check, getMain, openMenu, press, ensureProject} from "./WizLeafHelpers"

@component
export class WizLeafDrive extends Scenario {
  async run(): Promise<void> {
    try {
      await this.body()
    } catch (e) {
      throw new Error("c11: " + e + " | " + (e && (e as any).stack ? (e as any).stack : ""))
    }
  }

  /** Pinch and hold a pad button for `ms` (a real hold: trigger start ... trigger end). */
  private async hold(it: DefaultLeafInteractor, name: string, ms: number, probeAt: number): Promise<{[k: string]: any}> {
    const target = findInteractablesByName(name, undefined, true).filter((x: any) => !isNull(x) && !isNull(x.getSceneObject()))[0]
    if (!target) throw new Error('pad button "' + name + '" not found')
    const main = getMain()
    const p = it.drag(target, new vec3(0.02, 0, 0), ms)
    await sleep(probeAt)
    const mid = main.driveState()
    await p
    return mid
  }

  private async body(): Promise<void> {
    const it = new DefaultLeafInteractor()
    await sleep(1500)
    const main = getMain()
    main.setPaused(false)
    await ensureProject(main, "forrc-car")
    const lab = main.circuitLab()

    // wire the reference circuit in the Lab, then drive from the menu
    main.enterMode("lab")
    await sleep(400)
    lab.autoWire(true)
    check(lab.wireCount() >= 12, "the car is wired: " + lab.wireCount())
    main.enterMode("overview")
    await openMenu(main)
    check(main.menu.hasItem("drive"), "the main menu has the Drive icon: " + main.menu.itemIds().join(","))
    await press(it, "menu_icon_drive", 1200)
    expect(main.getDebug().mode).toBe("drive")
    const d0 = main.driveState()
    check(d0.fwd && d0.back && d0.steerOk && d0.lights, "every control is provided by the wiring: " + JSON.stringify(d0))

    // forward (held)
    const start = main.driveState()
    const mid = await this.hold(it, "drvhit_fwd", 1800, 900)
    const after = main.driveState()
    check(mid.speed > 2, "holding forward drives the car: speed " + mid.speed.toFixed(1))
    const moved = Math.sqrt(Math.pow(after.x - start.x, 2) + Math.pow(after.z - start.z, 2))
    check(moved > 2, "the car moved " + moved.toFixed(1) + " cm")

    // reverse goes the other way
    const b0 = main.driveState()
    const bmid = await this.hold(it, "drvhit_back", 1500, 800)
    check(bmid.speed < -2, "holding reverse drives backwards: speed " + bmid.speed.toFixed(1))
    const b1 = main.driveState()
    check(Math.sqrt(Math.pow(b1.x - b0.x, 2) + Math.pow(b1.z - b0.z, 2)) > 1.5, "the car moved in reverse")

    // steering: left + forward turns the car (hold forward through the controller, left through a pinch)
    const ctl = main.driveControl()
    const y0 = main.driveState().yaw
    ctl.setHeld("fwd", true)
    const lmid = await this.hold(it, "drvhit_left", 1500, 900)
    ctl.setHeld("fwd", false)
    check(Math.abs(lmid.steer) > 5, "the servo steers: " + lmid.steer.toFixed(1))
    check(Math.abs(main.driveState().yaw - y0) > 4, "the car turned: " + (main.driveState().yaw - y0).toFixed(1))

    // lights
    await press(it, "drvhit_lights", 500)
    check(main.driveState().lit > 0.1, "the lights button lights the LEDs: " + main.driveState().lit.toFixed(2))
    await press(it, "drvhit_lights", 500)
    expect(main.driveState().lit < 0.05).toBe(true)

    // rings
    for (let i = 0; i < 3; i++) {
      const r = ctl.ringPos(i)
      ctl.teleport(r.x, r.z)
      await sleep(250)
    }
    expect(main.driveState().got).toBe(3)

    // break the motor driver wire: forward / reverse stop being available and say why
    main.enterMode("lab")
    await sleep(400)
    const w = lab.wireList().find((x) => x.a.indexOf("drv/") === 0 && x.b === "mot/M+" || x.b.indexOf("drv/") === 0 && x.a === "mot/M+")
    check(!!w, "found the motor wire")
    lab.removeWire((w as {id: string}).id)
    main.enterMode("drive")
    await sleep(500)
    const d1 = main.driveState()
    check(!d1.fwd && !d1.back, "without the motor wire the drive buttons are off: " + JSON.stringify(d1))
    check(ctl.reasonFor("fwd").length > 0, "and the reason is: " + ctl.reasonFor("fwd"))
    check(d1.lights && d1.steerOk, "lights and steering still work")
    main.enterMode("overview")
    await sleep(300)
    expect(main.getDebug().mode).toBe("overview")
  }
}
