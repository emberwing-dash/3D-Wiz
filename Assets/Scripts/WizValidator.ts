// WizValidator.ts - SEPARATE virtual circuit validator (pure logic). NOT a physical test.
// Owns: the user's selected connections and their comparison with PROJECT_PACK.validation.expected.
// Must not: touch the scene, share state with the pet simulation, or claim real-world correctness.

import {PROJECT_PACK} from "./ProjectPack"

export interface ValidationReport {
  correct: string[] // selected and expected
  incorrect: string[] // selected but not expected (distractors)
  missing: string[] // expected but not selected
  remaining: number // expected connections not yet selected (== missing.length)
  total: number
  status: "EMPTY" | "INCOMPLETE" | "HAS ERRORS" | "COMPLETE"
  summary: string
  disclaimer: string
}

export class CircuitValidator {
  private selected: {[id: string]: boolean} = {}

  /** All option ids shown to the user: the expected wires plus the common-mistake distractors. */
  optionIds(): string[] {
    const v = PROJECT_PACK.validation
    const ids: string[] = []
    for (let i = 0; i < v.expected.length; i++) ids.push(v.expected[i])
    for (let i = 0; i < v.distractors.length; i++) ids.push(v.distractors[i].id)
    return ids
  }

  isSelected(id: string): boolean {
    return this.selected[id] === true
  }

  setSelected(id: string, on: boolean): void {
    this.selected[id] = on
  }

  toggle(id: string): boolean {
    this.selected[id] = !this.isSelected(id)
    return this.selected[id]
  }

  clear(): void {
    this.selected = {}
  }

  report(): ValidationReport {
    const v = PROJECT_PACK.validation
    const correct: string[] = []
    const incorrect: string[] = []
    const missing: string[] = []
    for (let i = 0; i < v.expected.length; i++) {
      const id = v.expected[i]
      if (this.isSelected(id)) correct.push(id)
      else missing.push(id)
    }
    const all = this.optionIds()
    for (let i = 0; i < all.length; i++) {
      const id = all[i]
      if (v.expected.indexOf(id) < 0 && this.isSelected(id)) incorrect.push(id)
    }
    let status: ValidationReport["status"]
    if (correct.length === 0 && incorrect.length === 0) status = "EMPTY"
    else if (incorrect.length > 0) status = "HAS ERRORS"
    else if (missing.length > 0) status = "INCOMPLETE"
    else status = "COMPLETE"
    const summary =
      "Correct " + correct.length + " | Missing " + missing.length + " | Incorrect " + incorrect.length +
      " | Remaining " + missing.length
    return {
      correct: correct,
      incorrect: incorrect,
      missing: missing,
      remaining: missing.length,
      total: v.expected.length,
      status: status,
      summary: summary,
      disclaimer: v.disclaimer,
    }
  }
}
