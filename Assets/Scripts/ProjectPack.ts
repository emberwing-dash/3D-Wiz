// ProjectPack.ts - THE single source of truth for the CURRENT 3D Wiz project. PROJECT_PACK holds whichever pack was loaded last
// (loadPack); the bundled default is the Sesame Quadruped (Lolin S2 Mini, hand-wired) defined here as SESAME_PACK. The other example
// projects live in Pack*.ts (one pack per project, same schema) and are registered in PackRegistry.ts.
// Owns: identity, parts (printed STL parts + electronics), circuit wires/pins, servo map, build steps, test-lab commands,
//       validator expectations, UI copy. Every other script reads from PROJECT_PACK; nothing keeps its own copy.
// Source: Sesame Robot open-source repo (Apache-2.0), original design by Dorian Borian, replication/bring-up by Soham Kadu.
//         Read OFFLINE from: README.md, docs/wiring-guide (+ s2-mini-wiring-guide-new.png), docs/build-guide, hardware/bom,
//         hardware/printing, firmware/sesame-firmware-main.ino, firmware/movement-sequences.h, firmware/face-bitmaps.h.
// Data basis tags: "repo" = stated in the repo text/firmware/diagram; "stl" = measured from the repo STL files;
//                  "standard" = common datasheet size NOT from the repo; "illustrative" = placement/angles chosen here.
// Units: centimetres. Robot frame: +Z = robot front (faces the user), +X = robot's LEFT, +Y up, origin = footprint centre
//        on the desk. Bench frame (circuit): +X right, +Y up (out of the board), +Z toward the viewer (front edge).

import {ElecSpec, FnDef} from "./CircuitSim"

export type V3 = [number, number, number]
export type RGBA = [number, number, number, number]
export type Basis = "repo" | "stl" | "standard" | "illustrative"

export type ServoName = "R1" | "R2" | "L1" | "L2" | "R3" | "R4" | "L3" | "L4"

export interface PinDef {
  name: string
  at: V3 // component-local (bench frame, component at its rest orientation)
  label?: string // short text shown on the bench
}

export interface ComponentDef {
  id: string
  name: string
  kind: "printed" | "electronic"
  group: string // "body" | "hip" | "foot" | "servo" | "electronics" (Sesame) or any label of a generic pack
  purpose: string
  glb?: string // printed parts: file under Assets/Models/Sesame
  stl?: string // original repo STL file
  tris?: number
  sizeCm: V3 // real bounding size X (width) x Y (height) x Z (depth), cm
  sizeBasis: Basis
  assembled: V3 // robot frame position (pivot for printed parts)
  assembledRot?: V3 // electronics: euler degrees applied in the robot (illustrative)
  exploded: V3 // extra offset in the exploded view
  boundsMin?: V3 // printed: assembled-pose bounds in the robot frame
  boundsMax?: V3
  color: RGBA
  servo?: ServoName // servos + joints that a servo drives
  benchPos?: V3 // circuit bench placement
  benchYaw?: number
  pins: PinDef[]
  notes: string[]
  // ---- generic packs: parts drawn from primitives instead of GLB meshes ----
  prims?: PrimDef[] // model of the part in its own frame (y = 0 is the underside); also used on the bench
  groups?: GroupDef[] // nested pivots inside the part (finger segments, servo horn)
  model?: string // reuse a built-in model by name (e.g. "oled", "servo")
  outward?: boolean // selectable from outside even when covers are on
  deskHidden?: boolean // not drawn on the desk model (My Model: the template's electronics live on the bench / workbench only)
  elec?: ElecSpec // electrical behaviour for the Circuit Lab simulator (CircuitSim.ts); pin names must follow its convention
}

export interface ConnEnd {
  component: string
  pin: string
}

export interface ConnectionDef {
  id: string
  group: "power" | "i2c" | "servo" | "plug"
  from: ConnEnd
  to: ConnEnd
  label: string
  explanation: string
  color: RGBA
  lift: number // routing height above the board (cm) so wires do not overlap
}

export interface StepDef {
  id: string
  title: string
  instruction: string
  components: string[] // highlighted; parts appear from the exploded view as the steps advance
  wires: string[]
  basis: "repo" | "illustrative"
  source: string
}

export interface DistractorDef {
  id: string
  label: string
  from: ConnEnd
  to: ConnEnd
  explanation: string
}

// ---------------------------------------------------------------------------------------------------------------------
// GUIDE PACK SCHEMA ("3dwiz-pack/1") - what the offline pack builder produces from a build guide + the user's 3D parts.
// Generic on purpose: a "servo hand" (N servos attaching to printed finger parts) is just parts + hosts + attach points.
// See tools/pack-from-guide.md for the pipeline and a JSON example. The Lens only CONSUMES the pack; it never reads a guide.
export interface ScrewHole {
  id: string
  hostId: string // the part (or model) that carries the hole
  at: V3 // position in the host frame (robot frame, cm)
  dir: V3 // direction the screw travels INTO the host
  type: string // e.g. "M2 self-tapping", "M2.5 machine"
  diameterMm: number
  depthMm: number
  basis: Basis
}

export interface AttachPoint {
  hostId: string // part this one is mounted on ("body" = the model itself)
  at: V3 // target position (robot frame, cm)
  rot: V3 // target orientation, euler degrees
  face: string // which face/axis of the part leads the insertion, e.g. "+Z", "shaft up"
  faceDir: V3 // that axis as a unit vector in the robot frame when installed (drawn as the guide arrow)
  screws: string[] // ids of ScrewHole entries that fasten it
}

export interface PartGuide {
  partId: string
  stepId: string
  attach: AttachPoint
  orientation: string // <= 6 words, shown only on demand
  source: {doc: string; section: string; url: string}
  tools: string[]
  basis: Basis // how trustworthy the attach data is
}

export interface FastenerDef {
  id: string
  label: string
  kind: "self-tapping" | "machine" | "standoff"
  diameterMm: number
  lengthMm: number
  head: "phillips" | "hex" | "none"
  driver: string // tool id that turns it
  color: RGBA
}

export interface ToolDef {
  id: string
  label: string
  head: "phillips" | "hex"
  size: string // PH0, PH1, H2.0
}

export interface GuidePack {
  schema: string
  guideSource: {url: string; license: string; note: string}
  parts: PartGuide[]
  screwHoles: ScrewHole[]
  fasteners: FastenerDef[]
  tools: ToolDef[]
}

export interface MoveStep {
  ang?: {[s: string]: number} // actuator name -> target value (servo: degrees, as in movement-sequences.h)
  jump?: {[s: string]: number} // set these actuators instantly (no motion), e.g. to wrap a wheel angle
  wait: number // ms (delayWithFace in the firmware)
  face?: string
  mode?: "loop" | "once" | "boomerang"
}

export interface CommandDef {
  id: string
  label: string
  face: string
  mode: "loop" | "once" | "boomerang"
  steps: MoveStep[]
  basis: string
}

// ---- generic pack features (rig, primitives, plan) -------------------------------------------------------------------
export interface PrimDef {
  s: "box" | "cyl" | "sph" | "glb" // glb: a real model from Assets/Models/Parts (n = model id, z = its size in cm for bounds, p = its centre)
  p: V3 // position, relative to the group origin (or the part root when g is absent)
  z: V3 // size (box x y z; cyl diameter x length x diameter along Y; sph diameter)
  c?: RGBA // colour (default: the component colour)
  r?: V3 // euler degrees
  g?: string // group id (GroupDef)
  n?: string
}
export interface GroupDef {
  id: string
  parent?: string
  at: V3 // group origin relative to its parent group (or the part root)
}
export interface ActEl {
  part: string // component id; "*" = the whole model (yaw / roll / lift)
  grp?: string
  op: "rot" | "move" | "glow"
  axis: V3 // rot: axis; move: direction; glow: RGB of the glow colour
  k: number // value multiplier (deg per unit, cm per unit, glow per unit)
}
export interface ActDef {
  name: string
  zero: number // neutral value
  speed: number // units per second in the simulation
  els: ActEl[]
  label?: string
}
export interface RigDef {
  mode: "sesame" | "generic"
  acts: ActDef[]
}
export interface PlanStep {
  title: string
  place: string[]
}
export interface QuestDef {
  id: string
  title: string
  steps: string[]
}
export interface VizItem {
  id: string
  size: V3
  rule: string
  fixed?: boolean
}

