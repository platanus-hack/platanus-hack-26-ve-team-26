# Unitree G1

Modelo MJCF del Unitree G1 (29 articulaciones, sin manos) de [MuJoCo Menagerie](https://github.com/google-deepmind/mujoco_menagerie/tree/main/unitree_g1), commit `f3b6013` (23 de octubre de 2026), sin cambios. Licencia BSD-3-Clause de Unitree Robotics, en [`LICENSE`](LICENSE).

| Archivo | Para qué |
| --- | --- |
| `scene.xml` + `g1.xml` | Lo que se ve hoy: colisiones con las mallas y motores rígidos (`kp=500`), con los que el robot se sostiene de pie sin política |
| `scene_mjx.xml` + `g1_mjx.xml` | Para entrenar: colisiones con cápsulas y esferas, pasos de 4 ms y motores más blandos (`kp=75` en la mayoría de las articulaciones), pensados para que una política los maneje; trae el keyframe `home` |
| `assets/` | Las 35 mallas que usan esos dos modelos (se dejaron afuera las de las manos) |
