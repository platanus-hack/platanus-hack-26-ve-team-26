"""The Dex3 hands' chains, from Menagerie's g1_with_hands.xml, as models/dex3/hands.json.

The web draws these hands on the G1 in En vivo only (src/dex3.js): their bodies hang from each
wrist_yaw_link, so this keeps, per side, the palm's mesh and every finger body below the wrist
(position, orientation, joint axis and range, mesh), in the XML's order. The physics model and
the policies keep the 29 joints without hands.

    python -I physics/scripts/make_dex3_hands.py
"""

import json
import xml.etree.ElementTree as ET
from pathlib import Path

DEX3 = Path(__file__).resolve().parent.parent / "models" / "dex3"


def floats(text, default):
    return [float(v) for v in text.split()] if text else default


def chain(body, parent, out):
    for child in body.findall("body"):
        joint = child.find("joint")
        visual = next(g for g in child.findall("geom") if g.get("class") == "visual")
        out.append({
            "name": child.get("name"),
            "parent": parent,
            "pos": floats(child.get("pos"), [0, 0, 0]),
            "quat": floats(child.get("quat"), [1, 0, 0, 0]),
            "joint": joint.get("name"),
            "axis": floats(joint.get("axis"), [0, 0, 1]),
            "range": floats(joint.get("range"), [0, 0]),
            "mesh": visual.get("mesh"),
        })
        chain(child, child.get("name"), out)


root = ET.parse(DEX3 / "g1_with_hands.xml").getroot()
hands = {}
for side in ("left", "right"):
    wrist = next(b for b in root.iter("body") if b.get("name") == f"{side}_wrist_yaw_link")
    palm = next(g for g in wrist.findall("geom") if g.get("class") == "visual" and "palm" in g.get("mesh"))
    bodies = []
    chain(wrist, None, bodies)
    hands[side] = {
        "palm": {"mesh": palm.get("mesh"), "pos": floats(palm.get("pos"), [0, 0, 0]), "quat": floats(palm.get("quat"), [1, 0, 0, 0])},
        "bodies": bodies,
    }
(DEX3 / "hands.json").write_text(json.dumps(hands, indent=1) + "\n")
print({side: [b["joint"] for b in h["bodies"]] for side, h in hands.items()})
