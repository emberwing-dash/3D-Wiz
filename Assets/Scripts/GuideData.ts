// GuideData.ts - the fixed step list of the Circuit Guide (data only, no scene access).
// Owns: the types of a guide pack (parts, pins, drop spots, steps with narration + mistake hint) and the RC car SAMPLE pack.
//       parseGuidePack() reads the same shape from JSON, which is what the offline video-analysis pre-step writes (tools/video-to-steps.md).
// Must not: touch the scene, hold state, or read any key.
//
// !!! The RC car pack below is a clearly-labelled SAMPLE STAND-IN. It was hand-authored for the existing RC car pack
// !!! (PackForrc.ts). It was NOT analysed from a tutorial video: no video was supplied. Replace it with the pre-analysis output.

export type V3 = [number, number, number]

export interface GuidePin {
  id: string // unique inside its part, e.g. "IO12" or "2"
  label: string // spoken / shown, e.g. "IO12" or "1A (pin 2)"
  at: V3 // part-local position (cm, real size)
}

export interface GuidePart {
  id: string // "esp32"
  glb: string // key understood by partPrefab() in WizParts.ts
  label: string // "ESP32 module"
  sizeCm: V3 // real size (x, y, z) of the model
  pins: GuidePin[]
  trayAt: V3 // where it waits before it is placed: bench-local cm
}

export interface GuideSpot {
  id: string
  on: "board" | "model" // the breadboard or the model (spot is in that thing's local frame)
  at: V3 // where the part's origin (bottom centre) ends up
  plate: [number, number] // glow plate size on the surface (cm)
}

export interface GuideStep {
  id: string
  kind: "place" | "wire"
  title: string // short, on the panel
  text: string // the instruction in words: which component, which pin to which pin
  part?: string // place: the part to drop
  spot?: string // place: the glowing drop spot
  pins?: [string, string] // wire: "part.pin" <-> "part.pin" (undirected)
  say: string // narration, spoken when the step starts (the transcript of the clip)
  after: string // narration that carries on once the step is complete
  clip: string // narration audio asset name ("" = none cut yet; the caption is the fallback)
  hint: string // short spoken hint for the likely mistake
}

export interface GuidePack {
  title: string
  source: string // honest provenance label, shown in the panel footer
  controller: "car" | "servo" | "none" // none: Play simply switches the finished circuit on (the LED lights)
  parts: GuidePart[]
  spots: GuideSpot[]
  steps: GuideStep[]
  board: {id: string; glb: string; sizeCm: V3; pins: GuidePin[]} // the breadboard (pins = its two rails)
}

const dip = (labels: string[]): GuidePin[] => {
  const out: GuidePin[] = []
  for (let n = 1; n <= 16; n++) {
    const left = n <= 8
    const z = left ? -0.889 + (n - 1) * 0.254 : 0.889 - (n - 9) * 0.254
    out.push({id: String(n), label: labels[n - 1] + " (pin " + n + ")", at: [left ? -0.381 : 0.381, 0.45, z]})
  }
  return out
}
const L293 = ["EN", "1A", "1Y", "GND", "GND", "2Y", "2A", "VCC2", "EN", "3A", "3Y", "GND", "GND", "4Y", "4A", "VCC1"]
const ESP_LEFT = ["5V", "GND", "IO12", "IO13", "IO14", "IO15", "IO2", "IO4"]

