// PackParts.ts - primitive-shape recipes for common hobby hardware (Arduino Uno / Mega, L298N, HC-SR04, SG90, TT motor, wheel, ESP32-C3
//                DevKit, MPU6050, TTP223, microphone module, OLED stand-in, breadboard, LED, resistor, push button, battery holder ...).
// All sizes are STANDARD datasheet-class sizes (cm), not taken from any project source: every pack that uses them says so.
// Owns: PrimDef lists + pin lists in the component frame (origin = board centre, y = 0 is the underside).
// Must not: know about projects or the scene.

import {V3, RGBA, PrimDef, GroupDef, PinDef} from "./ProjectPack"
import {box, cyl, sph, grp, pin, C} from "./PackKit"

export interface PartRecipe {
  prims: PrimDef[]
  groups?: GroupDef[]
  pins: PinDef[]
  size: V3
}

const HDR: RGBA = [0.1, 0.1, 0.12, 1]

function pinRow(prefix: string, names: string[], x0: number, dx: number, z: number, y: number): PinDef[] {
  const out: PinDef[] = []
  for (let i = 0; i < names.length; i++) out.push(pin(names[i], [x0 + i * dx, y, z], names[i]))
  return out
}

/** Arduino Uno R3 (68.6 x 53.4 mm). Pin positions along the headers are illustrative. */
export function uno(extra?: string[]): PartRecipe {
  const pins: PinDef[] = [
    pin("D13", [-1.5, 0.95, -2.35], "13"),
    pin("D11", [-0.7, 0.95, -2.35], "11"),
    pin("D10", [-0.45, 0.95, -2.35], "10"),
    pin("D9", [-0.2, 0.95, -2.35], "9"),
    pin("D8", [0.05, 0.95, -2.35], "8"),
    pin("D7", [0.55, 0.95, -2.35], "7"),
    pin("D6", [0.8, 0.95, -2.35], "6"),
    pin("D5", [1.05, 0.95, -2.35], "5"),
    pin("D4", [1.3, 0.95, -2.35], "4"),
    pin("D3", [1.55, 0.95, -2.35], "3"),
    pin("D2", [1.8, 0.95, -2.35], "2"),
    pin("5V", [-0.4, 0.95, 2.35], "5V"),
    pin("GND", [0.1, 0.95, 2.35], "GND"),
  ]
  return {
    size: [6.86, 1.5, 5.34],
    pins: pins,
    prims: [
      box([0, 0.08, 0], [6.86, 0.16, 5.34], [0.0, 0.42, 0.52, 1], undefined, undefined, "pcb"),
      box([-2.9, 0.75, -1.3], [1.6, 1.2, 1.2], C.silver, undefined, undefined, "usb"),
      box([-3.0, 0.65, 1.6], [1.4, 1.0, 0.9], C.black, undefined, undefined, "jack"),
      box([1.2, 0.3, 0.3], [2.0, 0.28, 0.7], C.black, undefined, undefined, "atmega"),
      box([0.4, 0.5, -2.35], [4.2, 0.85, 0.25], HDR, undefined, undefined, "hdr_top"),
      box([-0.4, 0.5, 2.35], [3.2, 0.85, 0.25], HDR, undefined, undefined, "hdr_bot"),
      cyl([-1.2, 0.3, 0.3], [0.7, 0.3, 0.7], C.silver, undefined, undefined, "xtal"),
      box([-1.9, 0.3, -0.4], [0.5, 0.2, 0.5], C.red, undefined, undefined, "reset"),
    ],
  }
}

/** Arduino Mega 2560 (101.6 x 53.3 mm). */
export function mega(): PartRecipe {
  const pins: PinDef[] = []
  const d = ["D3", "D5", "D6", "D9", "D10"]
  const dx = [-3.2, -2.6, -2.0, -1.2, -0.6]
  for (let i = 0; i < d.length; i++) pins.push(pin(d[i], [dx[i], 0.95, -2.35], d[i].substr(1)))
  for (let i = 0; i < 5; i++) pins.push(pin("A" + i, [0.6 + i * 0.5, 0.95, 2.35], "A" + i))
  pins.push(pin("5V", [3.9, 0.95, 2.35], "5V"))
  pins.push(pin("GND", [4.5, 0.95, 2.35], "GND"))
  return {
    size: [10.16, 1.5, 5.33],
    pins: pins,
    prims: [
      box([0, 0.08, 0], [10.16, 0.16, 5.33], [0.0, 0.4, 0.5, 1], undefined, undefined, "pcb"),
      box([-4.5, 0.75, -1.3], [1.6, 1.2, 1.2], C.silver, undefined, undefined, "usb"),
      box([-4.6, 0.65, 1.6], [1.4, 1.0, 0.9], C.black, undefined, undefined, "jack"),
      box([-0.5, 0.3, 0.2], [1.6, 0.28, 1.6], C.black, undefined, undefined, "atmega2560"),
      box([-1.2, 0.5, -2.35], [6.6, 0.85, 0.25], HDR, undefined, undefined, "hdr_top"),
      box([2.4, 0.5, 2.35], [4.4, 0.85, 0.25], HDR, undefined, undefined, "hdr_bot"),
      box([4.6, 0.5, -0.2], [0.3, 0.85, 4.0], HDR, undefined, undefined, "hdr_side"),
    ],
  }
}

