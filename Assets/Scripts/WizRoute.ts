// WizRoute.ts - CHECKPOINTS: numbered flags dropped on the table (aim with the ring, click). GO makes the model leave its spot and travel
// through the flags in order: a legged robot turns and walks with its gait, a wheeled one turns and drives with its wheels turning.
// Owns: the flags, the path lines, the travel (position, heading, gait signal). Must not: decide modes, menus or XP (WizMain does).

import {PartKit, StyledMat} from "./WizParts"
import {PROJECT_PACK, RGBA} from "./ProjectPack"
import {WizRobot} from "./WizRobot"
import {uiText, FONT_SEMIBOLD, COLOR_TEXT} from "./WizUI"

const MAX_POINTS = 8
const REACH = 0.9 // cm: closer than this counts as arrived
const LEG_SPEED = 3.6 // cm / s (a small quadruped walks slowly)
const WHEEL_SPEED = 9 // cm / s
const TURN_RATE = 150 // deg / s
const DEG = Math.PI / 180
const FLAG: RGBA = [1.0, 0.8, 0.25, 1]

export type Locomotion = "legs" | "wheels" | "none"

interface Cp {
  x: number
  z: number
  obj: SceneObject
  flag: StyledMat
}

export class WizRoute {
  private root: SceneObject
  private lines: SceneObject
  private pts: Cp[] = []
  private x = 0
  private z = 0
  private yaw = 0
  private running = false
  private target = 0
  private wheelPhase = 0
  private shown = false
  onReach: (index: number, total: number) => void = () => {}
  onDone: () => void = () => {}
  onGait: (moving: boolean) => void = () => {}

  constructor(private kit: PartKit, private robot: WizRobot) {
    this.root = global.scene.createSceneObject("RouteFlags")
    this.root.setParent(robot.getSceneObject())
    this.lines = global.scene.createSceneObject("RouteLines")
    this.lines.setParent(this.root)
    this.root.enabled = false
  }

  /** How this project moves: legs (Sesame), wheels (the cars) or not at all (pet, hand, circuit). */
  static kind(): Locomotion {
    if (PROJECT_PACK.rig.mode === "sesame") return "legs"
    for (const a of PROJECT_PACK.rig.acts) if (a.name === "wheels" || a.name === "wheelL") return "wheels"
    return "none"
  }

  canMove(): boolean {
    return WizRoute.kind() !== "none"
  }

  /** The model's nose is along +Z for the legged robot and -Z for the chassis (same convention as Drive). */
  private front(): number {
    return WizRoute.kind() === "legs" ? 1 : -1
  }

  show(on: boolean) {
    this.shown = on
    this.root.enabled = on
  }

  count(): number {
    return this.pts.length
  }

  isRunning(): boolean {
    return this.running
  }

  reached(): number {
    return this.running ? this.target : this.pts.length > 0 && this.target >= this.pts.length ? this.pts.length : this.target
  }

  poseNow(): {x: number; z: number; yaw: number} {
    return {x: this.x, z: this.z, yaw: this.yaw}
  }

  /** Drop a checkpoint at a world position (the ring on the table). */
  addWorld(world: vec3): boolean {
    if (this.pts.length >= MAX_POINTS) return false
    const l = this.robot.getSceneObject().getTransform().getInvertedWorldTransform().multiplyPoint(world)
    this.add(l.x, l.z)
    return true
  }

  add(x: number, z: number) {
    const idx = this.pts.length
    const o = global.scene.createSceneObject("cp_" + (idx + 1))
    o.setParent(this.root)
    o.getTransform().setLocalPosition(new vec3(x, 0, z))
    this.kit.shape(o, "cyl", [0, 1.6, 0], [0.18, 3.2, 0.18], [0.85, 0.88, 0.95, 1], "pole", false)
    this.kit.shape(o, "sphere", [0, 0.1, 0], [1.2, 0.3, 1.2], FLAG, "base", false)
    const f = this.kit.shape(o, "box", [0.9, 2.7, 0], [1.8, 1.0, 0.1], FLAG, "flag", false)
    const t = uiText(o, "n", String(idx + 1), 22, new vec4(0.05, 0.07, 0.12, 1), new vec3(0.9, 2.7, 0.12), FONT_SEMIBOLD)
    t.outlineSettings.enabled = false
    this.pts.push({x: x, z: z, obj: o, flag: f.sm})
    this.drawLines()
  }

