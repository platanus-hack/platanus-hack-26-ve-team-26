# Unitree Dex3-1 (manos del G1)

Las manos de tres dedos del G1 de [MuJoCo Menagerie](https://github.com/google-deepmind/mujoco_menagerie/tree/main/unitree_g1), commit `f3b6013`, el mismo del G1 de `../unitree_g1`. Licencia BSD-3-Clause de Unitree Robotics, en [`LICENSE`](LICENSE).

Solo se dibujan: en En vivo reemplazan a las manos de goma mientras el robot copia a una persona (`src/dex3.js`), con los dedos sacados de los de la persona (`src/fingers.js`). El modelo de física y las políticas siguen con las 29 articulaciones sin manos.

| Archivo | Qué es |
| --- | --- |
| `g1_with_hands.xml` | El MJCF de Menagerie, sin cambios: de donde salen las cadenas |
| `hands.json` | Por mano, la palma y los 7 cuerpos de los dedos (posición, orientación, eje y rango de cada articulación, malla), generado con `python -I scripts/make_dex3_hands.py` |
| `assets/` | Las 16 mallas de las manos (palma, pulgar ×3, índice ×2, medio ×2, por lado), simplificadas a un quinto con `scripts/decimate_meshes.py models/dex3/assets`: 16,3 → 3,3 MB |

Tres dedos por mano: pulgar, índice y medio. El medio sigue al medio, anular y meñique de la persona juntos.
