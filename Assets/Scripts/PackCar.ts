// PackCar.ts - project pack: Arduino obstacle-avoiding robot car (Uno + L298N + HC-SR04 on an SG90 + DC gear motors, 4WD chassis).
// SOURCE (read offline): https://github.com/sanjana-n07/Obstacle-Avoiding-Robot (README.md and Obstracle_Avoiding_Robot.ino), MIT licence,
//   (c) 2026 sanjana-n07. Stated there: IN1 D8, IN2 D7, IN3 D4, IN4 D3, ENA D5 (PWM), ENB D6 (PWM), servo D9, ultrasonic Trig D10 / Echo D11;
//   SAFE_DISTANCE 35 cm; the servo looks front 90 / left 0 / right 180; forward / backward / rotate left / rotate right / stop logic.
// NOT in the source (so NOT encoded as wires): the battery, motor power, L298N 12V / 5V / GND wiring, HC-SR04 and servo power, which
//   motor pair is output A or B. The chassis, wheel and motor shapes and all positions are illustrative; module sizes are standard sizes.
// Must not: contain engine code.

import {PackShape, ComponentDef, ConnectionDef, StepDef, CommandDef, V3, RGBA} from "./ProjectPack"
import {mk, box, wire, step, cmd, fillGuide, finishPack, WIRE, C, DEFAULT_GAME, DEFAULT_WORKBENCH, DEFAULT_VALIDATION_NOTE} from "./PackKit"
import {uno, l298n, hcsr04, sg90, ttMotor, wheel, batteryHolder} from "./PackParts"

const URL = "https://github.com/sanjana-n07/Obstacle-Avoiding-Robot"
const PLATE: RGBA = [0.55, 0.57, 0.62, 1]

