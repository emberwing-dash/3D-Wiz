# Status (paused, Oct 23 2026)

Plan: `devpost/design-brief-v2.md` (approved). Original brief kept in `design-brief.md`.

## Done and seen working in the preview
- Phobo (companion bot, analog-TV face, dialogue box, follows / holds / steps aside), menu tab + hide handle + Back, table placement (Place icon + grab bar).
- Circuit Lab: KiCad-style diagram <-> 3D breadboard with tidy jump wires, smart rails (RC Car: 14 of 34 wires by hand), hands-assemble animation, Drive mode.
- Verified-pin mode for packs without a simulator (the cat-like OLED pet: 6 signal wires, wrong pairs red + Phobo explains, 6/6 = Circuit Master), virtual touch / motion test activates the pet.
- Visualize shows real component models; hands demo carries esp, boost, batt, drv, sr.

## LEAF (last known)
- Passed: c1-c13 individually (c1, c2, c9, c12 after test fixes; c10, c11, c13 pass).
- NOT finished: the final full run (all scenarios together) was interrupted when paused. Re-run it first.
- Known failing: `x-ik-reachability` (simulated arm cannot reach the top menu icons; the menu was trimmed to 7 icons and lowered, not yet re-checked).

## Limits to remember
- The preview's PreviewInteractTool times out on every custom interactable (Phobo, menu, parts); the LEAF hand works. Treat LEAF as the pinch check.
- Lens Studio: after RecompileTypeScriptTool the preview stays "not compiled" until a script file changes (touch `Assets/Scripts/WizMover.ts`).
- The Groq key pasted in chat was NOT stored anywhere; rotate it. Voice is out of this version.

## Flags (must be off before use)
- WizLeafClient `autoRun` = off, WizMain `debugAction` = empty (both cleared and the project saved).

## Next
1. Re-run the full LEAF set, then x-ik-reachability.
2. Look again at Visualize (real models) and the assemble hands on the car.
3. Optional: drop the legacy guided Wires game code, README touch-ups.

## Update: AI helper, chips, inventory
- Phobo now has quick-question chips (Why? / Next? / What? / Where?) under its dialogue box. Answers come from scripted hints offline (verified in preview: "Looks fine to me!").
- `WizPhoboAI.ts` calls Gemini through Remote Service Gateway when a token is set. The `RemoteServiceGatewayCredentials` scene object holds placeholder tokens only - paste your own token in the Inspector (not stored in any file). The AI path is NOT verified (no token used). The previously exposed Groq key must be rotated.
- Packages added: RemoteServiceGateway, SnapDecorators, Utilities (RSG dependencies).
- Inventory panel (WizInventory) in Visualize: LEAF c14 passed.
- LEAF autoRun is OFF. x-ik-reachability still fails (simulated arm cannot reach top menu icons); full c1-c14 run together not repeated after latest changes.

## Update: Visualize = the 3D object with its circuit, in AR
- Visualize now shows the project model enlarged with a see-through body, every electronic part at its mount point, and every wire of the project drawn between the real pin positions (WizArView). POWER sends pulses along the wires; WIRES / BODY / EXPLODE are toggles (WizVizBar). Tap a part to light it and its wires.
- The block fit-test workbench and the PARTS inventory are no longer shown (code kept). c4 retired; c14 now tests the AR view.
- Verified: preview screenshots (Sesame and Desk Pet); LEAF c1-c3, c5, c6, x-pack, c8-c14 passed after the change (c12 needed a fresh preview refresh). c7 and x-ik-reachability not re-run.