/** L298N dual H-bridge module (about 43 x 43 mm, 27 mm tall with heatsink). */
export function l298n(): PartRecipe {
  return {
    size: [4.3, 2.7, 4.3],
    pins: pinRow("", ["ENA", "IN1", "IN2", "IN3", "IN4", "ENB"], -1.27, 0.508, -2.0, 0.5),
    prims: [
      box([0, 0.08, 0], [4.3, 0.16, 4.3], C.pcbRed, undefined, undefined, "pcb"),
      box([0, 1.2, 0.2], [2.0, 2.2, 1.6], C.black, undefined, undefined, "heatsink"),
      box([-1.9, 0.5, 0.4], [0.6, 0.8, 1.6], C.blue, undefined, undefined, "out12"),
      box([1.9, 0.5, 0.4], [0.6, 0.8, 1.6], C.blue, undefined, undefined, "out34"),
      box([0, 0.5, 1.8], [1.6, 0.8, 0.6], C.blue, undefined, undefined, "power"),
      box([0, 0.35, -2.0], [3.2, 0.5, 0.25], HDR, undefined, undefined, "hdr"),
    ],
  }
}

/** HC-SR04 ultrasonic module (45 x 20 x 15 mm); transducers face +Z. */
export function hcsr04(): PartRecipe {
  return {
    size: [4.5, 1.5, 2.0],
    pins: [pin("VCC", [-0.57, 0.3, -0.95], "VCC"), pin("TRIG", [-0.19, 0.3, -0.95], "TRIG"), pin("ECHO", [0.19, 0.3, -0.95], "ECHO"), pin("GND", [0.57, 0.3, -0.95], "GND")],
    prims: [
      box([0, 0.08, 0], [4.5, 0.16, 2.0], C.pcbBlue, undefined, undefined, "pcb"),
      cyl([-1.1, 0.95, 0.5], [1.6, 1.0, 1.6], C.silver, undefined, [90, 0, 0], "tx"),
      cyl([1.1, 0.95, 0.5], [1.6, 1.0, 1.6], C.silver, undefined, [90, 0, 0], "rx"),
      box([0, 0.35, -0.9], [1.2, 0.5, 0.25], HDR, undefined, undefined, "hdr"),
      box([0, 0.3, -0.1], [0.9, 0.2, 0.5], C.black, undefined, undefined, "chip"),
    ],
  }
}

/** SG90 micro servo (22.2 x 11.8 x 22.7 mm) with a pan horn group. */
export function sg90(color: RGBA): PartRecipe {
  return {
    size: [2.28, 2.7, 1.22],
    pins: [pin("SIG", [-1.25, 0.3, 0.3], "SIG"), pin("VCC", [-1.25, 0.3, 0.0], "V+"), pin("GND", [-1.25, 0.3, -0.3], "GND")],
    groups: [grp("horn", [0.57, 2.45, 0])],
    prims: [
      box([0, 1.125, 0], [2.28, 2.25, 1.22], color, undefined, undefined, "body"),
      box([0, 1.7, 0], [3.25, 0.25, 1.22], color, undefined, undefined, "ears"),
      cyl([0.57, 2.4, 0], [1.1, 0.3, 1.1], [0.15, 0.18, 0.3, 1], undefined, undefined, "boss"),
      cyl([0, 0.1, 0], [0.8, 0.14, 0.8], C.white, "horn", undefined, "horn"),
      box([0, 0.1, 0], [2.2, 0.12, 0.35], C.white, "horn", undefined, "arm"),
      box([-1.45, 0.9, 0.3], [0.5, 0.1, 0.1], [1.0, 0.5, 0.1, 1], undefined, undefined, "wire_sig"),
      box([-1.45, 0.9, 0.0], [0.5, 0.1, 0.1], C.red, undefined, undefined, "wire_v"),
      box([-1.45, 0.9, -0.3], [0.5, 0.1, 0.1], [0.4, 0.2, 0.1, 1], undefined, undefined, "wire_g"),
    ],
  }
}

