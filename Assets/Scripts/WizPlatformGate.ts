// WizPlatformGate.ts - keeps ONE project working on both Snapchat (phone, touch) and Spectacles (hands).
// Spectacles: does nothing.
// Phone:
//   1. SpectaclesInteractionKit expects hands and only starts on Spectacles, so its object is removed before it wakes
//      (WizInteract.ts supplies touch input instead). This object must sit ABOVE it in the scene (hierarchy order = awake order).
//   2. Surface placement: the workbench stays hidden while a pulsing ring + hand icon sit on the detected surface. Tap the
//      screen: the world origin is reset onto the surface under the finger, the workbench appears there facing the camera
//      (larger than on glasses, a phone view is much wider) and the usual title screen / icon menu carries on.

import {makeIconQuad} from "./WizIcons"
import {RGBA} from "./ProjectPack"

const PHONE_SCALE = 1.6 // workbench size on a phone
const DESK_DROP = 12.15 // the scene authors the desk surface 12.15 cm below its root
const CONTENT_DEPTH = 57 // ... and the content centre 57 cm in front of its root
const RING: RGBA = [0.35, 0.95, 1.0, 0.55]

@component
export class WizPlatformGate extends BaseScriptComponent {
  @input boxMesh!: RenderMesh
  @input cylinderMesh!: RenderMesh
  @input unlitMaterial!: Material
  @input faceMaterial!: Material

  private root: SceneObject | null = null
  private cam: SceneObject | null = null
  private tracking: DeviceTracking | null = null
  private reticle: SceneObject | null = null
  private cue: SceneObject | null = null
  private ringMat: Material | null = null
  private state: "waiting" | "settling" | "placed" = "waiting"
  private settle = 0
  private clock = 0
  private facing = new vec3(0, 0, -1)

  onAwake() {
    if (global.deviceInfoSystem.isSpectacles()) return
    const doomed: SceneObject[] = []
    const n = global.scene.getRootObjectsCount()
    for (let i = 0; i < n; i++) {
      const so = global.scene.getRootObject(i)
      if (so.name === "SpectaclesInteractionKit") doomed.push(so)
      else if (so.name === "3DWiz") this.root = so
      else if (!isNull(so.getComponent("Component.Camera"))) this.cam = so
    }
    for (let i = 0; i < doomed.length; i++) doomed[i].destroy()
    if (this.cam !== null) {
      this.tracking = this.cam.getComponent("Component.DeviceTracking") as DeviceTracking
      if (!isNull(this.tracking) && this.tracking.isDeviceTrackingModeSupported(DeviceTrackingMode.Surface)) {
        this.tracking.requestDeviceTrackingMode(DeviceTrackingMode.Surface)
      }
    }
    if (this.root !== null) {
      const s = PHONE_SCALE
      this.root.getTransform().setWorldScale(new vec3(s, s, s))
    }
    this.buildReticle()
    this.createEvent("OnStartEvent").bind(() => {
      // every script has now woken and built itself; keep the workbench hidden until the user taps a surface
      if (this.root !== null) this.root.enabled = false
    })
    this.createEvent("UpdateEvent").bind(() => this.update(getDeltaTime()))
    this.createEvent("TouchStartEvent").bind((e: TouchStartEvent) => this.onTap(e.getTouchPosition()))
  }

  private buildReticle() {
    const r = global.scene.createSceneObject("PlacementReticle")
    const disc = global.scene.createSceneObject("Ring")
    disc.setParent(r)
    disc.getTransform().setLocalScale(new vec3(16, 0.15, 16))
    const rmv = disc.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = this.cylinderMesh
    const mat = this.unlitMaterial.clone()
    mat.mainPass.baseColor = new vec4(RING[0], RING[1], RING[2], RING[3])
    mat.mainPass.blendMode = BlendMode.Normal
    mat.mainPass.depthWrite = false
    rmv.mainMaterial = mat
    this.ringMat = mat
    const cue = makeIconQuad(r, this.boxMesh, this.faceMaterial, "TapCue", "touch_app", 9, [1, 1, 1, 1])
    cue.obj.getTransform().setLocalPosition(new vec3(0, 10, 0))
    this.cue = cue.obj
    this.reticle = r
  }

  private camForward(): vec3 {
    if (this.cam === null) return new vec3(0, 0, -1)
    const b = this.cam.getTransform().back
    const f = new vec3(-b.x, 0, -b.z)
    return f.length < 0.01 ? new vec3(0, 0, -1) : f.normalize()
  }

  /** Test hook: same path as a finger tap. */
  tapForTest(p: vec2) {
    this.onTap(p)
  }

  private onTap(p: vec2) {
    if (this.state !== "waiting" || this.root === null) return
    if (this.tracking !== null && !isNull(this.tracking) && this.tracking.getActualDeviceTrackingMode() === DeviceTrackingMode.Surface) {
      this.tracking.resetTracking(p) // origin <- the detected surface under the finger
    }
    this.facing = this.camForward()
    this.state = "settling"
    this.settle = 0.25 // let the tracker move the origin before the workbench appears
  }

  private update(dt: number) {
    this.clock += dt
    if (this.reticle !== null && this.state !== "placed") {
      const pulse = 1 + 0.12 * Math.sin(this.clock * 4)
      const t = this.reticle.getTransform()
      t.setWorldScale(new vec3(pulse, 1, pulse))
      if (this.cue !== null && this.cam !== null) {
        // the hand icon bobs and turns to the viewer
        const to = this.cam.getTransform().getWorldPosition().sub(this.cue.getTransform().getWorldPosition())
        this.cue.getTransform().setWorldRotation(quat.lookAt(new vec3(to.x, 0, to.z).normalize(), vec3.up()))
        this.cue.getTransform().setLocalPosition(new vec3(0, 10 + Math.sin(this.clock * 3) * 1.2, 0))
      }
      if (this.ringMat !== null) this.ringMat.mainPass.baseColor = new vec4(RING[0], RING[1], RING[2], RING[3] * (0.7 + 0.3 * Math.sin(this.clock * 4)))
    }
    if (this.state === "settling") {
      this.settle -= dt
      if (this.settle <= 0) this.place()
    }
  }

  private place() {
    if (this.root === null) return
    const s = PHONE_SCALE
    const f = this.facing
    const k = CONTENT_DEPTH * s
    const rt = this.root.getTransform()
    // the root's local -z points along the camera's heading; the content centre lands on the tapped surface point (world origin)
    rt.setWorldRotation(quat.lookAt(f, vec3.up()))
    rt.setWorldPosition(new vec3(-f.x * k, DESK_DROP * s, -f.z * k))
    this.root.enabled = true
    if (this.reticle !== null) this.reticle.enabled = false
    this.state = "placed"
  }
}
