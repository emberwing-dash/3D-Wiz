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

## Update (Oct 30): Circuit Guide built from design-brief.md
New experience, default start mode ("CircuitGuide" object, `WizGuide.startMode = guide`). The old Circuit Lab sleeps (its root is disabled) and wakes with `startMode = lab` or `WizGuide.leave()`. No Circuit Lab code was changed except a one-line wake-up in `WizLeafHelpers.getMain()`.
- Files: `GuideData.ts` (step list + parser), `GuideKit.ts`, `GuideModel.ts` (split / explode / assemble / free placement), `GuideBench.ts` (table, breadboard, parts, pins, wires, glow, drop rules), `GuideUI.ts` (left panel, voice orb + captions + narrator, Play, controller), `WizGuide.ts` (state machine). Offline pre-step doc: `tools/video-to-steps.md`.
- STAND-IN: no tutorial video was supplied. The step list `RC_SAMPLE` is hand-authored for the RC car pack and says so in the panel footer. No narration audio clips exist; every line is a caption (+ a blip). Voice is not synthesised.
- Gemini key: only an Inspector string (empty, never stored, not read by the running Lens). It is not in any file.
- Flow: cyan glow on the drop spot / pins -> drop or wire (both ends) -> wrong = red + orb hint + caption + part/end returns -> right = green -> next step by itself (no Next button) -> Play -> joystick + BOOST / STOP (car) or one slider per part (servo).
- Components use the real KiCad / Adafruit GLB models and the repo's printed RC parts. Primitives only for the table, glow and UI.

### LEAF for the 5 done criteria (g1-g5), run in the preview
- g1 model load / explode / reassemble / free placement: PASS (RC parts and the user FBX; EXPLODE / ASSEMBLE and the model grab use real SIK pinches and a real drag).
- g2 glow on the exact spot / pins for all 8 steps, panel words: PASS.
- g3 wrong part, wrong place, wrong pin, one good end + one bad end: red, hint spoken + captioned, returns: PASS.
- g4 green, auto-advance, narration carries on, hold while working, no Next control: PASS.
- g5 Play (real pinch), joystick (real drag), steering, boost, stop, FBX slider drive: PASS.
- Old suite re-run with `startMode = lab`: c1-c3, c5-c11, c13, c14, x-pack PASS. c12 failed inside the long run but PASSES alone on a fresh preview (known order / refresh sensitivity). x-ik-reachability still fails (known).
- Run all g-tests from a clean preview. Parts and wires are put back by `restart()`.

### Not proven
- Feel: hand-tracking comfort, grabbing small pins on real glasses, panel and orb positions on the real display (the real FOV is narrow; the 25 cm left panel sits at the edge of view).
- Wire / part drops are tested through the same code path as a drag (`simDropPart`, `simDropEnd`), not by moving a real hand over a pin. PreviewInteractTool still times out on custom interactables.
- Narration audio, video-quality of the step list (no video analysed).

### Flags
- `WizLeafClient.autoRun` off, `only = c14-inventory`, `WizMain.debugAction` empty, `WizGuide.debugLog` off, `geminiKey` empty. Project saved.
- After RecompileTypeScriptTool touch `Assets/Scripts/WizMover.ts` so the preview recompiles.

