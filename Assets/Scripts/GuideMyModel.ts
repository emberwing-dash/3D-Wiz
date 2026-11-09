// GuideMyModel.ts - the MY MODEL page: bring your own 3D model and your own circuit, and attach one to the other.
//   1 pick a 3D model (the RC car, the built-in samples, and everything you added to CircuitGuide > userModels)
//   2 pick a circuit (LED Starter, RC Car, and every KiCad file / circuit photo / video step list you added)
//   START BUILD puts the circuit parts on the model (and the breadboard) with the glowing-spot guide. CONVERT PHOTO reads the picture in
//   CircuitGuide > circuitPhoto with Gemini and adds the circuit it found to the list.
// Owns: the page objects, the two pickers, the status line. Must not: build the guide or touch the model (WizGuide does, through the callbacks).

import {PartKit} from "./WizParts"
import {rrect} from "./WizUI"
import {label, makeTap, wrap, TEXT_DIM, TEXT_LIGHT} from "./GuideKit"
import {CATALOGUE} from "./GuideVoice"

export interface MyModelHooks {
  modelNames(): string[]
  circuits(): {id: string; title: string; blurb: string}[]
  start(modelIndex: number, circuitId: string): void
  convertPhoto(): Promise<string>
  menu(): void
}

export class GuideMyModel {
  root: SceneObject
  private kit: PartKit
  private modelIdx = 0
  private circuitIdx = 0
  private modelLabel!: Text
  private modelSub!: Text
  private circuitLabel!: Text
  private circuitSub!: Text
  private status!: Text
  private startLabel!: Text
  private busy = false

  constructor(kit: PartKit, parent: SceneObject, private hooks: MyModelHooks) {
    this.kit = kit
    this.root = kit.obj(parent, "GuideMyModelRoot", [0, 0, -50])
    // everything sits on one dark plate so the page reads on any background
    rrect(this.root, "plate", 30, 35, 1.6, [0.05, 0.08, 0.13, 0.97], -0.2, {size: 0.16, color: [0.35, 0.95, 1, 0.9]})
    label(this.root, "title", "MY MODEL", 44, new vec3(0, 15.2, 0.3), TEXT_LIGHT, true)
    label(this.root, "sub", "bring your own 3D model and circuit", 18, new vec3(0, 12.9, 0.3), TEXT_DIM)
    // 1 model
    label(this.root, "h1", "1   PICK A 3D MODEL", 22, new vec3(0, 10.4, 0.3), new vec4(0.55, 1, 1, 1), true)
    this.arrow("m_prev", "<", -11.6, 7.2, () => this.stepModel(-1))
    this.arrow("m_next", ">", 11.6, 7.2, () => this.stepModel(1))
    rrect(this.kit.obj(this.root, "m_plate", [0, 7.2, 0]), "p", 17.2, 3.4, 1.2, [0.12, 0.26, 0.42, 0.97], 0, {size: 0.12, color: [0.5, 0.95, 1, 0.9]})
    this.modelLabel = label(this.root, "m_name", "", 28, new vec3(0, 7.4, 0.35), TEXT_LIGHT, true)
    this.modelSub = label(this.root, "m_sub", "", 15, new vec3(0, 4.9, 0.3), TEXT_DIM)
    // 2 circuit
    label(this.root, "h2", "2   PICK A CIRCUIT", 22, new vec3(0, 2.0, 0.3), new vec4(0.55, 1, 1, 1), true)
    this.arrow("c_prev", "<", -11.6, -1.2, () => this.stepCircuit(-1))
    this.arrow("c_next", ">", 11.6, -1.2, () => this.stepCircuit(1))
    rrect(this.kit.obj(this.root, "c_plate", [0, -1.2, 0]), "p", 17.2, 3.4, 1.2, [0.12, 0.26, 0.42, 0.97], 0, {size: 0.12, color: [0.5, 0.95, 1, 0.9]})
    this.circuitLabel = label(this.root, "c_name", "", 24, new vec3(0, -1.0, 0.35), TEXT_LIGHT, true)
    this.circuitSub = label(this.root, "c_sub", "", 15, new vec3(0, -3.5, 0.3), TEXT_DIM)
    // 3 go
    label(this.root, "h3", "3   ATTACH IT", 22, new vec3(0, -6.0, 0.3), new vec4(0.55, 1, 1, 1), true)
    const go = this.kit.obj(this.root, "go", [5.2, -9.0, 0])
    rrect(go, "p", 11.5, 3.4, 1.3, [0.1, 0.52, 0.3, 0.98], 0, {size: 0.16, color: [0.55, 1, 0.7, 1]})
    this.startLabel = label(go, "l", "START BUILD", 28, new vec3(0, 0, 0.35), TEXT_LIGHT, true)
    makeTap(this.kit.obj(go, "guide_mm_hit_start"), new vec3(12, 4, 2), () => this.start())
    const ph = this.kit.obj(this.root, "photo", [-6.4, -9.0, 0])
    rrect(ph, "p", 10.6, 3.4, 1.3, [0.18, 0.3, 0.5, 0.98], 0, {size: 0.14, color: [0.7, 0.9, 1, 0.95]})
    label(ph, "l", "CONVERT PHOTO", 21, new vec3(0, 0, 0.35), TEXT_LIGHT, true)
    makeTap(this.kit.obj(ph, "guide_mm_hit_photo"), new vec3(11, 4, 2), () => this.photo())
    // status + help + back
    this.status = label(this.root, "status", "", 16, new vec3(0, -12.2, 0.3), new vec4(1, 0.9, 0.5, 1), true)
    label(this.root, "help", wrap("Your own model: drop an FBX / GLB / OBJ into Assets, make it a prefab and add it to CircuitGuide > userModels. Your own circuit: a KiCad file (tools/wrap-kicad.mjs), a photo (circuitPhoto) or a video step list (tools/video-to-pack.mjs).", 62), 12, new vec3(0, -14.6, 0.3), TEXT_DIM)
    const back = this.kit.obj(this.root, "back", [-9.6, 15.4, 0])
    rrect(back, "p", 7.6, 2.2, 1.0, [0.6, 0.25, 0.25, 0.97], 0, {size: 0.12, color: [1, 0.65, 0.65, 0.95]})
    label(back, "l", "BACK TO MENU", 16, new vec3(0, 0, 0.3), TEXT_LIGHT, true)
    makeTap(this.kit.obj(back, "guide_mm_hit_back"), new vec3(8, 2.8, 2), () => this.hooks.menu())
    this.refresh()
    this.root.enabled = false
  }