  clear() {
    this.stop()
    for (const p of this.pts) if (!isNull(p.obj)) p.obj.destroy()
    this.pts = []
    this.target = 0
    this.drawLines()
  }

  /** Back to the spot the model started on (also what leaving Visualize does). */
  resetPose() {
    this.x = 0
    this.z = 0
    this.yaw = this.robot.homeYaw()
    this.target = 0
    this.robot.setPoseXZ(0, 0, this.yaw)
    for (const p of this.pts) p.flag.set(FLAG)
  }

  go() {
    if (this.pts.length === 0) return
    const pose = this.robot.poseXZ()
    this.x = pose.x
    this.z = pose.z
    this.yaw = pose.yaw
    this.target = 0
    this.running = true
    for (const p of this.pts) p.flag.set(FLAG)
    this.drawLines()
  }

  stop() {
    if (this.running) this.onGait(false)
    this.running = false
  }

  private drawLines() {
    for (let i = this.lines.getChildrenCount() - 1; i >= 0; i--) this.lines.getChild(i).destroy()
    let px = this.robot.poseXZ().x
    let pz = this.robot.poseXZ().z
    for (let i = 0; i < this.pts.length; i++) {
      const dx = this.pts[i].x - px
      const dz = this.pts[i].z - pz
      const len = Math.sqrt(dx * dx + dz * dz)
      if (len > 0.1) {
        const s = this.kit.shape(this.lines, "box", [px + dx / 2, 0.12, pz + dz / 2], [0.25, 0.08, len], [0.35, 0.95, 1.0, 1], "seg" + i, false)
        s.obj.getTransform().setLocalRotation(quat.angleAxis(Math.atan2(dx, dz), vec3.up()))
      }
      px = this.pts[i].x
      pz = this.pts[i].z
    }
  }

  update(dt: number) {
    if (!this.running) return
    if (this.target >= this.pts.length) {
      this.running = false
      this.onGait(false)
      this.onDone()
      return
    }
    const p = this.pts[this.target]
    const dx = p.x - this.x
    const dz = p.z - this.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    const fr = this.front()
    // heading that points the nose at the checkpoint (nose direction = (sin th, cos th) * front)
    const want = Math.atan2(dx * fr, dz * fr) / DEG
    let d = want - this.yaw
    while (d > 180) d -= 360
    while (d < -180) d += 360
    const step = TURN_RATE * dt
    this.yaw += Math.max(-step, Math.min(step, d))
    const facing = Math.abs(d) < 14
    const speed = WizRoute.kind() === "legs" ? LEG_SPEED : WHEEL_SPEED
    let moved = 0
    if (facing && dist > REACH) {
      moved = Math.min(dist, speed * dt)
      this.x += (dx / dist) * moved
      this.z += (dz / dist) * moved
    }
    this.robot.setPoseXZ(this.x, this.z, this.yaw)
    // the gait: legs keep stepping while it travels or turns, wheels turn with the distance covered
    this.onGait(true)
    if (WizRoute.kind() === "wheels") {
      this.wheelPhase += moved * 60 + (facing ? 0 : TURN_RATE * dt * 0.3)
      this.robot.setAct("wheels", this.wheelPhase)
      this.robot.setAct("wheelL", this.wheelPhase)
      this.robot.setAct("wheelR", this.wheelPhase)
    }
    if (dist <= REACH) {
      p.flag.set([0.35, 1.0, 0.55, 1]) // reached: the flag turns green
      this.target++
      this.onReach(this.target, this.pts.length)
    }
  }
}
