// PackForrc.ts - project pack: FORRC, the Free and Open RC Robot Car (3D-printed chassis + the BOM electronics), with a Circuit Lab.
// SOURCE (read offline): circuit_ref/forrc  (README.md, rccarchassis.FCStd, exported/*.stl, bom/exported/rccar-bom-v1.csv)
//   Licence: CERN-OHL-S v2 (strongly reciprocal). Printed parts: the 8 repo STL files converted to GLB (mm -> cm, Z-up -> Y-up) with tools/cad.
//   BOM electronics (stated): ESP32-CAM, L293D motor controller, 74HC595 shift register, N20 geared DC motor, SG90 steering servo,
//   MT3608 boost converter, 4 x AA holder, small breadboard, 4 LEDs + 4 x 220 ohm, 1N4004 flyback diode, 2N2222 transistor, push buttons.
// NOT in the source (so NOT claimed as "from the repo"): any WIRING. The README and BOM have no schematic and no pin assignment. The
//   reference wiring below is MY illustrative design from the BOM parts and their datasheet pin functions (L293D, 74HC595, SG90, MT3608,
//   ESP32-CAM header). Every wire is flagged basis "illustrative" in the pack notes; the Circuit Lab lets you wire it any way you like.
// Part models: printed parts = repo STLs; resistor, LED, diode, transistor, DIP-16 ICs and the servo = real CAD from KiCad
//   kicad-packages3D (CC-BY-SA 4.0 with the KiCad library exception) and Adafruit_CAD_Parts (MIT); ESP32-CAM board, MT3608, 4xAA holder
//   and the N20 motor are drawn at standard sizes (no free model).
// Must not: contain engine code.

import {PackShape, ComponentDef, ConnectionDef, StepDef, CommandDef, PrimDef, PinDef, V3, RGBA} from "./ProjectPack"
import {mk, box, cyl, pin, wire, step, cmd, fillGuide, finishPack, WIRE, C, DEFAULT_GAME, DEFAULT_WORKBENCH, DEFAULT_VALIDATION_NOTE} from "./PackKit"
import {FnDef} from "./CircuitSim"

const URL = "https://github.com/codingwithsomeguy/forrc"
const PLA: RGBA = [0.3, 0.52, 0.92, 1]
const PLA_W: RGBA = [0.9, 0.92, 0.95, 1]
const PLA_O: RGBA = [0.97, 0.55, 0.16, 1]

// ---- real component models (sizes from Assets/Models/Parts/parts.json; origin = bottom centre) ---------------------------------
const SZ: {[id: string]: V3} = {
  led_5mm: [0.54, 1.41, 0.58], resistor_axial: [1.08, 0.55, 0.25], diode_do41: [1.1, 0.57, 0.27], npn_to92: [0.48, 0.98, 0.37],
  dip16: [0.79, 0.7, 1.92], push_button: [0.72, 0.78, 0.6], esp32_wroom: [1.8, 0.31, 2.55], servo_micro: [1.2, 3.07, 3.13],
}

function glb(id: string, at?: V3, rot?: V3): PrimDef {
  const s = SZ[id]
  const p: V3 = at ? at : [0, s[1] / 2, 0]
  return {s: "glb", n: id, p: p, z: s, r: rot}
}

const PIN_Y = 0.12

// 2-lead parts (the leads' feet are the pins)
const ledPins = (): PinDef[] => [pin("K", [-0.147, PIN_Y, 0], "K"), pin("A", [0.107, PIN_Y, 0], "A")]
const resPins = (): PinDef[] => [pin("1", [-0.508, PIN_Y, 0], "1"), pin("2", [0.508, PIN_Y, 0], "2")]
const diodePins = (): PinDef[] => [pin("K", [-0.508, PIN_Y, 0], "K"), pin("A", [0.508, PIN_Y, 0], "A")]
const npnPins = (): PinDef[] => [pin("E", [-0.127, PIN_Y, 0.054], "E"), pin("B", [0, PIN_Y, 0.054], "B"), pin("C", [0.127, PIN_Y, 0.054], "C")]
const btnPins = (): PinDef[] => [pin("1", [-0.315, PIN_Y, -0.225], "1"), pin("2", [0.315, PIN_Y, -0.225], "2")]

/** DIP-16: pins 1-8 down the left row (x = -3.81 mm), 9-16 up the right row; 2.54 mm pitch (measured on the KiCad model). */
function dipPins(labels: string[]): PinDef[] {
  const out: PinDef[] = []
  for (let n = 1; n <= 16; n++) {
    const left = n <= 8
    const z = left ? -0.889 + (n - 1) * 0.254 : 0.889 - (n - 9) * 0.254
    out.push(pin(String(n), [left ? -0.381 : 0.381, 0.3, z], labels[n - 1]))
  }
  return out
}
const L293_LABELS = ["EN", "1A", "1Y", "GND", "GND", "2Y", "2A", "VCC2", "EN", "3A", "3Y", "GND", "GND", "4Y", "4A", "VCC1"]
const HC595_LABELS = ["QB", "QC", "QD", "QE", "QF", "QG", "QH", "GND", "QH'", "CLR", "CLK", "LAT", "OE", "SER", "QA", "VCC"]

