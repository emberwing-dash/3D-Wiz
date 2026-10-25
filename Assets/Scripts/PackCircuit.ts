// PackCircuit.ts - project pack: Arduino button + LED starter on a breadboard (circuit only, no robot).
// SOURCE (read offline): Arduino docs, "How to Wire and Program a Button" (built-in examples / Digital / Button) and "Blink" (external LED
//   circuit), https://github.com/arduino/docs-content (content/built-in-examples/02.digital/Button/Button.md and
//   content/built-in-examples/01.basics/Blink/Blink.md), licence Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0).
// Stated there: button between the 5 V rail and digital pin 2, with the SAME leg pulled to ground through a 10K resistor (pull-down);
//   external LED on the pin of LED_BUILTIN (D13 on an UNO): pin -> 220 ohm resistor -> LED anode (long leg), cathode (short leg) -> GND;
//   red wire to the 5 V rail, black wire to the ground rail. The Button sketch lights the LED while the button is pressed.
// Combination note: the Button page uses the built-in LED; the external LED from the Blink page is wired to the same pin 13.
// NOT in the source: component and board dimensions (standard sizes), where on the breadboard each part sits (illustrative).
// Must not: contain engine code.

import {PackShape, ComponentDef, ConnectionDef, StepDef, CommandDef, V3, RGBA} from "./ProjectPack"
import {mk, box, wire, step, cmd, fillGuide, finishPack, WIRE, DEFAULT_GAME, DEFAULT_WORKBENCH, DEFAULT_VALIDATION_NOTE} from "./PackKit"
import {uno, breadboard, led5, resistor, pushButton} from "./PackParts"

const URL = "https://github.com/arduino/docs-content/blob/main/content/built-in-examples/02.digital/Button/Button.md"
const URL2 = "https://github.com/arduino/docs-content/blob/main/content/built-in-examples/01.basics/Blink/Blink.md"

const BB_Z = 2.9 // breadboard centre z in the desk frame
const BENCH_BB: V3 = [0, 0, 2.0]

function onBoard(x: number, z: number): {assembled: V3; benchPos: V3} {
  return {assembled: [x, 0.85, z], benchPos: [x, 0.85, BENCH_BB[2] + (z - BB_Z)]}
}

