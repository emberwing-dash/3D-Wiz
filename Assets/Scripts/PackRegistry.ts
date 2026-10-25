// PackRegistry.ts - the list of example projects and the "My Model" composer. One pack per project, same schema (3dwiz-pack/1).
// Owns: which projects exist (the Projects carousel is built from PACKS), how a project is loaded (loadProject), and My Model:
//       the user's imported model plus the electronics + circuit of one of the other projects as a template.
// Must not: contain engine code. Adding a project = write a Pack*.ts and add one line to PACKS.

import {PackShape, ComponentDef, SESAME_PACK, loadPack, V3, RGBA} from "./ProjectPack"
import {mk, box, finishPack} from "./PackKit"
import {makePetPack} from "./PackPet"
import {makeCarPack} from "./PackCar"
import {makeHandPack} from "./PackHand"
import {makeCircuitPack} from "./PackCircuit"
import {makeForrcPack} from "./PackForrc"
import {CardDef} from "./WizProjectCards"

export interface PackEntry {
  id: string
  name: string // card title, at most two words
  icon: string
  thumb: string
  accent: RGBA
  steps: number
  make: () => PackShape
}

export const TEMPLATE_IDS = ["sesame-quadruped", "esp32-pet", "obstacle-car", "servo-hand", "button-led", "forrc-car"]
export const MY_MODEL_ID = "my-model"
let myTemplate = "forrc-car"

export const PACKS: PackEntry[] = [
  {id: "sesame-quadruped", name: "Sesame Robot", icon: "pets", thumb: "sesame", accent: [1.0, 0.6, 0.2, 1], steps: 12, make: () => SESAME_PACK},
  {id: "esp32-pet", name: "Desk Pet", icon: "smart_toy", thumb: "pet", accent: [0.35, 0.95, 1.0, 1], steps: 11, make: makePetPack},
  {id: "obstacle-car", name: "Obstacle Car", icon: "directions_car", thumb: "car", accent: [1.0, 0.85, 0.25, 1], steps: 10, make: makeCarPack},
  {id: "servo-hand", name: "Servo Hand", icon: "back_hand", thumb: "hand", accent: [0.75, 0.6, 1.0, 1], steps: 11, make: makeHandPack},
  {id: "forrc-car", name: "RC Car", icon: "directions_car", thumb: "forrc", accent: [0.3, 0.6, 1.0, 1], steps: 11, make: makeForrcPack},
  {id: "button-led", name: "Button LED", icon: "lightbulb", thumb: "circuit", accent: [1.0, 0.4, 0.4, 1], steps: 9, make: makeCircuitPack},
  {id: MY_MODEL_ID, name: "My Model", icon: "upload_file", thumb: "mine", accent: [0.5, 1.0, 0.7, 1], steps: 0, make: () => makeMyModelPack(myTemplate)},
]

export function packEntry(id: string): PackEntry | null {
  for (let i = 0; i < PACKS.length; i++) if (PACKS[i].id === id) return PACKS[i]
  return null
}

export function cardDefs(): CardDef[] {
  return PACKS.map((p) => ({id: p.id, name: p.name, icon: p.icon, thumb: p.thumb, accent: p.accent, steps: p.steps}))
}

export function currentTemplate(): string {
  return myTemplate
}

/** Next circuit template for My Model (cycles through the five projects). */
export function nextTemplate(): string {
  const i = TEMPLATE_IDS.indexOf(myTemplate)
  myTemplate = TEMPLATE_IDS[(i + 1) % TEMPLATE_IDS.length]
  return myTemplate
}

export function setTemplate(id: string) {
  if (TEMPLATE_IDS.indexOf(id) >= 0) myTemplate = id
}

/** Build + activate a project's pack. Returns it (or null for an unknown id). */
export function activateProject(id: string, template?: string): PackShape | null {
  const e = packEntry(id)
  if (!e) return null
  if (template) setTemplate(template)
  const p = e.make()
  loadPack(p)
  return p
}

