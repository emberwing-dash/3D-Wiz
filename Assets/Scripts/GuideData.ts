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
  controller: "car" | "servo"
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
  ],
  spots: [
    {id: "bb_esp", on: "board", at: [-2.6, 0.97, 0], plate: [2.4, 3.1]},
    {id: "bb_l293", on: "board", at: [1.4, 0.97, 0], plate: [1.5, 2.5]},
    {id: "model_servo", on: "model", at: [0, 3.15, -4.5], plate: [1.8, 3.6]},
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
      after: "That is the last wire. The car is built. Press Play.",
      hint: "Servo signal goes to IO14. Wire servo SIG to ESP32 IO14.",
    },
  ],
}

/** Parse + validate the JSON the offline pre-analysis writes (same shape as GuidePack). Throws a readable error. */
export function parseGuidePack(json: string): GuidePack {
  const p = JSON.parse(json) as GuidePack
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