export function makeCircuitPack(): PackShape {
  const u = uno()
  const bb = breadboard()
  const led = led5([1.0, 0.18, 0.15, 1])
  const r10 = resistor([[0.45, 0.25, 0.1, 1], [0.05, 0.05, 0.05, 1], [1.0, 0.5, 0.1, 1], [0.85, 0.7, 0.3, 1]]) // brown black orange gold = 10k
  const r220 = resistor([[0.9, 0.1, 0.1, 1], [0.9, 0.1, 0.1, 1], [0.45, 0.25, 0.1, 1], [0.85, 0.7, 0.3, 1]]) // red red brown gold = 220
  const btn = pushButton()
  const pb = onBoard(-1.8, 3.1)
  const p10 = onBoard(-0.5, 2.3)
  const p22 = onBoard(1.3, 2.3)
  const pl = onBoard(2.9, 3.2)

  const components: ComponentDef[] = [
    mk({
      id: "breadboard", name: "Breadboard (half size)", color: [0.9, 0.9, 0.86, 1], assembled: [0, 0, BB_Z], prims: bb.prims, pins: bb.pins, exploded: [0, -2, 0], outward: true,
      benchPos: BENCH_BB, benchYaw: 0,
      purpose: "Solderless breadboard. The red rail carries 5 V and the blue rail carries ground (the tutorial: red wire to the 5 V row, black wire to the ground row).",
      notes: ["Half-size board ~83 x 55 mm (standard size, not from the source)."],
    }),
    mk({
      id: "uno", name: "Arduino Uno", color: [0.0, 0.42, 0.52, 1], assembled: [0, 0, -3.6], prims: u.prims, pins: u.pins, exploded: [0, 3, -2], outward: true,
      benchPos: [0, 0, -4.2], benchYaw: 0,
      purpose: "The board. Digital pin 2 reads the button; digital pin 13 (LED_BUILTIN on an UNO) drives the LED through a resistor.",
      notes: ["Board 68.6 x 53.4 mm (standard size, not from the source).", "Pin positions along the headers are illustrative."],
    }),
    mk({
      id: "button", name: "Pushbutton", color: [0.15, 0.15, 0.18, 1], assembled: pb.assembled, prims: btn.prims, groups: btn.groups, pins: btn.pins, exploded: [0, 3, 0], outward: true,
      benchPos: pb.benchPos, benchYaw: 0,
      purpose: "Momentary pushbutton. One leg goes to digital pin 2 (and through the 10K resistor to ground), the other leg to 5 V.",
      notes: ["6 mm tact switch (standard size, not from the source)."],
    }),
    mk({
      id: "r10k", name: "10K resistor", color: [0.85, 0.72, 0.5, 1], assembled: p10.assembled, prims: r10.prims, pins: r10.pins, exploded: [0, 3, 0], outward: true,
      benchPos: p10.benchPos, benchYaw: 0,
      purpose: "Pull-down resistor: keeps pin 2 at ground (LOW) until the button connects it to 5 V.",
      notes: ["10K ohm per the tutorial; colour code brown-black-orange."],
    }),
    mk({
      id: "r220", name: "220 ohm resistor", color: [0.85, 0.72, 0.5, 1], assembled: p22.assembled, prims: r220.prims, pins: r220.pins, exploded: [0, 3.5, 0], outward: true,
      benchPos: p22.benchPos, benchYaw: 0,
      purpose: "Current-limiting resistor in series with the LED (Blink tutorial: 220 ohm).",
      notes: ["220 ohm per the tutorial; colour code red-red-brown."],
    }),
    mk({
      id: "led", name: "LED (red)", color: [1.0, 0.18, 0.15, 1], assembled: pl.assembled, prims: led.prims, pins: led.pins, exploded: [0, 4, 0], outward: true,
      benchPos: pl.benchPos, benchYaw: 0,
      purpose: "External LED. The long leg (anode) goes to the resistor, the short leg (cathode) to ground.",
      notes: ["5 mm LED (standard size, not from the source)."],
    }),
  ]

  const conns: ConnectionDef[] = [
    wire("w_5v", "power", "uno.5V", "breadboard.RAIL_P", "5V > rail", "Button tutorial: a red wire from the 5 volt supply to the long vertical row.", WIRE.red, 1.4),
    wire("w_gnd", "power", "uno.GND", "breadboard.RAIL_N", "GND > rail", "Button tutorial: a black wire from ground to the other long vertical row.", WIRE.black, 1.0),
    wire("w_d2", "servo", "uno.D2", "button.A", "D2 > button", "Button tutorial: the third wire goes from digital pin 2 to one leg of the pushbutton.", WIRE.yellow, 1.8),
    wire("w_btn_r", "servo", "button.A", "r10k.P1", "Leg > 10K", "Button tutorial: that same leg of the button connects through the 10K pull-down resistor...", WIRE.white, 0.9),
    wire("w_pd", "power", "r10k.P2", "breadboard.RAIL_N", "10K > GND", "...to ground.", WIRE.black, 0.7),
    wire("w_btn5", "power", "button.B", "breadboard.RAIL_P", "Leg > 5V", "Button tutorial: the other leg of the button connects to the 5 volt supply.", WIRE.red, 0.8),
    wire("w_d13", "i2c", "uno.D13", "r220.P1", "D13 > 220", "Blink tutorial: connect one end of the resistor to the pin of LED_BUILTIN (D13 on an UNO).", WIRE.green, 2.2),
    wire("w_r_led", "i2c", "r220.P2", "led.A", "220 > LED", "Blink tutorial: the long leg (anode) of the LED goes to the other end of the resistor.", WIRE.orange, 0.8),
    wire("w_led_gnd", "power", "led.K", "breadboard.RAIL_N", "LED > GND", "Blink tutorial: the short leg (cathode) goes to GND.", WIRE.black, 0.9),
  ]

  const SRC = "Button + Blink tutorials"
  const steps: StepDef[] = [
    step("s_board", "Breadboard", "Start with the breadboard.", ["breadboard"], [], "illustrative", "Button: hardware list (breadboard)"),
    step("s_uno", "Arduino", "Place the Arduino Uno next to it.", ["uno"], [], "illustrative", "Button: hardware list (Arduino board)"),
    step("s_btn", "Button", "Press the pushbutton into the board.", ["button"], [], "illustrative", "Button: hardware list (momentary button)"),
    step("s_r10k", "10K resistor", "Add the 10K pull-down resistor.", ["r10k"], [], "illustrative", "Button: hardware list (10K ohm resistor)"),
    step("s_led", "LED", "Add the LED. Long leg (anode) toward the resistor.", ["led"], [], "illustrative", "Blink: optional LED"),
    step("s_r220", "220 ohm", "Add the 220 ohm resistor in front of the LED.", ["r220"], [], "illustrative", "Blink: optional 220 ohm resistor"),
    step("s_power", "Power rails", "Red wire from 5V to the red rail, black wire from GND to the blue rail.", ["uno", "breadboard"], ["w_5v", "w_gnd"], "repo", SRC),
    step("s_btnw", "Button wires", "Pin 2 to the button; the same leg through 10K to ground; the other leg to 5V.", ["uno", "button", "r10k", "breadboard"], ["w_d2", "w_btn_r", "w_pd", "w_btn5"], "repo", SRC),
    step("s_ledw", "LED wires", "Pin 13 to the 220 ohm resistor, resistor to the anode, cathode to ground.", ["uno", "r220", "led", "breadboard"], ["w_d13", "w_r_led", "w_led_gnd"], "repo", SRC),
  ]

  const commands: CommandDef[] = []
  commands.push(cmd("rest", "Rest", "off", "once", [{ang: {press: 0, led: 0}, wait: 300}], "button released, LED off"))
  commands.push(cmd("press", "Press", "on", "once", [
    {ang: {press: 0.2, led: 1}, wait: 1500, face: "on"},
    {ang: {press: 0, led: 0}, wait: 600, face: "off"},
  ], "Button sketch: LED on while the button is pressed (pin 2 reads HIGH)"))
  commands.push(cmd("hold", "Hold", "on", "once", [
    {ang: {press: 0.2, led: 1}, wait: 3200, face: "on"},
    {ang: {press: 0, led: 0}, wait: 600, face: "off"},
  ], "LED stays on as long as the button is held"))
  commands.push(cmd("tap", "Tap", "on", "once", [
    {ang: {press: 0.2, led: 1}, wait: 350, face: "on"},
    {ang: {press: 0, led: 0}, wait: 700, face: "off"},
  ], "a short press gives a short flash"))
  commands.push(cmd("blink", "Blink", "on", "once", [
    {ang: {led: 1}, wait: 1000, face: "on"}, {ang: {led: 0}, wait: 1000, face: "off"},
    {ang: {led: 1}, wait: 1000, face: "on"}, {ang: {led: 0}, wait: 1000, face: "off"},
    {ang: {led: 1}, wait: 1000, face: "on"}, {ang: {led: 0}, wait: 600, face: "off"},
  ], "Blink tutorial: on one second, off one second (external LED on the LED_BUILTIN pin)"))

  const pack: PackShape = {
    identity: {
      id: "button-led", app: "3D Wiz", tagline: "Visualize it. Build it. Test it.", name: "Button + LED", subtitle: "Arduino Uno starter on a breadboard",
      source: "Arduino docs: Button + Blink (CC BY-SA 4.0)", credit: "Arduino (docs-content, read offline)", license: "CC BY-SA 4.0", preparedOffline: true, version: "docs-content main",
      url: URL, short: "Button LED", icon: "lightbulb", hasOled: false, sourceNote: "Two official tutorials combined: the Button wiring with the Blink external-LED circuit on pin 13.",
    },
    mcu: {board: "Arduino UNO", button: "D2 with 10K pull-down to GND, other leg to 5V", led: "D13 -> 220 ohm -> LED -> GND"},
    notSpecified: [
      "Dimensions of every part and the breadboard (standard sizes) and where each part sits on the board (illustrative)",
      "The tutorials show the built-in LED for the Button sketch; the external LED here is the Blink page's optional circuit on the same pin",
      "Jumper wire lengths and the exact breadboard rows",
    ],
    placement: {
      desk: [0, -12, -64], deskSize: [30, 16], modeBar: [0, -27.8, -55], taskPanel: [0, -20, -55], testPanel: [0, -17.5, -55], validatorPanel: [0, -11, -55],
      infoCard: [0, 3.1, -55], menu: [0, -11, -55], bench: [0, -7.5, -63], benchScale: 1.8, benchTiltDeg: 55, locator: [11.5, 2.4, -62], locatorScale: 0.5,
      enlarge: 1.2, enlargeExploded: 1.0, explodeSpeed: 6, dragDegPerCm: 14, modelScale: 1.7, viewYaw: -12,
    },
    game: {snapCm: 1.5, tray: [0, 3.0, 5.6] as V3, confetti: DEFAULT_GAME.confetti},
    components: components,
    connections: conns,
    steps: steps,
    lab: {
      simLabel: "SIMULATED - no hardware", walkCycles: 1, motorDegPerS: 100, commands: commands,
      pages: [["press", "hold", "tap", "blink"]],
      icons: {press: "radio_button_checked", hold: "touch_app", tap: "flash_on", blink: "lightbulb"},
    },
    validation: {expected: [], distractors: [
      {id: "x_no_pulldown", label: "Leg to 5V", from: {component: "r10k", pin: "P2"}, to: {component: "breadboard", pin: "RAIL_P"}, explanation: "Not in the tutorial: the 10K pull-down goes to ground, not 5 V."},
      {id: "x_led_rev", label: "LED reversed", from: {component: "r220", pin: "P2"}, to: {component: "led", pin: "K"}, explanation: "Not in the tutorial: the resistor goes to the anode (long leg); the cathode goes to ground."},
    ], disclaimer: DEFAULT_VALIDATION_NOTE},
    visualize: {
      scale: 2.0, wallCm: 0.1, leadReachCm: 6,
      defaultCavity: {min: [-3.9, 0.85, -2.4] as V3, max: [3.9, 2.3, 2.4] as V3, basis: "breadboard top area"},
      catalog: [
        {id: "button", size: [0.6, 0.55, 0.6] as V3, rule: "middle of the board"},
        {id: "r10k", size: [1.0, 0.3, 0.3] as V3, rule: "next to the button"},
        {id: "r220", size: [1.0, 0.3, 0.3] as V3, rule: "near the LED"},
        {id: "led", size: [0.5, 0.95, 0.5] as V3, rule: "on the right"},
      ],
      servoNote: "No moving parts; the button cap moves a little",
      prefer: {button: [0.3, 0, 0.5] as V3, r10k: [0.4, 0, 0.2] as V3, r220: [0.7, 0, 0.2] as V3, led: [0.85, 0, 0.6] as V3},
      naive: {button: [0, 1.0, 0] as V3, r10k: [0.2, 1.0, 0.1] as V3, r220: [0.4, 1.0, 0] as V3, led: [0.3, 1.2, 0.1] as V3},
      shell: [box([0, 0.4, 0], [8.26, 0.8, 5.46], [0.9, 0.9, 0.86, 1], undefined, undefined, "board"), box([0, 0.82, 0], [7.6, 0.04, 0.45], [0.35, 0.35, 0.38, 1], undefined, undefined, "channel")],
      test: {power: ["button", "r10k"], data: ["button", "r10k"], servo: ["r220", "led"]},
      demo: {parts: ["button", "led"], screw: "", tool: "", hole: ""},
    },
    gesture: {} as PackShape["gesture"],
    guide: {schema: "3dwiz-pack/1", guideSource: {url: URL, license: "CC BY-SA 4.0", note: "Button.md and Blink.md read offline (" + URL2 + "). No screws or mounting in the source."}, parts: [], screwHoles: [], fasteners: [], tools: []},
    workbench: {altServos: [], ...DEFAULT_WORKBENCH},
    rig: {
      mode: "generic",
      acts: [
        {name: "press", zero: 0, speed: 1.5, els: [{part: "button", grp: "cap", op: "move", axis: [0, -1, 0], k: 1}]},
        {name: "led", zero: 0, speed: 6, els: [{part: "led", op: "glow", axis: [1.0, 0.25, 0.2], k: 1}]},
      ],
    },
    plan: {
      s_board: {title: "Breadboard", place: ["breadboard"]},
      s_uno: {title: "Arduino", place: ["uno"]},
      s_btn: {title: "Button", place: ["button"]},
      s_r10k: {title: "10K resistor", place: ["r10k"]},
      s_led: {title: "LED", place: ["led"]},
      s_r220: {title: "220 ohm", place: ["r220"]},
      s_power: {title: "Power rails", place: []},
      s_btnw: {title: "Button wires", place: []},
      s_ledw: {title: "LED wires", place: []},
    },
    quests: [
      {id: "q1", title: "Board", steps: ["s_board", "s_uno"]},
      {id: "q2", title: "Button", steps: ["s_btn", "s_r10k"]},
      {id: "q3", title: "LED", steps: ["s_led", "s_r220"]},
      {id: "q4", title: "Wiring", steps: ["s_power", "s_btnw", "s_ledw"]},
    ],
    names: {breadboard: "Breadboard", uno: "Arduino Uno", button: "Button", r10k: "10K", r220: "220 ohm", led: "LED"},
  }

  fillGuide(
    pack,
    {
      breadboard: {text: "rails at the back", face: "+Z", dir: [0, 0, 1]},
      uno: {text: "USB to the left", face: "-X usb", dir: [-1, 0, 0]},
      button: {text: "legs across the channel", face: "+Y", dir: [0, 1, 0]},
      r10k: {text: "any way round", face: "+Y", dir: [0, 1, 0]},
      r220: {text: "any way round", face: "+Y", dir: [0, 1, 0]},
      led: {text: "long leg toward the resistor", face: "-X anode", dir: [-1, 0, 0]},
    },
    {breadboard: "body", uno: "body", button: "breadboard", r10k: "breadboard", r220: "breadboard", led: "breadboard"},
    {doc: "Button.md + Blink.md", url: URL},
  )
  return finishPack(pack)
}