/** TT gear motor: the part runs along +Z from its inner end (z = 0) to the output shaft. */
export function ttMotor(): PartRecipe {
  return {
    size: [2.2, 2.2, 6.8],
    pins: [],
    prims: [
      cyl([0, 1.1, 1.7], [2.0, 3.4, 2.0], C.silver, undefined, [90, 0, 0], "can"),
      box([0, 1.1, 4.9], [2.2, 1.9, 3.0], C.yellow, undefined, undefined, "gearbox"),
      cyl([0, 1.1, 6.6], [0.5, 0.8, 0.5], C.silver, undefined, [90, 0, 0], "shaft"),
    ],
  }
}

/** Wheel with its axle along Z; four marks show the rotation. */
export function wheel(): PartRecipe {
  const marks: PrimDef[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    marks.push(box([Math.cos(a) * 2.3, Math.sin(a) * 2.3, 1.22], [0.5, 0.5, 0.06], C.white, undefined, undefined, "mark" + i))
  }
  return {
    size: [6.5, 6.5, 2.4],
    pins: [],
    prims: [cyl([0, 0, 0], [6.5, 2.4, 6.5], [0.1, 0.1, 0.12, 1], undefined, [90, 0, 0], "tyre"), cyl([0, 0, 0], [3.0, 2.5, 3.0], C.yellow, undefined, [90, 0, 0], "hub")].concat(marks),
  }
}

/** Two-cell-class battery holder (type not specified by the sources: approximate size). */
export function batteryHolder(): PartRecipe {
  return {
    size: [5.8, 1.6, 3.0],
    pins: [pin("+", [-3.0, 0.6, -0.6], "+"), pin("-", [-3.0, 0.6, 0.6], "-")],
    prims: [
      box([0, 0.8, 0], [5.8, 1.6, 3.0], [0.18, 0.2, 0.24, 1], undefined, undefined, "holder"),
      box([-3.15, 0.6, -0.6], [0.5, 0.12, 0.12], C.red, undefined, undefined, "lead+"),
      box([-3.15, 0.6, 0.6], [0.5, 0.12, 0.12], C.black, undefined, undefined, "lead-"),
    ],
  }
}

/** ESP32-C3-DevKitM-1 style board, long axis along X (about 54 x 25 mm). Pin positions are illustrative. */
export function esp32c3(): PartRecipe {
  return {
    size: [5.4, 0.9, 2.54],
    pins: [
      pin("3V3", [-2.3, 0.35, -1.1], "3V3"),
      pin("GPIO4", [-1.5, 0.35, -1.1], "4"),
      pin("GPIO7", [-0.7, 0.35, -1.1], "7"),
      pin("GPIO8", [-2.0, 0.35, 1.1], "8 SDA"),
      pin("GPIO9", [-1.2, 0.35, 1.1], "9 SCL"),
      pin("GND", [-0.4, 0.35, 1.1], "GND"),
    ],
    prims: [
      box([0, 0.06, 0], [5.4, 0.12, 2.54], [0.07, 0.38, 0.32, 1], undefined, undefined, "pcb"),
      box([1.5, 0.25, 0], [1.8, 0.28, 1.5], C.silver, undefined, undefined, "esp32c3-mini"),
      box([2.65, 0.25, 0], [0.9, 0.32, 0.8], C.silver, undefined, undefined, "usbc"),
      box([-0.9, 0.2, -1.1], [3.2, 0.2, 0.25], HDR, undefined, undefined, "hdr_back"),
      box([-0.9, 0.2, 1.1], [3.2, 0.2, 0.25], HDR, undefined, undefined, "hdr_front"),
    ],
  }
}

/** MPU6050 (GY-521-class) module, about 21 x 16 mm. */
export function mpu6050(): PartRecipe {
  return {
    size: [2.1, 0.5, 1.6],
    pins: [pin("VCC", [-0.57, 0.3, 0.7], "VCC"), pin("GND", [-0.19, 0.3, 0.7], "GND"), pin("SCL", [0.19, 0.3, 0.7], "SCL"), pin("SDA", [0.57, 0.3, 0.7], "SDA")],
    prims: [
      box([0, 0.06, 0], [2.1, 0.12, 1.6], [0.1, 0.3, 0.75, 1], undefined, undefined, "pcb"),
      box([0, 0.2, -0.2], [0.4, 0.12, 0.4], C.black, undefined, undefined, "mpu"),
      box([0, 0.2, 0.7], [1.2, 0.3, 0.2], HDR, undefined, undefined, "hdr"),
    ],
  }
}

