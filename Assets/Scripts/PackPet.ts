// PackPet.ts - project pack: ESP32 Desktop Pet (animated OLED eyes + touch + sound + motion).
// SOURCE (read offline): https://github.com/SukunDev/ESP32-Pet-Robot (README.md), MIT licence, (c) 2025 SukunDev.
//   From the README: ESP32-C3-DevKitM-1, SSD1306 128x64 OLED, MPU6050, microphone, TTP223 touch sensor;
//   pins: OLED SDA 8 / SCL 9, TTP223 7, microphone 4, MPU6050 SDA 8 / SCL 9 (shared I2C), 3V3 -> OLED / MPU6050 / touch VCC,
//   GND -> OLED / MPU6050 / microphone / touch GND; behaviours (moods, touch, sound, shake, lift, tilt, 5 s / 10 s sleep).
// NOT in the source (marked illustrative / standard in the data): the enclosure (the repo has no STL or shell), every module size,
//   all positions, the microphone module type and its VCC pin, which board pin position each GPIO sits at, the eye bitmaps.
// Must not: contain engine code.

import {PackShape, ComponentDef, ConnectionDef, StepDef, CommandDef, V3, RGBA} from "./ProjectPack"
import {mk, box, cyl, sph, wire, step, cmd, fillGuide, finishPack, WIRE, C, DEFAULT_GAME, DEFAULT_WORKBENCH, DEFAULT_VALIDATION_NOTE, pin} from "./PackKit"
import {esp32c3, mpu6050, ttp223, micModule} from "./PackParts"

const URL = "https://github.com/SukunDev/ESP32-Pet-Robot"
const SHELL: RGBA = [0.93, 0.91, 0.97, 1] // soft white-lavender cat body
const PINK: RGBA = [1.0, 0.62, 0.76, 1]
const DARK: RGBA = [0.2, 0.2, 0.26, 1]

function shellBasePrims() {
  return [
    box([0, 0.15, 0], [6.6, 0.3, 6.4], SHELL, undefined, undefined, "floor"),
    box([-3.175, 1.85, 0], [0.25, 3.1, 6.4], SHELL, undefined, undefined, "wallL"),
    box([3.175, 1.85, 0], [0.25, 3.1, 6.4], SHELL, undefined, undefined, "wallR"),
    box([0, 1.85, -3.075], [6.6, 3.1, 0.25], SHELL, undefined, undefined, "wallB"),
    box([0, 0.55, 3.075], [6.6, 0.5, 0.25], SHELL, undefined, undefined, "lip"),
    // cat: round paws at the front, a curled tail at the back, cheek pads and whiskers beside the OLED
    sph([-1.7, 0.7, 3.5], 1.7, SHELL, undefined, "pawL"),
    sph([1.7, 0.7, 3.5], 1.7, SHELL, undefined, "pawR"),
    sph([-1.7, 0.55, 3.95], 0.7, PINK, undefined, "padL"),
    sph([1.7, 0.55, 3.95], 0.7, PINK, undefined, "padR"),
    cyl([2.9, 2.0, -3.9], [0.8, 3.2, 0.8], SHELL, undefined, [0, 0, -25], "tail"),
    sph([3.65, 3.55, -3.9], 1.0, PINK, undefined, "tailTip"),
    box([-3.9, 2.1, 2.4], [1.4, 0.06, 0.06], DARK, undefined, [0, 0, 12], "whiskL1"),
    box([-3.9, 1.7, 2.4], [1.4, 0.06, 0.06], DARK, undefined, [0, 0, -12], "whiskL2"),
    box([3.9, 2.1, 2.4], [1.4, 0.06, 0.06], DARK, undefined, [0, 0, -12], "whiskR1"),
    box([3.9, 1.7, 2.4], [1.4, 0.06, 0.06], DARK, undefined, [0, 0, 12], "whiskR2"),
  ]
}