## Update (Oct 30, later): main menu first, three pages, table framing
- Reset opens the ORIGINAL 3D Wiz title screen (`WizGuide.startMode = menu`, default). Its icon menu now has **Lab / Circuit / Visualize / Library**. LAB and VISUALIZE use the old routes unchanged. CIRCUIT is one extra entry in the same menu (`id: guide`, handled in `WizMain.onMenuSelect`) that calls `WizGuide.enter()`: the old `3DWiz`, `HeadUI` and `Phobo` roots sleep, the Guide shows. Only those three roots are disabled (disabling the SIK / animate / update dispatcher roots freezes the Lens and the tests).
- Back: Lab and Visualize keep their Back icon. The Guide has a red MENU pill on the table (`guide_btn_hit_menu`); it calls `WizGuide.exitToMenu()`, wakes the old roots and returns to the title screen (`WizGuide.onExit`, set by `WizMain.bind`).
- Framing: the preview view point cannot be moved from the scene (the Camera Object rotation / position is overridden by device tracking), so the content was moved instead. The Guide table (22 x 17 cm, `benchScale` 0.9) is tilted toward the user (`tableTiltDeg` 40) like a drafting table at world (0, -5, -50); the step panel (18 cm wide) sits above it, the orb at the upper right, all inside the narrow preview view (checked in screenshots). Drag now slides on the tilted table plane.
- `WizMain` got: the two title icons, the `guide` route, `WizGuide.onExit`, and a debug action `guideback`. `WizLeafMenu` (c1) was updated for the 4-icon title menu. No other Circuit Lab code changed.
- LEAF now: g1-g5 and new **g6-main-menu-routes** (real pinches on the menu icons: CIRCUIT, MENU pill, LAB + Back, VISUALIZE + Back). Run after this change with a clean preview: c1, c10, c14, g1-g6 all PASS.
- Not checked: the Visualize page showed its control bars in the screenshot but the AR model was not visible in that frame (c14 passes; I did not compare against the old build). The debug action chain does not work while the Guide is open (it runs on the sleeping WizMain), so the "back" screenshot is the end state of g6.
- Flags: autoRun off (`only = c14-inventory`), `debugAction` empty, `debugLog` off, `geminiKey` empty, saved. Touch `Assets/Scripts/WizMover.ts` after a recompile.

## Update (Oct 30, evening): bigger title menu, Visualize model in frame, AUTO DEMO
- Title menu (Lab / Circuit / Visualize / Library): icons, words and hit boxes are 1.7x (`WizMenu.setBig`, only on the title screen; other menus unchanged), stack moved to x -9 / lifted so it stays in the frame and clear of Phobo. Routes unchanged (c1 and g6 pass).
- Visualize: the old first-visit flow asked the user to look 39 cm down at a table and pinch, which in the preview's level view put the model below the frame (not caused by the Guide). It now starts on the title screen's table spot (`WizPlacement.placeDefault`); the Place icon still lets you move it. Screenshot shows the model and its wires in frame. c14 still passes (it already handled "already placed").
- Decision: the RC_SAMPLE step list stays; no video analysis for now.
- AUTO DEMO (`GuideDemo.ts`): the WATCH DEMO pill on the Guide table (becomes STOP DEMO) plays the whole guide with a visible simulated hand (about 2.5 minutes): EXPLODE / ASSEMBLE pills, carries the model through free space, builds all 8 steps, ONE deliberate mistake (ESP32 put in the wrong place: red, hint, returns), Play, joystick drive. All grabs and drops go through the same bench code as a real drag (`demoGrabPart` -> `beginPart`, `demoReleasePart` -> `endPart` -> `judgePart`; wire ends likewise; `GuideModel.moveBy`; `Controller.moveStick`). No hand input needed. A click / touch, a real grab, or the STOP pill ends it and returns the guide to normal. The hand is made of primitives (not WizHands). Not added to the main menu (keeps the title menu at 4 icons).
- Car driving is now limited to the table (it may overhang a little).
- LEAF: g7-auto-demo PASS (checks all steps done, one red mistake with hint, exploded, model lift, Play pressed, car drove, pacing 90 to 200 s, STOP DEMO). Full run c1, c10, c14, g1-g7 PASS.
- Unchecked: demo pacing as seen by a human (only the time range is tested), the demo while a real hand is also tracking, recording quality.
- Flags: autoRun off (`only = c14-inventory`), debugAction empty, debugLog off, geminiKey empty, saved. Touch `Assets/Scripts/WizMover.ts` after recompile.

