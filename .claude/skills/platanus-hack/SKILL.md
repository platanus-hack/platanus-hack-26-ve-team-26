---
name: platanus-hack
description: Team 26's workflow for Platanus Hack 26 Caracas (Juan, Pastor, César, Ale). Use it to set up a teammate's machine (/platanus-hack setup: a parent folder with the hackathon repo platanus-hack-26-ve-team-26 and the private research repo platanus-ideas, gh, hooks and a personal branch), and whenever working in that repo: syncing with main, shipping with scripts/ship.sh, and keeping the per-session log in docs/bitacora. Trigger on /platanus-hack, "set up the hackathon repo", "ship this", "update the bitácora", or any work inside platanus-hack-26-ve-team-26.
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

## Updating this skill

The repo copy at `.claude/skills/platanus-hack/SKILL.md` is the source. To refresh the user-level copy:

```bash
gh api repos/platanus-hack/platanus-hack-26-ve-team-26/contents/.claude/skills/platanus-hack/SKILL.md -H "Accept: application/vnd.github.raw" > ~/.claude/skills/platanus-hack/SKILL.md
```
