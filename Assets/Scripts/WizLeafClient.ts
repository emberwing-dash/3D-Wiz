// WizLeafClient.ts - optional auto-runner: runs the registered LEAF scenarios in order inside the Lens preview and
// prints "PASS <id>" / "FAIL <id> :: reason" plus a final summary. Off by default (autoRun = false).

import {DefaultScenarioManager} from "Leaf.lspkg/Scenarios/scenario/manager/DefaultLeafScenarioManager"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"

@component
export class WizLeafClient extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">WizLeafClient - LEAF auto-runner</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Run the LEAF scenarios automatically when the Lens starts (testing only)")
  autoRun: boolean = false
  @input
  @hint("Comma-separated scenario ids to run; empty = all registered")
  only: string = ""
  @ui.group_end

  onAwake() {
    if (!this.autoRun) return
    this.createEvent("OnStartEvent").bind(() => {
      this.runAll().catch((e) => print("[WizLeafClient] runner error: " + e))
    })
  }

  private async runAll(): Promise<void> {
    const mgr = DefaultScenarioManager.getInstance()
    let ids = mgr.listScenarioIds()
    if (this.only.trim() !== "") {
      const want = this.only.split(",").map((s) => s.trim())
      ids = ids.filter((i) => want.indexOf(i) >= 0)
    }
    const results: string[] = []
    for (let i = 0; i < ids.length; i++) {
      await sleep(800)
      try {
        await mgr.startScenario(ids[i])
        results.push("PASS " + ids[i])
      } catch (e) {
        results.push("FAIL " + ids[i] + " :: " + e)
      }
      print("[WizLeafClient] " + results[results.length - 1])
    }
    print("[WizLeafClient] SUMMARY\n" + results.join("\n"))
  }
}
