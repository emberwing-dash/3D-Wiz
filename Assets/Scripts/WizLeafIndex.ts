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
  ]
}