export interface PackShape {
  identity: {
    id: string
    app: string
    tagline: string
    name: string
    subtitle: string
    source: string
    credit: string
    license: string
    preparedOffline: boolean
    version: string
    url?: string
    short?: string // card title, at most two words
    icon?: string
    hasOled?: boolean
    sourceNote?: string
  }
  mcu: {[k: string]: any}
  notSpecified: string[]
  placement: {
    desk: V3
    deskSize: [number, number]
    modeBar: V3
    taskPanel: V3
    testPanel: V3
    validatorPanel: V3
    infoCard: V3
    menu: V3
    bench: V3
    benchScale: number
    benchTiltDeg: number
    locator: V3
    locatorScale: number
    enlarge: number
    enlargeExploded: number
    explodeSpeed: number
    dragDegPerCm: number
    viewYaw?: number // initial yaw of the model on the desk (degrees): a 3/4 view for long models
    modelScale?: number // life-size factor of the whole model on the desk (small circuits are shown larger)
    benchMat?: {w: number; d: number; style: "mat" | "breadboard"}
  }
  game: {snapCm: number; tray: V3; confetti: number}
  components: ComponentDef[]
  connections: ConnectionDef[]
  steps: StepDef[]
  lab: {simLabel: string; walkCycles: number; motorDegPerS: number; commands: CommandDef[]; pages?: string[][]; icons?: {[id: string]: string}; restFace?: string; idleFace?: string; doneFace?: string}
  validation: {expected: string[]; distractors: DistractorDef[]; disclaimer: string}
  visualize: {
    scale: number
    wallCm: number
    leadReachCm: number
    defaultCavity: {min: V3; max: V3; basis: string}
    catalog: VizItem[]
    servoNote: string
    prefer: {[id: string]: V3}
    naive: {[id: string]: V3}
    shell?: PrimDef[] // the model drawn around the interior (generic packs)
    test?: {power: string[]; data: string[]; servo: string[]}
    demo?: {parts: string[]; screw: string; tool: string; hole: string}
  }
  gesture: {
    extendedRatio: number
    curledRatio: number
    ringPinkyMargin: number
    poseHoldS: number
    swipeDropCm: number
    swipeWindowS: number
    verticalDominance: number
    debounceS: number
    autoOpenS: number
    idleFadeS: number
    followSmooth: number
  }
  guide: GuidePack
  workbench: {altServos: {id: string; label: string; size: V3; color: RGBA}[]; holeToleranceMm: number; lengthSlackMm: number; tightCm: number; screwVisualScale: number}
  rig: RigDef
  plan: {[stepId: string]: PlanStep}
  quests: QuestDef[]
  names: {[id: string]: string}
  circuit?: {functions: FnDef[]; rails?: boolean; autoRails?: string[]; railSrc?: {plus: string[]; minus: string[]}} // Circuit Lab: what the finished circuit should be able to do
}

// ------------------------------------------------------------------------------------------------------------------
// Servo map (firmware/sesame-firmware-main.ino servoPins + firmware/movement-sequences.h ServoNames / enum ServoName)
// index: 0..7 ; name ; GPIO ; header slot (slot order = servoPins order in the wiring diagram, inferred)
export const SERVO_MAP: {idx: number; name: ServoName; gpio: number; slot: number; driven: string; motorGuideId: string}[] = [
  {idx: 0, name: "R1", gpio: 1, slot: 1, driven: "joint_r1", motorGuideId: "00"},
  {idx: 1, name: "R2", gpio: 2, slot: 2, driven: "joint_r2", motorGuideId: "01"},
  {idx: 2, name: "L1", gpio: 4, slot: 3, driven: "joint_l1", motorGuideId: "02"},
  {idx: 3, name: "L2", gpio: 6, slot: 4, driven: "joint_l2", motorGuideId: "03"},
  {idx: 4, name: "R4", gpio: 8, slot: 5, driven: "joint_r4", motorGuideId: "04"},
  {idx: 5, name: "R3", gpio: 10, slot: 6, driven: "joint_r3", motorGuideId: "05"},
  {idx: 6, name: "L3", gpio: 13, slot: 7, driven: "joint_l3", motorGuideId: "06"},
  {idx: 7, name: "L4", gpio: 14, slot: 8, driven: "joint_l4", motorGuideId: "07"},
]

const ORANGE: RGBA = [0.97, 0.5, 0.14, 1]
const ORANGE2: RGBA = [0.98, 0.62, 0.25, 1]
const SERVO_BLUE: RGBA = [0.2, 0.32, 0.62, 1]

const HEADER_PITCH = 0.254
function slotX(n: number): number {
  return -0.889 + (n - 1) * HEADER_PITCH
}

function servoDef(s: {name: ServoName; gpio: number; slot: number; driven: string; idx: number; motorGuideId: string}): ComponentDef {
  const l = s.name.charAt(0) === "L"
  const hip = s.name.charAt(1) === "1" || s.name.charAt(1) === "2"
  const front = s.name.charAt(1) === "1" || s.name.charAt(1) === "3"
  const sx = l ? 1 : -1
  const sz = front ? 1 : -1
  // Illustrative placement. Hip servos sit under their hip joint plate (shaft on the hip pivot); foot servos sit on the
  // foot pivot (shaft along the front-back axis) and ride with the hip.
  const hipPivot: V3 = [sx * 2.5, 2.4, sz * 2.83]
  const footPivot: V3 = [sx * 5.2, 1.52, sz * (front ? 1.75 : -1.75)]
  const p = hip ? [hipPivot[0] - sx * 0.57, hipPivot[1] - 2.1, hipPivot[2]] : [footPivot[0] + sx * 0.57, footPivot[1], footPivot[2] - sz * 0.2]
  const bx = -6.0 + (s.slot - 1) * 1.7
  return {
    id: "servo_" + s.name.toLowerCase(),
    name: "MG90S servo " + s.name,
    kind: "electronic",
    group: "servo",
    purpose:
      (hip ? "Hip servo (mounted in the frame). " : "Foot/leg servo (mounted in the leg piece). ") +
      "Drives joint " + s.name + ". Signal wire on S2 Mini GPIO" + s.gpio + " (firmware servoPins[" + s.idx + "]), header slot " + s.slot + ".",
    sizeCm: [2.28, 1.22, 2.25],
    sizeBasis: "standard",
    assembled: [p[0], p[1], p[2]],
    assembledRot: hip ? undefined : [90, 0, 0],
    exploded: hip ? [sx * 2.0, -2.0, sz * 2.0] : [sx * 3.0, -1.0, sz * 3.0],
    color: SERVO_BLUE,
    servo: s.name,
    benchPos: [bx, 0, 5.4],
    benchYaw: -90,
    pins: [{name: "PLUG", at: [-1.25, 0.2, 0], label: s.name}],
    notes: [
      "Size: MG90S standard ~22.8 x 12.2 x 28.5 mm (standard size, not from repo; drawn without the ears/shaft height).",
      "Firmware servo index " + s.idx + ", GPIO " + s.gpio + ", wiring-guide motor tag " + s.motorGuideId + ".",
      "Placement in the robot is illustrative.",
    ],
  }
}

function jointDef(id: string, srv: ServoName, src: string, glb: string, tris: number, piv: V3, bmin: V3, bmax: V3, size: V3, hip: boolean): ComponentDef {
  const l = srv.charAt(0) === "L"
  const front = srv.charAt(1) === "1" || srv.charAt(1) === "3"
  const sx = l ? 1 : -1
  const sz = front ? 1 : -1
  return {
    id: id,
    name: "Joint " + srv + (hip ? " (hip)" : " (leg)"),
    kind: "printed",
    group: hip ? "hip" : "foot",
    purpose: hip
      ? "Printed hip joint " + srv + " (" + (l ? "left" : "right") + ", " + (front ? "front" : "back") + "). A servo horn is pressed into it and the frame servo " + srv + " swings it."
      : "Printed leg joint " + srv + " (" + (l ? "left" : "right") + ", " + (front ? "front" : "back") + "). The leg servo " + srv + " is pushed into this piece.",
    glb: glb,
    stl: src,
    tris: tris,
    sizeCm: size,
    sizeBasis: "stl",
    assembled: piv,
    exploded: hip ? [sx * 2.0, 2.5, sz * 3.0] : [sx * 2.5, 1.0, sz * 4.5],
    boundsMin: bmin,
    boundsMax: bmax,
    color: hip ? ORANGE : ORANGE2,
    servo: srv,
    pins: [],
    notes: [
      "Mesh converted from the repo STL (mm -> cm). Assembly position/orientation is ILLUSTRATIVE (the STLs are not exported in one assembly frame).",
      "Joint pivot and the servo-angle -> rotation mapping are illustrative; angle values themselves are from movement-sequences.h.",
    ],
  }
}

