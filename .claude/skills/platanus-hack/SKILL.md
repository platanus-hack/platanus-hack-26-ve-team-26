---
name: platanus-hack
description: Team 26's workflow for Platanus Hack 26 Caracas (Juan, Pastor, César, Ale). Use it to set up a teammate's machine (/platanus-hack setup: a parent folder with the hackathon repo platanus-hack-26-ve-team-26 and the private research repo platanus-ideas, gh, hooks and a personal branch), and whenever working in either repo: syncing with main, shipping with scripts/ship.sh, keeping the per-session log in docs/bitacora, and keeping the rival-team study in platanus-ideas current. Trigger on /platanus-hack, "set up the hackathon repo", "ship this", "update the bitácora", "actualiza la competencia", or any work inside platanus-hack-26-ve-team-26 or platanus-ideas.
---

# Platanus Hack: team 26 workflow

Two repos side by side in one parent folder:

- `platanus-hack-26-ve-team-26`: the official public repo (`git@github.com:platanus-hack/platanus-hack-26-ve-team-26.git`), where the product is built. Its `AGENTS.md` and `CONTRIBUTING.md` are the source of truth for the rules below.
- `platanus-ideas`: the team's private research (`git@github.com:juanevillam/platanus-ideas.git`): pitches, judges, past winners, the study guide. Context only; nothing private gets copied into the public repo.

Talk to the person in Spanish. Code, commits and PRs in English.

## Setup (`/platanus-hack setup`)

Run these in order, stopping at the first failure with the exact fix:

1. **gh.** `gh --version`. Missing: on macOS offer `brew install gh` (run it if they agree); elsewhere point to https://cli.github.com. Then `gh auth status`; if not logged in, ask them to run `gh auth login` themselves (GitHub.com, SSH, browser) and wait. You never handle their credentials.
2. **Access.** `gh repo view platanus-hack/platanus-hack-26-ve-team-26` and `gh repo view juanevillam/platanus-ideas`. If the second fails, they have not accepted Juan's invitation: send them to https://github.com/notifications, or to ask Juan for one.
3. **Parent folder.** Ask where and what to call it (suggest `platanus-hack` inside their usual code folder). Create it.
4. **Clone** both repos into it with SSH. If a repo already exists there, `git -C <repo> pull --rebase` instead of cloning again.
5. **Hooks.** In the hackathon repo run `scripts/setup.sh` (pre-push guard for `main`, `pull.rebase`, `rerere`).
6. **Branch.** Ask their name and first topic, then `git switch -c <name>/<topic>` (lowercase, no accents: `cesar/ui`, `ale/docs`).
7. **Close.** Show the resulting tree and tell them: open Claude Code inside `platanus-hack-26-ve-team-26/` and accept trusting the folder so its hooks run; read `docs/estado.md` to see where everything is; the full workflow is in `CONTRIBUTING.md`.

## Working in the hackathon repo

- **Start of a session:** read `docs/estado.md` and the newest files in `docs/bitacora/`. Use `../platanus-ideas` for research context.
- **Every prompt** starts with two hook messages:
  - `sync-main:` the branch was rebased onto `origin/main`; read the incoming commits. On a conflict, resolve it with `git rebase origin/main` before anything else, keeping both sides' intent; ask before choosing inside another person's folder.
  - `bitacora:` names this session's log file, or says there is none yet.
- **Never commit on `main`.** Small conventional commits with the area as scope (`feat(physics): ...`).
- **Ship** when something works: `scripts/ship.sh "<type(scope): title>"`. It squash-merges into `main` and leaves the branch equal to `main`. Ask before shipping unless told to.
- **Contract changes** (`docs/contrato.md` and its types) are their own commit, shipped before the code that uses them.

## Session log (bitácora)

One file per session in `docs/bitacora/`, named `YYYY-MM-DD-HHMM-<person>-<topic>.md`, with `sesion: <id from the bitacora hook>` in its front matter. Template and rules in `docs/bitacora/README.md`.

