# From a build guide to a 3D Wiz pack

3D Wiz does not read guides. It consumes one JSON-shaped **pack** (`schema: "3dwiz-pack/1"`, typed in
`Assets/Scripts/ProjectPack.ts`, section `guide`). Turning a PDF / wiki / repo build guide into a pack is an **offline** step:
a person (or a coding assistant working with a person) reads the guide once, writes the pack, and the Lens only plays it back.
Orientation accuracy is therefore exactly as good as the pack. Every entry carries a `basis` so the Lens can say how much to trust it.

## Pipeline

1. Collect the guide's parts list, bill of materials, assembly steps, and the model files (STL/GLB) of the printed parts.
2. Convert each model to a GLB in metres (glTF units), so Lens Studio's 100x import gives centimetres. Keep one assembly frame
   (x right, y up, z toward the viewer); if the files are not in one frame, say so in `notSpecified`.
3. For each part, fill one `parts[]` entry (below): where it mounts, which face leads the insertion, and a six-word orientation cue.
4. List every screw hole, every fastener type (with its driver) and every screwdriver the guide mentions.
5. Order the parts into `steps` (guide order is kept; quests simply group consecutive steps).
6. Mark anything you inferred as `illustrative` and anything that comes from a drawing/STL as `stl`; measured data from the guide is `repo`.
7. Drop the pack into `ProjectPack.ts` (or a new pack file the main script imports). The LEAF scenario `x-pack-single-source` checks that
   every component has a host, an insertion direction, a short orientation and a source.

## Schema (3dwiz-pack/1)

```json
{
  "schema": "3dwiz-pack/1",
  "guideSource": {"url": "https://...", "license": "Apache-2.0", "note": "what was read, when"},
  "parts": [
    {
      "partId": "servo_r1",
      "stepId": "servos",
      "attach": {
        "hostId": "frame",
        "at": [4.2, 1.1, -1.8],
        "rot": [0, 90, 0],
        "face": "shaft up",
        "faceDir": [0, 1, 0],
        "screws": ["h_r1_a", "h_r1_b"]
      },
      "orientation": "shaft up, cable toward rear",
      "source": {"doc": "build guide", "section": "Step 4", "url": "https://..."},
      "tools": ["tool_ph0"],
      "basis": "repo"
    }
  ],
  "screwHoles": [
    {"id": "h_r1_a", "hostId": "frame", "at": [4.0, 1.4, -1.0], "dir": [0, -1, 0],
     "type": "M2 self-tapping", "diameterMm": 2.0, "depthMm": 6, "basis": "stl"}
  ],
  "fasteners": [
    {"id": "fx_m2x5_st", "label": "M2 x 5", "kind": "self-tapping", "diameterMm": 2.0, "lengthMm": 5,
     "head": "phillips", "driver": "tool_ph0", "color": [0.8, 0.8, 0.85, 1]}
  ],
  "tools": [{"id": "tool_ph0", "label": "PH0", "head": "phillips", "size": "PH0"}]
}
```

Field rules: positions are centimetres in the model frame; `rot` is euler degrees; `faceDir` is a unit vector; `orientation` is at most six words
(it is the only text shown for orientation); `basis` is one of `repo | stl | standard | illustrative`.

## Worked example: a servo hand

A hand with five finger servos is the same data in a different costume. Each finger is a part hosted on the palm; each servo mounts in a palm pocket
with its shaft toward the finger root.

```json
{
  "parts": [
    {"partId": "servo_index", "stepId": "servos",
     "attach": {"hostId": "palm", "at": [1.8, 0.0, 2.4], "rot": [0, 0, 0], "face": "shaft forward",
                "faceDir": [0, 0, 1], "screws": ["h_idx_a", "h_idx_b"]},
     "orientation": "shaft toward fingertip", "basis": "illustrative",
     "source": {"doc": "hand build guide", "section": "Servo mounting", "url": "https://example.org/guide"}, "tools": ["tool_ph0"]},
    {"partId": "finger_index", "stepId": "fingers",
     "attach": {"hostId": "servo_index", "at": [1.8, 0.0, 3.6], "rot": [0, 0, 0], "face": "horn slot",
                "faceDir": [0, 0, -1], "screws": ["h_idx_horn"]},
     "orientation": "slot over servo horn", "basis": "illustrative",
     "source": {"doc": "hand build guide", "section": "Fingers", "url": "https://example.org/guide"}, "tools": ["tool_ph0"]}
  ]
}
```

## What the Lens does with it

- **Build:** the offered part starts turned wrong; a plain pinch turns it 90 degrees; the target region, insertion arrow and path line are drawn from
  `attach`; wrong orientation or place springs back (amber), close is cyan, right is green and snaps.
- **Visualize:** `screwHoles`, `fasteners`, `tools` drive the virtual screw action (diameter, type, length, driver checks).
- **Own models:** an optional `userModel` prefab slot on the Visualize component replaces the default frame; the interior is then "estimated"
  unless the pack supplies a measured cavity.

## Limits (be honest in the demo)

- No automatic guide parsing exists in the Lens. This document is the manual / assistant-assisted recipe.
- Rotations, positions and hole coordinates are as accurate as the person who wrote them. Wrong data gives wrong cues.
- Standard sizes for off-the-shelf electronics (not in the guide's files) are flagged `standard`.

## Revision 4: packs as TypeScript, one per project (how the five examples were made)
A pack is now a `make...Pack()` function in `Assets/Scripts/Pack<Name>.ts` returning a `PackShape` (the schema above plus the engine fields).
`PackKit.ts` gives `mk()` (component with automatic bounds), `wire()`, `step()`, `cmd()`, `fillGuide()`, `finishPack()`; `PackParts.ts` has primitive
recipes for common hardware (Uno, Mega, L298N, HC-SR04, SG90, TT motor, wheel, ESP32-C3, MPU6050, TTP223, mic, breadboard, LED, resistor,
button, UBEC, flex glove, servo bank). Register the pack with one line in `PackRegistry.ts` and it appears in the Projects carousel.
**Sourcing rules used for the five bundled packs:** read the real repo / tutorial; record URL + licence in `identity` and `guide.guideSource`;
encode a wire ONLY if the source states it (everything else goes to `notSpecified`); mark every position and every part shape without a
real model as illustrative / approximate; use standard sizes only for off-the-shelf parts and say so in `notes`.
Actuators: `rig.acts[]` map a command value to rotating / moving / glowing parts or nested groups (`groups`, e.g. finger segments, servo
horn, button cap) or the whole model (`part: "*"`: yaw, roll, lift). `lab.commands[]` drive the acts; `jump` sets a value instantly.
The integrity check `c8-pack-integrity` (WizLeafPacks.ts) verifies every reference in every pack.
