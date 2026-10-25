// WizDrive.ts - DRIVE: play the car with virtual controls that follow the circuit YOU wired. Five big round buttons (forward, reverse, left,
// right, lights). What each one does is not scripted: WizCircuitLab.driveMap() searches the user's wiring by simulation for the GPIO /
// shift-register states that spin the motor each way, move the servo and light the LEDs, and the pad replays exactly those states. A button
// whose function the wiring does not provide turns red and says why in a few words. The car moves from the motor's simulated spin and the
// servo's steering; collect the rings for XP.
// Owns: the pad, the car kinematics on the desk, headlights, rings. Must not: edit wires, decide modes or menus (WizMain does).
// The simulation is a simplified DC model: driving here is virtual and does not prove a physical car works.

import {makeInteractable} from "./WizInteract"
import {PartKit, StyledMat} from "./WizParts"
import {makeIconQuad, tintIcon} from "./WizIcons"
import {RGBA} from "./ProjectPack"
import {Drive} from "./CircuitSim"
import {WizRobot} from "./WizRobot"
import {WizCircuitLab, DriveMap} from "./WizCircuitLab"
import {WizHud} from "./WizHud"

const DEG = Math.PI / 180
const SPEED = 8.5 // cm / s at full motor spin (workbench cm)
const WHEELBASE = 4.5
const STEER_DEG = 28
const BOUNDS_X = 9.5
const BOUNDS_Z = 5.5
const FRONT = -1 // the chassis nose is along local -Z
const CYAN: RGBA = [0.35, 0.95, 1.0, 1]
const DIM: RGBA = [1.0, 0.35, 0.3, 1]
const GREEN = new vec4(0.3, 1.0, 0.5, 1)
const RED = new vec4(1.0, 0.3, 0.25, 1)

type Ctl = "fwd" | "back" | "left" | "right" | "lights"
const CTLS: {id: Ctl; icon: string; x: number; y: number}[] = [
  {id: "left", icon: "turn_left", x: -10.6, y: 0.4},
  {id: "right", icon: "turn_right", x: -6.6, y: 0.4},
  {id: "fwd", icon: "arrow_upward", x: 12.2, y: 4.2},
  {id: "back", icon: "arrow_downward", x: 12.2, y: 0.4},
  {id: "lights", icon: "lightbulb", x: 12.2, y: -3.4},
]
const PAD_Z = -54.5

interface Btn {
  id: Ctl
  root: SceneObject
  ring: StyledMat
  icon: Material
  hit: SceneObject
}

export class WizDrive {
  private kit: PartKit
  private pad: SceneObject
  private btns: {[id: string]: Btn} = {}
  private held: {[id: string]: boolean} = {}
  private lightsOn = false
  private map: DriveMap | null = null
  private on = false
  private x = 0
  private z = 0
  private yaw = 0
  private speed = 0
  private steer = 0
  private wheels = 0
  private lastKey = ""
  private ledLit = 0
  private spin = 0
  private servoMoves = false
  private motorId = ""
  private servoId = ""
  private ledIds: string[] = []
  private lamps: SceneObject[] = []
  private lampMats: StyledMat[] = []
  private rings: {obj: SceneObject; x: number; z: number; got: boolean}[] = []
  private got = 0
  private warned: {[id: string]: number} = {}
  private clock = 0
  onRing: (n: number, total: number) => void = () => {}
  onAllRings: () => void = () => {}

  constructor(kit: PartKit, private root: SceneObject, private robot: WizRobot, private lab: WizCircuitLab, private hud: WizHud, private boxMesh: RenderMesh, private faceMat: Material) {
    this.kit = kit
    this.pad = kit.obj(root, "DrivePad", [0, 0, PAD_Z])
    for (const c of CTLS) this.buildButton(c.id, c.icon, c.x, c.y)
    this.pad.enabled = false
  }

  private buildButton(id: Ctl, icon: string, x: number, y: number) {
    const k = this.kit
    const root = k.obj(this.pad, "drv_" + id, [x, y, 0])
    const ring = k.shape(root, "cyl", [0, 0, 0], [3.1, 0.1, 3.1], CYAN, "ring", false, [90, 0, 0])
    k.shape(root, "cyl", [0, 0, 0.06], [2.7, 0.1, 2.7], [0.06, 0.11, 0.18, 1], "disc", false, [90, 0, 0])
    const q = makeIconQuad(root, this.boxMesh, this.faceMat, "icon", icon, 1.7, CYAN)
    q.obj.getTransform().setLocalPosition(new vec3(0, 0, 0.14))
    const hit = k.obj(root, "drvhit_" + id)
    const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
    const box = Shape.createBoxShape()
    box.size = new vec3(3.0, 3.0, 0.8)
    col.shape = box
    const it = makeInteractable(hit)
    it.targetingMode = 3
    it.onTriggerStart.add(() => this.press(id, true))
    it.onTriggerEnd.add(() => this.press(id, false))
    this.btns[id] = {id: id, root: root, ring: ring.sm, icon: q.mat, hit: hit}
  }

