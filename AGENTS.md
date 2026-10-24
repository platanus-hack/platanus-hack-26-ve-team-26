# Team 26: context for agents

Official repo of team 26 at **Platanus Hack 26 Caracas** (October 23 to 25, 2026), track **🧊 Three-Dimensional**: Juan, Pastor, César and Ale. The idea is Physical AI; its details get written here and in `docs/` as they are decided. The repo is public, it closes Sunday 08:30, and judges read it with AI agents: keep it clean, and write the reason next to every threshold or magic number.

## Start of every session

1. Read [`docs/estado.md`](docs/estado.md) (where each part is now) and the latest files in [`docs/bitacora/`](docs/bitacora) (what happened while this person was away).
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
| Pastor | @torpass | Physics engine | TBD |
| Juan | @juanevillam | Data: where it comes from, what we do with it, how it is rendered | TBD |
| César | @cisorm | TBD | TBD |
| Ale | @alehernandezt | Documentation, pitch and script (does not code) | `docs/` |

## Submission files (from the organizers)

`platanus-hack-project.jsonc` (name, Spanish one-liner and description, deploy URL), `project-description.md`, `project-logo.png` (1000x1000, max 500 KB) and a concise `README.md`. Edit them only when the person asks.

## Conventions

- Code, commits and PRs in English. Docs and texts for the team in Spanish.
- Every long operation shows its progress; main buttons stay visible without scrolling.