export const SESAME_PACK: PackShape = {
  identity: {
    id: "sesame-quadruped",
    app: "3D Wiz",
    tagline: "Visualize it. Build it. Test it.",
    name: "Sesame Quadruped",
    subtitle: "Lolin S2 Mini, hand-wired",
    source: "Sesame Robot (open source, Apache-2.0)",
    credit: "Original design: Dorian Borian. Replication / bring-up: Soham Kadu.",
    license: "Apache-2.0",
    preparedOffline: true,
    version: "printed parts: frame v121, bottom cover v121, joints v117, Cat top cover v100",
    url: "https://github.com/soham0777/sesame-robot",
    short: "Sesame Robot",
    icon: "pets",
    hasOled: true,
  },

  mcu: {
    board: "Lolin S2 Mini",
    servoPins: [1, 2, 4, 6, 8, 10, 13, 14],
    servoPinBasis: "firmware/sesame-firmware-main.ino (Lolin S2 Mini pinout) and the S2 Mini wiring diagram",
    oled: {type: "SSD1306 0.96in", w: 128, h: 64, i2cAddr: 0x3c, sda: 33, scl: 35},
    battery: "5-12 V per the wiring diagram; Bambu Lab 14500 7.4 V 800 mAh recommended (BOM)",
    buckOutput: "set to 5 V (diagram); build guide: trim to about 5.1 V",
  },

  notSpecified: [
    "Which header slot each servo plugs into is not labelled in the diagram (inferred from the GPIO order)",
    "Exact wire-to-slot pairing of the 8 yellow data lines is not distinguishable in the diagram image",
    "Battery pack, buck module, switch, OLED and servo dimensions (standard sizes used)",
    "Assembly positions of the printed parts (STLs are not in one assembly frame)",
    "Face bitmap for 'stand' / 'default' (not in face-bitmaps.h; firmware falls back to idle)",
  ],

  // Where things live in the world (cm). Camera at the origin looking down -Z. Measured in the Specs preview: the visible
  // window at 55 cm is about 32 cm wide and 36 cm tall, centred near y = -11.5 (x +-16, y -29.5 .. +6.5). Everything is
  // laid out inside that window; task panels are landscape (wide and short) for that reason.
  placement: {
    desk: [0, -12, -60] as V3, // desk surface centre; the robot base sits here ("arm's length, on a table")
    deskSize: [30, 16] as [number, number],
    modeBar: [0, -27.8, -55] as V3,
    taskPanel: [0, -20, -55] as V3,
    testPanel: [0, -17.5, -55] as V3,
    validatorPanel: [0, -11, -55] as V3,
    infoCard: [0, 3.1, -55] as V3,
    menu: [0, -11, -55] as V3,
    bench: [0, -7.5, -63] as V3,
    benchScale: 1.8,
    benchTiltDeg: 55,
    locator: [11.5, 2.4, -62] as V3, // small robot shown in Circuit mode for "show in robot"
    locatorScale: 0.4,
    enlarge: 2.5,
    enlargeExploded: 1.15,
    explodeSpeed: 6,
    dragDegPerCm: 14,
  },

  // Build game: pick a part from the tray in front of the robot, drop it on its ghost outline (target = assembled position).
  game: {
    snapCm: 2.2, // drop tolerance in the view plane (cm, robot scale 1)
    tray: [0, 2.4, 6.6] as V3, // robot-local position of the part offered to the user
    confetti: 16,
  },

  components: [
    // ---- printed parts (converted from the repo STL files; hips + legs are rigged) ----
    {
      id: "frame", name: "Internal frame", kind: "printed", group: "body",
      purpose: "Printed chassis. Holds the four hip servos, the battery holder and the S2 Mini + protoboard.",
      glb: "frame.glb", stl: "Internal-Frame-v121.stl", tris: 7780, sizeCm: [6.81, 1.57, 7.92], sizeBasis: "stl",
      assembled: [0, 0, 0], exploded: [0, -1.5, 0], boundsMin: [-3.64, 0.63, -3.96], boundsMax: [3.17, 2.2, 3.96],
      color: [0.5, 0.52, 0.58, 1], pins: [], notes: ["Notch = front, USB port = back (build guide)."],
    },
    {
      id: "bottom_cover", name: "Bottom cover", kind: "printed", group: "body",
      purpose: "Printed bottom plate. Closes the battery bay; two self-threading M2 screws.",
      glb: "bottom_cover.glb", stl: "Bottom-Cover-v121.stl", tris: 1702, sizeCm: [5.42, 0.73, 7.92], sizeBasis: "stl",
      assembled: [0, 0, 0], exploded: [0, -5.5, 0], boundsMin: [-2.95, -0.1, -3.96], boundsMax: [2.47, 0.63, 3.96],
      color: [0.8, 0.82, 0.85, 1], pins: [], notes: [],
    },
    {
      id: "top_cover_cat", name: "Top cover (Cat v100)", kind: "printed", group: "body",
      purpose: "Printed top cover with cat ears. Holds the OLED display (front window) and the rocker switch (back slot). Needs supports to print.",
      glb: "top_cover_cat.glb", stl: "top-covers/Top-Cover-Cat-v100.stl", tris: 3916, sizeCm: [3.76, 4.31, 7.92], sizeBasis: "stl",
      assembled: [0, 0, 0], exploded: [0, 6.0, 0], boundsMin: [-2.12, 2.2, -3.96], boundsMax: [1.64, 6.51, 3.96],
      color: [0.93, 0.93, 0.95, 1], pins: [], notes: ["Default cover here. Other repo covers: Enclosed v117, No-Ears v100."],
    },
    jointDef("joint_l1", "L1", "L1-v117.stl", "hip_l1.glb", 7186, [2.5, 2.4, 2.83], [1.67, 0.89, 1.81], [6.62, 3.94, 3.84], [4.95, 3.05, 2.03], true),
    jointDef("joint_r1", "R1", "R1-v117.stl", "hip_r1.glb", 7594, [-2.5, 2.4, 2.83], [-6.62, 0.89, 1.81], [-1.67, 3.94, 3.84], [4.95, 3.05, 2.03], true),
    jointDef("joint_l2", "L2", "L2-v117.stl", "hip_l2.glb", 7666, [2.5, 2.4, -2.83], [1.67, 0.89, -3.84], [6.62, 3.94, -1.81], [4.95, 3.05, 2.03], true),
    jointDef("joint_r2", "R2", "R2-v117.stl", "hip_r2.glb", 7578, [-2.5, 2.4, -2.83], [-6.62, 0.89, -3.84], [-1.67, 3.94, -1.81], [4.95, 3.05, 2.03], true),
    jointDef("joint_l3", "L3", "L3-v117.stl", "foot_l3.glb", 2052, [5.2, 1.52, 1.75], [4.85, 0.57, 1.27], [10.69, 2.48, 2.22], [5.84, 1.9, 0.95], false),
    jointDef("joint_r3", "R3", "R3-v117.stl", "foot_r3.glb", 2116, [-5.2, 1.52, 1.75], [-10.69, 0.57, 1.27], [-4.85, 2.48, 2.22], [5.84, 1.9, 0.95], false),
    jointDef("joint_l4", "L4", "L4-v117.stl", "foot_l4.glb", 1826, [5.2, 1.52, -1.75], [4.85, 0.57, -2.22], [10.69, 2.48, -1.27], [5.84, 1.9, 0.95], false),
    jointDef("joint_r4", "R4", "R4-v117.stl", "foot_r4.glb", 1890, [-5.2, 1.52, -1.75], [-10.69, 0.57, -2.22], [-4.85, 2.48, -1.27], [5.84, 1.9, 0.95], false),

    // ---- electronics (no STL in the repo: built from primitives at standard real sizes) ----
    {
      id: "mcu_s2mini", name: "Lolin S2 Mini (ESP32-S2)", kind: "electronic", group: "electronics",
      purpose: "The microcontroller. Drives 8 servos on GPIO 1,2,4,6,8,10,13,14 and the OLED over I2C (SDA GPIO33, SCL GPIO35). Powered on its VBUS pin from the 5 V rail. USB-C faces the back of the robot.",
      sizeCm: [2.54, 0.4, 3.43], sizeBasis: "standard", assembled: [0, 2.45, -1.2], assembledRot: [0, 180, 0], exploded: [0, 4.0, -3.0],
      color: [0.55, 0.14, 0.6, 1], benchPos: [-0.8, 0, 1.0], benchYaw: 0,
      pins: [
        {name: "GPIO1", at: [-1.1, 0.35, -0.45], label: "1"},
        {name: "GPIO2", at: [-1.1, 0.35, -0.196], label: "2"},
        {name: "GPIO4", at: [-1.1, 0.35, 0.058], label: "4"},
        {name: "GPIO6", at: [-1.1, 0.35, 0.312], label: "6"},
        {name: "GPIO8", at: [-1.1, 0.35, 0.566], label: "8"},
        {name: "GPIO10", at: [-1.1, 0.35, 0.82], label: "10"},
        {name: "GPIO13", at: [-1.1, 0.35, 1.074], label: "13"},
        {name: "GPIO14", at: [-1.1, 0.35, 1.328], label: "14"},
        {name: "GPIO39", at: [1.1, 0.35, -0.45], label: "39"},
        {name: "GPIO37", at: [1.1, 0.35, -0.196], label: "37"},
        {name: "GPIO35", at: [1.1, 0.35, 0.058], label: "35 SCL"},
        {name: "GPIO33", at: [1.1, 0.35, 0.312], label: "33 SDA"},
        {name: "GPIO18", at: [1.1, 0.35, 0.566], label: "18"},
        {name: "GPIO16", at: [1.1, 0.35, 0.82], label: "16"},
        {name: "GND", at: [1.1, 0.35, 1.074], label: "GND"},
        {name: "VBUS", at: [1.1, 0.35, 1.328], label: "VBUS"},
      ],
      notes: ["Size: Lolin S2 Mini ~34 x 25 mm (standard size, not from repo).", "Only the pins drawn in the wiring diagram are modelled."],
    },
    {
      id: "buck_converter", name: "Buck converter (LM2596-style)", kind: "electronic", group: "electronics",
      purpose: "Steps the battery voltage (5-12 V in) down to a stable 5 V for the servos, the OLED and the S2 Mini. The blue trimmer is turned until the output reads 5 V (build guide: about 5.1 V).",
      sizeCm: [4.3, 1.4, 2.1], sizeBasis: "standard", assembled: [-1.9, 2.5, 1.7], exploded: [-6.5, 4.0, 2.0],
      color: [0.12, 0.3, 0.7, 1], benchPos: [4.2, 0, -3.9], benchYaw: 0,
      pins: [
        {name: "IN+", at: [-2.0, 0.1, -0.85], label: "IN+"},
        {name: "IN-", at: [-2.0, 0.1, 0.85], label: "IN-"},
        {name: "OUT+", at: [2.0, 0.1, -0.85], label: "OUT+"},
        {name: "OUT-", at: [2.0, 0.1, 0.85], label: "OUT-"},
      ],
      notes: ["Size: LM2596-style module ~43 x 21 mm (standard size, not from repo).", "Set the trimmer to 5 V output BEFORE connecting anything (diagram note)."],
    },
    {
      id: "battery", name: "Battery (Bambu 14500 7.4 V 800 mAh)", kind: "electronic", group: "electronics",
      purpose: "Power source: recommended Bambu Lab 14500 7.4 V 800 mAh Li-ion pack (BOM). The wiring diagram accepts 5-12 V. Goes through the rocker switch and the buck converter, never straight to the rails.",
      sizeCm: [5.4, 1.5, 3.0], sizeBasis: "standard", assembled: [0, 1.4, -2.4], exploded: [0, -1.0, -7.5],
      color: [0.25, 0.28, 0.32, 1], benchPos: [-4.4, 0, -3.9], benchYaw: 0,
      pins: [
        {name: "+", at: [-2.7, 0.5, -0.6], label: "+Ve"},
        {name: "-", at: [-2.7, 0.5, 0.6], label: "-Ve"},
      ],
      notes: ["Size is approximate (2 x 14500 cells + case); the repo does not state pack dimensions (standard size, not from repo).", "Never cut the factory connector off the pack (wiring guide)."],
    },
    {
      id: "power_switch", name: "Rocker switch (KCD1)", kind: "electronic", group: "electronics",
      purpose: "Panel-mount rocker switch that snaps into the back slot of the top cover. Battery + goes through it before the buck converter.",
      sizeCm: [2.1, 1.5, 1.4], sizeBasis: "standard", assembled: [0, 3.0, -3.3], assembledRot: [-90, 0, 0], exploded: [0, 6.0, -5.0],
      color: [0.08, 0.08, 0.1, 1], benchPos: [-0.2, 0, -4.2], benchYaw: 0,
      pins: [
        {name: "A", at: [-0.5, 0.0, 0.8], label: "A"},
        {name: "B", at: [0.5, 0.0, 0.8], label: "B"},
      ],
      notes: ["Size: KCD1 mini rocker ~21 x 15 mm (standard size, not from repo)."],
    },
    {
      id: "servo_header_strip", name: "Servo header strip (8 x 3-pin)", kind: "electronic", group: "electronics",
      purpose: "Eight 3-pin headers on a small protoboard. The middle pins are joined into the 5 V rail, the outer pins into the GND rail; the third pin of each slot is that servo's signal line from the S2 Mini.",
      sizeCm: [2.6, 1.1, 1.3], sizeBasis: "standard", assembled: [0, 2.55, 2.0], exploded: [0, 4.0, 4.5],
      color: [0.18, 0.55, 0.28, 1], benchPos: [4.3, 0, -0.5], benchYaw: 0,
      pins: [
        {name: "GND_R", at: [1.15, 0.3, -0.254], label: "GND"},
        {name: "GND_L", at: [-1.15, 0.3, -0.254], label: "GND"},
        {name: "5V_R", at: [1.15, 0.3, 0.0], label: "5V"},
        {name: "5V_L", at: [-1.15, 0.3, 0.0], label: "5V"},
        {name: "S1", at: [slotX(1), 0.3, 0.254], label: "1"},
        {name: "S2", at: [slotX(2), 0.3, 0.254], label: "2"},
        {name: "S3", at: [slotX(3), 0.3, 0.254], label: "3"},
        {name: "S4", at: [slotX(4), 0.3, 0.254], label: "4"},
        {name: "S5", at: [slotX(5), 0.3, 0.254], label: "5"},
        {name: "S6", at: [slotX(6), 0.3, 0.254], label: "6"},
        {name: "S7", at: [slotX(7), 0.3, 0.254], label: "7"},
        {name: "S8", at: [slotX(8), 0.3, 0.254], label: "8"},
      ],
      notes: ["8 x 3-pin male headers on a ~5x7 cm protoboard (BOM); 2.54 mm pitch.", "Wire gauge: 30AWG for data lines, 22AWG for power (wiring guide)."],
    },
    {
      id: "oled", name: "OLED display (SSD1306 0.96in)", kind: "electronic", group: "electronics",
      purpose: "128x64 monochrome I2C display (address 0x3C) that shows the robot's face. Sits in the front window of the top cover. SDA = GPIO33, SCL = GPIO35.",
      sizeCm: [2.73, 0.4, 2.73], sizeBasis: "standard", assembled: [0, 5.0, 3.05], assembledRot: [90, 0, 0], exploded: [0, 6.0, 5.0],
      color: [0.1, 0.35, 0.75, 1], benchPos: [5.0, 0, 2.6], benchYaw: 0,
      pins: [
        {name: "GND", at: [-0.381, 0.25, -1.2], label: "GND"},
        {name: "VCC", at: [-0.127, 0.25, -1.2], label: "VCC"},
        {name: "SCL", at: [0.127, 0.25, -1.2], label: "SCL"},
        {name: "SDA", at: [0.381, 0.25, -1.2], label: "SDA"},
      ],
      notes: ["Size: 0.96in SSD1306 module ~27 x 27 mm (standard size, not from repo).", "I2C address 0x3C (OLED_I2C_ADDR in the firmware)."],
    },
    servoDef(SERVO_MAP[0]),
    servoDef(SERVO_MAP[1]),
    servoDef(SERVO_MAP[2]),
    servoDef(SERVO_MAP[3]),
    servoDef(SERVO_MAP[4]),
    servoDef(SERVO_MAP[5]),
    servoDef(SERVO_MAP[6]),
    servoDef(SERVO_MAP[7]),
  ] as ComponentDef[],

  // Wires as drawn in docs/wiring-guide/s2-mini-wiring-guide-new.png (+ firmware pins). Servo plugs are listed as "plug".
  connections: buildConnections(),

  // Guided build, in the repo build-guide order (Phases 2-4).
  steps: [
    {id: "s_print", title: "Print the parts", instruction: "Phase 1: print the 11 parts in PLA (frame, bottom cover, top cover, joints R1-R4 and L1-L4). Here: the printed set, converted from the repo STLs.", components: ["frame", "bottom_cover", "top_cover_cat"], wires: [], basis: "repo", source: "build guide Phase 1, printing README"},
    {id: "s_rails", title: "Rails on the header strip", instruction: "Phase 2: solder the 3-pin headers to the protoboard. One wire joins every middle pin (5 V rail), another joins the outer row (GND rail).", components: ["servo_header_strip"], wires: [], basis: "repo", source: "wiring guide: Building Power and Ground Rails"},
    {id: "s_data", title: "Eight data lines", instruction: "Cut 8 equal 30AWG wires. Join S2 Mini GPIO 1, 2, 4, 6, 8, 10, 13, 14 to the signal pin of header slots 1-8.", components: ["mcu_s2mini", "servo_header_strip"], wires: ["sig_1", "sig_2", "sig_4", "sig_6", "sig_8", "sig_10", "sig_13", "sig_14"], basis: "repo", source: "wiring guide: Data Lines + diagram"},
    {id: "s_power", title: "Battery, switch, buck", instruction: "Battery + goes through the rocker switch to the buck IN+; battery - to IN-. Set the buck to 5 V. Leave the switch un-soldered until the frame install (build guide warning).", components: ["battery", "power_switch", "buck_converter"], wires: ["pw_bat_sw", "pw_sw_buck", "pw_bat_gnd"], basis: "repo", source: "diagram + build guide Phase 2 warning"},
    {id: "s_rails5", title: "Buck to the rails", instruction: "Buck OUT+ to the 5 V rail, OUT- to the GND rail. The S2 Mini is powered from the rails on its VBUS and GND pins.", components: ["buck_converter", "servo_header_strip", "mcu_s2mini"], wires: ["pw_buck_5v", "pw_buck_gnd", "pw_vbus", "pw_mcu_gnd"], basis: "repo", source: "diagram"},
    {id: "s_oledwire", title: "OLED wiring", instruction: "OLED VCC to the 5 V rail, GND to the GND rail, SDA to GPIO33 and SCL to GPIO35 (I2C 0x3C). Check SDA/SCL are not swapped.", components: ["oled"], wires: ["pw_oled_vcc", "pw_oled_gnd", "i2c_sda", "i2c_scl"], basis: "repo", source: "diagram + firmware I2C_SDA 33 / I2C_SCL 35"},
    {id: "s_hips", title: "Pre-load the hip joints", instruction: "Phase 3: press a one-sided servo horn into each of the four hip joints R1, R2, L1, L2 and screw it in with an M2x5 self-threading screw. Do NOT mount them on servos yet.", components: ["joint_r1", "joint_r2", "joint_l1", "joint_l2"], wires: [], basis: "repo", source: "build guide: Hip Joints"},
    {id: "s_legs", title: "Legs over their motors", instruction: "Slide each leg piece R3, R4, L3, L4 over its servo (shaft at the top) and screw it in. Route the wires through the side slot.", components: ["joint_r3", "joint_r4", "joint_l3", "joint_l4", "servo_r3", "servo_r4", "servo_l3", "servo_l4"], wires: [], basis: "repo", source: "build guide: Leg Joints"},
    {id: "s_cover", title: "Top cover: switch + OLED", instruction: "Press the rocker switch into the back slot of the top cover (do not connect yet). Solder the OLED wires, push the display into its front slot and clamp it with two screws.", components: ["top_cover_cat", "power_switch", "oled"], wires: [], basis: "repo", source: "build guide: Top Cover & Soldering"},
    {id: "s_frame", title: "Battery holder + side motors", instruction: "Phase 4: insert the battery holder into the back of the frame, then press in the four side servos R1, R2, L1, L2 (shafts toward the outside) and screw them in.", components: ["frame", "battery", "servo_r1", "servo_r2", "servo_l1", "servo_l2"], wires: [], basis: "repo", source: "build guide: Hardware Main Assembly"},
    {id: "s_main", title: "Main electronics", instruction: "Lower the harness into the cavity with the USB port toward the rear. Screw the S2 Mini (and protoboard) to the frame. Calibrate with sesame-motor-tester: all motors to 90 degrees, then fit the joints.", components: ["mcu_s2mini", "servo_header_strip", "buck_converter", "joint_r1", "joint_l1"], wires: [], basis: "repo", source: "build guide: Installing Main Electronics, Calibrating"},
    {id: "s_close", title: "Cover and finish", instruction: "Route and zip-tie the wires, press the top cover on gently, screw it down, add the bottom cover. Flash the firmware and test in the portal.", components: ["top_cover_cat", "bottom_cover"], wires: [], basis: "repo", source: "build guide: Final Wiring and Top Cover, Bottom Cover"},
  ] as StepDef[],

  // Test Lab: sequences ported from firmware/movement-sequences.h. Faces from face-bitmaps.h. Angles in degrees.
  lab: {
    simLabel: "SIMULATED - no hardware",
    walkCycles: 3, // firmware default 10; shortened for the sim
    motorDegPerS: 420, // illustrative servo speed in the sim
    commands: buildCommands(),
  },

  // Virtual wiring validator (separate from the Test Lab). Not a physical test.
  validation: {
    expected: [] as string[],
    distractors: [
      {id: "x_sda_swap", label: "SDA to 35", from: {component: "mcu_s2mini", pin: "GPIO35"}, to: {component: "oled", pin: "SDA"}, explanation: "Not in the pack: SDA is GPIO33 and SCL is GPIO35 (SDA/SCL swapped)."},
      {id: "x_bat_direct", label: "Battery to rail", from: {component: "battery", pin: "+"}, to: {component: "servo_header_strip", pin: "5V_R"}, explanation: "Not in the pack: the battery must go through the switch and the buck converter, never straight to the 5 V rail."},
      {id: "x_servo_pin3", label: "R1 to GPIO3", from: {component: "mcu_s2mini", pin: "GPIO39"}, to: {component: "servo_header_strip", pin: "S1"}, explanation: "Not in the pack: slot 1 (servo R1) is GPIO1."},
    ] as DistractorDef[],
    disclaimer: "Virtual check only against the project pack - NOT a physical test. A virtual pass does not prove a real robot works.",
  },

  // VISUALIZE mode: rule-based fit check of the real component sizes inside a model's interior (NOT AI, virtual only).
  // Sizes are standard sizes (not from the repo) in the ROBOT frame: x = width, y = height, z = depth (front = +z).
  visualize: {
    scale: 1.8, // how much the (small) model is enlarged on the desk so the boxes are readable
    wallCm: 0.25, // ESTIMATED wall thickness subtracted from a user model's bounding box to get its interior
    leadReachCm: 8, // ASSUMED reach of the OLED I2C leads in the simulated circuit test
    // Interior of the default Sesame body (Internal-Frame v121 + Cat top cover v100), ESTIMATED from the STL bounds:
    // width = frame inner area between the hip tabs, height = frame top (2.2) to the cover hood (~5.2), depth = frame length less walls.
    defaultCavity: {min: [-2.7, 2.2, -3.5] as V3, max: [2.7, 5.2, 3.5] as V3, basis: "estimated"},
    catalog: [
      {id: "battery", size: [3.0, 1.5, 5.4] as V3, rule: "low, toward the back"},
      {id: "buck_converter", size: [2.1, 1.4, 4.3] as V3, rule: "beside the battery"},
      {id: "mcu_s2mini", size: [2.54, 0.5, 3.43] as V3, rule: "near the display"},
      {id: "servo_header_strip", size: [2.8, 1.1, 1.4] as V3, rule: "front, next to the MCU"},
      {id: "power_switch", size: [2.1, 1.5, 1.4] as V3, rule: "top, back (top cover slot)", fixed: true},
      {id: "oled", size: [2.73, 2.73, 0.4] as V3, rule: "front face, high", fixed: true},
    ],
    servoNote: "8 x MG90S ~2.3 x 1.2 x 2.3 cm sit at the leg joints, not in the interior",
    test: {power: ["battery", "power_switch", "buck_converter", "servo_header_strip", "mcu_s2mini"], data: ["mcu_s2mini", "oled"], servo: ["servo_header_strip", "mcu_s2mini"]},
    demo: {parts: ["battery", "mcu_s2mini"], screw: "fx_m2x5_st", tool: "tool_ph0", hole: "h_top_l"},
    // Where each item prefers to sit, as fractions of the interior (x: 0 left .. 1 right, y: 0 floor .. 1 top, z: 0 back .. 1 front).
    prefer: {
      battery: [0.5, 0.0, 0.2] as V3,
      buck_converter: [0.15, 0.0, 0.75] as V3,
      mcu_s2mini: [0.5, 0.3, 0.7] as V3,
      servo_header_strip: [0.5, 0.45, 1.0] as V3,
      power_switch: [0.5, 1.0, 0.0] as V3,
      oled: [0.5, 0.85, 1.0] as V3,
    } as {[id: string]: V3},
    // A deliberately naive starting layout (items dropped on top of each other) so the red/green check has something to show.
    naive: {
      battery: [0.0, 2.95, -0.8] as V3,
      buck_converter: [0.4, 3.3, 0.4] as V3,
      mcu_s2mini: [-0.3, 3.0, -0.6] as V3,
      servo_header_strip: [0.0, 4.6, 1.6] as V3,
      power_switch: [0.0, 4.45, -2.8] as V3,
      oled: [0.0, 3.6, 3.3] as V3,
    } as {[id: string]: V3},
  },

  // SAO-style gesture menu (detected from SIK hand joints, tolerant thresholds; see WizHands.ts / README).
  gesture: {
    extendedRatio: 1.55, // |tip - wrist| / |knuckle - wrist| above this = finger extended
    curledRatio: 1.45, // below this = curled
    ringPinkyMargin: 0.2, // index/middle must beat ring/pinky by this ratio
    poseHoldS: 0.06, // pose must be held this long
    swipeDropCm: 4.5, // palm travel (cm) within the window
    swipeWindowS: 0.7,
    verticalDominance: 1.2, // |dy| must exceed |dx| * this
    debounceS: 1.0,
    autoOpenS: 3.0, // the menu also opens by itself this long after launch
    idleFadeS: 4.0, // hints fade when the hand is idle
    followSmooth: 0.18, // menu / held-item smoothing per frame (0..1)
  },

  // Generic guide pack (schema above). Sesame is the bundled demo; filled below from the components.
  guide: {
    schema: "3dwiz-pack/1",
    guideSource: {
      url: "https://github.com/soham0777/sesame-robot",
      license: "Apache-2.0",
      note: "Attach points/orientations are transcribed offline from docs/build-guide + docs/images; positions are illustrative.",
    },
    parts: [] as PartGuide[],
    screwHoles: [
      {id: "h_top_l", hostId: "frame", at: [2.9, 2.2, 3.2], dir: [0, -1, 0], type: "M2 self-tapping", diameterMm: 2.0, depthMm: 5, basis: "illustrative"},
      {id: "h_top_r", hostId: "frame", at: [-2.9, 2.2, 3.2], dir: [0, -1, 0], type: "M2 self-tapping", diameterMm: 2.0, depthMm: 5, basis: "illustrative"},
      {id: "h_bot", hostId: "frame", at: [0.0, 0.63, -3.3], dir: [0, 1, 0], type: "M2 self-tapping", diameterMm: 2.0, depthMm: 5, basis: "illustrative"},
      {id: "h_horn", hostId: "joint_r1", at: [-2.5, 3.9, 2.83], dir: [0, -1, 0], type: "M2.5 machine", diameterMm: 2.5, depthMm: 5, basis: "illustrative"},
    ] as ScrewHole[],
    fasteners: [
      {id: "m2x5_st", label: "M2x5", kind: "self-tapping", diameterMm: 2.0, lengthMm: 5, head: "phillips", driver: "ph0", color: [0.85, 0.87, 0.9, 1]},
      {id: "m25x5_m", label: "M2.5x5", kind: "machine", diameterMm: 2.5, lengthMm: 5, head: "phillips", driver: "ph1", color: [0.95, 0.8, 0.3, 1]},
      {id: "m3x8_m", label: "M3x8", kind: "machine", diameterMm: 3.0, lengthMm: 8, head: "phillips", driver: "ph1", color: [0.9, 0.5, 0.3, 1]},
      {id: "m2x12_st", label: "M2x12", kind: "self-tapping", diameterMm: 2.0, lengthMm: 12, head: "phillips", driver: "ph0", color: [0.6, 0.9, 0.9, 1]},
      {id: "standoff_m25", label: "Standoff", kind: "standoff", diameterMm: 2.5, lengthMm: 5, head: "none", driver: "hex2", color: [0.7, 0.55, 0.9, 1]},
    ] as FastenerDef[],
    tools: [
      {id: "ph0", label: "PH0", head: "phillips", size: "PH0"},
      {id: "ph1", label: "PH1", head: "phillips", size: "PH1"},
      {id: "hex2", label: "H2.0", head: "hex", size: "H2.0"},
    ] as ToolDef[],
  } as GuidePack,

  // VISUALIZE workbench extras: alternative servo stand-ins (STANDARD sizes, not from the repo).
  workbench: {
    altServos: [
      {id: "alt_sg90", label: "SG90", size: [1.22, 2.9, 2.25] as V3, color: [0.2, 0.45, 0.85, 1] as RGBA},
      {id: "alt_mg996r", label: "MG996R", size: [1.97, 4.29, 4.07] as V3, color: [0.35, 0.35, 0.45, 1] as RGBA},
    ],
    holeToleranceMm: 0.15, // diameter match
    lengthSlackMm: 1.5, // screw may be this much shorter than the hole depth
    tightCm: 0.15, // clearance below this = amber
    screwVisualScale: 3, // fasteners are drawn this much bigger than real so they can be grabbed
  },

  rig: {mode: "sesame", acts: []},
  plan: {},
  quests: [],
  names: {
    frame: "Frame", bottom_cover: "Bottom cover", top_cover_cat: "Top cover", mcu_s2mini: "S2 Mini", buck_converter: "Buck",
    battery: "Battery", power_switch: "Switch", servo_header_strip: "Header strip", oled: "OLED",
  },
}