  // ------------------------------------------------------------------------------------------------ session
  begin() {
    this.map = this.lab.driveMap()
    this.lab.showPips()
    this.held = {}
    this.lightsOn = false
    this.warned = {}
    this.x = 0
    this.z = 0
    this.yaw = this.robot.homeYaw()
    this.speed = 0
    this.steer = 0
    this.wheels = 0
    this.lastKey = ""
    this.spin = 0
    this.ledLit = 0
    this.servoMoves = false
    this.got = 0
    const m = this.lab.circuitModel()
    this.ledIds = []
    this.motorId = ""
    this.servoId = ""
    if (m) {
      for (const id of m.partIds()) {
        const k = m.spec(id).kind
        if (k === "motor" && this.motorId === "") this.motorId = id
        else if (k === "servo" && this.servoId === "") this.servoId = id
        else if (k === "led") this.ledIds.push(id)
      }
    }
    this.buildRings()
    this.buildLamps()
    this.robot.setScaleMul(0.55)
    this.pad.enabled = true
    this.on = true
    this.paintButtons()
    this.hud.setLabel("0/" + this.rings.length)
    this.robot.setPoseXZ(this.x, this.z, this.yaw)
  }

  end() {
    if (!this.on && !this.pad.enabled) return
    this.on = false
    this.pad.enabled = false
    for (const r of this.rings) if (!isNull(r.obj)) r.obj.destroy()
    this.rings = []
    for (const l of this.lamps) if (!isNull(l)) l.destroy()
    this.lamps = []
    this.lampMats = []
    this.robot.setScaleMul(1)
    this.robot.setAct("wheels", 0)
    this.robot.setAct("steer", 0)
    this.robot.setPoseXZ(0, 0, this.robot.homeYaw())
  }

  isOn(): boolean {
    return this.on
  }

  private available(id: Ctl): boolean {
    if (!this.map) return false
    if (id === "fwd") return this.map.fwd !== null
    if (id === "back") return this.map.back !== null
    if (id === "lights") return this.map.lights !== null
    return this.map.steer !== null
  }

  private paintButtons() {
    for (const c of CTLS) {
      const b = this.btns[c.id]
      const ok = this.available(c.id)
      const active = this.held[c.id] === true || (c.id === "lights" && this.lightsOn)
      const col: RGBA = active ? [1, 1, 1, 1] : ok ? CYAN : DIM
      b.ring.set(col)
      tintIcon(b.icon, col)
      const s = active ? 1.12 : 1
      b.root.getTransform().setLocalScale(new vec3(s, s, s))
    }
  }

  private buildRings() {
    for (const r of this.rings) if (!isNull(r.obj)) r.obj.destroy()
    this.rings = []
    const spots: [number, number][] = [
      [6.5, -3.6],
      [-5.0, -4.2],
      [1.5, 3.8],
    ]
    for (let i = 0; i < spots.length; i++) {
      const o = this.kit.obj(this.robot.getSceneObject(), "ring" + i, [spots[i][0], 0.1, spots[i][1]])
      this.kit.shape(o, "cyl", [0, 0, 0], [3.4, 0.08, 3.4], [1.0, 0.8, 0.25, 1], "outer", false)
      this.kit.shape(o, "cyl", [0, 0.02, 0], [2.7, 0.1, 2.7], [0.05, 0.08, 0.12, 1], "inner", false)
      this.rings.push({obj: o, x: spots[i][0], z: spots[i][1], got: false})
    }
  }

  private buildLamps() {
    for (const l of this.lamps) if (!isNull(l)) l.destroy()
    this.lamps = []
    this.lampMats = []
    const model = this.robot.modelObject()
    for (const sx of [-1, 1]) {
      const r = this.kit.shape(model, "sphere", [sx * 1.0, 1.4, 5.4 * FRONT], [0.7, 0.7, 0.7], [0.3, 0.25, 0.15, 1], "headlight", false)
      this.lamps.push(r.obj)
      this.lampMats.push(r.sm)
    }
  }

  // ------------------------------------------------------------------------------------------------ input
  private press(id: Ctl, down: boolean) {
    if (!this.on) return
    if (id === "lights") {
      if (down) return
      this.lightsOn = !this.lightsOn
    } else this.held[id] = down
    if (down || id === "lights") this.explain(id)
    this.paintButtons()
  }

  /** Test hook: press / release a control exactly as a pinch does. */
  setHeld(id: Ctl, down: boolean) {
    this.press(id, down)
  }

