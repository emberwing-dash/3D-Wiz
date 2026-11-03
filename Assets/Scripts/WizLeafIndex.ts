// WizLeafIndex.ts - registers the 3D Wiz LEAF scenarios (menu/gesture, build game, wires, visualize, play+pause, save, pack, reach).

import {scenariosIndex} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import {ScenarioMetadata} from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import {WizLeafMenu} from "./WizLeafMenu"
import {WizLeafBuild} from "./WizLeafBuild"
import {WizLeafCircuit} from "./WizLeafCircuit"
import {WizLeafViz} from "./WizLeafViz"
import {WizLeafPlay} from "./WizLeafPlay"
import {WizLeafSave} from "./WizLeafSave"
import {WizLeafPack} from "./WizLeafPack"
import {WizLeafIK} from "./WizLeafIK"
import {WizLeafProjects} from "./WizLeafProjects"
import {WizLeafPacks} from "./WizLeafPacks"
import {WizLeafMyModel} from "./WizLeafMyModel"
import {WizLeafLab} from "./WizLeafLab"
import {WizLeafDrive} from "./WizLeafDrive"
import {WizLeafPhobo} from "./WizLeafPhobo"
import {WizLeafPet} from "./WizLeafPet"
import {WizLeafInventory} from "./WizLeafInventory"
import {WizLeafG1} from "./WizLeafG1"
import {WizLeafG2} from "./WizLeafG2"
import {WizLeafG3} from "./WizLeafG3"
import {WizLeafG4} from "./WizLeafG4"
import {WizLeafG5} from "./WizLeafG5"
import {WizLeafG6} from "./WizLeafG6"
import {WizLeafG7} from "./WizLeafG7"
import {WizLeafG8} from "./WizLeafG8"
import {WizLeafG9} from "./WizLeafG9"
import {WizLeafG10} from "./WizLeafG10"
import {WizLeafG11} from "./WizLeafG11"
import {WizLeafLive} from "./WizLeafLive"
import {WizLeafG12} from "./WizLeafG12"
import {WizLeafLiveE2E} from "./WizLeafLiveE2E"
import {WizLeafLiveInflight} from "./WizLeafLiveInflight"
import {WizLeafKeySrc} from "./WizLeafKeySrc"

@component
export class WizLeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    {id: "c1-menu-and-gesture", typename: WizLeafMenu.getTypeName()},
    {id: "c2-build-game", typename: WizLeafBuild.getTypeName()},
    {id: "c3-wire-game", typename: WizLeafCircuit.getTypeName()},
    // c4 (WizLeafViz, the old block workbench) is retired: Visualize is now MODEL + CIRCUIT, covered by c14
    //     {id: "c4-visualize-workbench", typename: WizLeafViz.getTypeName()},
    {id: "c5-play-and-pause", typename: WizLeafPlay.getTypeName()},
    {id: "c6-save-continue", typename: WizLeafSave.getTypeName()},
    {id: "x-pack-single-source", typename: WizLeafPack.getTypeName()},
    {id: "c7-projects-carousel", typename: WizLeafProjects.getTypeName()},
    {id: "c8-pack-integrity", typename: WizLeafPacks.getTypeName()},
    {id: "c9-my-model", typename: WizLeafMyModel.getTypeName()},
    {id: "c10-circuit-lab", typename: WizLeafLab.getTypeName()},
    {id: "c11-drive", typename: WizLeafDrive.getTypeName()},
    {id: "c12-phobo-menu-placement", typename: WizLeafPhobo.getTypeName()},
    {id: "c13-pet-verified-pins", typename: WizLeafPet.getTypeName()},
    {id: "c14-inventory", typename: WizLeafInventory.getTypeName()},
    {id: "x-ik-reachability", typename: WizLeafIK.getTypeName()},
    // Circuit Guide (design-brief.md done criteria 1-5). They switch the app into the guide mode (the old lab sleeps).
    {id: "g1-model-explode-place", typename: WizLeafG1.getTypeName()},
    {id: "g2-guide-glow-steps", typename: WizLeafG2.getTypeName()},
    {id: "g3-wrong-red-hint-return", typename: WizLeafG3.getTypeName()},
    {id: "g4-green-auto-advance", typename: WizLeafG4.getTypeName()},
    {id: "g5-play-and-control", typename: WizLeafG5.getTypeName()},
    {id: "g6-main-menu-routes", typename: WizLeafG6.getTypeName()},
    {id: "g7-auto-demo", typename: WizLeafG7.getTypeName()},
    {id: "g8-voice-to-build", typename: WizLeafG8.getTypeName()},
    {id: "g9-visualize-attach", typename: WizLeafG9.getTypeName()},
    {id: "g10-analyse-info", typename: WizLeafG10.getTypeName()},
    {id: "g11-build-entry-hands", typename: WizLeafG11.getTypeName()},
    {id: "g12-instant-actions", typename: WizLeafG12.getTypeName()},
    {id: "x-live-e2e", typename: WizLeafLiveE2E.getTypeName()},
    {id: "x-gemini-live", typename: WizLeafLive.getTypeName()},
    {id: "x-live-inflight", typename: WizLeafLiveInflight.getTypeName()},
    {id: "x-key-sources", typename: WizLeafKeySrc.getTypeName()},
  ]
}