/** TTP223 capacitive touch module (small version, about 15 x 11 mm; size varies by module). */
export function ttp223(): PartRecipe {
  return {
    size: [1.5, 0.4, 1.1],
    pins: [pin("VCC", [-0.4, 0.3, 0.45], "VCC"), pin("GND", [0.0, 0.3, 0.45], "GND"), pin("OUT", [0.4, 0.3, 0.45], "OUT")],
    prims: [
      box([0, 0.06, 0], [1.5, 0.12, 1.1], [0.15, 0.3, 0.7, 1], undefined, undefined, "pcb"),
      cyl([0, 0.14, -0.1], [0.7, 0.04, 0.7], C.gold, undefined, undefined, "pad"),
      box([0, 0.2, 0.45], [1.0, 0.25, 0.15], HDR, undefined, undefined, "hdr"),
    ],
  }
}

/** Electret microphone breakout (type not specified by the source: approximate). */
export function micModule(): PartRecipe {
  return {
    size: [1.6, 0.9, 1.2],
    pins: [pin("GND", [-0.4, 0.3, 0.5], "GND"), pin("VCC", [0.0, 0.3, 0.5], "VCC"), pin("OUT", [0.4, 0.3, 0.5], "OUT")],
    prims: [
      box([0, 0.06, 0], [1.6, 0.12, 1.2], [0.15, 0.4, 0.2, 1], undefined, undefined, "pcb"),
      cyl([-0.1, 0.4, -0.1], [0.6, 0.6, 0.6], C.silver, undefined, undefined, "capsule"),
      box([0, 0.2, 0.5], [1.0, 0.25, 0.15], HDR, undefined, undefined, "hdr"),
    ],
  }
}

/** Half-size breadboard (82.6 x 54.6 mm): body, rails, channel and hole columns. */
export function breadboard(): PartRecipe {
  const prims: PrimDef[] = [
    box([0, 0.4, 0], [8.26, 0.8, 5.46], [0.9, 0.9, 0.86, 1], undefined, undefined, "body"),
    box([0, 0.82, -2.35], [7.6, 0.04, 0.16], C.red, undefined, undefined, "rail_p"),
    box([0, 0.82, -1.95], [7.6, 0.04, 0.16], C.blue, undefined, undefined, "rail_n"),
    box([0, 0.82, 2.35], [7.6, 0.04, 0.16], C.red, undefined, undefined, "rail_p2"),
    box([0, 0.82, 1.95], [7.6, 0.04, 0.16], C.blue, undefined, undefined, "rail_n2"),
    box([0, 0.82, 0], [7.6, 0.04, 0.45], [0.35, 0.35, 0.38, 1], undefined, undefined, "channel"),
  ]
  for (let i = 0; i < 25; i++) {
    const x = -3.6 + i * 0.3
    prims.push(box([x, 0.82, -0.95], [0.07, 0.04, 1.1], [0.5, 0.5, 0.55, 1], undefined, undefined, "ca" + i))
    prims.push(box([x, 0.82, 0.95], [0.07, 0.04, 1.1], [0.5, 0.5, 0.55, 1], undefined, undefined, "cb" + i))
  }
  return {
    size: [8.26, 0.85, 5.46],
    pins: [pin("RAIL_P", [-3.9, 0.9, -2.35], "5V"), pin("RAIL_N", [-3.9, 0.9, -1.95], "GND")],
    prims: prims,
  }
}

/** 5 mm LED with a glow-able dome; legs: A (anode, long) and K (cathode). */
export function led5(color: RGBA): PartRecipe {
  return {
    size: [0.5, 0.95, 0.5],
    pins: [pin("A", [-0.127, 0.0, 0], "A"), pin("K", [0.127, 0.0, 0], "K")],
    prims: [
      cyl([0, 0.3, 0], [0.5, 0.5, 0.5], color, undefined, undefined, "base"),
      sph([0, 0.6, 0], 0.5, color, undefined, "dome"),
      box([-0.127, 0.0, 0], [0.04, 0.2, 0.04], C.silver, undefined, undefined, "legA"),
      box([0.127, 0.0, 0], [0.04, 0.12, 0.04], C.silver, undefined, undefined, "legK"),
    ],
  }
}

