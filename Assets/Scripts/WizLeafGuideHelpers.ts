// WizLeafGuideHelpers.ts - shared helpers for the Circuit Guide LEAF scenarios (test code only).
// Owns: getting the guide in a known state, playing one step perfectly through the real drop rules, reading the world.
// Must not: contain assertions about the app (scenarios do that).

import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {WizGuide} from "./WizGuide"

export function getGuide(): WizGuide {
  const g = WizGuide.instance
  if (g === null) throw new Error("WizGuide not found in the scene")
  return g
}

/** Guide running from step 1 with the RC car on the table. */
export async function freshGuide(): Promise<WizGuide> {
  const g = getGuide()
  g.enter()
  await sleep(300)
  g.setModelSource("rc")
  await sleep(500)
  return g
}

/** One step done the way a player would: the right part on the glowing spot, or both wire ends on the two glowing pins. */
export function doStep(g: WizGuide): void {
  const st = g.step()
  if (st === null) throw new Error("no current step")
  if (st.kind === "place") {
    g.bench.simDropPart(st.part as string, g.bench.spotWorldPos(st.spot as string))
  } else {
    const p = st.pins as [string, string]
    g.bench.simDropEnd(0, p[0])
    g.bench.simDropEnd(1, p[1])
  }
}

/** Do the current step, then wait for the green moment and the automatic advance. */
export async function doStepAndWait(g: WizGuide): Promise<void> {
  doStep(g)
  await sleep((g.successHoldS + 0.5) * 1000)
}

export function near(a: vec3, b: vec3, tol: number): boolean {
  return a.sub(b).length <= tol
}
