// WizLeafPacks.ts - LEAF c8: every pack passes an integrity check (pure data, nothing is loaded): wire endpoints reference existing parts and
// pins, every step target exists, every part is placed in exactly one step, quests cover the steps in order, rigs / commands / the
// workbench / the guide pack resolve, and each pack records its source, licence and what the source does NOT specify.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {PackShape, SERVO_MAP} from "./ProjectPack"
import {PACKS, packEntry, MY_MODEL_ID, TEMPLATE_IDS, makeMyModelPack} from "./PackRegistry"
import {check} from "./WizLeafHelpers"

function refCheck(p: PackShape, label: string) {
  const comp: {[id: string]: boolean} = {}
  const pins: {[k: string]: boolean} = {}
  for (const c of p.components) {
    check(!comp[c.id], label + ": duplicate component " + c.id)
    comp[c.id] = true
    for (const pn of c.pins) pins[c.id + "." + pn.name] = true
  }
  // wires
  const wires: {[id: string]: boolean} = {}
  for (const w of p.connections) {
    check(!wires[w.id], label + ": duplicate wire " + w.id)
    wires[w.id] = true
    check(comp[w.from.component] === true && pins[w.from.component + "." + w.from.pin] === true, label + ": wire " + w.id + " start " + w.from.component + "." + w.from.pin + " exists")
    check(comp[w.to.component] === true && pins[w.to.component + "." + w.to.pin] === true, label + ": wire " + w.id + " end " + w.to.component + "." + w.to.pin + " exists")
    check(w.explanation.length > 0 && w.label.length > 0, label + ": wire " + w.id + " is explained")
  }
  // distractors point at real pins too
  for (const d of p.validation.distractors) {
    check(pins[d.from.component + "." + d.from.pin] === true && pins[d.to.component + "." + d.to.pin] === true, label + ": distractor " + d.id + " endpoints exist")
  }
  // steps + plan
  const placed: {[id: string]: number} = {}
  const stepIds: string[] = []
  for (const s of p.steps) {
    stepIds.push(s.id)
    check(!!p.plan[s.id], label + ": step " + s.id + " has a plan entry")
    for (const c of s.components) check(comp[c] === true, label + ": step " + s.id + " target " + c + " exists")
    for (const w of s.wires) check(wires[w] === true, label + ": step " + s.id + " wire " + w + " exists")
    for (const c of p.plan[s.id].place) {
      check(comp[c] === true, label + ": plan " + s.id + " places existing " + c)
      placed[c] = (placed[c] ? placed[c] : 0) + 1
    }
    check(p.plan[s.id].title.split(" ").length <= 3, label + ": step title at most 3 words: " + p.plan[s.id].title)
  }
  for (const c of p.components) {
    if (c.group === "prop" || c.deskHidden) continue // desk-hidden parts (bench / workbench only) are not part of the guided build
    check(placed[c.id] === 1, label + ": part " + c.id + " is placed in exactly one step (" + (placed[c.id] ? placed[c.id] : 0) + ")")
  }
  // every wire is made in exactly one step
  const made: {[id: string]: number} = {}
  for (const s of p.steps) for (const w of s.wires) made[w] = (made[w] ? made[w] : 0) + 1
  for (const w of p.connections) if (w.group !== "plug") check(made[w.id] === 1, label + ": wire " + w.id + " is made in exactly one step")
  // quests
  const flat: string[] = []
  for (const q of p.quests) for (const s of q.steps) flat.push(s)
  expect(flat.join(",")).toBe(stepIds.join(","))
  expect(p.quests.length).toBe(4)
  // rig
  const actNames: {[n: string]: boolean} = {}
  if (p.rig.mode === "generic") {
    for (const a of p.rig.acts) {
      actNames[a.name] = true
      for (const e of a.els) {
        if (e.part === "*") continue
        check(comp[e.part] === true, label + ": act " + a.name + " moves existing " + e.part)
        if (e.grp) {
          const def = p.components.find((c) => c.id === e.part)
          check(!!def && !!def.groups && def.groups.some((g) => g.id === e.grp), label + ": act " + a.name + " group " + e.grp + " exists on " + e.part)
        }
      }
    }
  } else for (const s of SERVO_MAP) actNames[s.name] = true
  // commands
  const cmds: {[id: string]: boolean} = {}
  for (const c of p.lab.commands) {
    cmds[c.id] = true
    for (const st of c.steps) {
      if (st.ang) for (const k in st.ang) check(actNames[k] === true, label + ": command " + c.id + " drives a known actuator " + k)
      if (st.jump) for (const k in st.jump) check(actNames[k] === true, label + ": command " + c.id + " jumps a known actuator " + k)
    }
  }
  if (p.lab.pages) {
    for (const pg of p.lab.pages) for (const id of pg) {
      check(cmds[id] === true, label + ": page command " + id + " exists")
      check(!!(p.lab.icons && p.lab.icons[id]), label + ": page command " + id + " has an icon")
    }
  }
  // visualize + guide
  for (const c of p.visualize.catalog) check(comp[c.id] === true, label + ": catalogue part " + c.id + " exists")
  if (p.visualize.test) for (const id of p.visualize.test.power.concat(p.visualize.test.data, p.visualize.test.servo)) check(comp[id] === true, label + ": circuit-test part " + id + " exists")
  const dm = p.visualize.demo
  if (dm) for (const id of dm.parts) check(comp[id] === true, label + ": demo part " + id + " exists")
  const gp: {[id: string]: boolean} = {}
  for (const g of p.guide.parts) {
    gp[g.partId] = true
    check(comp[g.partId] === true, label + ": guide part " + g.partId + " exists")
    check(g.orientation.split(" ").length <= 6 && g.orientation.length > 0, label + ": orientation is short: " + g.orientation)
    check(g.source.url.indexOf("http") === 0, label + ": guide part " + g.partId + " names its source")
  }
  for (const c of p.components) if (c.group !== "prop") check(gp[c.id] === true, label + ": " + c.id + " has a guide entry")
  const holes: {[id: string]: boolean} = {}
  for (const h of p.guide.screwHoles) holes[h.id] = true
  for (const g of p.guide.parts) for (const sc of g.attach.screws) check(holes[sc] === true, label + ": screw hole " + sc + " exists")
  // provenance
  check(p.identity.source.length > 0 && p.identity.license.length > 0 && !!p.identity.url && (p.identity.url as string).indexOf("http") === 0, label + ": source + licence + url recorded")
  check(p.notSpecified.length > 0, label + ": records what is NOT specified by the source")
}