/** My Model: the user's imported model on the desk + the electronics, wires and checks of a template project to test-fit and attach. */
export function makeMyModelPack(templateId: string): PackShape {
  const t = packEntry(templateId) ? (packEntry(templateId) as PackEntry).make() : makePetPack()
  const keep: {[id: string]: boolean} = {}
  for (let i = 0; i < t.visualize.catalog.length; i++) keep[t.visualize.catalog[i].id] = true
  for (let i = 0; i < t.connections.length; i++) {
    keep[t.connections[i].from.component] = true
    keep[t.connections[i].to.component] = true
  }
  const comps: ComponentDef[] = [
    mk({
      id: "usermodel", name: "My model", model: "user", kind: "printed", group: "body", color: [0.72, 0.75, 0.82, 1], assembled: [0, 0, 0], sizeCm: [10, 6, 8], sizeBasis: "illustrative",
      exploded: [0, 0, 0], outward: true,
      purpose: "Your own 3D model (imported with tools/import-model.md). Its size and interior are measured from the real meshes.",
      notes: ["Assigned in the Inspector as the userModel input; a placeholder block is shown until then."],
    }),
  ]
  for (let i = 0; i < t.components.length; i++) {
    const c = t.components[i]
    if (c.group === "prop" || !keep[c.id]) continue
    if (c.kind !== "electronic") continue
    comps.push({...c, deskHidden: true})
  }
  const place = {...t.placement, modelScale: 1, desk: [0, -12, -60] as V3}
  const shellPrims = [
    box([0, 0.15, 0], [12, 0.3, 9], [0.72, 0.75, 0.82, 1], undefined, undefined, "floor"),
    box([-5.875, 2.4, 0], [0.25, 4.2, 9], [0.72, 0.75, 0.82, 1], undefined, undefined, "wallL"),
    box([5.875, 2.4, 0], [0.25, 4.2, 9], [0.72, 0.75, 0.82, 1], undefined, undefined, "wallR"),
    box([0, 2.4, -4.375], [12, 4.2, 0.25], [0.72, 0.75, 0.82, 1], undefined, undefined, "wallB"),
  ]
  const p: PackShape = {
    ...t,
    identity: {
      ...t.identity, id: MY_MODEL_ID, name: "My Model", subtitle: "Your model + " + t.identity.name + " circuit", short: "My Model", icon: "upload_file",
      source: "Your model + the " + t.identity.short + " circuit template", credit: t.identity.credit, license: t.identity.license,
      sourceNote: "Template circuit: " + t.identity.name + ". The model is yours.", hasOled: false,
    },
    notSpecified: ["Your model's interior is ESTIMATED from its bounding box minus a wall allowance", "Component sizes are standard sizes from the template project"].concat(t.notSpecified.slice(0, 2)),
    placement: place,
    components: comps,
    steps: [],
    plan: {},
    quests: [],
    lab: {...t.lab, commands: [], pages: [], icons: {}},
    visualize: {
      ...t.visualize,
      scale: Math.min(t.visualize.scale, 1.6),
      defaultCavity: {min: [-5.75, 0.3, -4.25] as V3, max: [5.75, 4.3, 4.25] as V3, basis: "placeholder"},
      shell: shellPrims,
      demo: {parts: t.visualize.demo ? t.visualize.demo.parts : [], screw: "fx_m2x5_st", tool: "tool_ph0", hole: "h_a"},
    },
    guide: {
      schema: "3dwiz-pack/1",
      guideSource: {url: "", license: t.identity.license, note: "Your model + the " + t.identity.name + " circuit. Screws are the standard hobby set (M2 / M2.5 / M3) with two illustrative holes in the interior."},
      parts: [],
      screwHoles: [],
      fasteners: SESAME_PACK.guide.fasteners.slice(0, 3),
      tools: SESAME_PACK.guide.tools.slice(0, 2),
    },
    workbench: {...t.workbench, altServos: SESAME_PACK.workbench.altServos},
    rig: {mode: "generic", acts: []},
    names: {...t.names, usermodel: "My model"},
  }
  return finishPack(p)
}