// ---- modules drawn from primitives (no free model) -----------------------------------------------------------------------------
function esp32camModel(): {prims: PrimDef[]; pins: PinDef[]} {
  const left = ["5V", "GND", "IO12", "IO13", "IO15", "IO14", "IO2", "IO4"]
  const prims: PrimDef[] = [
    box([0, 0.08, 0], [2.7, 0.16, 4.05], [0.08, 0.1, 0.12, 1], undefined, undefined, "pcb"),
    glb("esp32_wroom", [0, 0.16 + SZ.esp32_wroom[1] / 2, -0.75]),
    box([0, 0.5, 1.55], [0.85, 0.7, 0.85], [0.06, 0.06, 0.07, 1], undefined, undefined, "camera"),
    cyl([0, 0.9, 1.55], [0.5, 0.1, 0.5], [0.25, 0.3, 0.45, 1], undefined, undefined, "lens"),
    box([-1.143, 0.2, -0.15], [0.25, 0.22, 2.0], [0.06, 0.06, 0.07, 1], undefined, undefined, "headerL"),
    box([1.143, 0.2, -0.15], [0.25, 0.22, 2.0], [0.06, 0.06, 0.07, 1], undefined, undefined, "headerR"),
  ]
  const pins: PinDef[] = []
  for (let i = 0; i < left.length; i++) pins.push(pin(left[i], [-1.143, 0.34, -1.1 + i * 0.254], left[i]))
  pins.push(pin("3V3", [1.143, 0.34, -1.1], "3V3"))
  return {prims: prims, pins: pins}
}

function boostModel(): {prims: PrimDef[]; pins: PinDef[]} {
  return {
    prims: [
      box([0, 0.06, 0], [3.7, 0.12, 1.7], C.pcbBlue, undefined, undefined, "pcb"),
      box([-0.2, 0.5, 0], [1.0, 0.8, 1.0], C.black, undefined, undefined, "inductor"),
      box([1.0, 0.3, 0.1], [0.5, 0.35, 0.5], [0.1, 0.35, 0.9, 1], undefined, undefined, "trimmer"),
      cyl([-1.2, 0.35, -0.4], [0.5, 0.5, 0.5], C.silver, undefined, undefined, "cap"),
    ],
    pins: [
      pin("IN+", [-1.7, 0.16, 0.6], "IN+"), pin("IN-", [-1.7, 0.16, -0.6], "IN-"), pin("OUT+", [1.7, 0.16, 0.6], "OUT+"), pin("OUT-", [1.7, 0.16, -0.6], "OUT-"),
    ],
  }
}

function batteryModel(): {prims: PrimDef[]; pins: PinDef[]} {
  const prims: PrimDef[] = [box([0, 0.8, 0], [6.3, 1.6, 5.7], [0.08, 0.09, 0.11, 1], undefined, undefined, "holder")]
  for (let i = 0; i < 4; i++) prims.push(cyl([-2.25 + i * 1.5, 1.45, 0], [1.4, 5.0, 1.4], [0.5, 0.36, 0.08, 1], undefined, [90, 0, 0], "cell" + i))
  return {prims: prims, pins: [pin("+", [-0.35, 0.8, 3.05], "+"), pin("-", [0.35, 0.8, 3.05], "-")]}
}

function n20Model(): {prims: PrimDef[]; pins: PinDef[]} {
  return {
    prims: [
      cyl([0, 0.5, -0.45], [1.0, 1.5, 1.0], C.silver, undefined, [90, 0, 0], "can"),
      box([0, 0.5, 0.8], [1.2, 1.0, 0.95], [0.75, 0.78, 0.82, 1], undefined, undefined, "gearbox"),
      cyl([0, 0.5, 1.6], [0.3, 0.8, 0.3], C.silver, undefined, [90, 0, 0], "shaft"),
      box([-0.25, 0.5, -1.25], [0.12, 0.3, 0.4], C.gold, undefined, undefined, "tab1"),
      box([0.25, 0.5, -1.25], [0.12, 0.3, 0.4], C.gold, undefined, undefined, "tab2"),
    ],
    pins: [pin("M+", [-0.25, 0.5, -1.5], "M+"), pin("M-", [0.25, 0.5, -1.5], "M-")],
  }
}