@component
export class WizLeafPacks extends Scenario {
  async run(): Promise<void> {
    await sleep(500)
    for (const e of PACKS) {
      if (e.id === MY_MODEL_ID) continue
      refCheck(e.make(), e.id)
    }
    // My Model for every template: the filtered electronics keep every wire endpoint, catalogue part and circuit-test part
    for (const t of TEMPLATE_IDS) {
      const p = makeMyModelPack(t)
      const comp: {[id: string]: {[pin: string]: boolean}} = {}
      for (const c of p.components) {
        comp[c.id] = {}
        for (const pn of c.pins) comp[c.id][pn.name] = true
      }
      check(!!comp["usermodel"], "my-model/" + t + ": the user model part exists")
      check(p.connections.length > 0, "my-model/" + t + ": has a circuit to attach")
      for (const w of p.connections) {
        check(!!comp[w.from.component] && comp[w.from.component][w.from.pin] === true, "my-model/" + t + ": wire " + w.id + " start exists")
        check(!!comp[w.to.component] && comp[w.to.component][w.to.pin] === true, "my-model/" + t + ": wire " + w.id + " end exists")
      }
      for (const c of p.visualize.catalog) check(!!comp[c.id], "my-model/" + t + ": catalogue part " + c.id + " exists")
      expect(p.steps.length).toBe(0)
    }
    check(PACKS.length >= 6, "five example projects + My Model are registered: " + PACKS.length)
  }
}