export const RC_SAMPLE: GuidePack = {
  title: "RC car: motor driver + steering servo",
  source: "SAMPLE steps (stand-in, no video)",
  controller: "car",
  board: {
    id: "bb",
    glb: "breadboard_half",
    sizeCm: [8.5, 0.97, 5.5],
    pins: [
      {id: "P+", label: "the red + rail", at: [3.2, 1.05, -2.3]},
      {id: "N", label: "the blue - rail", at: [3.2, 1.05, 2.3]},
    ],
  },
  parts: [
    {
      id: "esp32", glb: "esp32_wroom", label: "ESP32 module", sizeCm: [1.8, 0.31, 2.55], trayAt: [2.4, 0.5, 6.4],
      pins: ESP_LEFT.map((l, i): GuidePin => ({id: l, label: l, at: [-0.75, 0.45, -1.0 + i * 0.285]})),
    },
    {id: "l293d", glb: "dip16", label: "L293D motor driver", sizeCm: [0.79, 0.7, 1.92], trayAt: [5.8, 0.5, 6.4], pins: dip(L293)},
    {
      id: "servo", glb: "servo_micro", label: "steering servo", sizeCm: [1.2, 3.07, 3.13], trayAt: [9.4, 0.5, 4.8],
      pins: [
        {id: "SIG", label: "SIG (orange)", at: [-0.3, 3.2, 1.0]},
        {id: "VCC", label: "VCC (red)", at: [0, 3.2, 1.0]},
        {id: "GND", label: "GND (brown)", at: [0.3, 3.2, 1.0]},
      ],
    },
    // ---- second half of the build: power, the motor, and the status LED (sizes and pins as in GuideParts.VIZ_PARTS)
    {
      id: "battery", glb: "gen:battery_holder_4xAA", label: "4xAA battery holder", sizeCm: [5.5, 1.6, 3.0], trayAt: [-0.5, 0.5, 2.6], // clear of the EXPLODE / ASSEMBLE buttons (z about 7.4)
      pins: [
        {id: "+", label: "+ (red)", at: [-2.6, 1.6, 1.4]},
        {id: "-", label: "- (black)", at: [-2.6, 1.6, -1.4]},
      ],
    },
    {
      id: "switch", glb: "gen:slide_switch", label: "slide switch", sizeCm: [1.0, 0.7, 0.5], trayAt: [4.0, 0.5, 2.2],
      pins: [
        {id: "1", label: "pin 1", at: [-0.3, 0.8, 0]},
        {id: "2", label: "pin 2", at: [0.3, 0.8, 0]},
      ],
    },
    {
      id: "motor", glb: "gen:dc_motor_n20", label: "N20 gear motor", sizeCm: [1.2, 1.0, 2.6], trayAt: [8.0, 0.5, 2.2],
      pins: [
        {id: "M+", label: "M+", at: [-0.3, 0.8, -1.3]},
        {id: "M-", label: "M-", at: [0.3, 0.8, -1.3]},
      ],
    },
    {
      id: "led", glb: "led_5mm", label: "LED", sizeCm: [0.54, 1.41, 0.58], trayAt: [5.4, 0.5, 2.2],
      pins: [
        {id: "A", label: "A (long leg, +)", at: [0.107, 0.12, 0]},
        {id: "K", label: "K (short leg, -)", at: [-0.147, 0.12, 0]},
      ],
    },
    {
      id: "resistor", glb: "resistor_axial", label: "220 ohm resistor", sizeCm: [1.08, 0.55, 0.25], trayAt: [6.7, 0.5, 2.2],
      pins: [
        {id: "1", label: "end 1", at: [-0.508, 0.12, 0]},
        {id: "2", label: "end 2", at: [0.508, 0.12, 0]},
      ],
    },
  ],
  spots: [
    {id: "bb_esp", on: "board", at: [-2.6, 0.97, 0], plate: [2.4, 3.1]},
    {id: "bb_l293", on: "board", at: [1.4, 0.97, 0], plate: [1.5, 2.5]},
    {id: "model_servo", on: "model", at: [0, 3.15, -4.5], plate: [1.8, 3.6]},
    {id: "model_battery", on: "model", at: [0, 3.15, 2.9], plate: [5.6, 3.1]},
    {id: "model_switch", on: "model", at: [-2.4, 3.15, 0.9], plate: [1.4, 1.0]},
    {id: "model_motor", on: "model", at: [1.3, 0.2, 5.2], plate: [1.5, 2.8]},
    {id: "bb_led", on: "board", at: [3.5, 0.97, -1.0], plate: [1.0, 1.0]},
    {id: "bb_resistor", on: "board", at: [3.5, 0.97, 1.0], plate: [1.6, 0.8]},
  ],
  steps: [
    {
      id: "s1", kind: "place", title: "Place the ESP32", text: "Drop the ESP32 module on the glowing spot at the left of the breadboard.",
      part: "esp32", spot: "bb_esp", clip: "",
      say: "First, put the ESP32 module on the left side of the breadboard, pins toward the rail.",
      after: "Good. That is the brain of the car.",
      hint: "That is not where the ESP32 goes. Use the glowing spot on the left of the breadboard.",
    },
    {
      id: "s2", kind: "place", title: "Place the L293D", text: "Drop the L293D motor driver on the glowing spot, right of the ESP32.",
      part: "l293d", spot: "bb_l293", clip: "",
      say: "Next, the L293D motor driver goes just to the right of the ESP32.",
      after: "Nice, the motor driver is in.",
      hint: "The L293D sits to the right of the ESP32, on the glowing spot.",
    },
    {
      id: "s3", kind: "wire", title: "Wire IO12 to 1A", text: "Wire ESP32 pin IO12 to L293D pin 1A (pin 2).",
      pins: ["esp32.IO12", "l293d.2"], clip: "",
      say: "Now connect IO12 on the ESP32 to input 1A on the motor driver, that is pin 2.",
      after: "That wire drives the motor forward.",
      hint: "Not that pin. Wire ESP32 IO12 to the L293D pin 1A, both glow.",
    },
    {
      id: "s4", kind: "wire", title: "Wire IO13 to 2A", text: "Wire ESP32 pin IO13 to L293D pin 2A (pin 7).",
      pins: ["esp32.IO13", "l293d.7"], clip: "",
      say: "Then connect IO13 to input 2A, pin 7 of the motor driver.",
      after: "Now it can also reverse.",
      hint: "Not that pin. IO13 goes to L293D pin 2A, pin 7.",
    },
    {
      id: "s5", kind: "wire", title: "Power: 5V to the + rail", text: "Wire ESP32 pin 5V to the red + rail of the breadboard.",
      pins: ["esp32.5V", "bb.P+"], clip: "",
      say: "Give it power. Connect the 5 volt pin of the ESP32 to the red rail.",
      after: "Power is on the rail.",
      hint: "Power goes to the red rail. Wire ESP32 5V to the glowing + rail.",
    },
    {
      id: "s6", kind: "wire", title: "Ground to the - rail", text: "Wire L293D pin GND (pin 4) to the blue - rail.",
      pins: ["l293d.4", "bb.N"], clip: "",
      say: "And ground. Connect a GND pin of the motor driver to the blue rail.",
      after: "Ground done. The circuit has power and ground.",
      hint: "Ground goes to the blue rail. Wire L293D GND pin 4 to the glowing - rail.",
    },
    {
      id: "s7", kind: "place", title: "Mount the servo", text: "Drop the steering servo on the glowing spot at the front of the car.",
      part: "servo", spot: "model_servo", clip: "",
      say: "Now mount the steering servo at the front of the car chassis.",
      after: "The servo is mounted.",
      hint: "The servo mounts at the front of the car. Use the glowing spot.",
    },
    {
      id: "s8", kind: "wire", title: "Servo signal to IO14", text: "Wire the servo SIG pin to ESP32 pin IO14.",
      pins: ["servo.SIG", "esp32.IO14"], clip: "",
      say: "Last wire. The servo signal goes to IO14 on the ESP32.",
      after: "Steering is wired. Now the power and the motor.",
      hint: "Servo signal goes to IO14. Wire servo SIG to ESP32 IO14.",
    },
    {
      id: "s9", kind: "place", title: "Mount the battery holder", text: "Drop the 4xAA battery holder on the glowing spot on the car body.",
      part: "battery", spot: "model_battery", clip: "",
      say: "The car needs its own power. Put the four AA battery holder on the back of the chassis.",
      after: "The battery holder is on board.",
      hint: "The battery holder sits on the back of the chassis, on the glowing spot.",
    },
    {
      id: "s10", kind: "place", title: "Mount the power switch", text: "Drop the slide switch on the glowing spot next to the battery holder.",
      part: "switch", spot: "model_switch", clip: "",
      say: "Add a slide switch beside it, so you can turn the car on and off.",
      after: "The switch is mounted.",
      hint: "The slide switch goes beside the battery, on the glowing spot.",
    },
    {
      id: "s11", kind: "wire", title: "Battery + to the switch", text: "Wire the battery + (red) pin to switch pin 1.",
      pins: ["battery.+", "switch.1"], clip: "",
      say: "Connect the red plus wire of the battery to the first pin of the switch.",
      after: "Now the switch controls the battery.",
      hint: "Plus goes through the switch. Wire battery + to switch pin 1.",
    },
    {
      id: "s12", kind: "wire", title: "Switch to the motor supply", text: "Wire switch pin 2 to L293D pin VCC2 (pin 8).",
      pins: ["switch.2", "l293d.8"], clip: "",
      say: "The other side of the switch feeds the motor supply pin of the driver, pin 8.",
      after: "The motors get power only when the switch is on.",
      hint: "Switch pin 2 goes to L293D pin 8, the motor supply.",
    },
    {
      id: "s13", kind: "place", title: "Mount the drive motor", text: "Drop the N20 gear motor on the glowing spot at the back of the car.",
      part: "motor", spot: "model_motor", clip: "",
      say: "Now the drive motor goes at the back, next to the rear wheels.",
      after: "The motor is mounted.",
      hint: "The drive motor goes at the back of the car, on the glowing spot.",
    },
    {
      id: "s14", kind: "wire", title: "Driver output to motor +", text: "Wire L293D pin 1Y (pin 3) to motor pin M+.",
      pins: ["l293d.3", "motor.M+"], clip: "",
      say: "Connect output 1Y of the motor driver, pin 3, to the plus pin of the motor.",
      after: "One motor wire done.",
      hint: "Not that pin. L293D pin 3 goes to motor M+.",
    },
    {
      id: "s15", kind: "wire", title: "Driver output to motor -", text: "Wire L293D pin 2Y (pin 6) to motor pin M-.",
      pins: ["l293d.6", "motor.M-"], clip: "",
      say: "And output 2Y, pin 6, to the minus pin. Now the driver can spin it both ways.",
      after: "The motor is wired. The car can drive.",
      hint: "Not that pin. L293D pin 6 goes to motor M-.",
    },
    {
      id: "s16", kind: "place", title: "Place the LED", text: "Drop the LED on the glowing spot on the breadboard.",
      part: "led", spot: "bb_led", clip: "",
      say: "A status light helps. Put the LED on the right side of the breadboard.",
      after: "The LED is in.",
      hint: "The LED goes on the right of the breadboard, on the glowing spot.",
    },
    {
      id: "s17", kind: "place", title: "Place the resistor", text: "Drop the 220 ohm resistor on the glowing spot below the LED.",
      part: "resistor", spot: "bb_resistor", clip: "",
      say: "An LED needs a resistor so it does not burn out. Place it just below the LED.",
      after: "The resistor is in.",
      hint: "The resistor goes just below the LED, on the glowing spot.",
    },
    {
      id: "s18", kind: "wire", title: "LED to the resistor", text: "Wire LED pin A (the long leg) to resistor end 1.",
      pins: ["led.A", "resistor.1"], clip: "",
      say: "Connect the long leg of the LED, the anode, to one end of the resistor.",
      after: "The LED is protected.",
      hint: "The long leg of the LED, A, goes to resistor end 1.",
    },
    {
      id: "s19", kind: "wire", title: "Resistor to IO2", text: "Wire resistor end 2 to ESP32 pin IO2.",
      pins: ["resistor.2", "esp32.IO2"], clip: "",
      say: "Last wire. The other end of the resistor goes to IO2 on the ESP32.",
      after: "That is the last wire. The car is built. Press Play.",
      hint: "The other resistor end goes to ESP32 IO2.",
    },
  ],
}

