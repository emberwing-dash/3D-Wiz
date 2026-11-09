// GuideParts.ts - the real-looking component library of the VISUALIZE and ANALYSE pages, and the RC car assembly layout.
// Owns: which 3D model each component uses (and where it comes from), pins, the mount layout on the RC car, and model instancing with size
//       normalisation for the generated models. No plain boxes or spheres stand in for a component.
// Sources (stated honestly, also shown in the info cards):
//   "KiCad"      real CAD from KiCad kicad-packages3D (CC-BY-SA 4.0 with the library exception): LED, resistor (colour bands), diode, NPN TO-92,
//                DIP-16 (the L293D), ESP32-WROOM module, push button, buzzer; breadboard + micro servo from Adafruit CAD (MIT).
//   "Fast3D"     AI-generated meshes (Lens Studio Fast3D): 4xAA battery holder, N20 gear motor, slide switch.
//   "code"       built in code from a can, a stripe and legs: the electrolytic capacitor (Fast3D refused it twice).
//   missing      TO-220 transistor (not sourced; the NPN TO-92 stands for "transistor").

import {PartKit} from "./WizParts"
import {partPrefab} from "./WizParts"
import {RC_SAMPLE, V3} from "./GuideData"

export type PartSource = "KiCad" | "Adafruit" | "Fast3D" | "code"

export interface PartPin {
  id: string
  at: V3 // part-local, cm
}

export interface VizPart {
  id: string
  name: string // the name in labels
  short: string // very short tag text
  source: PartSource
  glb: string // key of partPrefab(), or "gen:<name>" for a generated model, or "code:capacitor"
  sizeCm: V3 // real size (x, y, z); generated models are scaled so their longest side matches
  pins: PartPin[]
}

const dipPins = (): PartPin[] => RC_SAMPLE.parts.filter((p) => p.id === "l293d")[0].pins.map((p) => ({id: p.id, at: p.at}))
const espPins = (): PartPin[] => RC_SAMPLE.parts.filter((p) => p.id === "esp32")[0].pins.map((p) => ({id: p.id, at: p.at}))
const servoPins = (): PartPin[] => RC_SAMPLE.parts.filter((p) => p.id === "servo")[0].pins.map((p) => ({id: p.id, at: p.at}))

export const VIZ_PARTS: VizPart[] = [
  {id: "esp32", name: "ESP32 module", short: "ESP32", source: "KiCad", glb: "esp32_wroom", sizeCm: [1.8, 0.31, 2.55], pins: espPins()},
  {id: "l293d", name: "L293D motor driver", short: "L293D", source: "KiCad", glb: "dip16", sizeCm: [0.79, 0.7, 1.92], pins: dipPins()},
  {id: "servo", name: "Steering servo", short: "Servo", source: "Adafruit", glb: "servo_micro", sizeCm: [1.2, 3.07, 3.13], pins: servoPins()},
  {id: "battery", name: "4xAA battery holder", short: "Battery", source: "Fast3D", glb: "gen:battery_holder_4xAA", sizeCm: [5.5, 1.6, 3.0], pins: [{id: "+", at: [-2.6, 1.6, 1.4]}, {id: "-", at: [-2.6, 1.6, -1.4]}]},
  {id: "motor", name: "N20 gear motor", short: "Motor", source: "Fast3D", glb: "gen:dc_motor_n20", sizeCm: [1.2, 1.0, 2.6], pins: [{id: "M+", at: [-0.3, 0.8, -1.3]}, {id: "M-", at: [0.3, 0.8, -1.3]}]},
  {id: "switch", name: "Slide switch", short: "Switch", source: "Fast3D", glb: "gen:slide_switch", sizeCm: [1.0, 0.7, 0.5], pins: [{id: "1", at: [-0.3, 0.8, 0]}, {id: "2", at: [0.3, 0.8, 0]}]},
  {id: "led", name: "LED 5 mm", short: "LED", source: "KiCad", glb: "led_5mm", sizeCm: [0.54, 1.41, 0.58], pins: [{id: "A", at: [0.107, 0.12, 0]}, {id: "K", at: [-0.147, 0.12, 0]}]},
  {id: "resistor", name: "Resistor 220 ohm", short: "Resistor", source: "KiCad", glb: "resistor_axial", sizeCm: [1.08, 0.55, 0.25], pins: [{id: "1", at: [-0.508, 0.12, 0]}, {id: "2", at: [0.508, 0.12, 0]}]},
  {id: "npn", name: "NPN transistor (TO-92)", short: "NPN", source: "KiCad", glb: "npn_to92", sizeCm: [0.48, 0.98, 0.37], pins: [{id: "E", at: [-0.127, 0.12, 0.054]}, {id: "B", at: [0, 0.12, 0.054]}, {id: "C", at: [0.127, 0.12, 0.054]}]},
  {id: "diode", name: "Flyback diode", short: "Diode", source: "KiCad", glb: "diode_do41", sizeCm: [1.1, 0.57, 0.27], pins: [{id: "K", at: [-0.508, 0.12, 0]}, {id: "A", at: [0.508, 0.12, 0]}]},
  {id: "capacitor", name: "Electrolytic capacitor", short: "Capacitor", source: "code", glb: "code:capacitor", sizeCm: [0.6, 1.1, 0.6], pins: [{id: "+", at: [0.15, 0.1, 0]}, {id: "-", at: [-0.15, 0.1, 0]}]},
]