## Update (Oct 30, night): voice-to-build on the main menu (Gemini allowed, with offline fallback)
BRIEF DEVIATION (on purpose, user request): the original brief says "the Lens never depends on live AI". The Lens now MAY call Gemini for (1) reading the spoken sentence and (2) writing a step list, but it never depends on it: every call has an 8 s timeout and a local fallback, so with no key the whole flow works offline.
- Title screen: a big VOICE (mic) button at the bottom middle and a HANDS: AUTO ON/OFF pill (default ON; no hand tracking needed). Files: `GuideVoice.ts` (catalogue, strict JSON validation, keyword fallback, `GeminiClient`), `GuideVoiceUI.ts` (mic, transcript, "Which video?" search with a virtual keyboard and result cards, "RC Car - okay?" card, hands script), small hooks in `WizGuide.ts` / `WizMain.ts` (`isTitle`, `sleepLegacy / wakeLegacy`, `usePack`).
- Flow: mic tap -> speech (real ASR only when HANDS AUTO is OFF and the preview/device supports it; after a few seconds, or with hands on, the presenter says "I want build car" as caption + transcript) -> intent (Gemini JSON {intent, project, search_query} validated, else keyword match) -> search page with the query typed key by key and filtered cards (RC Car on top; Servo Hand, Desk Pet, LED Starter are catalogue entries WITHOUT a step list: OKAY on them says so) -> OKAY -> optional Gemini step list (validated with `parseGuidePack` against RC_SAMPLE's parts / pins / spots; rejected => RC_SAMPLE) -> Circuit Guide; with hands auto on the AUTO DEMO continues (parts, wires, one deliberate mistake, Play, drive).
- Honest labels: the results are a LOCAL catalogue (titles only, no video picture, no live YouTube search); the panel says so.
- Gemini path: direct `InternetModule.fetch` to generativelanguage.googleapis.com (model Inspector `geminiModel`, default gemini-2.5-flash), key in the `x-goog-api-key` header. The Remote Service Gateway path was not used (it needs its own token). The LIVE Gemini call was NOT tested (no key available). Only the validation of fake responses was tested.
- KEY RULES: `CircuitGuide > geminiKey` is empty in the saved project (the hint says: paste for a session, CLEAR before saving or committing). Not logged or echoed anywhere; typing a key on the virtual keyboard was not built. Key-like strings (Google API key prefixes) searched in Assets, devpost and tools: none found.
- LEAF g8-voice-to-build PASS: unit checks (valid / fenced / malformed / wrong intent / unknown project / missing field intents, fake Gemini response, keyword fallback, valid and invalid fake step lists) + offline path with hands on (real pinch on the mic, transcript, typed query "rc car", RC Car on top, "RC Car - okay?", Guide step 1, demo running) + offline path with hands off (real pinches on DEL, R, the card, CANCEL, the card again, OKAY). Full run c1, c10, c14, g1-g8 PASS.
- Not done / unchecked: live Gemini (intent and steps), real ASR, hands in Lab / Visualize (not added), typing the key at runtime.
- Small fixes: the guide's orb now drops queued lines on restart (g4 was order-sensitive).
- Flags: autoRun off (`only = c14-inventory`), debugAction empty, debugLog off, geminiKey empty, saved.

## Update (Oct 30, later): smaller icons, no overlapping text
- Title menu icons are 1.15x (was 1.7x) and the column sits lower and further left so no label touches the Lv bar, the title, the tagline or the robot. The VOICE and HANDS: ON pills are one row on the bottom edge of the view: `GuideVoice.placePills` places them with `Camera.screenSpaceToWorldSpace(0.5, 0.9)` so they stay below the robot and inside the frame for any preview panel shape (the preview panel is now square; it was portrait earlier).
- Search page: the "You said" line, the honest "local catalogue" note and the cards no longer share rows; the HANDS pill moves into the panel header while the search is open; card blurbs no longer run under the thumbnail. Guide: the step-panel footer is shortened ("SAMPLE steps (stand-in, no video)") so it stays inside its plate, orb caption narrower.
- Checked in screenshots (square panel): title menu, listening, search + keyboard, confirm card, guide page, Visualize page. Text-over-text overlaps seen: none. Hand and cursor graphics pass over buttons while they act (that is the hand, not text). The legacy Visualize bars sit over the room background only.
- Not checked: the earlier portrait panel shape after these tweaks (positions for the menu column were tuned on the square view); real device.
- LEAF after the change: c1, c10, c14, g1-g8 PASS.
- Flags: autoRun off (`only = c14-inventory`), debugAction empty, debugLog off, geminiKey empty, saved.

## Update (Nov 3): three-page product (VISUALIZE / ANALYSE / BUILD) - done and tested
BRIEF DEVIATION (user direction): the product is a main menu with three pages; live AI stays optional (offline path complete).
- Main menu: exactly Visualize / Analyse / Build (`viz3d`, `analyse`, `build`). Old Lab / Library / old Visualize are reachable from the OLD LAB / LIBRARY / OLD VIEW pills at the bottom edge of the BUILD page. Every page has a MENU pill (floating toolbar over the table on VISUALIZE and ANALYSE so the car cannot hide it). VOICE mic + HANDS pill unchanged; the voice flow still ends in BUILD.
- BUILD = the Circuit Guide; from the menu with HANDS AUTO on the simulated hand starts tinkering by itself.
- ANALYSE (`GuideAnalyse.ts`, `GuideInfo.ts`): RC car with real component models, 8 name tags with "i" buttons; info only on click, one card at a time, same i / X / table tap closes; ASK MORE only with a Gemini key; hand demo clicks four i. Stand-in subject (no camera feed in the preview); real recognition would replace it on a device.
- VISUALIZE (`GuideViz.ts`, `GuideParts.ts`): printed RC car on the table, tray of 11 components in two rows, outline mount markers, snap + name label + pins + 12 wires, wrong-spot refusal, SEE-THRU / RESET / DEMO; hand demo attaches all 11.
- Component models: REAL library: KiCad CAD (ESP32-WROOM, DIP-16 as the L293D, LED, resistor with colour bands, diode, NPN TO-92) and Adafruit CAD (micro servo). AI-GENERATED (Fast3D, `Assets/Models/Generated`): 4xAA battery holder, N20 gear motor, slide switch. CODE-MODELLED: electrolytic capacitor (Fast3D refused it three times, "ALD verification failed"). MISSING: TO-220 transistor.
- LEAF (run in the preview): c1, c10, c14, g1-g11 all PASS (g6 rewritten for the 3-button menu; g9 visualize, g10 analyse, g11 build entry are new; g1, g6, g8, g11 re-run after the last layout tweak and pass).
- Unchecked: other panel shapes (screenshots are from the square panel), a real device, live Gemini, human judgement of label crowding (names are staggered by hand on the deck and a few sit close).
- Flags: autoRun off (`only = c14-inventory`), debugAction empty, debugLog off, geminiKey empty, saved; no key-like strings in Assets / devpost / tools.

## Update (Nov 3, later): level / XP system removed, live Gemini check
- Removed: the "Lv" label, XP bar, stars and badges (WizHud), XP / badge / level-up / star logic and toasts in WizMain, Phobo "Level N!" line, XP / badge fields in save data (older saves with those fields are ignored). LEAF assertions on XP / badges / stars removed from c2, c3, c6, c11, c13 and the retired viz test; c6 now enters the old Visualize directly. Unrelated uses of "level" (logic / voltage levels, SIK-level) untouched. Main menu screenshot checked: title, tagline, three icons, no gap.
- Live Gemini (key pasted by the user for the session, never logged): model `gemini-2.5-flash` was rejected (HTTP 404, "no longer available to new users"); default is now `gemini-flash-latest`. Live results: (a) intent from Gemini, HTTP 200, 4.9 to 9.3 s, validated, RC Car on top; (b) the Gemini step list (10 steps) passed `parseGuidePack` and the Guide started with it (25 s; timeout raised to 30 s for the step list, 12 s for intent / ask); with the old 8 s limit the call timed out and fell back to RC_SAMPLE, which also proved that path; (c) ANALYSE ASK MORE returned a sensible answer (6 s, output limit raised); (d) a wrong model plus a made-up key gave HTTP 400 in 0.2 s and the flow fell back. A true network stall was not simulated.
- Key hygiene: the key was found set in the Inspector (53 chars) and the saved Scene file had a key-shaped string before the test; it was cleared, the project saved, and a grep of Assets / devpost / tools / the scene found no key-like strings (see the report). The user must paste the key again for live use and clear it before committing.
- LEAF: c1, c2, c3, c6, c10, c11, c13, c14, g1-g11 pass; `x-gemini-live` is a manual scenario (needs the key).

## Update (Nov 3): instant demo path, quota guards
- New Inspector switch `CircuitGuide > liveAi` (default OFF). Off = fully offline, no network call is ever made. On = Gemini only warms an in-memory cache in the background (intent, step list) and powers ASK MORE; it never blocks or swaps anything in the demo. The intent is the local keyword match (instant); OKAY starts the bundled step list at once (a pre-warmed validated AI step list is used only if it is already cached, with an "AI ready" badge on the search page).
- Quota guards in `GeminiClient`: cache by request text (never by key), identical in-flight calls shared, at most 8 calls per session, no retries; tests / autoRun never call (liveAi off). Not persisted to storage.
- Performance: the three page worlds are pre-built hidden in the first seconds (1.2 / 2.6 / 4.0 s), audio cues are assigned once (the first success sound used to cost about 100 ms), VISUALIZE wires redraw only when something moved, ANALYSE leader lines redraw only when the car moved or every 12th frame. Measured (preview, LEAF g12-instant-actions): mic tap to Listening 3 ms; to the search page 0.75 s (0.7 s is the deliberate wait that lets real speech arrive before the scripted line stands in); typing a key 0 ms; RC Car to "okay?" 1 ms; OKAY to Guide step 1 5 ms (was 144 ms before the pre-build); correct drop to green 3 ms (was 104 ms); ANALYSE entry 3 ms, tap an i 0 ms; VISUALIZE entry 2 ms, attach 4 ms. Frame time: idle 3D Wiz title avg 50 ms (the old title scene is the heavy part), VISUALIZE with the hand running avg 40 ms, worst frame 83 ms.
- LEAF: all registered scenarios were run: c1, c2, c3, c5, c6, x-pack, c7, c8, c9, c10, c11, c12, c13, c14, g1-g12 PASS; x-ik-reachability still fails (known). c7 was changed because the Library icon left the title menu (it now opens the carousel directly). `x-gemini-live` is manual (needs the key and liveAi on).
- Flags: autoRun off, debugAction empty, geminiKey empty, liveAi off, saved.

## Update (Nov 3): live Gemini end-to-end check (liveAi on, key pasted by the user for the session)
- Voice -> search page 0.74 s (intent local, instant); typing stayed 0 to 1 ms while 2 background calls ran; "AI ready" badge after 17.6 / 26.4 s; RC Car card 1 to 3 ms; OKAY -> Guide 0.2 s with the Gemini step list (9 steps, validated); ANALYSE ASK MORE: button shows "..." at once, the answer arrives after 7.6 to 7.9 s while the worst frame stays 73 to 90 ms; repeated requests made 0 new calls; a new request at the cap was refused with no network call; 3 to 4 network calls per session (cap 8). One earlier run saw 1 unexpected extra call on the repeat (cause not identified, not reproduced in 2 further runs).
- After the test: geminiKey cleared, liveAi off, saved, project / Cache / Lens Studio logs scanned: no key-shaped string.

## Update (Nov 3): .env key path
- User-requested exception to the "Inspector only" rule: `.env` (git-ignored, one empty line `GEMINI_API_KEY=`), `.env.example`, `tools/apply-env.ps1` (reads `.env`, writes `Assets/Scripts/GeminiKeyLocal.ts`, never prints the key), and a committed empty stub `GeminiKeyLocal.ts` so a fresh clone compiles. Key order: Inspector field, else the .env module, else offline (`pickKey`, unit-tested in g8). README has a "Live AI key" section.
