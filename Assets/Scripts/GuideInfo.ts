// GuideInfo.ts - the local info table of the ANALYSE page (name, what it is, role in the RC car, key specs, pin notes, a DIY tip).
// Offline and complete. A Gemini "Ask more" is optional and only offered when a key is set.
// Real object recognition would decide WHICH component you are looking at on a device; here the subject is a stand-in model.

export interface PartInfo {
  part: string
  what: string
  role: string
  specs: string
  pins: string
  tip: string
}

export const PART_INFO: PartInfo[] = [
  {part: "esp32", what: "A Wi-Fi + Bluetooth microcontroller module.", role: "The brain: reads inputs and sets the motor and servo signals.", specs: "240 MHz dual core, 3.3 V logic, 520 kB RAM", pins: "IO12 / IO13 drive the L293D, IO14 the servo signal.", tip: "Power it from 5 V on the VIN pin, never feed 5 V into an IO pin."},
  {part: "l293d", what: "A dual H-bridge motor driver in a 16-pin DIP.", role: "Lets small logic signals spin the motor both ways.", specs: "4.5 to 36 V, 600 mA per channel", pins: "1A / 2A are inputs, 1Y / 2Y the motor outputs, VCC2 the motor supply.", tip: "Tie the enable pins high and keep motor and logic grounds common."},
  {part: "servo", what: "A micro servo: motor, gears and position sensor in one case.", role: "Turns the front wheels for steering.", specs: "4.8 to 6 V, about 180 degrees, 9 g", pins: "Orange = signal, red = 5 V, brown = ground.", tip: "Give it its own 5 V supply if the car resets when it moves."},
  {part: "battery", what: "A holder for four AA cells in series.", role: "Powers the motor and the electronics.", specs: "4 x 1.5 V = 6 V, around 2000 mAh", pins: "Red wire = plus, black wire = minus.", tip: "Put a slide switch on the red wire so you can cut power quickly."},
  {part: "motor", what: "An N20 micro gear motor.", role: "Drives the rear axle through the gears.", specs: "6 V, about 150 rpm, 100 mA no load", pins: "Two solder tabs; swap them to reverse the direction.", tip: "Solder a 100 nF capacitor across the tabs to cut electrical noise."},
  {part: "switch", what: "A slide switch (single pole, double throw).", role: "Main power switch of the car.", specs: "Rated about 0.5 A at 30 V", pins: "Middle pin = common, outer pins = the two positions.", tip: "Use the common pin and one outer pin as a simple on / off."},
  {part: "led", what: "A 5 mm light emitting diode.", role: "Status light: shows the car is on or reversing.", specs: "About 2 V and 10 to 20 mA", pins: "The long leg is the anode (plus), the short leg the cathode.", tip: "Always put a resistor in series, an LED has no current limit of its own."},
  {part: "resistor", what: "A 220 ohm axial resistor (red, red, brown bands).", role: "Limits the current through the LED.", specs: "220 ohm, 1/4 W, 5 percent", pins: "No polarity: either way round works.", tip: "Read the bands from the end that has the bands closest together."},
  {part: "npn", what: "An NPN bipolar transistor in a TO-92 case.", role: "Switches a bigger load from a small signal on its base.", specs: "About 100 to 500 mA, gain around 100", pins: "E, B, C: look at the flat face, pins left to right.", tip: "Put about 1 kilo-ohm in series with the base."},
  {part: "diode", what: "A 1N4004 rectifier diode.", role: "Flyback diode: absorbs the voltage spike when the motor switches off.", specs: "400 V reverse, 1 A forward", pins: "The stripe marks the cathode (K).", tip: "Place it across the motor, stripe toward plus."},
  {part: "capacitor", what: "A radial electrolytic capacitor.", role: "Smooths the battery rail so the ESP32 does not reset.", specs: "470 uF, 16 V", pins: "The stripe marks the minus leg.", tip: "Never connect it backwards, it can burst."},
]

export function infoOf(part: string): PartInfo {
  return PART_INFO.filter((p) => p.part === part)[0]
}