  private arrow(id: string, text: string, x: number, y: number, on: () => void) {
    const a = this.kit.obj(this.root, "mm_" + id, [x, y, 0])
    rrect(a, "p", 3.2, 3.4, 1.2, [0.2, 0.4, 0.62, 0.98], 0, {size: 0.12, color: [0.7, 0.95, 1, 0.95]})
    label(a, "l", text, 34, new vec3(0, 0, 0.3), TEXT_LIGHT, true)
    makeTap(this.kit.obj(a, "guide_mm_hit_" + id), new vec3(3.8, 4.0, 2), on)
  }

  show(on: boolean) {
    this.root.enabled = on
    if (on) this.refresh()
  }

  isShown(): boolean {
    return this.root.enabled
  }

  stepModel(d: number) {
    const n = this.hooks.modelNames().length
    this.modelIdx = (this.modelIdx + d + n * 4) % Math.max(1, n)
    this.refresh()
  }

  stepCircuit(d: number) {
    const n = this.hooks.circuits().length
    this.circuitIdx = (this.circuitIdx + d + n * 4) % Math.max(1, n)
    this.refresh()
  }

  /** Select a circuit by id (after a photo was converted, the new one is shown). */
  selectCircuit(id: string) {
    const l = this.hooks.circuits()
    for (let i = 0; i < l.length; i++) if (l[i].id === id) this.circuitIdx = i
    this.refresh()
  }

  refresh() {
    const names = this.hooks.modelNames()
    const cs = this.hooks.circuits()
    if (this.modelIdx >= names.length) this.modelIdx = 0
    if (this.circuitIdx >= cs.length) this.circuitIdx = 0
    this.modelLabel.text = names.length > 0 ? names[this.modelIdx] : "RC car"
    this.modelSub.text = names.length > 1 ? "model " + (this.modelIdx + 1) + " of " + names.length + (this.modelIdx === 0 ? "  (printed parts)" : "  (your file, split into parts)") : "add yours: see below"
    const c = cs[this.circuitIdx]
    this.circuitLabel.text = c ? c.title : "-"
    this.circuitSub.text = c ? c.blurb + "  (" + (this.circuitIdx + 1) + " of " + cs.length + ")" : ""
  }

  setStatus(t: string) {
    this.status.text = t
  }

  statusText(): string {
    return this.status.text
  }

  selection(): {model: number; circuit: string} {
    const cs = this.hooks.circuits()
    return {model: this.modelIdx, circuit: cs.length > 0 ? cs[this.circuitIdx].id : "rc-car"}
  }

  start() {
    const s = this.selection()
    this.setStatus("")
    this.hooks.start(s.model, s.circuit)
  }

  photo() {
    if (this.busy) return
    this.busy = true
    this.setStatus("Reading the photo with Gemini ...")
    this.hooks
      .convertPhoto()
      .then((id) => {
        this.busy = false
        this.refresh()
        this.selectCircuit(id)
        this.setStatus("Photo converted: it is in the list. Press START BUILD.")
      })
      .catch((e) => {
        this.busy = false
        this.setStatus(String(e).replace(/^Error: /, "").substring(0, 70))
      })
  }

  isBusy(): boolean {
    return this.busy
  }
}

/** The circuits the page offers: every ready tutorial (bundled and imported). */
export function readyCircuits(): {id: string; title: string; blurb: string}[] {
  return CATALOGUE.filter((c) => c.ready).map((c) => ({id: c.id, title: c.title, blurb: c.blurb}))
}