export function makePetPack(): PackShape {
  const c3 = esp32c3()
  const imu = mpu6050()
  const tt = ttp223()
  const mic = micModule()

  const components: ComponentDef[] = [
    mk({
      id: "shell_base", name: "Cat shell base (illustrative)", kind: "printed", group: "body", color: SHELL, assembled: [0, 0, 0],
      sizeBasis: "illustrative", exploded: [0, -2.5, 0], prims: shellBasePrims(),
      purpose: "A simple open shell to hold the modules. The source repo has no enclosure, so this shape is illustrative.",
      notes: ["NOT from the source: the repo ships no STL or shell."],
    }),
    mk({
      id: "esp32c3", name: "ESP32-C3-DevKitM-1", color: [0.07, 0.38, 0.32, 1], assembled: [0, 0.3, -1.6], exploded: [0, 3.5, -1.5],
      prims: c3.prims, pins: c3.pins, benchPos: [0, 0, 1.0], benchYaw: 0, outward: false,
      purpose: "The brain. GPIO8 = I2C SDA and GPIO9 = I2C SCL (OLED and MPU6050 share them), GPIO7 = touch, GPIO4 = microphone, 3V3 powers the modules.",
      notes: ["Size ~54 x 25 mm (standard size, not from the source).", "Pin positions along the headers are illustrative; GPIO numbers are from the README."],
    }),
    mk({
      id: "mpu6050", name: "MPU6050 motion sensor", color: [0.1, 0.3, 0.75, 1], assembled: [-1.9, 0.3, 0.7], exploded: [-3.5, 3.0, 0],
      prims: imu.prims, pins: imu.pins, benchPos: [4.8, 0, -3.6], benchYaw: 0,
      purpose: "Gyroscope + accelerometer on the shared I2C bus (SDA GPIO8, SCL GPIO9). It senses shake, lift/drop and left/right tilt.",
      notes: ["Size ~21 x 16 mm (standard size, not from the source)."],
    }),
    mk({
      id: "ttp223", name: "TTP223 touch sensor", color: [0.15, 0.3, 0.7, 1], assembled: [1.9, 0.3, 0.7], exploded: [3.5, 3.0, 0],
      prims: tt.prims, pins: tt.pins, benchPos: [-4.8, 0, 5.2], benchYaw: 0,
      purpose: "Capacitive touch pad on GPIO7. A touch makes the pet happy or angry.",
      notes: ["Module size varies (about 15 x 11 mm here; standard size, not from the source)."],
    }),
    mk({
      id: "mic", name: "Microphone module", color: [0.15, 0.4, 0.2, 1], assembled: [0, 0.3, 1.0], exploded: [0, 4.0, 1.5],
      prims: mic.prims, pins: mic.pins, benchPos: [4.8, 0, 5.2], benchYaw: 0,
      purpose: "Sound input on GPIO4. A noise while asleep makes the pet scared or angry.",
      notes: ["The source does not name the module type or say how its VCC is wired (not specified)."],
    }),
    mk({
      id: "oled", name: "OLED display (SSD1306 0.96in)", model: "oled", color: [0.1, 0.35, 0.75, 1], assembled: [0, 1.95, 2.72], assembledRot: [90, 0, 0],
      sizeCm: [2.73, 0.4, 2.73], exploded: [0, 2.0, 3.0], benchPos: [-4.8, 0, -3.6], benchYaw: 0, outward: true,
      pins: [pin("GND", [-0.381, 0.25, -1.2], "GND"), pin("VCC", [-0.127, 0.25, -1.2], "VCC"), pin("SCL", [0.127, 0.25, -1.2], "SCL"), pin("SDA", [0.381, 0.25, -1.2], "SDA")],
      purpose: "128x64 OLED that shows the animated eyes. SDA = GPIO8, SCL = GPIO9, shared with the MPU6050.",
      notes: ["Size: 0.96in SSD1306 module ~27 x 27 mm (standard size, not from the source)."],
    }),
    mk({
      id: "shell_top", name: "Cat lid with ears (illustrative)", kind: "printed", group: "cover", color: SHELL, assembled: [0, 3.45, 0], sizeBasis: "illustrative", exploded: [0, 4.5, 0],
      prims: [
        box([0, 0.125, 0], [6.6, 0.25, 6.4], SHELL, undefined, undefined, "lid"),
        // cat ears: diamonds sunk half into the lid, pink inside
        box([-2.3, 0.3, -0.3], [1.7, 1.7, 0.5], SHELL, undefined, [0, 0, 45], "earL"),
        box([2.3, 0.3, -0.3], [1.7, 1.7, 0.5], SHELL, undefined, [0, 0, 45], "earR"),
        box([-2.3, 0.3, 0.0], [0.95, 0.95, 0.5], PINK, undefined, [0, 0, 45], "earInL"),
        box([2.3, 0.3, 0.0], [0.95, 0.95, 0.5], PINK, undefined, [0, 0, 45], "earInR"),
      ],
      purpose: "Closes the shell. The source has no enclosure, so this is illustrative.",
      notes: ["NOT from the source."],
    }),
    mk({
      id: "hand_prop", name: "Finger (demo prop)", kind: "electronic", group: "prop", color: [0.95, 0.8, 0.7, 1], assembled: [0, 8.5, 0.5], sizeBasis: "illustrative",
      prims: [cyl([0, 1.8, 0], [1.2, 3.6, 1.2], [0.95, 0.8, 0.7, 1], undefined, undefined, "finger"), cyl([0, 0, 0], [1.3, 0.3, 1.3], [0.95, 0.8, 0.7, 1], undefined, undefined, "tip")],
      purpose: "A finger that taps the pet in the Touch demo.", notes: ["Demo prop only."],
    }),
  ]

  const conns: ConnectionDef[] = [
    wire("i2c_sda_oled", "i2c", "esp32c3.GPIO8", "oled.SDA", "SDA 8 > OLED", "README: Pin 8 (SDA) goes to the OLED SDA.", WIRE.blue, 2.4),
    wire("i2c_scl_oled", "i2c", "esp32c3.GPIO9", "oled.SCL", "SCL 9 > OLED", "README: Pin 9 (SCL) goes to the OLED SCL.", WIRE.green, 2.8),
    wire("i2c_sda_imu", "i2c", "esp32c3.GPIO8", "mpu6050.SDA", "SDA 8 > IMU", "README: Pin 8 (SDA) is shared with the MPU6050 SDA.", WIRE.blue, 3.2),
    wire("i2c_scl_imu", "i2c", "esp32c3.GPIO9", "mpu6050.SCL", "SCL 9 > IMU", "README: Pin 9 (SCL) is shared with the MPU6050 SCL.", WIRE.green, 3.6),
    wire("sig_touch", "servo", "esp32c3.GPIO7", "ttp223.OUT", "GPIO7 > touch", "README: Pin 7 goes to the TTP223 touch sensor.", WIRE.yellow, 1.4),
    wire("sig_mic", "servo", "esp32c3.GPIO4", "mic.OUT", "GPIO4 > mic", "README: Pin 4 goes to the microphone (which module pin is not specified).", WIRE.orange, 1.8),
    wire("v33_oled", "power", "esp32c3.3V3", "oled.VCC", "3V3 > OLED", "README: 3V3 powers the OLED VCC.", WIRE.red, 1.0),
    wire("v33_imu", "power", "esp32c3.3V3", "mpu6050.VCC", "3V3 > IMU", "README: 3V3 powers the MPU6050 VCC.", WIRE.red, 1.3),
    wire("v33_touch", "power", "esp32c3.3V3", "ttp223.VCC", "3V3 > touch", "README: 3V3 powers the touch sensor VCC.", WIRE.red, 1.6),
    wire("gnd_oled", "power", "esp32c3.GND", "oled.GND", "GND > OLED", "README: GND goes to the OLED GND.", WIRE.black, 0.5),
    wire("gnd_imu", "power", "esp32c3.GND", "mpu6050.GND", "GND > IMU", "README: GND goes to the MPU6050 GND.", WIRE.black, 0.7),
    wire("gnd_mic", "power", "esp32c3.GND", "mic.GND", "GND > mic", "README: GND goes to the microphone GND.", WIRE.black, 0.9),
    wire("gnd_touch", "power", "esp32c3.GND", "ttp223.GND", "GND > touch", "README: GND goes to the touch sensor GND.", WIRE.black, 1.1),
  ]

  const SRC = "README wiring diagram"
  const steps: StepDef[] = [
    step("s_shell", "Shell", "Start with an open shell to hold the modules (illustrative: the repo has no enclosure).", ["shell_base"], [], "illustrative", "no enclosure in the source"),
    step("s_mcu", "Brain", "Lay the ESP32-C3-DevKitM-1 in the back of the shell.", ["esp32c3"], [], "illustrative", "README: hardware list"),
    step("s_imu", "Motion", "Place the MPU6050 on the left.", ["mpu6050"], [], "illustrative", "README: hardware list"),
    step("s_touch", "Touch", "Place the TTP223 touch sensor on the right.", ["ttp223"], [], "illustrative", "README: hardware list"),
    step("s_mic", "Mic", "Place the microphone module in the middle.", ["mic"], [], "illustrative", "README: hardware list"),
    step("s_oled", "Display", "Stand the OLED at the front, screen forward.", ["oled"], [], "illustrative", "README: hardware list"),
    step("s_i2c", "I2C wires", "SDA to GPIO8 and SCL to GPIO9 for the OLED and the MPU6050.", ["esp32c3", "oled", "mpu6050"], ["i2c_sda_oled", "i2c_scl_oled", "i2c_sda_imu", "i2c_scl_imu"], "repo", SRC),
    step("s_sig", "Signal wires", "GPIO7 to the touch sensor, GPIO4 to the microphone.", ["esp32c3", "ttp223", "mic"], ["sig_touch", "sig_mic"], "repo", SRC),
    step("s_3v3", "Power wires", "3V3 to the OLED, MPU6050 and touch sensor VCC.", ["esp32c3", "oled", "mpu6050", "ttp223"], ["v33_oled", "v33_imu", "v33_touch"], "repo", SRC),
    step("s_gnd", "Ground wires", "GND to the OLED, MPU6050, microphone and touch sensor GND.", ["esp32c3", "oled", "mpu6050", "mic", "ttp223"], ["gnd_oled", "gnd_imu", "gnd_mic", "gnd_touch"], "repo", SRC),
    step("s_lid", "Lid", "Close the lid. The pet wakes up.", ["shell_top"], [], "illustrative", "no enclosure in the source"),
  ]

  const commands: CommandDef[] = []
  const face = (id: string, label: string, f: string, mode: "loop" | "once" | "boomerang", basis: string, extra?: CommandDef["steps"]) =>
    commands.push(cmd(id, label, f, mode, extra ? extra : [{ang: {tilt: 0, hop: 0, finger: 0}, wait: 2400}], basis))
  face("default", "Default", "eye_default", "boomerang", "README: Default: normal eyes with automatic blinking")
  face("happy", "Happy", "eye_happy", "loop", "README: Happy: smiling eyes with laughing animation")
  face("angry", "Angry", "eye_angry", "loop", "README: Angry: eyes with horizontal flickering")
  face("sleepy", "Sleepy", "eye_sleepy", "loop", "README: Sleepy: drowsy eyes half-closed")
  face("asleep", "Asleep", "eye_asleep", "loop", "README: Asleep: horizontal lines")
  face("scared", "Scared", "eye_scared", "loop", "README: Scared: sweat drops and rapid flickering")
  face("curious", "Curious", "eye_curious", "loop", "README: Curiosity: eyes change size when looking sideways")
  face("left", "Tilt left", "eye_left", "once", "README: Tilted left: eyes look left", [{ang: {tilt: -14}, wait: 1800, face: "eye_left", mode: "once"}, {ang: {tilt: 0}, wait: 700, face: "eye_default", mode: "boomerang"}])
  face("right", "Tilt right", "eye_right", "once", "README: Tilted right: eyes look right", [{ang: {tilt: 14}, wait: 1800, face: "eye_right", mode: "once"}, {ang: {tilt: 0}, wait: 700, face: "eye_default", mode: "boomerang"}])
  face("touch", "Touch", "eye_default", "boomerang", "README: touch -> happy or angry (happy shown)", [
    {ang: {finger: 0}, wait: 300},
    {ang: {finger: 4.2}, wait: 600},
    {ang: {finger: 4.2}, wait: 1800, face: "eye_happy", mode: "loop"},
    {ang: {finger: 0}, wait: 900, face: "eye_default", mode: "boomerang"},
  ])
  face("shake", "Shake", "eye_scared", "loop", "README: shaking -> scared", [
    {ang: {tilt: 12}, wait: 160}, {ang: {tilt: -12}, wait: 160}, {ang: {tilt: 12}, wait: 160}, {ang: {tilt: -12}, wait: 160}, {ang: {tilt: 12}, wait: 160},
    {ang: {tilt: -12}, wait: 160}, {ang: {tilt: 0}, wait: 900, face: "eye_default", mode: "boomerang"},
  ])
  face("lift", "Lift", "eye_scared", "loop", "README: lifted / dropped -> scared", [
    {ang: {hop: 3.2}, wait: 900}, {ang: {hop: 3.2}, wait: 600}, {ang: {hop: 0}, wait: 900, face: "eye_default", mode: "boomerang"},
  ])
  face("sleep", "Sleep", "eye_default", "boomerang", "README: sleepy after 5 s, asleep after 10 s (shortened here)", [
    {ang: {tilt: 0}, wait: 900}, {ang: {tilt: 0}, wait: 1900, face: "eye_sleepy", mode: "loop"}, {ang: {tilt: 0}, wait: 2400, face: "eye_asleep", mode: "loop"},
  ])

  const pack: PackShape = {
    identity: {
      id: "esp32-pet", app: "3D Wiz", tagline: "Visualize it. Build it. Test it.", name: "ESP32 Desktop Pet", subtitle: "ESP32-C3, OLED eyes, touch + motion + sound",
      source: "ESP32-Pet-Robot (MIT)", credit: "SukunDev (README read offline)", license: "MIT", preparedOffline: true, version: "README as of 2025-26",
      url: URL, short: "Desk Pet", icon: "smart_toy", hasOled: true, sourceNote: "No enclosure in the source; shell is illustrative.",
    },
    mcu: {board: "ESP32-C3-DevKitM-1", oled: {type: "SSD1306 128x64", sda: 8, scl: 9}, touch: 7, mic: 4, imu: "MPU6050 on the shared I2C bus"},
    notSpecified: [
      "No enclosure or STL in the source: shell, lid, module sizes and positions are illustrative or standard sizes",
      "Microphone module type and how its VCC is wired",
      "Which header position each GPIO occupies on the board (GPIO numbers are from the README)",
      "Eye bitmaps (the README describes the moods; the frames here are drawn to match, not copied)",
    ],
    placement: {
      desk: [0, -12, -63], deskSize: [30, 16], modeBar: [0, -27.8, -55], taskPanel: [0, -20, -55], testPanel: [0, -17.5, -55], validatorPanel: [0, -11, -55],
      infoCard: [0, 3.1, -55], menu: [0, -11, -55], bench: [0, -7.5, -63], benchScale: 1.8, benchTiltDeg: 55, locator: [11.5, 2.4, -62], locatorScale: 0.7,
      enlarge: 1.25, enlargeExploded: 1.0, explodeSpeed: 6, dragDegPerCm: 14, modelScale: 2.1,
    },
    game: {snapCm: 1.6, tray: [0, 2.2, 3.8] as V3, confetti: DEFAULT_GAME.confetti},
    components: components,
    connections: conns,
    steps: steps,
    lab: {
      simLabel: "SIMULATED - no hardware", walkCycles: 1, motorDegPerS: 60, commands: commands, restFace: "eye_default", idleFace: "eye_default", doneFace: "eye_happy",
      pages: [["touch", "shake", "lift", "sleep", "left", "right"], ["happy", "angry", "sleepy", "asleep", "scared", "curious", "default"]],
      icons: {
        touch: "touch_app", shake: "sync_alt", lift: "arrow_upward", sleep: "history", left: "turn_left", right: "turn_right", happy: "sentiment_satisfied",
        angry: "mood_bad", sleepy: "bedtime", asleep: "hotel", scared: "sentiment_very_dissatisfied", curious: "visibility", default: "mood",
      },
    },
    // Verified-pin pack (no simulator): every wire is checked against the README's pin list (green / red). Supply and ground are connected for
    // the user, so the six signal wires are the ones to make.
    circuit: {
      functions: [],
      autoRails: ["v33_oled", "v33_imu", "v33_touch", "gnd_oled", "gnd_imu", "gnd_mic", "gnd_touch"],
      railSrc: {plus: ["esp32c3/3V3"], minus: ["esp32c3/GND"]},
    },
    validation: {expected: [], distractors: [
      {id: "x_sda_swap", label: "SDA to 9", from: {component: "esp32c3", pin: "GPIO9"}, to: {component: "oled", pin: "SDA"}, explanation: "Not in the README: OLED SDA is GPIO8 and SCL is GPIO9 (swapped)."},
      {id: "x_touch_5v", label: "Touch to 5V", from: {component: "esp32c3", pin: "GPIO4"}, to: {component: "ttp223", pin: "OUT"}, explanation: "Not in the README: the touch sensor signal is GPIO7; GPIO4 is the microphone."},
    ], disclaimer: DEFAULT_VALIDATION_NOTE},
    visualize: {
      scale: 1.9, wallCm: 0.25, leadReachCm: 8,
      defaultCavity: {min: [-3.05, 0.3, -2.95] as V3, max: [3.05, 3.45, 2.95] as V3, basis: "illustrative shell"},
      catalog: [
        {id: "esp32c3", size: [5.4, 0.9, 2.54] as V3, rule: "back, flat"},
        {id: "mpu6050", size: [2.1, 0.5, 1.6] as V3, rule: "flat, left"},
        {id: "ttp223", size: [1.5, 0.4, 1.1] as V3, rule: "flat, right"},
        {id: "mic", size: [1.6, 0.9, 1.2] as V3, rule: "middle"},
        {id: "oled", size: [2.73, 2.73, 0.4] as V3, rule: "front face, high", fixed: true},
      ],
      servoNote: "No moving parts in this project.",
      prefer: {esp32c3: [0.5, 0, 0.1] as V3, mpu6050: [0.1, 0, 0.6] as V3, ttp223: [0.9, 0, 0.6] as V3, mic: [0.5, 0, 0.8] as V3, oled: [0.5, 0.9, 1.0] as V3},
      naive: {esp32c3: [0, 0.75, -0.5] as V3, mpu6050: [-0.6, 0.6, -0.4] as V3, ttp223: [0.5, 0.6, -0.3] as V3, mic: [0, 1.0, -0.2] as V3, oled: [0, 1.5, 0.8] as V3},
      shell: shellBasePrims(),
      test: {power: ["esp32c3", "oled", "mpu6050", "ttp223"], data: ["esp32c3", "oled"], servo: ["mpu6050", "ttp223", "mic"]},
      demo: {parts: ["esp32c3", "oled"], screw: "", tool: "", hole: ""},
    },
    gesture: {} as PackShape["gesture"],
    guide: {schema: "3dwiz-pack/1", guideSource: {url: URL, license: "MIT", note: "README read offline; no enclosure or assembly drawings in the source, so attach points are illustrative."}, parts: [], screwHoles: [], fasteners: [], tools: []},
    workbench: {altServos: [], ...DEFAULT_WORKBENCH},
    rig: {
      mode: "generic",
      acts: [
        {name: "tilt", zero: 0, speed: 70, els: [{part: "*", op: "rot", axis: [0, 0, 1], k: 1}]},
        {name: "hop", zero: 0, speed: 8, els: [{part: "*", op: "move", axis: [0, 1, 0], k: 1}]},
        {name: "finger", zero: 0, speed: 8, els: [{part: "hand_prop", op: "move", axis: [0, -1, 0], k: 1}]},
      ],
    },
    plan: {
      s_shell: {title: "Shell", place: ["shell_base"]},
      s_mcu: {title: "Brain", place: ["esp32c3"]},
      s_imu: {title: "Motion", place: ["mpu6050"]},
      s_touch: {title: "Touch", place: ["ttp223"]},
      s_mic: {title: "Mic", place: ["mic"]},
      s_oled: {title: "Display", place: ["oled"]},
      s_i2c: {title: "I2C wires", place: []},
      s_sig: {title: "Signal wires", place: []},
      s_3v3: {title: "Power wires", place: []},
      s_gnd: {title: "Ground wires", place: []},
      s_lid: {title: "Lid", place: ["shell_top"]},
    },
    quests: [
      {id: "q1", title: "Body", steps: ["s_shell", "s_mcu"]},
      {id: "q2", title: "Senses", steps: ["s_imu", "s_touch", "s_mic", "s_oled"]},
      {id: "q3", title: "Wiring", steps: ["s_i2c", "s_sig", "s_3v3", "s_gnd"]},
      {id: "q4", title: "Life", steps: ["s_lid"]},
    ],
    names: {shell_base: "Shell", shell_top: "Lid", esp32c3: "ESP32-C3", mpu6050: "MPU6050", ttp223: "Touch", mic: "Mic", oled: "OLED", hand_prop: "Finger"},
  }

  fillGuide(
    pack,
    {
      shell_base: {text: "open side up", face: "+Y", dir: [0, 1, 0]},
      esp32c3: {text: "USB toward the right", face: "+X usb", dir: [1, 0, 0]},
      mpu6050: {text: "pins toward the front", face: "+Z", dir: [0, 0, 1]},
      ttp223: {text: "pad facing up", face: "+Y pad", dir: [0, 1, 0]},
      mic: {text: "capsule facing up", face: "+Y", dir: [0, 1, 0]},
      oled: {text: "screen to the front", face: "+Z screen", dir: [0, 0, 1]},
      shell_top: {text: "flat side down", face: "-Y", dir: [0, -1, 0]},
    },
    {esp32c3: "shell_base", mpu6050: "shell_base", ttp223: "shell_base", mic: "shell_base", oled: "shell_base", shell_top: "shell_base", shell_base: "body"},
    {doc: "README.md", url: URL},
  )
  return finishPack(pack)
}