export function makeForrcPack(): PackShape {
  const esp = esp32camModel()
  const bst = boostModel()
  const bat = batteryModel()
  const mot = n20Model()

  // ---- printed parts: the repo STLs (GLB origin = CAD origin; chassis, riser and clip are in the CAD assembly frame) ----------
  const printed = (id: string, name: string, glbName: string, stl: string, tris: number, size: V3, at: V3, bmin: V3, bmax: V3, color: RGBA, purpose: string, rot?: V3, exploded?: V3): ComponentDef => ({
    id: id, name: name, kind: "printed", group: "body", purpose: purpose, glb: glbName, stl: stl, tris: tris, sizeCm: size, sizeBasis: "stl",
    assembled: at, assembledRot: rot, exploded: exploded ? exploded : [0, 2, 0], boundsMin: bmin, boundsMax: bmax, color: color, pins: [],
    notes: ["Mesh converted from the repo STL (mm -> cm, Z-up -> Y-up).", "Position: " + (rot === undefined && at[0] === 0 && at[1] === 0 && at[2] === 0 ? "from the CAD assembly frame." : "ILLUSTRATIVE (this STL is exported in its own frame).")],
  })
  const wheelDef = (id: string, name: string, x: number, z: number): ComponentDef =>
    printed(id, name, "rubberbandwheel.glb", "rubberbandwheel.stl", 4162, [0.6, 4.0, 4.0], [x, -1.8, z], [x > 0 ? x : x - 0.6, -3.8, z - 2.0], [x > 0 ? x + 0.6 : x, 0.2, z + 2.0], [0.12, 0.12, 0.14, 1],
      "Printed wheel rim. A rubber band (#61) goes round it as the tyre.", x < 0 ? [0, 180, 0] : undefined, [x > 0 ? 3 : -3, 0, 0])
  const spacerDef = (id: string, x: number, z: number): ComponentDef =>
    printed(id, "Axle spacer", "axleouterspacer.glb", "axleouterspacer.stl", 408, [0.8, 0.7, 0.8], [x, -1.8, z], [x > 0 ? x : x - 0.7, -2.2, z - 0.4], [x > 0 ? x + 0.7 : x, -1.4, z + 0.4], PLA_O,
      "Holds the wheel off the chassis on the 2 mm axle.", [0, 0, x > 0 ? -90 : 90], [x > 0 ? 2 : -2, 0, 0])

  const components: ComponentDef[] = [
    printed("chassis", "RC chassis", "rcchassis.glb", "rcchassis.stl", 3374, [6.6, 2.6, 11.6], [0, 0, 0], [-3.3, -2.6, -5.8], [3.3, 0, 5.8], PLA,
      "The printed chassis: side rails, axle holes, motor pocket and the front steering mount.", undefined, [0, -2.5, 0]),
    printed("riser", "Electronics riser", "electronicsriser.glb", "electronicsriser.stl", 2256, [6.4, 3.45, 9.2], [0, 0, 0], [-3.2, -0.3, -4.35], [3.2, 3.15, 4.85], PLA_W,
      "The deck that carries the breadboard and electronics above the chassis.", undefined, [0, 4.5, 0]),
    printed("motor_clip", "Motor clip", "motorclip.glb", "motorclip.stl", 724, [1.95, 1.43, 2.3], [0, 0, 0], [-1.65, -0.35, 3.05], [0.3, 1.08, 5.35], PLA_O,
      "Clip that holds the N20 geared motor in its pocket.", undefined, [0, 3.2, 0]),
    printed("motor_gear", "Motor gear", "motorgear.glb", "motorgear.stl", 1140, [1.69, 0.6, 1.7], [1.2, -0.1, 4.4], [1.2, -0.95, 3.55], [1.8, 0.75, 5.25], PLA_W,
      "Small gear on the motor shaft. It turns the drive gear.", [0, 0, -90], [2, 1.5, 0]),
    printed("drive_gear", "Drive gear", "drivegear.glb", "drivegear.stl", 1120, [1.69, 0.6, 1.7], [1.2, -1.8, 4.4], [1.2, -2.65, 3.55], [1.8, -0.95, 5.25], PLA_O,
      "Gear fixed on the rear axle. It carries the motor torque to the wheels.", [0, 0, -90], [2, -1.5, 0]),
    wheelDef("wheel_fr", "Wheel front right", 4.0, -4.4),
    wheelDef("wheel_fl", "Wheel front left", -4.0, -4.4),
    wheelDef("wheel_rr", "Wheel rear right", 4.0, 4.4),
    wheelDef("wheel_rl", "Wheel rear left", -4.0, 4.4),
    spacerDef("spacer_fr", 3.3, -4.4), spacerDef("spacer_fl", -3.3, -4.4), spacerDef("spacer_rr", 3.3, 4.4), spacerDef("spacer_rl", -3.3, 4.4),
    printed("servo_cap", "Steering cap", "simplesteeringservocap.glb", "simplesteeringservocap.stl", 814, [1.6, 0.8, 2.01], [0, 3.1, -5.1], [-0.8, 3.1, -6.1], [0.8, 3.9, -4.1], PLA_W,
      "Cap on the steering servo horn. It pushes the front steering.", undefined, [0, 3, 0]),

    // ---- electronics (BOM) ----
    mk({
      id: "esp", name: "ESP32-CAM", color: C.pcbGreen, assembled: [-1.7, 3.15, -2.2], prims: esp.prims, pins: esp.pins, benchPos: [-1.2, 0, -0.8], exploded: [0, 4, 0], outward: true,
      purpose: "The brain. GPIO12 / 13 drive the L293D, GPIO15 the steering servo, GPIO14 / 2 / 4 the shift register.", elec: {kind: "mcu", gpios: ["IO12", "IO13", "IO14", "IO15", "IO2", "IO4"]},
      notes: ["Board 27 x 40.5 mm (standard size; no free model). The WROOM module on it is the KiCad ESP32-WROOM-32 model.", "Which GPIO does what is MY choice (the repo has no schematic)."],
    }),
    mk({
      id: "drv", name: "L293D driver", color: C.black, assembled: [2.4, 3.15, -0.8], prims: [glb("dip16"), box([0, 0.72, 0], [0.5, 0.03, 1.3], [0.95, 0.8, 0.1, 1], undefined, undefined, "stripe")], pins: dipPins(L293_LABELS),
      benchPos: [2.0, 0, -2.4], exploded: [0, 4, 0], outward: true, elec: {kind: "l293d"},
      purpose: "H-bridge motor driver (DIP-16). IN1 / IN2 pick the direction; its outputs drive the motor.", notes: ["Real KiCad DIP-16 model. Pin functions from the L293D datasheet."],
    }),
    mk({
      id: "sr", name: "74HC595", color: C.black, assembled: [2.4, 3.15, 1.1], prims: [glb("dip16"), box([0, 0.72, 0], [0.5, 0.03, 1.3], [0.2, 0.9, 1.0, 1], undefined, undefined, "stripe")], pins: dipPins(HC595_LABELS),
      benchPos: [2.0, 0, 0.6], exploded: [0, 4, 0], outward: true, elec: {kind: "hc595"},
      purpose: "Shift register: three GPIO pins (data, clock, latch) give 8 outputs for the LEDs.", notes: ["Real KiCad DIP-16 model. Pin functions from the 74HC595 datasheet."],
    }),
    mk({
      id: "mot", name: "N20 motor", color: C.silver, assembled: [-0.65, -0.6, 4.4], assembledRot: [0, 90, 0], prims: mot.prims, pins: mot.pins, benchPos: [6.8, 0, -3.2], benchYaw: 90, exploded: [0, -3, 0],
      elec: {kind: "motor", p: {ohms: 6}}, purpose: "N20 geared DC motor, 3-6 V. Drives the rear axle through two gears.", notes: ["Standard N20 size (12 x 10 x ~24 mm); no free model."],
    }),
    mk({
      id: "srv", name: "Steering servo", group: "servo", color: [0.2, 0.32, 0.62, 1], assembled: [0, 0, -5.1], prims: [glb("servo_micro")], pins: [pin("GND", [-0.25, 0.8, -1.9], "GND"), pin("VCC", [0, 0.8, -1.9], "VCC"), pin("SIG", [0.25, 0.8, -1.9], "SIG")],
      benchPos: [6.8, 0, 0.4], exploded: [0, 3, 0], outward: true, elec: {kind: "servo"},
      purpose: "9 g micro servo on the front. It swings the steering through the printed cap.", notes: ["Real model: Adafruit 1143 micro servo (MG90S-class, same footprint class as the SG90 in the BOM)."],
    }),
    mk({
      id: "batt", name: "4 x AA", color: [0.14, 0.15, 0.18, 1], assembled: [0, 3.15, 3.4], prims: bat.prims, pins: bat.pins, benchPos: [-6.4, 0, 0.5], exploded: [0, 4, 0], outward: true,
      elec: {kind: "battery", p: {volts: 6}}, purpose: "Four AA cells (6 V). Powers the boost converter.", notes: ["Standard size; no free model."],
    }),
    mk({
      id: "boost", name: "MT3608 boost", color: C.pcbBlue, assembled: [1.2, 3.15, -3.4], prims: bst.prims, pins: bst.pins, benchPos: [-6.4, 0, 5.0], exploded: [0, 4, 0], outward: true,
      elec: {kind: "boost", p: {vout: 5, vinMin: 2.5}}, purpose: "Steps the battery up to a steady 5 V for the electronics (trim set to 5 V).", notes: ["Standard size 37 x 17 mm; no free model."],
    }),
  ]
  // small parts (BOM): real models; they live on the bench / workbench only
  const ledColors = ["LED 1", "LED 2", "LED 3", "LED 4"]
  for (let i = 0; i < 4; i++) {
    components.push(mk({
      id: "led" + (i + 1), name: ledColors[i], color: [0.9, 0.2, 0.15, 1], assembled: [0, 3.15, 0], prims: [glb("led_5mm")], pins: ledPins(), benchPos: [-1.8 + i * 1.6, 0, 5.2], exploded: [0, 3, 0],
      deskHidden: true, elec: {kind: "led"}, purpose: "5 mm LED. Needs a resistor in series.", notes: ["Real KiCad LED_D5.0mm model."],
    }))
    components.push(mk({
      id: "r" + (i + 1), name: "220 ohm " + (i + 1), color: [0.8, 0.6, 0.3, 1], assembled: [0, 3.15, 0], prims: [glb("resistor_axial")], pins: resPins(), benchPos: [-1.8 + i * 1.6, 0, 3.4], benchYaw: 90,
      exploded: [0, 3, 0], deskHidden: true, elec: {kind: "resistor", p: {ohms: 220}}, purpose: "220 ohm resistor: limits the LED current.", notes: ["Real KiCad axial resistor model."],
    }))
  }
  components.push(mk({
    id: "d1", name: "1N4004", color: C.black, assembled: [0, 3.15, 0], prims: [glb("diode_do41")], pins: diodePins(), benchPos: [6.4, 0, 3.6], exploded: [0, 3, 0], deskHidden: true,
    elec: {kind: "diode", p: {vf: 0.7}}, purpose: "Rectifier diode (the BOM calls it the flyback diode). Band = cathode.", notes: ["Real KiCad DO-41 model."],
  }))
  components.push(mk({
    id: "q1", name: "2N2222", color: C.black, assembled: [0, 3.15, 0], prims: [glb("npn_to92")], pins: npnPins(), benchPos: [7.8, 0, 3.6], exploded: [0, 3, 0], deskHidden: true,
    elec: {kind: "npn"}, purpose: "NPN transistor: a small current at B switches a bigger one from C to E.", notes: ["Real KiCad TO-92 model. Pin order E-B-C assumed for the TO-92 2N2222 / PN2222 listed in the BOM."],
  }))
  components.push(mk({
    id: "btn", name: "Push button", color: C.black, assembled: [0, 3.15, 0], prims: [glb("push_button")], pins: btnPins(), benchPos: [9.0, 0, 3.6], exploded: [0, 3, 0], deskHidden: true,
    elec: {kind: "button"}, purpose: "Tactile push button (BOM: 'push buttons').", notes: ["Real KiCad 6 mm tactile switch model."],
  }))

  // ---- reference wiring (ILLUSTRATIVE: designed from the BOM + datasheet pin functions; not in the repo) -------------------------------
  const RED = WIRE.red
  const BLK = WIRE.black
  const conns: ConnectionDef[] = []
  let lift = 0.9
  const w = (id: string, g: "power" | "i2c" | "servo", a: string, b: string, label: string, why: string, color: RGBA) => {
    conns.push(wire(id, g, a, b, label, why, color, lift))
    lift += 0.18
    if (lift > 3.4) lift = 0.9
  }
  w("p_batt_p", "power", "batt.+", "boost.IN+", "+ to boost", "Battery plus to the boost converter input.", RED)
  w("p_batt_n", "power", "batt.-", "boost.IN-", "- to boost", "Battery minus to the boost converter input.", BLK)
  w("p_esp5", "power", "boost.OUT+", "esp.5V", "5 V to ESP32", "5 V to the ESP32-CAM 5V pin.", RED)
  w("p_espg", "power", "boost.OUT-", "esp.GND", "GND to ESP32", "Ground to the ESP32-CAM.", BLK)
  w("p_drv1", "power", "boost.OUT+", "drv.16", "5 V logic", "L293D VCC1 (pin 16) is the 5 V logic supply.", RED)
  w("p_drv2", "power", "boost.OUT+", "drv.8", "5 V motor", "L293D VCC2 (pin 8) is the motor supply.", RED)
  w("p_drvg", "power", "boost.OUT-", "drv.4", "GND to driver", "L293D ground (pin 4).", BLK)
  w("p_drve", "power", "boost.OUT+", "drv.1", "Enable on", "Enable pin 1 high so both channels are on.", RED)
  w("p_sr3", "power", "esp.3V3", "sr.16", "3.3 V to 595", "74HC595 at 3.3 V so the ESP32 logic is high enough.", WIRE.orange)
  w("p_srg", "power", "boost.OUT-", "sr.8", "GND to 595", "74HC595 ground (pin 8).", BLK)
  w("p_srclr", "power", "esp.3V3", "sr.10", "Clear high", "SRCLR (pin 10) high so the register is not cleared.", WIRE.orange)
  w("p_sroe", "power", "boost.OUT-", "sr.13", "Output on", "OE (pin 13) low = outputs enabled.", BLK)
  w("p_srv5", "power", "boost.OUT+", "srv.VCC", "5 V servo", "Servo power.", RED)
  w("p_srvg", "power", "boost.OUT-", "srv.GND", "GND servo", "Servo ground.", BLK)
  w("d_in1", "servo", "esp.IO12", "drv.2", "IO12 to 1A", "GPIO12 to L293D input 1A.", WIRE.yellow)
  w("d_in2", "servo", "esp.IO13", "drv.7", "IO13 to 2A", "GPIO13 to L293D input 2A.", WIRE.green)
  w("d_m1", "servo", "drv.3", "mot.M+", "1Y to motor", "L293D output 1Y to the motor.", WIRE.blue)
  w("d_m2", "servo", "drv.6", "mot.M-", "2Y to motor", "L293D output 2Y to the motor.", WIRE.purple)
  w("s_sig", "servo", "esp.IO15", "srv.SIG", "IO15 to servo", "GPIO15 to the servo signal.", WIRE.orange)
  w("l_ser", "i2c", "esp.IO14", "sr.14", "IO14 to SER", "Data into the shift register.", WIRE.yellow)
  w("l_clk", "i2c", "esp.IO2", "sr.11", "IO2 to CLK", "Shift clock.", WIRE.green)
  w("l_lat", "i2c", "esp.IO4", "sr.12", "IO4 to LAT", "Latch (storage clock).", WIRE.blue)
  const qpin = ["15", "1", "2", "3"]
  for (let i = 1; i <= 4; i++) {
    w("l_q" + i, "i2c", "sr." + qpin[i - 1], "r" + i + ".1", "Q to R" + i, "Shift-register output " + String.fromCharCode(64 + i) + " to resistor " + i + ".", WIRE.white)
    w("l_r" + i, "i2c", "r" + i + ".2", "led" + i + ".A", "R to LED" + i, "Resistor to the LED anode.", WIRE.white)
    w("l_g" + i, "i2c", "led" + i + ".K", "boost.OUT-", "LED" + i + " GND", "LED cathode to ground.", BLK)
  }

  const fns: FnDef[] = [
    {id: "power", label: "Power", icon: "bolt", goals: [{part: "esp", effect: "powered"}, {part: "drv", effect: "powered"}]},
    {id: "drive", label: "Drive", icon: "directions_car", goals: [{part: "mot", effect: "spin+"}, {part: "mot", effect: "spin-"}]},
    {id: "steer", label: "Steer", icon: "swap_horiz", goals: [{part: "srv", effect: "moves"}]},
    {id: "lights", label: "Lights", icon: "lightbulb", goals: [1, 2, 3, 4].map((n) => ({part: "led" + n, effect: "lit" as const}))},
  ]

  const SRC = "BOM + datasheets"
  const steps: StepDef[] = [
    step("s_chassis", "Chassis", "Start with the printed chassis.", ["chassis"], [], "repo", "README: FORRC chassis"),
    step("s_riser", "Riser", "Put the electronics riser on top.", ["riser"], [], "repo", "forrc/exported/electronicsriser.stl"),
    step("s_motor", "Motor", "Clip the N20 motor in its pocket and fit the motor gear.", ["motor_clip", "mot", "motor_gear"], [], "illustrative", "forrc/exported/motorclip.stl"),
    step("s_axle", "Rear axle", "Slide the drive gear and spacers onto the rear axle.", ["drive_gear", "spacer_rr", "spacer_rl"], [], "illustrative", "BOM: 2 mm axle rods"),
    step("s_wheels", "Wheels", "Press the four wheels on the axles.", ["wheel_rr", "wheel_rl", "spacer_fr", "spacer_fl", "wheel_fr", "wheel_fl"], [], "illustrative", "BOM: rubber bands #61"),
    step("s_steer", "Steering", "Mount the servo at the front and fit its cap.", ["srv", "servo_cap"], [], "illustrative", "forrc/exported/simplesteeringservocap.stl"),
    step("s_brain", "Brain", "Place the ESP32-CAM and the boost converter on the riser.", ["esp", "boost"], [], "illustrative", SRC),
    step("s_power", "Power parts", "Add the battery holder and the L293D and 74HC595 chips.", ["batt", "drv", "sr"], [], "illustrative", SRC),
    step("s_wpower", "Power wires", "Join the battery, boost converter and every power pin.", ["batt", "boost", "esp", "drv", "sr", "srv"], conns.filter((c) => c.id.charAt(0) === "p").map((c) => c.id), "illustrative", SRC),
    step("s_wdrive", "Drive wires", "Join the ESP32 to the driver, the driver to the motor, and the servo signal.", ["esp", "drv", "mot", "srv"], conns.filter((c) => c.id.charAt(0) === "d" || c.id.charAt(0) === "s").map((c) => c.id), "illustrative", SRC),
    step("s_wlights", "Light wires", "Join the ESP32 to the shift register, then each output to its LED.", ["esp", "sr"], conns.filter((c) => c.id.charAt(0) === "l").map((c) => c.id), "illustrative", SRC),
  ]

  const commands: CommandDef[] = []
  const rest = {wheels: 0, steer: 0}
  commands.push(cmd("rest", "Rest", "stop", "once", [{ang: {...rest}, wait: 300}], "starting pose"))
  commands.push(cmd("drive", "Drive", "go", "once", [{jump: {wheels: 0}, ang: {wheels: 1080}, wait: 3000, face: "go"}, {wait: 200, face: "stop"}], "simulated: motor forward"))
  commands.push(cmd("back", "Reverse", "back", "once", [{jump: {wheels: 0}, ang: {wheels: -720}, wait: 2200, face: "back"}, {wait: 200, face: "stop"}], "simulated: motor reverse"))
  commands.push(cmd("left", "Steer left", "left", "once", [{ang: {steer: 30, wheels: 360}, wait: 1000, face: "left"}, {ang: {steer: 0}, wait: 600, face: "stop"}], "simulated: servo left"))
  commands.push(cmd("right", "Steer right", "right", "once", [{ang: {steer: -30, wheels: 360}, wait: 1000, face: "right"}, {ang: {steer: 0}, wait: 600, face: "stop"}], "simulated: servo right"))

  const pack: PackShape = {
    identity: {
      id: "forrc-car", app: "3D Wiz", tagline: "Visualize it. Build it. Test it.", name: "FORRC RC Car", subtitle: "Printed chassis + ESP32-CAM, L293D, servo, LEDs",
      source: "FORRC (CERN-OHL-S 2.0)", credit: "codingwithsomeguy/forrc (kits by the Fairfield County Makers' Guild). Component CAD: KiCad libraries (CC-BY-SA 4.0), Adafruit_CAD_Parts (MIT).",
      license: "CERN-OHL-S-2.0", preparedOffline: true, version: "repo STL + BOM v1", url: URL, short: "RC Car", icon: "directions_car", hasOled: false,
      sourceNote: "The repo has no wiring: the reference circuit is illustrative.",
    },
    mcu: {board: "ESP32-CAM", driver: "L293D", servo: "SG90 class", shiftRegister: "74HC595", boost: "MT3608", battery: "4 x AA"},
    notSpecified: [
      "ALL wiring: the repo has no schematic and no GPIO assignment (the reference circuit here is illustrative)",
      "Assembly positions of the gears, wheels, spacers and servo cap (their STLs are exported in their own frames)",
      "Which BOM part is the 2N2222 / 1N4004 used for (the BOM lists them without a circuit)",
      "ESP32-CAM board, MT3608, 4xAA holder and N20 motor are drawn at standard sizes (no free CAD model)",
    ],
    placement: {
      desk: [0, -12, -60], deskSize: [26, 16], modeBar: [0, -27.8, -55], taskPanel: [0, -20, -55], testPanel: [0, -17.5, -55], validatorPanel: [0, -11, -55],
      infoCard: [0, 3.1, -55], menu: [0, -11, -55], bench: [0, -7.5, -63], benchScale: 1.12, benchTiltDeg: 52, locator: [11.5, 2.4, -62], locatorScale: 0.4,
      enlarge: 1.8, enlargeExploded: 1.1, explodeSpeed: 6, dragDegPerCm: 14, modelScale: 1.5, viewYaw: 215, benchMat: {w: 21, d: 12.5, style: "breadboard"},
    },
    game: {snapCm: 2.4, tray: [0, 5.0, 6.2] as V3, confetti: DEFAULT_GAME.confetti},
    components: components,
    connections: conns,
    steps: steps,
    lab: {
      simLabel: "SIMULATED - no hardware", walkCycles: 1, motorDegPerS: 360, commands: commands, pages: [["drive", "back", "left", "right"]],
      icons: {drive: "arrow_upward", back: "arrow_downward", left: "turn_left", right: "turn_right"},
    },
    validation: {expected: [], distractors: [
      {id: "x_logic5", label: "595 on 5 V", from: {component: "boost", pin: "OUT+"}, to: {component: "sr", pin: "16"}, explanation: "A 74HC595 at 5 V needs about 3.5 V to read a high: the ESP32's 3.3 V is not enough. Power it from 3V3."},
      {id: "x_in_swap", label: "IO12 to EN", from: {component: "esp", pin: "IO12"}, to: {component: "drv", pin: "1"}, explanation: "Pin 1 is the enable, not an input: the inputs are pins 2 and 7."},
    ], disclaimer: DEFAULT_VALIDATION_NOTE},
    visualize: {
      scale: 1.3, wallCm: 0.25, leadReachCm: 12,
      defaultCavity: {min: [-3.0, 3.15, -4.2] as V3, max: [3.0, 6.0, 4.8] as V3, basis: "illustrative deck above the riser"},
      catalog: [
        {id: "esp", size: [2.7, 1.1, 4.05] as V3, rule: "front of the deck"},
        {id: "boost", size: [3.7, 1.0, 1.7] as V3, rule: "front, beside the ESP32"},
        {id: "batt", size: [6.3, 1.6, 5.7] as V3, rule: "rear of the deck"},
        {id: "drv", size: [0.79, 0.7, 1.92] as V3, rule: "next to the motor"},
        {id: "sr", size: [0.79, 0.7, 1.92] as V3, rule: "near the ESP32"},
      ],
      servoNote: "the motor sits in its pocket under the deck, the steering servo at the front",
      prefer: {esp: [0.2, 0, 0.15] as V3, boost: [0.8, 0, 0.08] as V3, batt: [0.5, 0, 0.8] as V3, drv: [0.9, 0, 0.45] as V3, sr: [0.1, 0, 0.5] as V3},
      naive: {esp: [0, 3.4, 0.4] as V3, boost: [0.8, 3.7, -0.2] as V3, batt: [-0.6, 3.4, 0.3] as V3, drv: [0.3, 3.5, 0.2] as V3, sr: [0.2, 3.7, 0.1] as V3},
      shell: [box([0, 3.0, 0.3], [6.4, 0.3, 9.2], PLA_W, undefined, undefined, "deck")],
      test: {power: ["batt", "boost", "esp"], data: ["esp", "drv"], servo: ["esp", "srv"]},
      demo: {parts: ["esp", "boost", "batt", "drv", "sr"], screw: "fx_m2x5_st", tool: "tool_ph0", hole: "h_riser_a"},
    },
    gesture: {} as PackShape["gesture"],
    guide: {
      schema: "3dwiz-pack/1",
      guideSource: {url: URL, license: "CERN-OHL-S-2.0", note: "STL files and BOM read offline; the repo has no assembly drawing or wiring, so attach points and wires are illustrative."},
      parts: [],
      screwHoles: [
        {id: "h_riser_a", hostId: "riser", at: [-2.4, 3.15, -3.5], dir: [0, -1, 0], type: "M2 self-tapping", diameterMm: 2.0, depthMm: 8, basis: "standard"},
        {id: "h_riser_b", hostId: "riser", at: [2.4, 3.15, 3.5], dir: [0, -1, 0], type: "M2 self-tapping", diameterMm: 2.0, depthMm: 8, basis: "standard"},
      ],
      fasteners: [{id: "m2x5_st", label: "M2x5", kind: "self-tapping", diameterMm: 2.0, lengthMm: 5, head: "phillips", driver: "ph0", color: [0.9, 0.9, 0.95, 1]}],
      tools: [{id: "ph0", label: "PH0", head: "phillips", size: "PH0"}],
    },
    workbench: {altServos: [{id: "alt_mg90", label: "MG90S", size: [1.22, 2.85, 2.28] as V3, color: [0.35, 0.35, 0.45, 1] as RGBA}], ...DEFAULT_WORKBENCH},
    rig: {
      mode: "generic",
      acts: [
        {name: "wheels", zero: 0, speed: 540, els: ["wheel_fr", "wheel_fl", "wheel_rr", "wheel_rl"].map((p) => ({part: p, op: "rot" as const, axis: [1, 0, 0] as V3, k: -1}))},
        {name: "steer", zero: 0, speed: 120, els: [{part: "servo_cap", op: "rot" as const, axis: [0, 1, 0] as V3, k: 1}]},
      ],
    },
    plan: {
      s_chassis: {title: "Chassis", place: ["chassis"]},
      s_riser: {title: "Riser", place: ["riser"]},
      s_motor: {title: "Motor", place: ["motor_clip", "mot", "motor_gear"]},
      s_axle: {title: "Rear axle", place: ["drive_gear", "spacer_rr", "spacer_rl"]},
      s_wheels: {title: "Wheels", place: ["wheel_rr", "wheel_rl", "spacer_fr", "spacer_fl", "wheel_fr", "wheel_fl"]},
      s_steer: {title: "Steering", place: ["srv", "servo_cap"]},
      s_brain: {title: "Brain", place: ["esp", "boost"]},
      s_power: {title: "Power parts", place: ["batt", "drv", "sr"]},
      s_wpower: {title: "Power wires", place: []},
      s_wdrive: {title: "Drive wires", place: []},
      s_wlights: {title: "Light wires", place: []},
    },
    quests: [
      {id: "q1", title: "Frame", steps: ["s_chassis", "s_riser"]},
      {id: "q2", title: "Drive", steps: ["s_motor", "s_axle", "s_wheels"]},
      {id: "q3", title: "Steer", steps: ["s_steer"]},
      {id: "q4", title: "Brains", steps: ["s_brain", "s_power", "s_wpower", "s_wdrive", "s_wlights"]},
    ],
    names: {
      chassis: "Chassis", riser: "Riser", motor_clip: "Clip", motor_gear: "Motor gear", drive_gear: "Drive gear", wheel_fr: "Wheel FR", wheel_fl: "Wheel FL", wheel_rr: "Wheel RR",
      wheel_rl: "Wheel RL", spacer_fr: "Spacer", spacer_fl: "Spacer", spacer_rr: "Spacer", spacer_rl: "Spacer", servo_cap: "Steer cap", esp: "ESP32", drv: "L293D", sr: "74HC595", mot: "Motor",
      srv: "Servo", batt: "4 x AA", boost: "Boost", d1: "1N4004", q1: "2N2222", btn: "Button", led1: "LED 1", led2: "LED 2", led3: "LED 3", led4: "LED 4", r1: "220", r2: "220", r3: "220", r4: "220",
    },
    // Smart rails: the supply and ground nets (everything on the boost converter's 5 V / GND rails, the resistor-to-LED pairs and the
    // shift-register CLR tie) are connected for the user, so only the signals and the choices that matter are wired by hand (14 of 34).
    circuit: {
      functions: fns,
      rails: false,
      autoRails: ["p_batt_p", "p_batt_n", "p_esp5", "p_espg", "p_drv1", "p_drv2", "p_drvg", "p_drve", "p_srg", "p_sroe", "p_srv5", "p_srvg", "l_g1", "l_g2", "l_g3", "l_g4", "l_r1", "l_r2", "l_r3", "l_r4"],
    },
  }

  const orient: {[id: string]: {text: string; face: string; dir: V3}} = {
    chassis: {text: "motor pocket at the rear", face: "+Z", dir: [0, 0, 1]},
    riser: {text: "flat side down", face: "-Y", dir: [0, -1, 0]},
    motor_clip: {text: "open side to the motor", face: "+X", dir: [1, 0, 0]},
    mot: {text: "shaft to the gears", face: "+X", dir: [1, 0, 0]},
    motor_gear: {text: "on the motor shaft", face: "+X", dir: [1, 0, 0]},
    drive_gear: {text: "meshes with the motor gear", face: "+X", dir: [1, 0, 0]},
    esp: {text: "camera to the front", face: "-Z", dir: [0, 0, -1]},
    boost: {text: "pins to the front", face: "-Z", dir: [0, 0, -1]},
    batt: {text: "leads to the front", face: "-Z", dir: [0, 0, -1]},
    drv: {text: "notch to the front", face: "-Z", dir: [0, 0, -1]},
    sr: {text: "notch to the front", face: "-Z", dir: [0, 0, -1]},
    srv: {text: "horn up", face: "+Y", dir: [0, 1, 0]},
    servo_cap: {text: "on the servo horn", face: "+Y", dir: [0, 1, 0]},
  }
  const host: {[id: string]: string} = {chassis: "body", riser: "chassis", motor_clip: "chassis", mot: "motor_clip", motor_gear: "mot", drive_gear: "chassis", servo_cap: "srv", srv: "chassis"}
  for (const id of ["wheel_fr", "wheel_fl", "wheel_rr", "wheel_rl"]) {
    orient[id] = {text: "hub on the axle", face: "inward", dir: [id.charAt(7) === "l" ? 1 : -1, 0, 0]}
    host[id] = "chassis"
  }
  for (const id of ["spacer_fr", "spacer_fl", "spacer_rr", "spacer_rl"]) {
    orient[id] = {text: "on the axle", face: "outward", dir: [id.charAt(7) === "l" ? -1 : 1, 0, 0]}
    host[id] = "chassis"
  }
  for (const id of ["esp", "boost", "batt", "drv", "sr"]) host[id] = "riser"
  fillGuide(pack, orient, host, {doc: "README.md + BOM", url: URL}, {}, {})
  return finishPack(pack)
}