- Create it on the first prompt that changes code, docs or decisions; **update it before finishing every reply** of the session: what was done, what worked, what did not and why, decisions, what comes next.
- Edit only this session's file. Commit it with the work; it reaches `main` on the next ship.
- When the big picture changes, update only this person's section of `docs/estado.md`. Cross-team decisions go to `docs/decisiones/AAAA-MM-DD-<tema>.md`; open questions to `docs/preguntas-abiertas.md`.
- On "cierra la sesión" or when the work is done: `estado: cerrada`, update `docs/estado.md`, commit and offer to ship.

## Competition study (always on)

The other teams' repos in the `platanus-hack` org are public, and the team keeps a study of them in **platanus-ideas** (private): `docs/research/competencia/`, with its own `README.md` explaining the routine. Nothing about it goes in this repo.

**At the start of every session**, in either repo, run one pass. It costs one command and it is how the team finds out that a rival pivoted:

```bash
../platanus-ideas/docs/research/competencia/actualizar.sh    # or ./docs/... from platanus-ideas
```

- It clones or updates the rival repos into `../competencia/` (sibling of both repos, **outside git**: other teams' code is never versioned in ours) and prints what changed since the documents were last written.
- **`SIN NOVEDADES` means stop.** Say so in one line and move on: no reading, no writing, no commit.
- Otherwise: read each changed team's new commits, what they added (README, `platanus-hack-project.jsonc`, docs, code) and curl their deploy URL; update `caracas-2026.md` (the "Actualizado" header, the pass number, the table rows and the fichas that moved) and `three-dimensional.md` when our own track moves or something is worth copying; rewrite their "Cambios desde la última pasada" section for this pass instead of appending; then `actualizar.sh --marcar`, commit in English (`docs(research): ...`) and push straight to `main` of platanus-ideas — that repo has no `ship.sh`.

**Score every team on each pass.** `caracas-2026.md` carries a scoreboard built with the event's real rubric, and `three-dimensional.md` carries the same for our track. The criteria are not just weights, they are questions, and they change how to score:

| Criterion | Weight | What the judge asks |
| --- | --- | --- |
| Technical | 25 % | Is there real engineering? Do the methods fit the problem? Is it **robust, efficient and secure**? |
| Ambition | 20 % | Are they after something big? How far are they **pushing the limits**? |
| Execution | 20 % | How much did they **build during this hack**? Is it what **a talented team with 36 hours and frontier AI tools** should reach? |
| Impact | 20 % | How much better is someone's life? Is it a **real leap over the status quo**? |
| Originality | 15 % | Is it new? **If the judge asks their agent, does it find something very similar already built?** |

So: execution is a relative bar, not a file count; originality is decided by a live search, so whatever an agent finds in ten seconds is the mark; and technical covers robustness and security, so a single point of failure or an exposed secret costs points however clever the algorithm is. Re-score the teams that moved, judging **only what is in the repo and the deploy right now**, the way a technical judge who verifies everything would. Keep the ranking, the top three with its reasoning, and the table of who can pass us on each criterion. Be honest: a flattering score is useless, and the person asked for it not to be. The scoreboard states its cut-off time and that it measures what exists, not what will be delivered.

**Keep it running every half hour** until the repos close (Sunday 25, 08:30). Schedule it with CronCreate at an off-minute (`7,37 * * * *`), with a prompt that does the pass above and stays silent on `SIN NOVEDADES`. The schedule lives in the session, so set it up again after a restart; the person can also just say "actualiza la competencia".

Two things to remember when reading the results:

- **A template repo proves nothing.** Platanus tells every team to mirror their code to a personal repo in order to deploy on Vercel, so a team can have half a product built and an empty public repo.
- Work in platanus-ideas (this study, pitch, research) is **not** logged in `docs/bitacora/`: the bitácora is only for work in this repo.

## Updating this skill

The repo copy at `.claude/skills/platanus-hack/SKILL.md` is the source. To refresh the user-level copy:

```bash
gh api repos/platanus-hack/platanus-hack-26-ve-team-26/contents/.claude/skills/platanus-hack/SKILL.md -H "Accept: application/vnd.github.raw" > ~/.claude/skills/platanus-hack/SKILL.md
```