// ------------------------------------------------------------------------------------------------------------------
function buildConnections(): ConnectionDef[] {
  const RED: RGBA = [1.0, 0.18, 0.15, 1]
  const BLK: RGBA = [0.12, 0.12, 0.14, 1]
  const YEL: RGBA = [1.0, 0.78, 0.2, 1]
  const BLUE: RGBA = [0.2, 0.62, 1.0, 1]
  const GRN: RGBA = [0.35, 0.9, 0.3, 1]
  const GRAY: RGBA = [0.7, 0.55, 0.45, 1]
  const out: ConnectionDef[] = [
    {id: "pw_bat_sw", group: "power", from: {component: "battery", pin: "+"}, to: {component: "power_switch", pin: "A"}, label: "Bat+ > switch", explanation: "Battery +Ve goes into the rocker switch first (diagram: red wire from +Ve up to the switch).", color: RED, lift: 1.6},
    {id: "pw_sw_buck", group: "power", from: {component: "power_switch", pin: "B"}, to: {component: "buck_converter", pin: "IN+"}, label: "Switch > IN+", explanation: "The switched positive goes to the buck converter IN+ pad.", color: RED, lift: 2.0},
    {id: "pw_bat_gnd", group: "power", from: {component: "battery", pin: "-"}, to: {component: "buck_converter", pin: "IN-"}, label: "Bat- > IN-", explanation: "Battery -Ve goes straight to the buck converter IN- pad (black wire).", color: BLK, lift: 0.9},
    {id: "pw_buck_5v", group: "power", from: {component: "buck_converter", pin: "OUT+"}, to: {component: "servo_header_strip", pin: "5V_R"}, label: "OUT+ > 5V rail", explanation: "Buck OUT+ (set to 5 V) feeds the 5 V rail: the middle pin of every servo header.", color: RED, lift: 1.4},
    {id: "pw_buck_gnd", group: "power", from: {component: "buck_converter", pin: "OUT-"}, to: {component: "servo_header_strip", pin: "GND_R"}, label: "OUT- > GND rail", explanation: "Buck OUT- feeds the GND rail: the outer pin of every servo header.", color: BLK, lift: 0.7},
    {id: "pw_vbus", group: "power", from: {component: "mcu_s2mini", pin: "VBUS"}, to: {component: "servo_header_strip", pin: "5V_L"}, label: "VBUS < 5V rail", explanation: "The S2 Mini is powered from the 5 V rail on its VBUS pin (red wire in the diagram).", color: RED, lift: 1.1},
    {id: "pw_mcu_gnd", group: "power", from: {component: "mcu_s2mini", pin: "GND"}, to: {component: "servo_header_strip", pin: "GND_L"}, label: "MCU GND", explanation: "S2 Mini GND to the GND rail (black wire in the diagram).", color: BLK, lift: 0.5},
    {id: "pw_oled_vcc", group: "power", from: {component: "oled", pin: "VCC"}, to: {component: "servo_header_strip", pin: "5V_R"}, label: "OLED VCC", explanation: "OLED VCC from the 5 V rail (red wire in the diagram).", color: RED, lift: 1.8},
    {id: "pw_oled_gnd", group: "power", from: {component: "oled", pin: "GND"}, to: {component: "servo_header_strip", pin: "GND_R"}, label: "OLED GND", explanation: "OLED GND from the GND rail (black wire in the diagram).", color: BLK, lift: 0.4},
    {id: "i2c_sda", group: "i2c", from: {component: "mcu_s2mini", pin: "GPIO33"}, to: {component: "oled", pin: "SDA"}, label: "SDA 33", explanation: "I2C data: S2 Mini GPIO33 to OLED SDA (blue wire). Firmware I2C_SDA 33, OLED address 0x3C.", color: BLUE, lift: 2.4},
    {id: "i2c_scl", group: "i2c", from: {component: "mcu_s2mini", pin: "GPIO35"}, to: {component: "oled", pin: "SCL"}, label: "SCL 35", explanation: "I2C clock: S2 Mini GPIO35 to OLED SCL (green wire). Firmware I2C_SCL 35.", color: GRN, lift: 2.8},
  ]
  for (let i = 0; i < SERVO_MAP.length; i++) {
    const s = SERVO_MAP[i]
    out.push({
      id: "sig_" + s.gpio, group: "servo", from: {component: "mcu_s2mini", pin: "GPIO" + s.gpio}, to: {component: "servo_header_strip", pin: "S" + s.slot},
      label: "GPIO" + s.gpio + " > " + s.name, explanation: "Servo " + s.name + " signal: S2 Mini GPIO" + s.gpio + " to header slot " + s.slot + " (yellow data line). Firmware servoPins[" + s.idx + "] = " + s.gpio + ".",
      color: YEL, lift: 0.6 + i * 0.16,
    })
  }
  for (let i = 0; i < SERVO_MAP.length; i++) {
    const s = SERVO_MAP[i]
    out.push({
      id: "plug_" + s.name.toLowerCase(), group: "plug", from: {component: "servo_" + s.name.toLowerCase(), pin: "PLUG"}, to: {component: "servo_header_strip", pin: "S" + s.slot},
      label: s.name + " plug > slot " + s.slot, explanation: "Servo " + s.name + " plugs into header slot " + s.slot + " (brown wire on the GND pin, signal on the third pin).", color: GRAY, lift: 0.5 + i * 0.1,
    })
  }
  return out
}