const part = (id: string): GuidePart => {
  const p = RC_SAMPLE.parts.filter((x) => x.id === id)[0]
  return {...p, pins: p.pins.map((q) => ({...q, at: [...q.at] as V3})), trayAt: [...p.trayAt] as V3}
}

/** The first circuit to try: battery + switch on the model, resistor + LED on the breadboard. Same parts, pins and models as the RC car pack. */
export const LED_SAMPLE: GuidePack = {
  title: "LED starter: battery, switch, resistor, LED",
  source: "SAMPLE steps (hand-written starter circuit, not from a video)",
  controller: "none",
  board: RC_SAMPLE.board,
  parts: [part("battery"), part("switch"), part("resistor"), part("led")],
  spots: [
    {id: "model_battery", on: "model", at: [0, 3.15, 2.9], plate: [5.6, 3.1]},
    {id: "model_switch", on: "model", at: [-2.4, 3.15, 0.9], plate: [1.4, 1.0]},
    {id: "bb_resistor", on: "board", at: [2.4, 0.97, -1.2], plate: [1.6, 0.8]},
    {id: "bb_led", on: "board", at: [3.3, 0.97, 0.6], plate: [1.0, 1.0]},
  ],
  steps: [
    {
      id: "l1", kind: "place", title: "Mount the battery holder", text: "Drop the 4xAA battery holder on the glowing spot on the model.",
      part: "battery", spot: "model_battery", clip: "",
      say: "Every circuit needs power. Put the battery holder on the top of the model.",
      after: "Power source in place.",
      hint: "The battery holder goes on the glowing spot on the model.",
    },
    {
      id: "l2", kind: "place", title: "Mount the switch", text: "Drop the slide switch on the glowing spot next to the battery.",
      part: "switch", spot: "model_switch", clip: "",
      say: "Add a slide switch next to it, so you can turn the light on and off.",
      after: "The switch is on.",
      hint: "The switch goes next to the battery, on the glowing spot.",
    },
    {
      id: "l3", kind: "place", title: "Place the resistor", text: "Drop the 220 ohm resistor on the glowing spot on the breadboard.",
      part: "resistor", spot: "bb_resistor", clip: "",
      say: "An LED needs a resistor so it does not burn out. Put it on the breadboard.",
      after: "The resistor limits the current.",
      hint: "The resistor goes on the breadboard, on the glowing spot.",
    },
    {
      id: "l4", kind: "place", title: "Place the LED", text: "Drop the LED on the glowing spot next to the resistor.",
      part: "led", spot: "bb_led", clip: "",
      say: "Now the LED, right next to the resistor.",
      after: "The LED is in. Now wire it up.",
      hint: "The LED goes next to the resistor, on the glowing spot.",
    },
    {
      id: "l5", kind: "wire", title: "Battery + to the switch", text: "Wire the battery + (red) pin to switch pin 1.",
      pins: ["battery.+", "switch.1"], clip: "",
      say: "Connect the red plus wire of the battery to the first pin of the switch.",
      after: "The switch now controls the battery.",
      hint: "Battery + goes to switch pin 1.",
    },
    {
      id: "l6", kind: "wire", title: "Switch to the resistor", text: "Wire switch pin 2 to resistor end 1.",
      pins: ["switch.2", "resistor.1"], clip: "",
      say: "The other side of the switch goes to one end of the resistor.",
      after: "Current can reach the resistor.",
      hint: "Switch pin 2 goes to resistor end 1.",
    },
    {
      id: "l7", kind: "wire", title: "Resistor to the LED", text: "Wire resistor end 2 to LED pin A (the long leg).",
      pins: ["resistor.2", "led.A"], clip: "",
      say: "Connect the other end of the resistor to the long leg of the LED, the anode.",
      after: "Current flows into the LED.",
      hint: "Resistor end 2 goes to the LED long leg, A.",
    },
    {
      id: "l8", kind: "wire", title: "LED back to the battery -", text: "Wire LED pin K (the short leg) to the battery - (black) pin.",
      pins: ["led.K", "battery.-"], clip: "",
      say: "Last wire. The short leg of the LED goes back to the minus of the battery. That closes the circuit.",
      after: "The circuit is closed. Press Play to switch it on.",
      hint: "LED short leg, K, goes to the battery minus.",
    },
  ],
}