export function vizPart(id: string): VizPart {
  return VIZ_PARTS.filter((p) => p.id === id)[0]
}

/** Where each component sits on the RC car (model-local cm; y is the surface it stands on). */
export interface Mount {
  id: string
  part: string
  at: V3
  rotY: number // degrees
}

export const RC_MOUNTS: Mount[] = [
  {id: "m_esp32", part: "esp32", at: [-1.4, 3.15, -1.2], rotY: 0},
  {id: "m_l293d", part: "l293d", at: [1.7, 3.15, -1.2], rotY: 0},
  {id: "m_servo", part: "servo", at: [0, 3.15, -5.3], rotY: 0},
  {id: "m_battery", part: "battery", at: [0, 3.15, 2.9], rotY: 0},
  {id: "m_motor", part: "motor", at: [1.3, 0.2, 5.2], rotY: 0},
  {id: "m_switch", part: "switch", at: [-2.4, 3.15, 0.9], rotY: 0},
  {id: "m_led", part: "led", at: [-2.3, 3.15, 0.0], rotY: 0},
  {id: "m_resistor", part: "resistor", at: [-0.9, 3.15, 0.0], rotY: 0},
  {id: "m_npn", part: "npn", at: [0.5, 3.15, 0.0], rotY: 0},
  {id: "m_diode", part: "diode", at: [1.9, 3.15, 0.0], rotY: 0},
  {id: "m_capacitor", part: "capacitor", at: [2.5, 3.15, 1.1], rotY: 0},
]

/** Wires of the RC car circuit (drawn once both ends are on the model). "part.pin" -> "part.pin". */
export const RC_WIRES: {a: string; b: string; color: [number, number, number, number]}[] = [
  {a: "esp32.IO12", b: "l293d.2", color: [0.95, 0.75, 0.2, 1]},
  {a: "esp32.IO13", b: "l293d.7", color: [0.35, 0.7, 1, 1]},
  {a: "esp32.IO14", b: "servo.SIG", color: [0.95, 0.5, 0.15, 1]},
  {a: "battery.+", b: "switch.1", color: [1, 0.3, 0.3, 1]},
  {a: "switch.2", b: "l293d.8", color: [1, 0.3, 0.3, 1]},
  {a: "l293d.3", b: "motor.M+", color: [0.3, 0.95, 0.5, 1]},
  {a: "l293d.6", b: "motor.M-", color: [0.9, 0.9, 0.9, 1]},
  {a: "led.A", b: "resistor.1", color: [0.9, 0.4, 0.9, 1]},
  {a: "resistor.2", b: "esp32.IO2", color: [0.9, 0.9, 0.3, 1]},
  {a: "npn.B", b: "esp32.IO4", color: [0.4, 0.9, 0.9, 1]},
  {a: "diode.A", b: "motor.M+", color: [0.6, 0.6, 1, 1]},
  {a: "capacitor.+", b: "battery.+", color: [1, 0.55, 0.5, 1]},
]

function generated(name: string): ObjectPrefab | null {
  switch (name) {
    case "battery_holder_4xAA":
      return requireAsset("../Models/Generated/battery_holder_4xAA.glb") as ObjectPrefab
    case "dc_motor_n20":
      return requireAsset("../Models/Generated/dc_motor_n20.glb") as ObjectPrefab
    case "slide_switch":
      return requireAsset("../Models/Generated/slide_switch.glb") as ObjectPrefab
  }
  return null
}

