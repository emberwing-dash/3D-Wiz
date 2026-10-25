// WizArView.ts - VISUALIZE in AR: the 3D object on your table with its circuit drawn ON it. Every electronic part sits at its mount point on the
// model, every wire of the project runs between the real pin positions of those parts, and POWER sends light pulses along the wires from the
// source to the load. Tap a part: it and its wires light up, the rest fades back. Layers (BODY / WIRES / POWER / EXPLODE) are toggles.
// Owns: the wire tubes + pulses on the model, the focus highlight. Must not: decide modes, move the model (WizRobot does) or edit the circuit.

import {PartKit, StyledMat} from "./WizParts"
import {PROJECT_PACK, ConnectionDef, RGBA, getComponent} from "./ProjectPack"
import {WizRobot} from "./WizRobot"

const THICK = 0.16
const PULSE_D = 0.36
const PULSE_SPEED = 7 // cm per second along the wire

interface ArWire {
  conn: ConnectionDef
  segs: {obj: SceneObject; sm: StyledMat}[]
  pulses: {obj: SceneObject; sm: StyledMat; t: number}[]
  pts: vec3[]
  len: number
  ok: boolean
}

export class WizArView {
  private root: SceneObject | null = null
  private wires: ArWire[] = []
  private on = false
  private wiresOn = true
  private power = false
  private focus = ""
  private clock = 0

  constructor(private kit: PartKit, private robot: WizRobot) {}

  /** Build the wires on the current model (call again after a project change). */
  begin() {
    this.end()
    const model = this.robot.modelObject()
    this.root = global.scene.createSceneObject("ArWires")
    this.root.setParent(model)
    this.wires = []
    const have = this.robot.partIds()
    for (const c of PROJECT_PACK.connections) {
      if (c.group === "plug") continue
      if (have.indexOf(c.from.component) < 0 || have.indexOf(c.to.component) < 0) continue
      const w: ArWire = {conn: c, segs: [], pulses: [], pts: [], len: 0, ok: true}
      for (let i = 0; i < 3; i++) {
        const s = this.kit.shape(this.root, "cyl", [0, 0, 0], [THICK, 1, THICK], c.color, "w_" + c.id + "_" + i, false)
        w.segs.push({obj: s.obj, sm: s.sm})
      }
      for (let i = 0; i < 2; i++) {
        const p = this.kit.shape(this.root, "sphere", [0, 0, 0], [PULSE_D, PULSE_D, PULSE_D], [1, 1, 1, 1], "pulse_" + c.id + "_" + i, false)
        w.pulses.push({obj: p.obj, sm: p.sm, t: i * 0.5})
      }
      this.wires.push(w)
    }
    this.on = true
    this.focus = ""
    this.setPower(false)
    this.layout()
  }

  end() {
    this.on = false
    if (this.root && !isNull(this.root)) this.root.destroy()
    this.root = null
    this.wires = []
    this.focus = ""
  }

  setWires(on: boolean) {
    this.wiresOn = on
    if (this.root && !isNull(this.root)) this.root.enabled = on
  }

  setPower(on: boolean) {
    this.power = on
    for (const w of this.wires) for (const p of w.pulses) p.obj.enabled = on
  }

  isPower(): boolean {
    return this.power
  }

  wireCount(): number {
    return this.wires.length
  }

  /** Light one part and the wires that touch it; "" = show everything evenly. */
  setFocus(id: string) {
    this.focus = id
    for (const w of this.wires) {
      const hit = id === "" || w.conn.from.component === id || w.conn.to.component === id
      const k = hit ? 1 : 0.18
      const c = w.conn.color
      for (const s of w.segs) s.sm.set([c[0], c[1], c[2], k])
    }
  }

  focusId(): string {
    return this.focus
  }

  /** Pin position of a part in model space: the part's own transform (mount point + orientation + explode) applied to the pin offset. */
  private pinLocal(comp: string, pinName: string): vec3 | null {
    const def = getComponent(comp)
    const pin = def.pins ? def.pins.find((p) => p.name === pinName) : undefined
    if (!pin) return null
    const root = this.robot.partObject(comp)
    if (!root || isNull(root)) return null
    const w = root.getTransform().getWorldTransform().multiplyPoint(new vec3(pin.at[0], pin.at[1], pin.at[2]))
    return this.robot.modelObject().getTransform().getInvertedWorldTransform().multiplyPoint(w)
  }

  /** Re-route every wire (parts may have moved: explode, turn). A -> up -> across -> down -> B. */
  private layout() {
    for (const w of this.wires) {
      const a = this.pinLocal(w.conn.from.component, w.conn.from.pin)
      const b = this.pinLocal(w.conn.to.component, w.conn.to.pin)
      if (!a || !b) {
        w.ok = false
        for (const s of w.segs) s.obj.enabled = false
        continue
      }
      w.ok = true
      const top = Math.max(a.y, b.y) + 1.1 + w.conn.lift * 0.45
      const p1 = new vec3(a.x, top, a.z)
      const p2 = new vec3(b.x, top, b.z)
      w.pts = [a, p1, p2, b]
      w.len = a.sub(p1).length + p1.sub(p2).length + p2.sub(b).length
      this.seg(w.segs[0].obj, a, p1)
      this.seg(w.segs[1].obj, p1, p2)
      this.seg(w.segs[2].obj, p2, b)
    }
  }

  private seg(o: SceneObject, a: vec3, b: vec3) {
    const d = b.sub(a)
    const len = d.length
    const t = o.getTransform()
    if (len < 0.001) {
      o.enabled = false
      return
    }
    o.enabled = true
    t.setLocalPosition(a.add(d.uniformScale(0.5)))
    const n = d.uniformScale(1 / len)
    t.setLocalRotation(n.y < -0.9995 ? quat.fromEulerVec(new vec3(Math.PI, 0, 0)) : quat.rotationFromTo(vec3.up(), n))
    t.setLocalScale(new vec3(THICK, len, THICK))
  }

  private along(w: ArWire, f: number): vec3 {
    let d = Math.max(0, Math.min(1, f)) * w.len
    for (let i = 0; i < 3; i++) {
      const a = w.pts[i]
      const b = w.pts[i + 1]
      const l = b.sub(a).length
      if (d <= l || i === 2) return l < 0.0001 ? b : a.add(b.sub(a).uniformScale(Math.min(1, d / l)))
      d -= l
    }
    return w.pts[3]
  }

  update(dt: number) {
    if (!this.on || !this.wiresOn) return
    this.clock += dt
    this.layout() // cheap (a few dozen tubes) and keeps the wires glued to the parts while the model is exploded or turned
    if (!this.power) return
    for (const w of this.wires) {
      if (!w.ok || w.len < 0.01) continue
      const hit = this.focus === "" || w.conn.from.component === this.focus || w.conn.to.component === this.focus
      for (const p of w.pulses) {
        p.t = (p.t + (dt * PULSE_SPEED) / w.len) % 1
        p.obj.getTransform().setLocalPosition(this.along(w, p.t))
        const c = w.conn.color
        p.sm.set([Math.min(1, c[0] * 0.4 + 0.7), Math.min(1, c[1] * 0.4 + 0.7), Math.min(1, c[2] * 0.4 + 0.7), hit ? 1 : 0.2])
      }
    }
  }
}