/** The bundled step lists by project id (the user's own packs register here too: see registerPack). */
const PACKS: {[id: string]: GuidePack} = {"rc-car": RC_SAMPLE, "led-blink": LED_SAMPLE}

export function packForProject(id: string): GuidePack {
  return PACKS[id] ? PACKS[id] : RC_SAMPLE
}

export function registerPack(id: string, p: GuidePack): void {
  PACKS[id] = p
}

export function hasPack(id: string): boolean {
  return PACKS[id] !== undefined
}

/** Parse + validate the JSON the offline pre-analysis writes (same shape as GuidePack). Throws a readable error. */
export function parseGuidePack(json: string): GuidePack {
  const p = JSON.parse(json) as GuidePack
  if (p.controller !== "car" && p.controller !== "servo" && p.controller !== "none") p.controller = "none"
  if (!p.parts || !p.spots || !p.board) throw new Error("guide pack needs parts, spots and a board")
  if (!p.steps || p.steps.length === 0) throw new Error("guide pack has no steps")
  const partIds: {[id: string]: GuidePart} = {}
  for (const x of p.parts) partIds[x.id] = x
  const spotIds: {[id: string]: boolean} = {}
  for (const s of p.spots) spotIds[s.id] = true
  const pinOk = (ref: string): boolean => {
    const [a, b] = ref.split(".")
    if (a === p.board.id) return p.board.pins.some((q) => q.id === b)
    return !!partIds[a] && partIds[a].pins.some((q) => q.id === b)
  }
  for (const s of p.steps) {
    if (s.kind === "place") {
      if (!s.part || !partIds[s.part]) throw new Error("step " + s.id + ": unknown part " + s.part)
      if (!s.spot || !spotIds[s.spot]) throw new Error("step " + s.id + ": unknown spot " + s.spot)
    } else {
      if (!s.pins || !pinOk(s.pins[0]) || !pinOk(s.pins[1])) throw new Error("step " + s.id + ": unknown pin in " + JSON.stringify(s.pins))
    }
    if (!s.say || !s.hint) throw new Error("step " + s.id + ": narration and hint are required")
  }
  return p
}
