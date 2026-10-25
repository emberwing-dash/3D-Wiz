// WizHud.ts - the tiny game HUD: part/quest label, progress pips, XP bar + level + stars, badges, result icons, floating
//             "+10" toasts, a "virtual" chip and the optional "i" card (name, one short line, real size).
// Owns: floating Text/shape objects only. No paragraphs: icons, colours, numbers. State is pushed in by WizMain.
// Must not: decide anything (no game rules) or create buttons.

import {RGBA, V3} from "./ProjectPack"
import {PartKit, StyledMat} from "./WizParts"
import {makeLabel, LABEL_ACCENT, LABEL_WARN, LABEL_COLOR} from "./WizLabelsUI"
import {makeIconQuad} from "./WizIcons"

const PIP_MAX = 24

@component
export class WizHud extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">WizHud - pips, XP, badges, "i" card</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Unit cube mesh (1 cm)")
  boxMesh!: RenderMesh
  @input
  @hint("Unit sphere mesh (1 cm)")
  sphereMesh!: RenderMesh
  @input
  @hint("Unit cylinder mesh (1 cm)")
  cylinderMesh!: RenderMesh
  @input
  @hint("Lit glTF material")
  litMaterial!: Material
  @input
  @hint("Unlit material")
  unlitMaterial!: Material
  @input
  @hint("Unlit material with Base Texture enabled (icons)")
  faceMaterial!: Material
  @ui.group_end

  private kit!: PartKit
  private label!: Text
  private pips: {obj: SceneObject; sm: StyledMat}[] = []
  private xpFill!: SceneObject
  private xpFillSm!: StyledMat
  private lvText!: Text
  private stars: StyledMat[] = []
  private badgeObjs: {obj: SceneObject; sm: StyledMat}[] = []
  private chip!: Text
  private infoRoot!: SceneObject
  private infoTitle!: Text
  private infoLine!: Text
  private infoSize!: Text
  private resultRoot!: SceneObject
  private resultMats: Material[] = []
  private toastText!: Text
  private toastT: number = 0
  private paused: boolean = false
  private pipCount: number = 0
  private dimObj!: SceneObject

  onAwake() {
    try {
      this.kit = new PartKit(this.boxMesh, this.sphereMesh, this.cylinderMesh, this.litMaterial, this.unlitMaterial)
      const root = this.sceneObject
      this.label = makeLabel(root, "HudLabel", "", 46, [0, 5.4, 0], LABEL_ACCENT)
      for (let i = 0; i < PIP_MAX; i++) {
        const r = this.kit.shape(root, "sphere", [0, 3.7, 0], [0.5, 0.5, 0.5], [0.3, 0.3, 0.35, 1], "pip" + i, false)
        r.obj.enabled = false
        this.pips.push({obj: r.obj, sm: r.sm})
      }
      // XP bar (track + fill), level number, stars
      this.kit.shape(root, "box", [0, 2.6, 0], [10, 0.3, 0.1], [0.15, 0.2, 0.25, 1], "xpTrack", false)
      const f = this.kit.shape(root, "box", [-5, 2.6, 0.05], [0.01, 0.3, 0.12], [0.35, 1.0, 1.0, 1], "xpFill", false)
      this.xpFill = f.obj
      this.xpFillSm = f.sm
      this.lvText = makeLabel(root, "HudLevel", "", 34, [-6.6, 2.6, 0], LABEL_COLOR)
      for (let i = 0; i < 3; i++) {
        const st = this.kit.shape(root, "box", [6.4 + i * 0.9, 2.6, 0], [0.55, 0.55, 0.1], [0.3, 0.3, 0.3, 1], "star" + i, false, [0, 0, 45])
        this.stars.push(st.sm)
      }
      for (let i = 0; i < 6; i++) {
        const b = this.kit.shape(root, "sphere", [13.2 - i * 1.0, 5.4, 0], [0.7, 0.7, 0.2], [0.35, 0.35, 0.4, 1], "badge" + i, false)
        b.obj.enabled = false
        this.badgeObjs.push({obj: b.obj, sm: b.sm})
      }
      this.chip = makeLabel(root, "HudChip", "", 26, [12.4, -28.2, 0], new vec4(0.7, 0.85, 0.95, 0.6))
      // "i" card
      this.infoRoot = this.kit.obj(root, "InfoCard", [0, -1.0, 0])
      this.kit.shape(this.infoRoot, "box", [0, -0.2, -0.1], [15, 3.9, 0.05], [0.04, 0.08, 0.12, 0.8], "infoBack", false)
      this.infoTitle = makeLabel(this.infoRoot, "InfoTitle", "", 44, [0, 1.1, 0], LABEL_ACCENT)
      this.infoLine = makeLabel(this.infoRoot, "InfoBody", "", 34, [0, -0.1, 0], LABEL_COLOR)
      this.infoSize = makeLabel(this.infoRoot, "InfoSize", "", 34, [0, -1.3, 0], LABEL_WARN)
      this.infoRoot.enabled = false
      // result icons (power / data / servo)
      this.resultRoot = this.kit.obj(root, "Results", [0, -2.5, 0])
      const names = ["bolt", "sync_alt", "settings"]
      for (let i = 0; i < 3; i++) {
        const q = makeIconQuad(this.resultRoot, this.boxMesh, this.faceMaterial, "result" + i, names[i], 2.0, [0.6, 0.6, 0.6, 1])
        q.obj.getTransform().setLocalPosition(new vec3((i - 1) * 2.8, 0, 0))
        this.resultMats.push(q.mat)
      }
      this.resultRoot.enabled = false
      const dm = this.kit.shape(root, "box", [0, -10, 0.45], [80, 70, 0.05], [0, 0, 0, 0.45], "PauseDim", false)
      dm.sm.mat.mainPass.blendMode = BlendMode.Normal
      dm.sm.mat.mainPass.depthWrite = false
      this.dimObj = dm.obj
      this.dimObj.enabled = false
      this.toastText = makeLabel(root, "HudToast", "", 56, [0, -3, 0], LABEL_ACCENT)
      this.toastText.getSceneObject().enabled = false
    } catch (e) {
      print("[WizHud] build failed: " + e + " " + (e && (e as any).stack ? (e as any).stack : ""))
    }
    this.createEvent("UpdateEvent").bind(() => this.update(this.paused ? 0 : getDeltaTime()))
  }

  setPaused(on: boolean) {
    this.paused = on
  }

  /** Pause: the scene is dimmed (a translucent sheet in front of the content, behind the menu). */
  setDim(on: boolean) {
    this.dimObj.enabled = on
  }

  isDimmed(): boolean {
    return this.dimObj.enabled
  }

  setLabel(text: string) {
    this.label.text = text
  }

  labelText(): string {
    return this.label.text
  }

  /** states: 0 empty, 1 done, 2 current, 3 amber (needs attention), 4 green-ok, 5 red. */
  setPips(states: number[]) {
    const n = Math.min(PIP_MAX, states.length)
    this.pipCount = n
    const gap = 0.85
    const x0 = -((n - 1) * gap) / 2
    const cols: RGBA[] = [[0.3, 0.3, 0.35, 1], [0.35, 1.0, 1.0, 1], [1, 1, 1, 1], [1.0, 0.75, 0.25, 1], [0.3, 0.95, 0.5, 1], [1.0, 0.3, 0.25, 1]]
    for (let i = 0; i < PIP_MAX; i++) {
      const p = this.pips[i]
      p.obj.enabled = i < n
      if (i >= n) continue
      p.obj.getTransform().setLocalPosition(new vec3(x0 + i * gap, 3.7, 0))
      p.sm.set(cols[states[i]])
      const sc = states[i] === 2 ? 0.75 : 0.5
      p.obj.getTransform().setLocalScale(new vec3(sc, sc, sc))
    }
  }

  pipStates(): number {
    return this.pipCount
  }

  setXp(frac: number, level: number) {
    const f = Math.max(0.01, Math.min(1, frac))
    this.xpFill.getTransform().setLocalScale(new vec3(10 * f, 0.3, 0.12))
    this.xpFill.getTransform().setLocalPosition(new vec3(-5 + 5 * f, 2.6, 0.05))
    this.lvText.text = "Lv " + level
  }

  setStars(n: number) {
    for (let i = 0; i < 3; i++) this.stars[i].set(i < n ? [1.0, 0.85, 0.25, 1] : [0.3, 0.3, 0.3, 1])
  }

  setBadges(colors: RGBA[]) {
    for (let i = 0; i < this.badgeObjs.length; i++) {
      this.badgeObjs[i].obj.enabled = i < colors.length
      if (i < colors.length) this.badgeObjs[i].sm.set(colors[i])
    }
  }

  setChip(text: string) {
    this.chip.text = text
  }

  showInfo(title: string, line: string, size: string) {
    this.infoTitle.text = title
    this.infoLine.text = line
    this.infoSize.text = size
    this.infoRoot.enabled = true
  }

  hideInfo() {
    this.infoRoot.enabled = false
  }

  infoVisible(): boolean {
    return this.infoRoot.enabled
  }

  infoTexts(): string[] {
    return [this.infoTitle.text, this.infoLine.text, this.infoSize.text]
  }

  /** null hides; else power / data / servo pass-fail as green / red icons. */
  setResults(r: boolean[] | null) {
    this.resultRoot.enabled = r !== null
    if (r === null) return
    for (let i = 0; i < 3; i++) {
      const c: RGBA = r[i] ? [0.3, 1.0, 0.5, 1] : [1.0, 0.3, 0.25, 1]
      this.resultMats[i].mainPass.baseColor = new vec4(c[0], c[1], c[2], 1)
    }
  }

  /** Floating "+10" style pop. */
  toast(text: string, color: vec4 = LABEL_ACCENT) {
    this.toastText.text = text
    this.toastText.textFill.color = color
    this.toastText.getSceneObject().enabled = true
    this.toastT = 1.0
  }

  toastActive(): boolean {
    return this.toastT > 0
  }

  setVisible(on: boolean) {
    this.sceneObject.enabled = on
  }

  private update(dt: number) {
    if (this.toastT > 0) {
      this.toastT -= dt
      const t = this.toastText.getSceneObject().getTransform()
      t.setLocalPosition(new vec3(0, -3 + (1 - this.toastT) * 3, 0))
      if (this.toastT <= 0) this.toastText.getSceneObject().enabled = false
    }
  }
}