export function makeCarPack(): PackShape {
  const u = uno()
  const d = l298n()
  const s = hcsr04()
  const sv = sg90([0.2, 0.45, 0.85, 1])
  const mot = ttMotor()
  const wh = wheel()
  const bat = batteryHolder()

  const wheelDef = (id: string, name: string, x: number, z: number): ComponentDef =>
    mk({
      id: id, name: name, kind: "electronic", group: "wheel", color: [0.1, 0.1, 0.12, 1], assembled: [x, 3.25, z], prims: wh.prims, outward: true,
      exploded: [0, 0, z > 0 ? 3.5 : -3.5], purpose: "Wheel on the gear motor shaft. It spins when the motor runs.", notes: ["Size ~65 mm wheel (standard size, not from the source)."],
    })
  const motorDef = (id: string, name: string, x: number, left: boolean): ComponentDef =>
    mk({
      id: id, name: name, kind: "electronic", group: "motor", color: C.yellow, assembled: [x, 1.9, 0], assembledRot: left ? [0, 180, 0] : [0, 0, 0], prims: mot.prims,
      exploded: [0, -2.2, left ? -2.5 : 2.5], outward: false,
      purpose: "DC gear motor (the README says 'DC Gear Motors', 4WD chassis). Its leads go to the L298N motor outputs (wiring not specified in the source).",
      notes: ["Motor size is a standard TT-motor size (not from the source)."],
    })

  const components: ComponentDef[] = [
    mk({
      id: "chassis", name: "4WD chassis (kit)", kind: "printed", group: "body", color: PLATE, assembled: [0, 0, 0], sizeBasis: "illustrative", exploded: [0, -3, 0],
      prims: [box([0, 2.4, 0], [20, 0.4, 11], PLATE, undefined, undefined, "plate"), box([0, 2.0, 0], [18, 0.3, 4], [0.45, 0.47, 0.52, 1], undefined, undefined, "rib")],
      purpose: "The 4WD robot chassis from the README parts list. Its real shape is not given in the source; this plate is illustrative.", notes: ["Illustrative shape: the source names a 4WD chassis but gives no drawing."],
    }),
    motorDef("motor_fr", "Motor front right", 7.5, false),
    motorDef("motor_fl", "Motor front left", 7.5, true),
    motorDef("motor_rr", "Motor rear right", -7.5, false),
    motorDef("motor_rl", "Motor rear left", -7.5, true),
    wheelDef("wheel_fr", "Wheel front right", 7.5, 7.0),
    wheelDef("wheel_fl", "Wheel front left", 7.5, -7.0),
    wheelDef("wheel_rr", "Wheel rear right", -7.5, 7.0),
    wheelDef("wheel_rl", "Wheel rear left", -7.5, -7.0),
    mk({
      id: "l298n", name: "L298N motor driver", color: C.pcbRed, assembled: [-6.0, 2.6, -2.5], prims: d.prims, pins: d.pins, exploded: [0, 4, -3], outward: true,
      benchPos: [-4.6, 0, 3.0], benchYaw: 0,
      purpose: "Dual H-bridge. IN1 D8, IN2 D7, IN3 D4, IN4 D3 choose the motor directions; ENA D5 and ENB D6 (PWM) set the speed.",
      notes: ["Size ~43 x 43 mm (standard size, not from the source).", "Motor outputs and power terminals are not wired here: the source does not state them."],
    }),
    mk({
      id: "battery", name: "Battery pack", color: [0.18, 0.2, 0.24, 1], assembled: [-6.0, 2.6, 2.8], prims: bat.prims, pins: bat.pins, exploded: [0, 4, 3], outward: true,
      purpose: "Battery pack (the source lists a battery pack but not its type or wiring).", benchPos: [-4.6, 0, 7.2], benchYaw: 0,
      notes: ["Type and size not specified in the source (approximate size)."],
    }),
    mk({
      id: "uno", name: "Arduino Uno", color: [0.0, 0.42, 0.52, 1], assembled: [1.2, 2.6, 0], prims: u.prims, pins: u.pins, exploded: [0, 5, 0], outward: true,
      benchPos: [1.5, 0, 2.0], benchYaw: 0,
      purpose: "The controller. D8 D7 D4 D3 drive IN1-IN4, D5 / D6 are the motor PWM pins, D9 is the servo, D10 is Trig and D11 is Echo.",
      notes: ["Board size 68.6 x 53.4 mm (standard size, not from the source).", "Pin positions along the headers are illustrative; the pin numbers are from the README."],
    }),
    mk({
      id: "servo_head", name: "SG90 servo", model: "servo", color: [0.2, 0.45, 0.85, 1], assembled: [8.4, 2.6, 0], prims: sv.prims, groups: sv.groups, pins: sv.pins, group: "servo",
      exploded: [0, 4, 0], outward: true, benchPos: [6.5, 0, 6.0], benchYaw: 0,
      purpose: "SG90 servo on D9. It turns the ultrasonic sensor: front 90, left 0, right 180 degrees (README / sketch).",
      notes: ["Size ~22 x 12 x 23 mm (standard size, not from the source)."],
    }),
    mk({
      id: "sonar", name: "HC-SR04 ultrasonic", color: C.pcbBlue, assembled: [8.97, 5.27, 0], assembledRot: [0, 90, 0], prims: s.prims, pins: s.pins, exploded: [0, 4, 0], outward: true,
      benchPos: [6.8, 0, -1.2], benchYaw: 0,
      purpose: "Distance sensor on the servo. Trig D10 sends a pulse, Echo D11 returns it. The robot stops when the front distance is 35 cm or less.",
      notes: ["Module ~45 x 20 x 15 mm (standard size, not from the source).", "Its VCC and GND wiring is not specified in the source."],
    }),
    mk({
      id: "obstacle", name: "Obstacle (demo prop)", kind: "electronic", group: "prop", color: [0.95, 0.4, 0.15, 1], assembled: [18, 0, 0], sizeBasis: "illustrative",
      prims: [box([0, 3.0, 0], [3, 6, 8], [0.95, 0.4, 0.15, 1], undefined, undefined, "block")],
      purpose: "A block the simulated car meets in the Play demo.", notes: ["Demo prop only."],
    }),
  ]

  const conns: ConnectionDef[] = [
    wire("ctl_in1", "servo", "uno.D8", "l298n.IN1", "D8 > IN1", "README: IN1 is Arduino D8.", WIRE.yellow, 1.2),
    wire("ctl_in2", "servo", "uno.D7", "l298n.IN2", "D7 > IN2", "README: IN2 is Arduino D7.", WIRE.orange, 1.5),
    wire("ctl_in3", "servo", "uno.D4", "l298n.IN3", "D4 > IN3", "README: IN3 is Arduino D4.", WIRE.green, 1.8),
    wire("ctl_in4", "servo", "uno.D3", "l298n.IN4", "D3 > IN4", "README: IN4 is Arduino D3.", WIRE.blue, 2.1),
    wire("pwm_ena", "power", "uno.D5", "l298n.ENA", "D5 > ENA", "README: ENA is Arduino D5 (PWM).", WIRE.purple, 2.4),
    wire("pwm_enb", "power", "uno.D6", "l298n.ENB", "D6 > ENB", "README: ENB is Arduino D6 (PWM).", WIRE.white, 2.7),
    wire("srv_sig", "i2c", "uno.D9", "servo_head.SIG", "D9 > servo", "README: the servo signal is Arduino D9.", WIRE.orange, 3.0),
    wire("son_trig", "i2c", "uno.D10", "sonar.TRIG", "D10 > Trig", "README: Ultrasonic Trig is Arduino D10.", WIRE.green, 3.3),
    wire("son_echo", "i2c", "uno.D11", "sonar.ECHO", "D11 > Echo", "README: Ultrasonic Echo is Arduino D11.", WIRE.blue, 3.6),
  ]

  const SRC = "README pin table + sketch"
  const steps: StepDef[] = [
    step("s_chassis", "Chassis", "Start with the 4WD chassis plate.", ["chassis"], [], "illustrative", "README: 4WD Robot Chassis"),
    step("s_motors", "Motors", "Fit the four DC gear motors under the chassis.", ["motor_fr", "motor_fl", "motor_rr", "motor_rl"], [], "illustrative", "README: DC Gear Motors"),
    step("s_wheels", "Wheels", "Press a wheel on each motor shaft.", ["wheel_fr", "wheel_fl", "wheel_rr", "wheel_rl"], [], "illustrative", "README: 4WD kit"),
    step("s_driver", "Driver", "Mount the L298N motor driver at the back.", ["l298n"], [], "illustrative", "README: L298N Motor Driver"),
    step("s_uno", "Brain", "Place the Arduino Uno on the middle of the chassis.", ["uno"], [], "illustrative", "README: Arduino UNO"),
    step("s_battery", "Battery", "Place the battery pack.", ["battery"], [], "illustrative", "README: Battery Pack"),
    step("s_head", "Sensor head", "Fit the SG90 servo at the front and the HC-SR04 on top of its horn.", ["servo_head", "sonar"], [], "illustrative", "README: SG90 + HC-SR04"),
    step("s_ctl", "Motor wires", "Join D8 D7 D4 D3 to IN1 IN2 IN3 IN4.", ["uno", "l298n"], ["ctl_in1", "ctl_in2", "ctl_in3", "ctl_in4"], "repo", SRC),
    step("s_pwm", "Speed wires", "Join D5 to ENA and D6 to ENB (PWM speed).", ["uno", "l298n"], ["pwm_ena", "pwm_enb"], "repo", SRC),
    step("s_eyes", "Sensor wires", "Join D9 to the servo signal, D10 to Trig and D11 to Echo.", ["uno", "servo_head", "sonar"], ["srv_sig", "son_trig", "son_echo"], "repo", SRC),
  ]

  const commands: CommandDef[] = []
  const rest = {wheelL: 0, wheelR: 0, head: 90, turn: 0, obstacle: 0}
  commands.push(cmd("rest", "Rest", "stop", "once", [{ang: {...rest}, wait: 300}], "starting pose"))
  commands.push(cmd("drive", "Drive", "go", "once", [
    {jump: {wheelL: 0, wheelR: 0}, ang: {wheelL: 720, wheelR: 720}, wait: 2100, face: "go"},
    {wait: 200, face: "stop"},
  ], "sketch: forward() while the front distance is above 35 cm"))
  commands.push(cmd("scan", "Scan", "scan", "once", [
    {ang: {head: 0}, wait: 800, face: "left"},
    {ang: {head: 180}, wait: 1300, face: "right"},
    {ang: {head: 90}, wait: 800, face: "front"},
  ], "sketch: lookLeft() 0 deg, lookRight() 180 deg, back to 90"))
  commands.push(cmd("avoid", "Avoid", "go", "once", [
    {jump: {wheelL: 0, wheelR: 0, obstacle: 0, turn: 0}, ang: {head: 90, wheelL: 1080, wheelR: 1080, obstacle: 4.8}, wait: 3100, face: "go"},
    {wait: 600, face: "stop"},
    {ang: {head: 0}, wait: 800, face: "left"},
    {ang: {head: 180}, wait: 1300, face: "right"},
    {ang: {head: 90}, wait: 500, face: "front"},
    {ang: {turn: 70, wheelL: 720, wheelR: 1440}, wait: 900, face: "turn"},
    {ang: {obstacle: 0, wheelL: 1800, wheelR: 2520}, wait: 3100, face: "go"},
    {wait: 300, face: "stop"},
  ], "sketch: stop, scan left then right, rotate toward the side with more room, then forward"))
  commands.push(cmd("back", "Reverse", "back", "once", [
    {jump: {wheelL: 0, wheelR: 0, turn: 0}, ang: {wheelL: -360, wheelR: -360}, wait: 1100, face: "back"},
    {ang: {turn: -70, wheelL: 0, wheelR: -720}, wait: 900, face: "turn"},
    {ang: {turn: -70, wheelL: 360, wheelR: -360}, wait: 700, face: "go"},
    {wait: 300, face: "stop"},
  ], "sketch: trapped -> backward(), then rotateRight(), then forward()"))
  commands.push(cmd("left", "Turn left", "turn", "once", [
    {jump: {wheelL: 0, wheelR: 0}, ang: {turn: 60, wheelL: -360, wheelR: 360}, wait: 900, face: "left"},
    {ang: {turn: 0, wheelL: 0, wheelR: 0}, wait: 900, face: "stop"},
  ], "sketch: rotateLeft() (left side backward, right side forward)"))
  commands.push(cmd("right", "Turn right", "turn", "once", [
    {jump: {wheelL: 0, wheelR: 0}, ang: {turn: -60, wheelL: 360, wheelR: -360}, wait: 900, face: "right"},
    {ang: {turn: 0, wheelL: 0, wheelR: 0}, wait: 900, face: "stop"},
  ], "sketch: rotateRight() (left side forward, right side backward)"))

  const pack: PackShape = {
    identity: {
      id: "obstacle-car", app: "3D Wiz", tagline: "Visualize it. Build it. Test it.", name: "Obstacle Car", subtitle: "Arduino Uno, L298N, HC-SR04, 4WD",
      source: "Obstacle-Avoiding-Robot (MIT)", credit: "sanjana-n07 (README + sketch read offline)", license: "MIT", preparedOffline: true, version: "README + .ino as of 2026",
      url: URL, short: "Obstacle Car", icon: "directions_car", hasOled: false, sourceNote: "Power and motor wiring is not in the source.",
    },
    mcu: {board: "Arduino UNO", driver: "L298N", sensor: "HC-SR04", servo: "SG90", safeDistanceCm: 35, pins: {IN1: 8, IN2: 7, IN3: 4, IN4: 3, ENA: 5, ENB: 6, servo: 9, trig: 10, echo: 11}},
    notSpecified: [
      "Battery type and all power wiring (L298N 12V / 5V / GND, sensor and servo power)",
      "Which motor pair is L298N output A or B, and the motor lead wiring",
      "Chassis, wheel and motor shapes and every position (illustrative); module sizes are standard sizes",
      "Screws and mounting holes (none are stated; the optional Visualize screws are a standard M3 exercise)",
    ],
    placement: {
      desk: [0, -12, -60], deskSize: [30, 16], modeBar: [0, -27.8, -55], taskPanel: [0, -20, -55], testPanel: [0, -17.5, -55], validatorPanel: [0, -11, -55],
      infoCard: [0, 3.1, -55], menu: [0, -11, -55], bench: [0, -7.5, -63], benchScale: 1.7, benchTiltDeg: 55, locator: [11.5, 2.4, -62], locatorScale: 0.4,
      enlarge: 1.2, enlargeExploded: 1.0, explodeSpeed: 6, dragDegPerCm: 14, modelScale: 0.85, viewYaw: 35,
    },
    game: {snapCm: 2.4, tray: [0, 5.0, 6.2] as V3, confetti: DEFAULT_GAME.confetti},
    components: components,
    connections: conns,
    steps: steps,
    lab: {
      simLabel: "SIMULATED - no hardware", walkCycles: 1, motorDegPerS: 360, commands: commands,
      pages: [["avoid", "drive", "scan", "back", "left", "right"]],
      icons: {avoid: "autorenew", drive: "arrow_upward", scan: "radar", back: "arrow_downward", left: "turn_left", right: "turn_right"},
    },
    validation: {expected: [], distractors: [
      {id: "x_in_swap", label: "D8 to IN2", from: {component: "uno", pin: "D8"}, to: {component: "l298n", pin: "IN2"}, explanation: "Not in the README: IN1 is D8 and IN2 is D7."},
      {id: "x_echo", label: "D10 to Echo", from: {component: "uno", pin: "D10"}, to: {component: "sonar", pin: "ECHO"}, explanation: "Not in the README: Trig is D10 and Echo is D11."},
    ], disclaimer: DEFAULT_VALIDATION_NOTE},
    visualize: {
      scale: 1.1, wallCm: 0.25, leadReachCm: 20,
      defaultCavity: {min: [-9.5, 2.6, -5.0] as V3, max: [9.5, 6.0, 5.0] as V3, basis: "illustrative deck"},
      catalog: [
        {id: "uno", size: [6.86, 1.5, 5.34] as V3, rule: "middle of the deck"},
        {id: "l298n", size: [4.3, 2.7, 4.3] as V3, rule: "at the back"},
        {id: "battery", size: [5.8, 1.6, 3.0] as V3, rule: "at the back"},
        {id: "servo_head", size: [2.28, 2.7, 1.22] as V3, rule: "front edge"},
        {id: "sonar", size: [4.5, 1.5, 2.0] as V3, rule: "on the servo, front"},
      ],
      servoNote: "4 DC gear motors and 4 wheels sit under and beside the deck",
      prefer: {uno: [0.55, 0, 0.5] as V3, l298n: [0.1, 0, 0.1] as V3, battery: [0.1, 0, 0.9] as V3, servo_head: [0.95, 0, 0.5] as V3, sonar: [0.95, 0.8, 0.5] as V3},
      naive: {uno: [0, 3.4, 0.4] as V3, l298n: [0.8, 3.7, -0.2] as V3, battery: [-0.6, 3.4, 0.3] as V3, servo_head: [0.3, 3.5, 0.2] as V3, sonar: [0.2, 3.7, 0.1] as V3},
      shell: [
        box([0, 2.4, 0], [20, 0.4, 11], PLATE, undefined, undefined, "plate"),
      ].concat(wheelShell()),
      test: {power: ["battery", "l298n", "uno"], data: ["uno", "sonar"], servo: ["uno", "servo_head"]},
      demo: {parts: ["l298n", "uno"], screw: "fx_m3x8_m", tool: "tool_ph1", hole: "h_uno_a"},
    },
    gesture: {} as PackShape["gesture"],
    guide: {
      schema: "3dwiz-pack/1",
      guideSource: {url: URL, license: "MIT", note: "README and sketch read offline; the source has no assembly drawings or screws, so attach points are illustrative."},
      parts: [],
      screwHoles: [
        {id: "h_uno_a", hostId: "chassis", at: [-1.5, 2.6, -2.2], dir: [0, -1, 0], type: "M3 machine", diameterMm: 3.0, depthMm: 8, basis: "standard"},
        {id: "h_uno_b", hostId: "chassis", at: [3.8, 2.6, 2.2], dir: [0, -1, 0], type: "M3 machine", diameterMm: 3.0, depthMm: 8, basis: "standard"},
      ],
      fasteners: [{id: "m3x8_m", label: "M3x8", kind: "machine", diameterMm: 3.0, lengthMm: 8, head: "phillips", driver: "ph1", color: [0.9, 0.5, 0.3, 1]}],
      tools: [{id: "ph1", label: "PH1", head: "phillips", size: "PH1"}],
    },
    workbench: {altServos: [{id: "alt_mg996r", label: "MG996R", size: [1.97, 4.29, 4.07] as V3, color: [0.35, 0.35, 0.45, 1] as RGBA}], ...DEFAULT_WORKBENCH},
    rig: {
      mode: "generic",
      acts: [
        {name: "wheelL", zero: 0, speed: 360, els: [{part: "wheel_fl", op: "rot", axis: [0, 0, 1], k: -1}, {part: "wheel_rl", op: "rot", axis: [0, 0, 1], k: -1}]},
        {name: "wheelR", zero: 0, speed: 360, els: [{part: "wheel_fr", op: "rot", axis: [0, 0, 1], k: -1}, {part: "wheel_rr", op: "rot", axis: [0, 0, 1], k: -1}]},
        {name: "head", zero: 90, speed: 200, els: [{part: "sonar", op: "rot", axis: [0, 1, 0], k: -1}, {part: "servo_head", grp: "horn", op: "rot", axis: [0, 1, 0], k: -1}]},
        {name: "turn", zero: 0, speed: 100, els: [{part: "*", op: "rot", axis: [0, 1, 0], k: 1}]},
        {name: "obstacle", zero: 0, speed: 1.6, els: [{part: "obstacle", op: "move", axis: [-1, 0, 0], k: 1}]},
      ],
    },
    plan: {
      s_chassis: {title: "Chassis", place: ["chassis"]},
      s_motors: {title: "Motors", place: ["motor_fr", "motor_fl", "motor_rr", "motor_rl"]},
      s_wheels: {title: "Wheels", place: ["wheel_fr", "wheel_fl", "wheel_rr", "wheel_rl"]},
      s_driver: {title: "Driver", place: ["l298n"]},
      s_uno: {title: "Brain", place: ["uno"]},
      s_battery: {title: "Battery", place: ["battery"]},
      s_head: {title: "Sensor head", place: ["servo_head", "sonar"]},
      s_ctl: {title: "Motor wires", place: []},
      s_pwm: {title: "Speed wires", place: []},
      s_eyes: {title: "Sensor wires", place: []},
    },
    quests: [
      {id: "q1", title: "Chassis", steps: ["s_chassis", "s_motors", "s_wheels"]},
      {id: "q2", title: "Brains", steps: ["s_driver", "s_uno", "s_battery"]},
      {id: "q3", title: "Eyes", steps: ["s_head"]},
      {id: "q4", title: "Wiring", steps: ["s_ctl", "s_pwm", "s_eyes"]},
    ],
    names: {
      chassis: "Chassis", l298n: "L298N", battery: "Battery", uno: "Arduino Uno", servo_head: "Servo", sonar: "HC-SR04", obstacle: "Obstacle",
      motor_fr: "Motor FR", motor_fl: "Motor FL", motor_rr: "Motor RR", motor_rl: "Motor RL", wheel_fr: "Wheel FR", wheel_fl: "Wheel FL", wheel_rr: "Wheel RR", wheel_rl: "Wheel RL",
    },
  }

  const orient: {[id: string]: {text: string; face: string; dir: V3}} = {
    chassis: {text: "front toward +X", face: "+X", dir: [1, 0, 0]},
    l298n: {text: "pin header to the back", face: "-Z", dir: [0, 0, -1]},
    battery: {text: "leads to the back", face: "-X", dir: [-1, 0, 0]},
    uno: {text: "USB to the back", face: "-X usb", dir: [-1, 0, 0]},
    servo_head: {text: "horn facing up", face: "+Y", dir: [0, 1, 0]},
    sonar: {text: "eyes facing forward", face: "+X", dir: [1, 0, 0]},
  }
  const host: {[id: string]: string} = {chassis: "body", sonar: "servo_head"}
  const screws: {[id: string]: string[]} = {uno: ["h_uno_a", "h_uno_b"]}
  const parts = ["motor_fr", "motor_fl", "motor_rr", "motor_rl"]
  for (let i = 0; i < parts.length; i++) {
    orient[parts[i]] = {text: "shaft outward", face: "outward", dir: [0, 0, parts[i].charAt(7) === "l" ? -1 : 1]}
    host[parts[i]] = "chassis"
  }
  const wh2 = ["wheel_fr", "wheel_fl", "wheel_rr", "wheel_rl"]
  for (let i = 0; i < wh2.length; i++) {
    orient[wh2[i]] = {text: "hub on the shaft", face: "inward", dir: [0, 0, wh2[i].charAt(7) === "l" ? 1 : -1]}
    host[wh2[i]] = "motor_" + wh2[i].substr(6)
  }
  for (const id of ["l298n", "battery", "uno", "servo_head"]) host[id] = "chassis"
  fillGuide(pack, orient, host, {doc: "README.md + sketch", url: URL}, screws, {uno: ["ph1"]})
  return finishPack(pack)
}

function wheelShell() {
  const out = []
  const xs = [7.5, -7.5]
  const zs = [7.0, -7.0]
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) out.push({s: "cyl" as const, p: [xs[i], 3.25, zs[j]] as V3, z: [6.5, 2.4, 6.5] as V3, c: [0.1, 0.1, 0.12, 1] as RGBA, r: [90, 0, 0] as V3, n: "wheel" + i + j})
  }
  return out
}