function buildCommands(): CommandDef[] {
  const stand = (face?: string): MoveStep => ({ang: {R1: 135, R2: 45, L1: 45, L2: 135, R4: 0, R3: 180, L3: 0, L4: 180}, wait: 250, face: face})
  const cmds: CommandDef[] = []
  const add = (id: string, label: string, face: string, mode: "loop" | "once" | "boomerang", steps: MoveStep[], basis: string) =>
    cmds.push({id: id, label: label, face: face, mode: mode, steps: steps, basis: basis})
  const ST: MoveStep = stand()
  const ENDSTAND: MoveStep = {ang: ST.ang, wait: 300, face: "idle", mode: "boomerang"}
  add("stand", "Stand", "stand", "once", [{ang: ST.ang, wait: 600}, {wait: 0, face: "idle", mode: "boomerang"}], "runStandPose: face stand (ONCE) then idle")
  add("rest", "Rest", "rest", "boomerang", [{ang: {R1: 90, R2: 90, L1: 90, L2: 90, R3: 90, R4: 90, L3: 90, L4: 90}, wait: 800}], "runRestPose: all servos 90, face rest (BOOMERANG)")
  add("walk", "Walk", "walk", "once", [
    {ang: {R3: 135, L3: 45, R2: 100, L1: 25}, wait: 200},
    {ang: {R3: 135, L3: 0}, wait: 200},
    {ang: {L4: 135, L2: 90, R4: 0, R1: 180}, wait: 200},
    {ang: {R2: 45, L1: 90}, wait: 200},
    {ang: {R4: 45, L4: 180}, wait: 200},
    {ang: {R3: 180, L3: 45, R2: 90, L1: 0}, wait: 200},
    {ang: {L2: 135, R1: 90}, wait: 200},
    {ang: {R3: 135, L3: 0}, wait: 200},
    {ang: {L4: 135, L2: 90, R4: 0, R1: 180}, wait: 200},
    {ang: {R2: 45, L1: 90}, wait: 200},
    {ang: {R4: 45, L4: 180}, wait: 200},
    {ang: {R3: 180, L3: 45, R2: 90, L1: 0}, wait: 200},
    {ang: {L2: 135, R1: 90}, wait: 200},
    ENDSTAND,
  ], "runWalkPose (3 of 10 cycles in the sim)")
  add("back", "Walk back", "walk", "once", [
    {ang: {R3: 135, L3: 0}, wait: 200},
    {ang: {L4: 135, L2: 135, R4: 0, R1: 90}, wait: 200},
    {ang: {R2: 90, L1: 0}, wait: 200},
    {ang: {R4: 45, L4: 180}, wait: 200},
    {ang: {R3: 180, L3: 45, R2: 45, L1: 90}, wait: 200},
    {ang: {L2: 90, R1: 180}, wait: 200},
    {ang: {R3: 135, L3: 0}, wait: 200},
    {ang: {L4: 135, L2: 135, R4: 0, R1: 90}, wait: 200},
    {ang: {R2: 90, L1: 0}, wait: 200},
    {ang: {R4: 45, L4: 180}, wait: 200},
    {ang: {R3: 180, L3: 45, R2: 45, L1: 90}, wait: 200},
    {ang: {L2: 90, R1: 180}, wait: 200},
    ENDSTAND,
  ], "runWalkBackward (3 cycles)")
  add("left", "Turn left", "walk", "once", [
    {ang: {R3: 135, L4: 135}, wait: 150}, {ang: {R1: 180, L2: 180}, wait: 150}, {ang: {R3: 180, L4: 180}, wait: 150}, {ang: {R1: 135, L2: 135}, wait: 150},
    {ang: {R4: 45, L3: 45}, wait: 150}, {ang: {R2: 90, L1: 90}, wait: 150}, {ang: {R4: 0, L3: 0}, wait: 150}, {ang: {R2: 45, L1: 45}, wait: 150},
    {ang: {R3: 135, L4: 135}, wait: 150}, {ang: {R1: 180, L2: 180}, wait: 150}, {ang: {R3: 180, L4: 180}, wait: 150}, {ang: {R1: 135, L2: 135}, wait: 150},
    ENDSTAND,
  ], "runTurnLeft (2 cycles)")
  add("right", "Turn right", "walk", "once", [
    {ang: {R4: 45, L3: 45}, wait: 150}, {ang: {R2: 0, L1: 0}, wait: 150}, {ang: {R4: 0, L3: 0}, wait: 150}, {ang: {R2: 45, L1: 45}, wait: 150},
    {ang: {R3: 135, L4: 135}, wait: 150}, {ang: {R1: 90, L2: 90}, wait: 150}, {ang: {R3: 180, L4: 180}, wait: 150}, {ang: {R1: 135, L2: 135}, wait: 150},
    {ang: {R4: 45, L3: 45}, wait: 150}, {ang: {R2: 0, L1: 0}, wait: 150}, {ang: {R4: 0, L3: 0}, wait: 150}, {ang: {R2: 45, L1: 45}, wait: 150},
    ENDSTAND,
  ], "runTurnRight (2 cycles)")
  add("wave", "Wave", "wave", "once", [
    ST, {ang: {R4: 80, L3: 180, L2: 90, R1: 100}, wait: 200}, {ang: {L3: 180}, wait: 300},
    {ang: {L3: 100}, wait: 300}, {ang: {L3: 180}, wait: 300}, {ang: {L3: 100}, wait: 300}, {ang: {L3: 180}, wait: 300}, {ang: {L3: 100}, wait: 300},
    ENDSTAND,
  ], "runWavePose")
  add("dance", "Dance", "dance", "loop", [
    {ang: {R1: 90, R2: 90, L1: 90, L2: 90, R4: 160, R3: 160, L3: 10, L4: 10}, wait: 300},
    {ang: {R4: 115, R3: 115, L3: 10, L4: 10}, wait: 300}, {ang: {R4: 160, R3: 160, L3: 65, L4: 65}, wait: 300},
    {ang: {R4: 115, R3: 115, L3: 10, L4: 10}, wait: 300}, {ang: {R4: 160, R3: 160, L3: 65, L4: 65}, wait: 300},
    {ang: {R4: 115, R3: 115, L3: 10, L4: 10}, wait: 300}, {ang: {R4: 160, R3: 160, L3: 65, L4: 65}, wait: 300},
    ENDSTAND,
  ], "runDancePose (3 of 5 repeats)")
  add("swim", "Swim", "swim", "once", [
    {ang: {R1: 90, R2: 90, L1: 90, L2: 90, R3: 90, R4: 90, L3: 90, L4: 90}, wait: 200},
    {ang: {R1: 135, R2: 45, L1: 45, L2: 135}, wait: 400}, {ang: {R1: 90, R2: 90, L1: 90, L2: 90}, wait: 400},
    {ang: {R1: 135, R2: 45, L1: 45, L2: 135}, wait: 400}, {ang: {R1: 90, R2: 90, L1: 90, L2: 90}, wait: 400},
    ENDSTAND,
  ], "runSwimPose (2 of 4 repeats)")
  add("point", "Point", "point", "boomerang", [
    {ang: {L2: 90, R1: 135, R2: 100, L4: 180, L1: 25, L3: 145, R4: 80, R3: 170}, wait: 2000},
    ENDSTAND,
  ], "runPointPose")
  add("pushup", "Pushup", "pushup", "once", [
    ST, {ang: {L1: 0, R1: 180, L3: 90, R3: 90}, wait: 500},
    {ang: {L3: 0, R3: 180}, wait: 600}, {ang: {L3: 90, R3: 90}, wait: 500},
    {ang: {L3: 0, R3: 180}, wait: 600}, {ang: {L3: 90, R3: 90}, wait: 500},
    ENDSTAND,
  ], "runPushupPose (2 of 4 repeats)")
  add("bow", "Bow", "bow", "once", [
    ST, {ang: {L1: 0, R1: 180, L3: 0, R3: 180, L2: 180, R2: 0, R4: 0, L4: 180}, wait: 600},
    {ang: {L3: 90, R3: 90}, wait: 1500},
    ENDSTAND,
  ], "runBowPose")
  add("cute", "Cute", "cute", "once", [
    ST, {ang: {L2: 160, R2: 20, R4: 180, L4: 0, L1: 0, R1: 180, L3: 180, R3: 0}, wait: 200},
    {ang: {R4: 180, L4: 45}, wait: 300}, {ang: {R4: 135, L4: 0}, wait: 300}, {ang: {R4: 180, L4: 45}, wait: 300}, {ang: {R4: 135, L4: 0}, wait: 300},
    ENDSTAND,
  ], "runCutePose (2 of 5 repeats)")
  add("freaky", "Freaky", "freaky", "once", [
    ST, {ang: {L1: 0, R1: 180, L2: 180, R2: 0, R4: 90, R3: 0}, wait: 200},
    {ang: {R3: 25}, wait: 400}, {ang: {R3: 0}, wait: 400}, {ang: {R3: 25}, wait: 400}, {ang: {R3: 0}, wait: 400},
    ENDSTAND,
  ], "runFreakyPose (2 of 3 repeats)")
  add("worm", "Worm", "worm", "once", [
    ST, {ang: {R1: 180, R2: 0, L1: 0, L2: 180, R4: 90, R3: 90, L3: 90, L4: 90}, wait: 200},
    {ang: {R3: 45, L3: 135, R4: 45, L4: 135}, wait: 300}, {ang: {R3: 135, L3: 45, R4: 135, L4: 45}, wait: 300},
    {ang: {R3: 45, L3: 135, R4: 45, L4: 135}, wait: 300}, {ang: {R3: 135, L3: 45, R4: 135, L4: 45}, wait: 300},
    ENDSTAND,
  ], "runWormPose (2 of 5 repeats)")
  add("shake", "Shake", "shake", "once", [
    ST, {ang: {R1: 135, L1: 45, L3: 90, R3: 90, L2: 90, R2: 90}, wait: 200},
    {ang: {R4: 45, L4: 135}, wait: 300}, {ang: {R4: 0, L4: 180}, wait: 300}, {ang: {R4: 45, L4: 135}, wait: 300}, {ang: {R4: 0, L4: 180}, wait: 300},
    ENDSTAND,
  ], "runShakePose (2 of 5 repeats)")
  add("shrug", "Shrug", "dead", "once", [
    ST, {ang: {R3: 90, R4: 90, L3: 90, L4: 90}, wait: 1000},
    {ang: {R3: 0, R4: 180, L3: 180, L4: 0}, wait: 1500, face: "shrug", mode: "once"},
    ENDSTAND,
  ], "runShrugPose: face dead, then shrug")
  add("dead", "Dead", "dead", "boomerang", [
    ST, {ang: {R3: 90, R4: 90, L3: 90, L4: 90}, wait: 600},
  ], "runDeadPose (no stand afterwards)")
  add("crab", "Crab", "crab", "once", [
    ST, {ang: {R1: 90, R2: 90, L1: 90, L2: 90, R4: 0, R3: 180, L3: 45, L4: 135}, wait: 200},
    {ang: {R4: 45, R3: 135, L3: 0, L4: 180}, wait: 300}, {ang: {R4: 0, R3: 180, L3: 45, L4: 135}, wait: 300},
    {ang: {R4: 45, R3: 135, L3: 0, L4: 180}, wait: 300}, {ang: {R4: 0, R3: 180, L3: 45, L4: 135}, wait: 300},
    ENDSTAND,
  ], "runCrabPose (2 of 5 repeats)")
  return cmds
}