function worldBounds(so: SceneObject): {mn: vec3; mx: vec3; any: boolean} {
  let mn = new vec3(1e9, 1e9, 1e9)
  let mx = new vec3(-1e9, -1e9, -1e9)
  let any = false
  const walk = (o: SceneObject) => {
    const r = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (!isNull(r)) {
      const a = r.worldAabbMin()
      const b = r.worldAabbMax()
      mn = new vec3(Math.min(mn.x, a.x), Math.min(mn.y, a.y), Math.min(mn.z, a.z))
      mx = new vec3(Math.max(mx.x, b.x), Math.max(mx.y, b.y), Math.max(mx.z, b.z))
      any = true
    }
    for (let i = 0; i < o.getChildrenCount(); i++) walk(o.getChild(i))
  }
  walk(so)
  return {mn: mn, mx: mx, any: any}
}

/** A radial electrolytic capacitor built from a can, a stripe, a rubber cap and two legs (the only code-modelled component). */
function capacitor(kit: PartKit, parent: SceneObject) {
  kit.shape(parent, "cyl", [0, 0.6, 0], [0.62, 1.0, 0.62], [0.1, 0.16, 0.42, 1], "can", true)
  kit.shape(parent, "cyl", [0, 1.12, 0], [0.64, 0.06, 0.64], [0.75, 0.78, 0.82, 1], "top", true)
  kit.shape(parent, "box", [0.3, 0.6, 0], [0.06, 0.95, 0.3], [0.85, 0.88, 0.95, 1], "stripe", true)
  kit.shape(parent, "cyl", [0.15, 0.04, 0], [0.05, 0.5, 0.05], [0.8, 0.8, 0.82, 1], "legP", true)
  kit.shape(parent, "cyl", [-0.15, 0.04, 0], [0.05, 0.4, 0.05], [0.8, 0.8, 0.82, 1], "legN", true)
}

/** Put the 3D model for `glb` under `holder`: a partPrefab() key, "gen:<name>" (generated, scaled so its longest side is the real size) or "code:capacitor". */
export function instModel(kit: PartKit, holder: SceneObject, glb: string, sizeCm: V3) {
  if (glb.indexOf("code:") === 0) capacitor(kit, holder)
  else if (glb.indexOf("gen:") === 0) {
    const pf = generated(glb.substring(4))
    if (pf !== null) {
      // measure and normalise in an unrotated, unscaled scratch object, then hang it under the part
      const tmp = global.scene.createSceneObject("tmpMeasure")
      const inst = pf.instantiate(tmp)
      const b = worldBounds(inst)
      const t = inst.getTransform()
      if (b.any) {
        const size = b.mx.sub(b.mn)
        const longest = Math.max(size.x, size.y, size.z, 0.0001)
        const k = Math.max(sizeCm[0], sizeCm[1], sizeCm[2]) / longest
        t.setLocalScale(t.getLocalScale().uniformScale(k))
        const b2 = worldBounds(inst)
        t.setLocalPosition(t.getLocalPosition().add(new vec3(-(b2.mn.x + b2.mx.x) / 2, -b2.mn.y, -(b2.mn.z + b2.mx.z) / 2)))
      }
      inst.setParent(holder)
      tmp.destroy()
    }
  } else {
    const pf = partPrefab(glb)
    if (pf !== null) pf.instantiate(holder)
  }
}

/** Instantiate a component under `parent` (origin = bottom centre). Generated models are scaled so their longest side is the real size. */
export function buildPart(kit: PartKit, parent: SceneObject, id: string, pinSize: number = 0.22): {root: SceneObject; pins: {[id: string]: SceneObject}} {
  const def = vizPart(id)
  const root = kit.obj(parent, "part_" + id)
  const holder = kit.obj(root, "model")
  instModel(kit, holder, def.glb, def.sizeCm)
  const pins: {[id: string]: SceneObject} = {}
  for (const p of def.pins) {
    const n = kit.obj(root, "pin_" + id + "_" + p.id, p.at)
    kit.shape(n, "sphere", [0, 0, 0], [pinSize, pinSize, pinSize], [0.95, 0.95, 1, 0.9], "dot", false)
    pins[p.id] = n
  }
  return {root: root, pins: pins}
}
