"""Lighter G1 meshes for the web: every STL in models/unitree_g1/assets, simplified in place.

Unitree's meshes are 19 MB (390 k triangles) for a robot drawn a few hundred pixels tall: the
largest single download of the page after MuJoCo. Each mesh keeps KEEP of its triangles (never
fewer than MIN_TRIANGLES), by quadric decimation, which keeps the silhouette and the hard edges the
flat shading shows. The physics does not change where the policies run: scene_mjx.xml (training's
and the web's once a policy is loaded) uses these meshes only to be seen (density 0, no contacts),
and every body's mass and inertia are written in the XML.

    python -I physics/scripts/decimate_meshes.py   (needs numpy, numpy-stl, fast-simplification)
"""

import sys
from pathlib import Path

import fast_simplification
import numpy as np
from stl import mesh as stl_mesh

ASSETS = Path(__file__).resolve().parent.parent / "models" / "unitree_g1" / "assets"
# A fifth of the triangles: at the size the web draws the robot, the difference is under a pixel
# on the silhouette (compared by eye at 1:1 in the landing's close-up, the closest shot).
KEEP = 0.2
# Small parts (the ankle pitch links, ~1 k triangles) would lose their shape below this.
MIN_TRIANGLES = 600
# Left whole: the chest's UNITREE lettering, whose letters broke apart at a fifth (240 KB, the
# landing's close-up shows it full screen).
KEEP_WHOLE = {"logo_link.STL"}


def decimate(path: Path) -> tuple[int, int]:
    triangles = stl_mesh.Mesh.from_file(str(path)).vectors.reshape(-1, 3).astype(np.float64)
    points, faces = np.unique(triangles.round(7), axis=0, return_inverse=True)
    faces = faces.reshape(-1, 3)
    faces = faces[(faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])]
    keep = max(KEEP, MIN_TRIANGLES / len(faces))
    if keep >= 0.95:
        return len(faces), len(faces)
    points, faces = fast_simplification.simplify(points.astype(np.float32), faces.astype(np.int32), target_reduction=1 - keep)
    out = stl_mesh.Mesh(np.zeros(len(faces), dtype=stl_mesh.Mesh.dtype))
    out.vectors[:] = points[faces]
    out.update_normals()
    out.save(str(path))
    return len(triangles) // 3, len(faces)


if __name__ == "__main__":
    before = after = 0
    for path in sorted(p for p in ASSETS.glob("*.STL") if p.name not in KEEP_WHOLE):
        size = path.stat().st_size
        a, b = decimate(path)
        before += size
        after += path.stat().st_size
        print(f"{path.name}: {a} -> {b} triangles")
    print(f"total {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB")
    sys.exit(0)