// validation.expected = every drawn wire except the servo plugs
;(SESAME_PACK.validation.expected as string[]).push(
  ...SESAME_PACK.connections.filter((c) => c.group !== "plug").map((c) => c.id),
)

// Build plan: per repo build step, a 1-3 word title and the parts the user places in the robot (first = the one picked up,
// the rest snap in with it). Steps with no parts are wiring steps (the user connects that step's wires on the bench).
const SESAME_PLAN: {[stepId: string]: PlanStep} = {
  s_print: {title: "Frame", place: ["frame"]},
  s_rails: {title: "Header strip", place: ["servo_header_strip"]},
  s_data: {title: "Data wires", place: []},
  s_power: {title: "Power wires", place: []},
  s_rails5: {title: "Buck wires", place: []},
  s_oledwire: {title: "OLED wires", place: []},
  s_hips: {title: "Hip joints", place: ["joint_r1", "joint_r2", "joint_l1", "joint_l2"]},
  s_legs: {title: "Legs", place: ["joint_r3", "joint_r4", "joint_l3", "joint_l4", "servo_r3", "servo_r4", "servo_l3", "servo_l4"]},
  s_cover: {title: "Display", place: ["oled", "power_switch"]},
  s_frame: {title: "Battery + servos", place: ["battery", "servo_r1", "servo_r2", "servo_l1", "servo_l2"]},
  s_main: {title: "Brain", place: ["mcu_s2mini", "buck_converter"]},
  s_close: {title: "Covers", place: ["bottom_cover", "top_cover_cat"]},
}

