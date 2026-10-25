// PackHand.ts - project pack: glove-controlled bionic (servo) hand, five SG90 servos pulling tendons through a 3D-printed hand.
// SOURCE (read offline): https://github.com/SATHv1kk/bionic-arm-flex-sensor-control (README.md, docs/wiring.md, docs/hardware.md,
//   hardware/bom.csv, firmware/bionic_hand/config.h), MIT licence. Stated there: Arduino Mega 2560 (an Uno also works); five SG90 servos;
//   five 2.2 in flex sensors in voltage dividers (10k-47k fixed resistor); pin map Thumb A0 / D3, Index A1 / D5, Middle A2 / D6, Ring A3 / D9,
//   Little A4 / D10; servos on a dedicated 5 V supply of at least 3 A with a common ground; flex dividers on the Arduino 5 V rail; each finger
//   printed as three segments (distal, middle, proximal) bonded with superglue; tendons are nylon line from the fingertip to the servo horn;
//   the forearm houses the servos; servo angle 0 = straight, 180 = fully curled (config.h defaults).
// NOT in the source (so approximate / illustrative here): the printed part shapes and sizes (the repo ships CAD screenshots, no STL),
//   which way each servo horn faces, every position. The Mega, SG90 and UBEC sizes are standard sizes.
// Must not: contain engine code.

import {PackShape, ComponentDef, ConnectionDef, StepDef, CommandDef, V3, RGBA, GroupDef, PrimDef} from "./ProjectPack"
import {mk, box, sph, grp, wire, step, cmd, fillGuide, finishPack, WIRE, DEFAULT_GAME, DEFAULT_WORKBENCH, DEFAULT_VALIDATION_NOTE} from "./PackKit"
import {mega, sg90, ubec, flexGlove, servoBank} from "./PackParts"

const URL = "https://github.com/SATHv1kk/bionic-arm-flex-sensor-control"
const SKIN: RGBA = [0.62, 0.66, 0.74, 1]
const SKIN2: RGBA = [0.5, 0.55, 0.66, 1]

const FINGERS: {id: string; name: string; short: string; z: number; x0: number; len: [number, number, number]}[] = [
  {id: "thumb", name: "Thumb", short: "Thumb", z: 3.3, x0: 2.0, len: [2.2, 2.0, 1.8]},
  {id: "index", name: "Index finger", short: "Index", z: 1.7, x0: 6.0, len: [3.0, 2.2, 1.9]},
  {id: "middle", name: "Middle finger", short: "Middle", z: 0.1, x0: 6.0, len: [3.3, 2.5, 2.0]},
  {id: "ring", name: "Ring finger", short: "Ring", z: -1.5, x0: 6.0, len: [3.0, 2.2, 1.9]},
  {id: "little", name: "Little finger", short: "Little", z: -3.1, x0: 6.0, len: [2.4, 1.8, 1.6]},
]
const PINS_D = ["D3", "D5", "D6", "D9", "D10"]
const PINS_A = ["A0", "A1", "A2", "A3", "A4"]

function fingerParts(f: (typeof FINGERS)[number]): {prims: PrimDef[]; groups: GroupDef[]} {
  const L = f.len
  const prims: PrimDef[] = []
  const groups = [grp("seg0", [0, 0, 0]), grp("seg1", [L[0], 0, 0], "seg0"), grp("seg2", [L[1], 0, 0], "seg1")]
  for (let i = 0; i < 3; i++) {
    prims.push(box([L[i] / 2, 0, 0], [L[i] - 0.06, 1.3, 1.45], i % 2 === 0 ? SKIN : SKIN2, "seg" + i, undefined, "segment" + i))
  }
  prims.push(sph([L[2], 0, 0], 1.3, SKIN2, "seg2", "tip"))
  return {prims: prims, groups: groups}
}