/** Axial resistor (colour bands set the value), lying along X. */
export function resistor(bands: RGBA[]): PartRecipe {
  const prims: PrimDef[] = [
    cyl([0, 0.15, 0], [0.24, 0.63, 0.24], [0.85, 0.72, 0.5, 1], undefined, [0, 0, 90], "body"),
    box([-0.45, 0.15, 0], [0.4, 0.03, 0.03], C.silver, undefined, undefined, "lead1"),
    box([0.45, 0.15, 0], [0.4, 0.03, 0.03], C.silver, undefined, undefined, "lead2"),
  ]
  for (let i = 0; i < bands.length; i++) prims.push(cyl([-0.2 + i * 0.1, 0.15, 0], [0.26, 0.05, 0.26], bands[i], undefined, [0, 0, 90], "band" + i))
  return {
    size: [1.0, 0.3, 0.3],
    pins: [pin("P1", [-0.5, 0.15, 0], "1"), pin("P2", [0.5, 0.15, 0], "2")],
    prims: prims,
  }
}

/** 6 mm tact switch; the cap is a group that slides down when pressed. */
export function pushButton(): PartRecipe {
  return {
    size: [0.6, 0.5, 0.6],
    pins: [pin("A", [-0.3, 0.0, 0], "A"), pin("B", [0.3, 0.0, 0], "B")],
    groups: [grp("cap", [0, 0.35, 0])],
    prims: [
      box([0, 0.15, 0], [0.6, 0.3, 0.6], C.black, undefined, undefined, "body"),
      cyl([0, 0.1, 0], [0.35, 0.2, 0.35], C.red, "cap", undefined, "cap"),
      box([-0.3, 0.0, 0], [0.06, 0.1, 0.06], C.silver, undefined, undefined, "legA"),
      box([0.3, 0.0, 0], [0.06, 0.1, 0.06], C.silver, undefined, undefined, "legB"),
    ],
  }
}

/** UBEC / 5 V regulated supply module (3 A class, about 34 x 20 mm). */
export function ubec(): PartRecipe {
  return {
    size: [3.4, 1.0, 2.0],
    pins: [pin("OUT+", [1.5, 0.6, 0.6], "5V"), pin("OUT-", [1.5, 0.6, -0.6], "GND")],
    prims: [
      box([0, 0.5, 0], [3.4, 1.0, 2.0], [0.15, 0.55, 0.3, 1], undefined, undefined, "case"),
      box([1.7, 0.6, 0.6], [0.3, 0.2, 0.2], C.red, undefined, undefined, "out+"),
      box([1.7, 0.6, -0.6], [0.3, 0.2, 0.2], C.black, undefined, undefined, "out-"),
    ],
  }
}

/** Glove electronics: 5 flex sensors (2.2 in) with their divider resistors, abstracted as one board. */
export function flexGlove(): PartRecipe {
  const prims: PrimDef[] = [box([0, 0.1, 0], [7.0, 0.2, 5.2], [0.2, 0.25, 0.4, 1], undefined, undefined, "glove")]
  const pins: PinDef[] = []
  for (let i = 0; i < 5; i++) {
    const x = -2.4 + i * 1.2
    prims.push(box([x, 0.25, -0.2], [0.6, 0.1, 4.4], [0.1, 0.1, 0.12, 1], undefined, undefined, "flex" + i))
    prims.push(cyl([x, 0.3, 2.2], [0.24, 0.63, 0.24], [0.85, 0.72, 0.5, 1], undefined, [90, 0, 0], "r" + i))
    pins.push(pin("F" + i, [x, 0.4, 2.5], "F" + i))
  }
  pins.push(pin("V5", [-3.3, 0.4, -2.3], "5V"))
  pins.push(pin("GND", [3.3, 0.4, -2.3], "GND"))
  return {size: [7.0, 0.4, 5.2], pins: pins, prims: prims}
}

/** Five SG90 servos side by side (the forearm bank), signal wires S0..S4 thumb..little, one shared V+ and GND. */
export function servoBank(color: RGBA): PartRecipe {
  const prims: PrimDef[] = []
  const pins: PinDef[] = []
  for (let i = 0; i < 5; i++) {
    const z = (i - 2) * 1.3
    prims.push(box([0, 1.125, z], [2.28, 2.25, 1.22], color, undefined, undefined, "servo" + i))
    prims.push(cyl([0.57, 2.45, z], [0.8, 0.2, 0.8], C.white, undefined, undefined, "horn" + i))
    pins.push(pin("S" + i, [-1.3, 0.5, z], "S" + i))
  }
  pins.push(pin("V+", [-1.3, 0.5, -3.7], "5V"))
  pins.push(pin("GND", [-1.3, 0.5, 3.7], "GND"))
  return {size: [2.28, 2.7, 6.6], pins: pins, prims: prims}
}