export function shortName(id: string): string {
  const f = PROJECT_PACK.names[id]
  if (f !== undefined) return f
  if (id.indexOf("joint_") === 0) return "Joint " + id.substr(6).toUpperCase()
  if (id.indexOf("servo_") === 0) return "Servo " + id.substr(6).toUpperCase()
  return id
}

/** One short line about a part (first sentence of the purpose, at most ~64 characters). */
export function blurb(id: string): string {
  const p = getComponent(id).purpose
  const first = p.split(". ")[0]
  return first.length > 64 ? first.substr(0, 61) + "..." : first
}

export type Pack = PackShape

export function getComponent(id: string): ComponentDef {
  const c = PROJECT_PACK.components.find((x) => x.id === id)
  if (!c) throw new Error("ProjectPack: unknown component " + id)
  return c
}

export function getConnection(id: string): ConnectionDef | undefined {
  return PROJECT_PACK.connections.find((x) => x.id === id)
}

export function getPin(componentId: string, pin: string): PinDef {
  const c = getComponent(componentId)
  const p = c.pins.find((x) => x.name === pin)
  if (!p) throw new Error("ProjectPack: no pin " + pin + " on " + componentId)
  return p
}

export function getCommand(id: string): CommandDef | undefined {
  return PROJECT_PACK.lab.commands.find((c) => c.id === id)
}

