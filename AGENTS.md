# Team 26: context for agents

Official repo of team 26 at **Platanus Hack 26 Caracas** (October 23 to 25, 2026), track **🧊 Three-Dimensional**: Juan, Pastor, César and Ale. The product is **Tridi**, for Physical AI: it turns video into training data for humanoid robots. Video or camera → 3D skeleton of one person → the motion on a simulated Unitree G1 (MuJoCo) → the robot learns it by imitation, with pushes and varied worlds → it delivers a small trained policy (ONNX) and the physics-corrected motion data. Pitch, and what is true today versus planned: [`docs/pitch/pitch-producto.md`](docs/pitch/pitch-producto.md); how it is built, by area: [`docs/plan-producto.md`](docs/plan-producto.md). Origin of the idea: [`docs/decisiones/2026-10-23-idea-tridi.md`](docs/decisiones/2026-10-23-idea-tridi.md). The repo is public, it closes Sunday 08:30, and judges read it with AI agents: keep it clean, and write the reason next to every threshold or magic number.

## Start of every session

1. Read [`docs/estado.md`](docs/estado.md) (where each part is now) and the latest files in [`docs/bitacora/`](docs/bitacora) (what happened while this person was away).
   Before writing product copy or claims (web, README, pitch), check the "Qué es verdad hoy y qué es plan" table in [`docs/pitch/pitch-producto.md`](docs/pitch/pitch-producto.md): what is planned is never shown as done.
2. Research, pitches, judges and the study guide live in the team's **private** sibling repo `../platanus-ideas` (start at `docs/preparacion/00-empieza-aqui.md`). Use it as context; never copy private material (chats, personal notes) into this public repo.

## Git workflow (mandatory)

Full detail in [`CONTRIBUTING.md`](CONTRIBUTING.md). What an agent must do:

- **Never commit on `main`.** A pre-push hook (`.githooks/pre-push`, enabled by `scripts/setup.sh`) rejects direct pushes to it. Work on the person's branch `<name>/<topic>`; if you are on `main`, create one first.
- **A `sync-main:` message at the start of a prompt** comes from the hook that rebased this branch onto `origin/main`. Read the incoming commits: teammates may have changed code you depend on. If it reports a conflict, resolve it with `git rebase origin/main` before anything else, keeping both sides' intent; if the conflict is in another person's folder, ask before choosing.
- **Commit small and often**, in English with conventional commits and the area as scope: `feat(physics): ...`, `fix(data): ...`, `docs(pitch): ...`. One logical change per commit.
- **Ship when something works**: `scripts/ship.sh "<type(scope): title>"` squash-merges the branch into `main` and resets the branch to the new `main`. Only ship code that runs: `main` is what gets deployed. Ask the person before shipping if they have not asked you to.
- **Stay in your owner's folder.** If you must touch another area, make it a separate small commit and tell the person so they can warn its owner.
- **Shared contract** (message formats, types, data schema) lives in [`docs/contrato.md`](docs/contrato.md) and its types file. A contract change is its own commit, shipped before the code that uses it.

## Session log (mandatory)

Rules and template in [`docs/bitacora/README.md`](docs/bitacora/README.md).

- **One file per session, updated after every prompt** that changes code, docs or decisions. A `bitacora:` message at the start of each prompt names this session's file, or says there is none yet.
- Create it as `docs/bitacora/YYYY-MM-DD-HHMM-<person>-<topic>.md` with the `sesion:` id the hook gives you. Only ever edit this session's file.
- Before finishing each reply, update it: what was done, what worked, what did not and why, decisions, what comes next. Commit it with the work (`docs(bitacora): ...` if alone).
- When the session's work changes the big picture, update only this person's section of [`docs/estado.md`](docs/estado.md). Decisions that affect others also go to [`docs/decisiones/`](docs/decisiones); open questions to [`docs/preguntas-abiertas.md`](docs/preguntas-abiertas.md).

## Team

| Person | GitHub | Area | Folder |
| --- | --- | --- | --- |
| Pastor | @torpass | Physics engine, robot, retargeting and 3D render | `physics/` |
| Juan | @juanevillam | Data extraction: camera and video to a clean pose clip of one subject | `data/` |
| César | @cisorm | User experience of the simulation (web app) | `web/` |
| Ale | @alehernandezt | Strategy, pitch and script (does not code) | `docs/` |
| Pastor, then Juan | @torpass | Policy training (Juan joins with the first `PoseClip`) | `training/` |

## Submission files (from the organizers)

`platanus-hack-project.jsonc` (name, Spanish one-liner and description, deploy URL), `project-description.md`, `project-logo.png` (1000x1000, max 500 KB) and a concise `README.md`. Edit them only when the person asks.

Platanus validates **every commit on `main`** and posts "Submission Invalid" in Discord if these files hold placeholders, or lose their filled values. `scripts/ship.sh` runs `scripts/check-submission.sh` and refuses to ship otherwise. `deploy-url` is https://tridi-alpha.vercel.app.

## Deploy

Vercel and Render cannot connect to this organization repo, so they deploy from the public mirror [`Torpass/tridi`](https://github.com/Torpass/tridi), which `scripts/ship.sh` updates after every merge (`scripts/mirror.sh`). Never commit to the mirror. Detail in [`docs/decisiones/2026-10-23-deploy.md`](docs/decisiones/2026-10-23-deploy.md).

- **Web:** Vercel project `tridi` (Pastor's account), production https://tridi-alpha.vercel.app, built from `physics/` until `web/` exists.
- **Video server:** `data/server.py` runs on Juan's Mac behind a Cloudflare tunnel (`data/serve.sh`); the web finds it through `?api=`. It keeps only PoseClips, never videos. Detail in [`docs/decisiones/2026-10-24-servidor-de-video-en-la-mac.md`](docs/decisiones/2026-10-24-servidor-de-video-en-la-mac.md).

## Conventions

- Code, commits and PRs in English. Docs and texts for the team in Spanish.
- Every long operation shows its progress; main buttons stay visible without scrolling.
