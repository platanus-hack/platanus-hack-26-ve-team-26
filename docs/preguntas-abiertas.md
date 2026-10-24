# Preguntas abiertas

Lo que falta decidir o averiguar. Se agrega al final con quién la hizo y a quién le toca; cuando se responde, se tacha y se enlaza la respuesta (una decisión, una bitácora o un commit).

- **Deploy desde el repo de la organización** (Juan): Vercel y Render no se conectan a repos de la organización. El README de Platanus propone espejar en un repo personal con un segundo push URL, pero los merges con `ship.sh` ocurren en GitHub y no pasan por ese push. ¿Quién mantiene el espejo y cómo (un push de `main` tras cada ship, o una GitHub Action)?
- **¿Quién entrena la política?** (Juan, para los 4): el esquema reparte motor, UX, datos y negocio, pero nadie tiene `training/` (retargeting → PPO con imitación en MuJoCo → ONNX). Es la pieza más larga (horas de Mac). Propuesta: Pastor lo arranca porque vive dentro de MuJoCo, y Juan se suma apenas `data/` entregue el primer `PoseClip`.
- **¿Qué robot?** (Pastor): humanoide simple de MuJoCo (entrena más rápido) o Unitree G1 de MuJoCo Menagerie (más vistoso, más lento de entrenar).