export function makeHandPack(): PackShape {
  const mg = mega()
  const ub = ubec()
  const fl = flexGlove()
  const sb = servoBank([0.2, 0.45, 0.85, 1])
  void sg90

  const components: ComponentDef[] = [
    mk({
      id: "forearm", name: "Forearm (approximate)", kind: "printed", group: "body", color: SKIN, assembled: [-6.25, 0, 0], sizeBasis: "illustrative", exploded: [-3, -2, 0],
      prims: [
        box([0, 0.15, 0], [11.5, 0.3, 7.4], SKIN, undefined, undefined, "floor"),
        box([0, 1.8, 3.55], [11.5, 3.0, 0.3], SKIN, undefined, undefined, "wallF"),
        box([0, 1.8, -3.55], [11.5, 3.0, 0.3], SKIN, undefined, undefined, "wallB"),
        box([-5.6, 1.8, 0], [0.3, 3.0, 7.4], SKIN, undefined, undefined, "end"),
      ],
      purpose: "The printed forearm. It houses the five servos (README). Real shape: only CAD screenshots in the source, so this tray is approximate.",
      notes: ["APPROXIMATE: the source has no STL for the forearm."],
    }),
    mk({
      id: "servo_bank", name: "5 x SG90 servos", color: [0.2, 0.45, 0.85, 1], assembled: [-7.0, 0.3, 0], prims: sb.prims, pins: sb.pins, exploded: [0, 4, 0], outward: true,
      benchPos: [-5.8, 0, 3.2], benchYaw: 0,
      purpose: "Five SG90 micro servos, one per finger. Each winds a nylon tendon that curls its finger. Signals on D3 D5 D6 D9 D10, powered by the separate 5 V supply.",
      notes: ["SG90: 4.8-6 V, 0-180 degrees, 9 g (hardware.md). Size ~22 x 12 x 23 mm (standard size, not from the source).", "Which way each horn faces is not specified."],
    }),
    mk({
      id: "palm", name: "Palm (approximate)", kind: "printed", group: "body", color: SKIN2, assembled: [2.75, 0, 0], sizeBasis: "illustrative", exploded: [0, 3, 0],
      prims: [box([0, 0.7, 0], [6.5, 1.4, 8.0], SKIN2, undefined, undefined, "palm")],
      purpose: "The printed palm that carries the five fingers.", notes: ["APPROXIMATE: the source has no STL for the palm."],
    }),
  ]
  for (const f of FINGERS) {
    const fp = fingerParts(f)
    components.push(
      mk({
        id: "finger_" + f.id, name: f.name + " (3 segments)", kind: "printed", group: "finger", color: SKIN, assembled: [f.x0, 0.7, f.z], sizeBasis: "illustrative",
        prims: fp.prims, groups: fp.groups, exploded: [4, 2, f.z > 0 ? 1.5 : -1.5], outward: true,
        purpose: f.name + ": three printed segments (distal, middle, proximal) bonded with superglue and curled by a nylon tendon from its servo.",
        notes: ["APPROXIMATE shape and size: the source shows CAD screenshots, not STL files."],
      }),
    )
  }
  components.push(
    mk({
      id: "mega", name: "Arduino Mega 2560", color: [0.0, 0.4, 0.5, 1], assembled: [-8.0, 0, -8.2], prims: mg.prims, pins: mg.pins, exploded: [0, 4, 0], outward: true,
      benchPos: [0, 0, -3.2], benchYaw: 0,
      purpose: "The controller (an Uno also works, hardware.md). D3 D5 D6 D9 D10 drive the servos; A0-A4 read the flex sensors.",
      notes: ["Board size 101.6 x 53.3 mm (standard size, not from the source)."],
    }),
    mk({
      id: "ubec", name: "5 V 3 A supply (UBEC)", color: [0.15, 0.55, 0.3, 1], assembled: [-1.5, 0, -8.2], prims: ub.prims, pins: ub.pins, exploded: [0, 4, 0], outward: true,
      benchPos: [-2.0, 0, 5.8], benchYaw: 0,
      purpose: "A dedicated 5 V supply of at least 3 A for the servos, with its ground shared with the Arduino (wiring.md). A 470-1000 uF capacitor across the rails is recommended.",
      notes: ["UBEC size ~34 x 20 mm (standard size, not from the source)."],
    }),
    mk({
      id: "flex_glove", name: "Flex-sensor glove", color: [0.2, 0.25, 0.4, 1], assembled: [4.0, 0, -8.2], prims: fl.prims, pins: fl.pins, exploded: [0, 4, 0], outward: true,
      benchPos: [3.8, 0, 4.2], benchYaw: 0,
      purpose: "Five 2.2 in flex sensors, each in a voltage divider with a 10k-47k fixed resistor (shown as one board). Resistance rises as the finger bends.",
      notes: ["Sensor 2.2 in (5.6 cm) per hardware.md; the fixed resistor value is chosen by you (47k is the doc's example)."],
    }),
  )

  const conns: ConnectionDef[] = []
  for (let i = 0; i < 5; i++) {
    conns.push(wire("sense_" + FINGERS[i].id, "servo", "mega." + PINS_A[i], "flex_glove.F" + i, PINS_A[i] + " > " + FINGERS[i].short, "wiring.md: " + FINGERS[i].short + " flex sensor goes to " + PINS_A[i] + ".", WIRE.purple, 1.0 + i * 0.35))
  }
  conns.push(wire("flex_5v", "power", "mega.5V", "flex_glove.V5", "5V > dividers", "wiring.md: the flex dividers stay on the Arduino 5 V rail.", WIRE.red, 3.0))
  conns.push(wire("flex_gnd", "power", "mega.GND", "flex_glove.GND", "GND > dividers", "wiring.md: the divider bottoms go to GND.", WIRE.black, 3.3))
  for (let i = 0; i < 5; i++) {
    conns.push(wire("servo_" + FINGERS[i].id, "i2c", "mega." + PINS_D[i], "servo_bank.S" + i, PINS_D[i] + " > " + FINGERS[i].short, "wiring.md: " + FINGERS[i].short + " servo signal is " + PINS_D[i] + ".", WIRE.yellow, 1.6 + i * 0.35))
  }
  conns.push(wire("pwr_plus", "power", "ubec.OUT+", "servo_bank.V+", "5V > servos", "wiring.md: servo V+ comes from the external 5 V supply, not the Arduino 5 V pin.", WIRE.red, 3.6))
  conns.push(wire("pwr_minus", "power", "ubec.OUT-", "servo_bank.GND", "GND > servos", "wiring.md: servo GND goes to the supply ground.", WIRE.black, 3.9))
  conns.push(wire("gnd_common", "power", "mega.GND", "ubec.OUT-", "Common GND", "wiring.md: the supply ground and the Arduino ground MUST be shared.", WIRE.black, 4.2))

  const SRC = "wiring.md pin map"
  const steps: StepDef[] = [
    step("s_forearm", "Forearm", "Start with the printed forearm; it houses the servos.", ["forearm"], [], "illustrative", "README: forearm houses the servos"),
    step("s_servos", "Servos", "Seat the five SG90 servos in the forearm.", ["servo_bank"], [], "illustrative", "README: servos in the forearm"),
    step("s_palm", "Palm", "Attach the printed palm.", ["palm"], [], "illustrative", "hardware.md: hand printed in parts"),
    step("s_fa", "Fingers 1", "Fit the index finger and the thumb (three bonded segments each).", ["finger_index", "finger_thumb"], [], "illustrative", "hardware.md: three segments per finger"),
    step("s_fb", "Fingers 2", "Fit the middle, ring and little fingers.", ["finger_middle", "finger_ring", "finger_little"], [], "illustrative", "hardware.md: three segments per finger"),
    step("s_mega", "Arduino", "Place the Arduino Mega 2560.", ["mega"], [], "repo", "hardware.md: Arduino Mega 2560"),
    step("s_ubec", "5V supply", "Place the dedicated 5 V 3 A supply.", ["ubec"], [], "repo", "wiring.md: Power"),
    step("s_glove", "Glove", "Place the flex-sensor glove board.", ["flex_glove"], [], "repo", "README: flex sensors on a glove"),
    step("s_sense", "Sensor wires", "A0-A4 to the five flex dividers, 5V and GND to the divider rails.", ["mega", "flex_glove"], ["sense_thumb", "sense_index", "sense_middle", "sense_ring", "sense_little", "flex_5v", "flex_gnd"], "repo", SRC),
    step("s_sig", "Servo signals", "D3 D5 D6 D9 D10 to the five servo signal wires.", ["mega", "servo_bank"], ["servo_thumb", "servo_index", "servo_middle", "servo_ring", "servo_little"], "repo", SRC),
    step("s_pwr", "Servo power", "Supply 5 V and GND to the servos, and join the grounds.", ["ubec", "servo_bank", "mega"], ["pwr_plus", "pwr_minus", "gnd_common"], "repo", "wiring.md: Servo connections"),
  ]

  const commands: CommandDef[] = []
  const all = (v: number, over?: {[k: string]: number}) => {
    const o: {[k: string]: number} = {}
    for (const f of FINGERS) o["f_" + f.id] = v
    if (over) for (const k in over) o[k] = over[k]
    return o
  }
  commands.push(cmd("open", "Open", "open", "once", [{ang: all(0), wait: 1200}], "config.h: angleStraight 0"))
  commands.push(cmd("fist", "Fist", "fist", "once", [{ang: all(180), wait: 1600}], "config.h: angleBent 180"))
  commands.push(cmd("point", "Point", "point", "once", [{ang: all(180, {f_index: 0}), wait: 1600}], "index straight, others curled"))
  commands.push(cmd("peace", "Peace", "peace", "once", [{ang: all(180, {f_index: 0, f_middle: 0}), wait: 1600}], "index and middle straight, others curled"))
  commands.push(cmd("thumb", "Thumbs up", "thumb", "once", [{ang: all(180, {f_thumb: 0}), wait: 1600}], "thumb straight, others curled"))
  commands.push(cmd("pinch", "Pinch", "pinch", "once", [{ang: all(0, {f_thumb: 110, f_index: 110}), wait: 1600}], "thumb and index curl toward each other"))
  commands.push(cmd("count", "Count", "count", "once", [
    {ang: all(0), wait: 600},
    {ang: {f_little: 180}, wait: 300}, {ang: {f_ring: 180}, wait: 300}, {ang: {f_middle: 180}, wait: 300}, {ang: {f_index: 180}, wait: 300}, {ang: {f_thumb: 180}, wait: 500},
    {ang: all(0), wait: 900},
  ], "each finger follows its own flex sensor (one sensor per finger, no coupling)"))

  const pack: PackShape = {
    identity: {
      id: "servo-hand", app: "3D Wiz", tagline: "Visualize it. Build it. Test it.", name: "Servo Hand", subtitle: "Glove-controlled bionic hand, 5 x SG90",
      source: "bionic-arm-flex-sensor-control (MIT)", credit: "SATHv1kk (README + docs read offline)", license: "MIT", preparedOffline: true, version: "master branch, docs/wiring.md",
      url: URL, short: "Servo Hand", icon: "back_hand", hasOled: false, sourceNote: "Printed parts are approximate: the source has CAD screenshots only.",
    },
    mcu: {board: "Arduino Mega 2560 (Uno also works)", servos: 5, servoPins: [3, 5, 6, 9, 10], flexPins: ["A0", "A1", "A2", "A3", "A4"], supply: "5 V >= 3 A, common ground"},
    notSpecified: [
      "Printed part shapes and sizes (the repo has CAD screenshots, no STL): forearm, palm and finger shapes here are APPROXIMATE",
      "Which way each servo horn faces and how the tendons are routed",
      "The fixed divider resistor value is yours to choose (10k-47k; 47k is the doc's worked example)",
      "All positions (illustrative); the Mega, SG90 and UBEC sizes are standard sizes",
    ],
    placement: {
      desk: [0, -12, -60], deskSize: [30, 16], modeBar: [0, -27.8, -55], taskPanel: [0, -20, -55], testPanel: [0, -17.5, -55], validatorPanel: [0, -11, -55],
      infoCard: [0, 3.1, -55], menu: [0, -11, -55], bench: [0, -7.5, -63], benchScale: 1.8, benchTiltDeg: 55, locator: [11.5, 2.4, -62], locatorScale: 0.4,
      enlarge: 1.25, enlargeExploded: 1.0, explodeSpeed: 6, dragDegPerCm: 14, modelScale: 0.85, viewYaw: 30,
    },
    game: {snapCm: 2.4, tray: [0, 3.0, 6.8] as V3, confetti: DEFAULT_GAME.confetti},
    components: components,
    connections: conns,
    steps: steps,
    lab: {
      simLabel: "SIMULATED - no hardware", walkCycles: 1, motorDegPerS: 260, commands: commands,
      pages: [["open", "fist", "point", "peace", "thumb", "pinch", "count"]],
      icons: {open: "back_hand", fist: "sports_mma", point: "touch_app", peace: "pan_tool", thumb: "thumb_up", pinch: "swap_horiz", count: "more_horiz"},
    },
    validation: {expected: [], distractors: [
      {id: "x_servo_pin", label: "D3 to Index", from: {component: "mega", pin: "D3"}, to: {component: "servo_bank", pin: "S1"}, explanation: "Not in wiring.md: D3 is the thumb servo; the index servo is D5."},
      {id: "x_servo_5v", label: "Mega 5V to servos", from: {component: "mega", pin: "5V"}, to: {component: "servo_bank", pin: "V+"}, explanation: "Not in wiring.md: servo V+ must come from the external 5 V supply, never the Arduino 5 V pin."},
    ], disclaimer: DEFAULT_VALIDATION_NOTE},
    visualize: {
      scale: 1.3, wallCm: 0.25, leadReachCm: 14,
      defaultCavity: {min: [-5.5, 0.3, -3.4] as V3, max: [5.5, 3.3, 3.4] as V3, basis: "approximate forearm"},
      catalog: [
        {id: "servo_bank", size: [2.28, 2.7, 6.6] as V3, rule: "back of the forearm"},
        {id: "ubec", size: [3.4, 1.0, 2.0] as V3, rule: "beside the servos"},
        {id: "mega", size: [10.16, 1.5, 5.33] as V3, rule: "only if the forearm is long enough"},
      ],
      servoNote: "The five fingers are driven by tendons from these servos",
      prefer: {servo_bank: [0.1, 0, 0.5] as V3, ubec: [0.8, 0, 0.5] as V3, mega: [0.5, 0, 0.5] as V3},
      naive: {servo_bank: [-2.0, 1.65, 0] as V3, ubec: [-1.0, 0.8, 0.5] as V3, mega: [1.0, 1.05, 0] as V3},
      shell: [
        box([0, 0.15, 0], [11.5, 0.3, 7.4], SKIN, undefined, undefined, "floor"),
        box([0, 1.8, 3.55], [11.5, 3.0, 0.3], SKIN, undefined, undefined, "wallF"),
        box([0, 1.8, -3.55], [11.5, 3.0, 0.3], SKIN, undefined, undefined, "wallB"),
        box([-5.6, 1.8, 0], [0.3, 3.0, 7.4], SKIN, undefined, undefined, "end"),
      ],
      test: {power: ["ubec", "servo_bank"], data: ["mega", "servo_bank"], servo: ["servo_bank"]},
      demo: {parts: ["servo_bank", "ubec"], screw: "", tool: "", hole: ""},
    },
    gesture: {} as PackShape["gesture"],
    guide: {schema: "3dwiz-pack/1", guideSource: {url: URL, license: "MIT", note: "README, wiring.md, hardware.md and bom.csv read offline. The hand is glued and tendoned: the source states no screws."}, parts: [], screwHoles: [], fasteners: [], tools: []},
    workbench: {altServos: [{id: "alt_mg996r", label: "MG996R", size: [1.97, 4.29, 4.07] as V3, color: [0.35, 0.35, 0.45, 1] as RGBA}], ...DEFAULT_WORKBENCH},
    rig: {
      mode: "generic",
      acts: FINGERS.map((f) => ({
        name: "f_" + f.id, zero: 0, speed: 260,
        els: [
          {part: "finger_" + f.id, grp: "seg0", op: "rot" as const, axis: [0, 0, 1] as V3, k: -70 / 180},
          {part: "finger_" + f.id, grp: "seg1", op: "rot" as const, axis: [0, 0, 1] as V3, k: -90 / 180},
          {part: "finger_" + f.id, grp: "seg2", op: "rot" as const, axis: [0, 0, 1] as V3, k: -60 / 180},
        ],
      })),
    },
    plan: {
      s_forearm: {title: "Forearm", place: ["forearm"]},
      s_servos: {title: "Servos", place: ["servo_bank"]},
      s_palm: {title: "Palm", place: ["palm"]},
      s_fa: {title: "Fingers 1", place: ["finger_index", "finger_thumb"]},
      s_fb: {title: "Fingers 2", place: ["finger_middle", "finger_ring", "finger_little"]},
      s_mega: {title: "Arduino", place: ["mega"]},
      s_ubec: {title: "5V supply", place: ["ubec"]},
      s_glove: {title: "Glove", place: ["flex_glove"]},
      s_sense: {title: "Sensor wires", place: []},
      s_sig: {title: "Servo signals", place: []},
      s_pwr: {title: "Servo power", place: []},
    },
    quests: [
      {id: "q1", title: "Body", steps: ["s_forearm", "s_servos", "s_palm"]},
      {id: "q2", title: "Fingers", steps: ["s_fa", "s_fb"]},
      {id: "q3", title: "Brains", steps: ["s_mega", "s_ubec", "s_glove"]},
      {id: "q4", title: "Wiring", steps: ["s_sense", "s_sig", "s_pwr"]},
    ],
    names: {
      forearm: "Forearm", servo_bank: "5 Servos", palm: "Palm", mega: "Arduino Mega", ubec: "5V supply", flex_glove: "Glove",
      finger_thumb: "Thumb", finger_index: "Index", finger_middle: "Middle", finger_ring: "Ring", finger_little: "Little",
    },
  }

  const orient: {[id: string]: {text: string; face: string; dir: V3}} = {
    forearm: {text: "open side up", face: "+Y", dir: [0, 1, 0]},
    servo_bank: {text: "horns up, wires back", face: "+Y", dir: [0, 1, 0]},
    palm: {text: "flat side down", face: "-Y", dir: [0, -1, 0]},
    mega: {text: "USB to the back", face: "-X", dir: [-1, 0, 0]},
    ubec: {text: "outputs to the right", face: "+X", dir: [1, 0, 0]},
    flex_glove: {text: "sensors along the fingers", face: "+X", dir: [1, 0, 0]},
  }
  const host: {[id: string]: string} = {forearm: "body", servo_bank: "forearm", palm: "forearm", mega: "body", ubec: "body", flex_glove: "body"}
  for (const f of FINGERS) {
    orient["finger_" + f.id] = {text: "curls toward the palm", face: "+X", dir: [1, 0, 0]}
    host["finger_" + f.id] = "palm"
  }
  fillGuide(pack, orient, host, {doc: "README.md + docs", url: URL})
  return finishPack(pack)
}