export function getPartGuide(id: string): PartGuide | undefined {
  return PROJECT_PACK.guide.parts.find((g) => g.partId === id)
}

// ---------------------------------------------------------------------------------------------------------------------
// Fill the guide pack for the bundled Sesame demo from the components + BUILD_PLAN + the repo build guide.
// (A generated pack from another guide has exactly this shape; see tools/pack-from-guide.md.)
;(function fillSesameGuide() {
  const GUIDE_URL = "https://github.com/soham0777/sesame-robot/blob/main/docs/build-guide/README.md"
  const ORIENT: {[id: string]: {text: string; face: string; dir: V3}} = {
    frame: {text: "notch front, USB back", face: "+Z notch", dir: [0, 0, 1]},
    bottom_cover: {text: "flat side down", face: "+Y", dir: [0, 1, 0]},
    top_cover_cat: {text: "ears up, window front", face: "+Z window", dir: [0, 0, 1]},
    mcu_s2mini: {text: "USB to the back", face: "-Z usb", dir: [0, 0, -1]},
    buck_converter: {text: "trimmer up", face: "+Y", dir: [0, 1, 0]},
    battery: {text: "wires up the slot", face: "-Z leads", dir: [0, 0, -1]},
    power_switch: {text: "rocker to the back", face: "-Z", dir: [0, 0, -1]},
    servo_header_strip: {text: "plugs face up", face: "+Y", dir: [0, 1, 0]},
    oled: {text: "screen to the front", face: "+Z screen", dir: [0, 0, 1]},
  }
  const stepOf = (id: string): string => {
    for (const k in SESAME_PLAN) if (SESAME_PLAN[k].place.indexOf(id) >= 0) return k
    return ""
  }
  const comps = SESAME_PACK.components
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i]
    let host = "frame"
    if (c.id === "frame") host = "body"
    else if (c.id === "oled" || c.id === "power_switch") host = "top_cover_cat"
    else if (c.servo && (c.servo.charAt(1) === "3" || c.servo.charAt(1) === "4")) host = "joint_" + c.servo.charAt(0).toLowerCase() + (c.servo.charAt(1) === "3" ? "1" : "2")
    const side = c.servo ? (c.servo.charAt(0) === "L" ? 1 : -1) : 0
    let o = ORIENT[c.id]
    if (!o) {
      if (c.kind === "printed" && c.group === "hip") o = {text: "horn side up", face: "+Y horn", dir: [0, 1, 0]}
      else if (c.kind === "printed") o = {text: "servo shaft at the top", face: "outward", dir: [side, 0, 0]}
      else if (c.group === "servo") o = {text: "shaft toward the outside", face: "shaft", dir: [side, 0, 0]}
      else o = {text: "as drawn", face: "+Y", dir: [0, 1, 0]}
    }
    const screws: string[] = []
    if (c.id === "top_cover_cat") screws.push("h_top_l", "h_top_r")
    if (c.id === "bottom_cover") screws.push("h_bot")
    if (c.id === "joint_r1") screws.push("h_horn")
    const st = stepOf(c.id)
    const step = SESAME_PACK.steps.find((x) => x.id === st)
    SESAME_PACK.guide.parts.push({
      partId: c.id,
      stepId: st,
      attach: {
        hostId: host,
        at: [c.assembled[0], c.assembled[1], c.assembled[2]],
        rot: c.assembledRot ? [c.assembledRot[0], c.assembledRot[1], c.assembledRot[2]] : [0, 0, 0],
        face: o.face,
        faceDir: o.dir,
        screws: screws,
      },
      orientation: o.text,
      source: {doc: "docs/build-guide/README.md", section: step ? step.source : "build guide", url: GUIDE_URL},
      tools: c.kind === "printed" ? ["ph0"] : c.group === "servo" ? ["ph0"] : [],
      basis: c.kind === "printed" ? "illustrative" : "illustrative",
    })
  }
})()

// Quests group the repo build steps (repo order is kept; each quest is a run of consecutive steps).
const SESAME_QUESTS: QuestDef[] = [
  {id: "q1", title: "Frame", steps: ["s_print", "s_rails"]},
  {id: "q2", title: "Wiring", steps: ["s_data", "s_power", "s_rails5", "s_oledwire"]},
  {id: "q3", title: "Servos", steps: ["s_hips", "s_legs", "s_cover", "s_frame"]},
  {id: "q4", title: "Life", steps: ["s_main", "s_close"]},
]

SESAME_PACK.plan = SESAME_PLAN
SESAME_PACK.quests = SESAME_QUESTS

/** The CURRENT project (loadPack swaps its contents). Starts as the bundled Sesame Quadruped. */
export const PROJECT_PACK: PackShape = {...SESAME_PACK}
/** Live views of the current pack's plan / quests (refilled by loadPack so importers keep working). */
export const BUILD_PLAN: {[stepId: string]: PlanStep} = {...SESAME_PLAN}
export const QUESTS: QuestDef[] = SESAME_QUESTS.slice()

/** Make `p` the current project. Every module reads PROJECT_PACK at call time, so a reload of the scene builders picks it up. */
export function loadPack(p: PackShape): void {
  const target = PROJECT_PACK as {[k: string]: any}
  for (const k in p) target[k] = (p as {[k: string]: any})[k]
  for (const k in BUILD_PLAN) delete BUILD_PLAN[k]
  for (const k in p.plan) BUILD_PLAN[k] = p.plan[k]
  QUESTS.length = 0
  for (let i = 0; i < p.quests.length; i++) QUESTS.push(p.quests[i])
}

export function questOf(stepId: string): number {
  for (let i = 0; i < QUESTS.length; i++) if (QUESTS[i].steps.indexOf(stepId) >= 0) return i
  return 0
}

/** Does any part of the current pack have an electrical model (CircuitSim)? Packs without one use verified-pin checking instead. */
export function hasSim(): boolean {
  for (const c of PROJECT_PACK.components) if (c.elec) return true
  return false
}