  private explain(id: Ctl) {
    if (!this.map || this.available(id)) return
    const now = this.clock
    if (this.warned[id] !== undefined && now - this.warned[id] < 1.5) return
    this.warned[id] = now
    this.hud.toast(this.map.reasons[id] ? this.map.reasons[id] : "no signal", RED)
  }

  // ------------------------------------------------------------------------------------------------ per frame
  tick(dt: number) {
    if (!this.on || !this.map) return
    this.clock += dt
    if (dt > 0.1) dt = 0.1
    const m = this.map
    const drv: Drive = {gpio: {}, sr: {}, pressed: {}}
    const add = (d: Drive | null) => {
      if (!d) return
      for (const k in d.gpio) drv.gpio[k] = d.gpio[k]
      for (const k in d.sr) drv.sr[k] = (drv.sr[k] ? drv.sr[k] : 0) | d.sr[k]
    }
    const fwd = this.held["fwd"] === true
    const back = this.held["back"] === true
    const left = this.held["left"] === true
    const right = this.held["right"] === true
    if (fwd && !back) add(m.fwd)
    if (back && !fwd) add(m.back)
    if (left || right) add(m.steer)
    if (this.lightsOn) add(m.lights)
    const key = JSON.stringify(drv)
    if (key !== this.lastKey) {
      this.lastKey = key
      const res = this.lab.probe(drv)
      const mo = this.motorId !== "" ? res.parts[this.motorId] : null
      const sv = this.servoId !== "" ? res.parts[this.servoId] : null
      this.spin = mo ? mo.spin : 0
      this.servoMoves = sv ? sv.moves : false
      let lit = 0
      for (const id of this.ledIds) if (res.parts[id]) lit = Math.max(lit, res.parts[id].lit)
      this.ledLit = lit
    }
    // kinematics: motor spin -> speed, servo + left / right -> steering
    const target = this.spin * SPEED
    this.speed += (target - this.speed) * Math.min(1, dt * 6)
    const wantSteer = (left ? 1 : 0) - (right ? 1 : 0)
    const steerT = this.servoMoves ? wantSteer * STEER_DEG : 0
    this.steer += (steerT - this.steer) * Math.min(1, dt * 10)
    const rate = (this.speed * Math.tan(this.steer * DEG)) / WHEELBASE // rad / s
    this.yaw += rate / DEG * dt
    const th = this.yaw * DEG
    // forward is the model's local -Z turned by the yaw about Y
    this.x += Math.sin(th) * FRONT * this.speed * dt
    this.z += Math.cos(th) * FRONT * this.speed * dt
    this.x = Math.max(-BOUNDS_X, Math.min(BOUNDS_X, this.x))
    this.z = Math.max(-BOUNDS_Z, Math.min(BOUNDS_Z, this.z))
    this.wheels += this.speed * 60 * dt
    this.robot.setPoseXZ(this.x, this.z, this.yaw)
    this.robot.setAct("wheels", this.wheels)
    this.robot.setAct("steer", this.steer)
    // headlights follow the LEDs
    const glow = Math.min(1, this.ledLit * 2.5)
    for (let i = 0; i < this.lampMats.length; i++) this.lampMats[i].set(glow > 0.05 ? [1.0, 0.92, 0.5, 1] : [0.3, 0.25, 0.15, 1])
    for (const l of this.lamps) {
      const s = 0.7 + glow * 0.5
      l.getTransform().setLocalScale(new vec3(s, s, s))
    }
    // rings
    for (const r of this.rings) {
      if (r.got) continue
      const dx = r.x - this.x
      const dz = r.z - this.z
      if (dx * dx + dz * dz < 2.4 * 2.4) {
        r.got = true
        r.obj.enabled = false
        this.got++
        this.hud.setLabel(this.got + "/" + this.rings.length)
        this.hud.toast(String(this.got), GREEN)
        this.onRing(this.got, this.rings.length)
        if (this.got === this.rings.length) this.onAllRings()
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ debug / tests
  debug(): {x: number; z: number; yaw: number; speed: number; steer: number; got: number; lit: number; fwd: boolean; back: boolean; steerOk: boolean; lights: boolean} {
    return {
      x: this.x, z: this.z, yaw: this.yaw, speed: this.speed, steer: this.steer, got: this.got, lit: this.ledLit,
      fwd: this.available("fwd"), back: this.available("back"), steerOk: this.available("left"), lights: this.available("lights"),
    }
  }

  reasonFor(id: Ctl): string {
    return this.map && this.map.reasons[id] ? this.map.reasons[id] : ""
  }

  ringPos(i: number): {x: number; z: number} {
    return {x: this.rings[i].x, z: this.rings[i].z}
  }

  teleport(x: number, z: number) {
    this.x = x
    this.z = z
    this.robot.setPoseXZ(this.x, this.z, this.yaw)
  }
}


