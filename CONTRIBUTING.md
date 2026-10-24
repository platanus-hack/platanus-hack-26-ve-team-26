# Cómo trabajamos (ramas y commits)

Somos 4 trabajando en paralelo, casi siempre con agentes de IA, durante ~30 horas. El objetivo de este flujo es uno solo: **que nadie tenga que ponerse al día a mano con lo que subieron los demás.**

## La idea en 5 reglas

1. **`main` siempre funciona y es lo que se despliega.** Nadie trabaja directo en `main`.
2. **Cada persona tiene su rama de trabajo**: `<nombre>/<tema>` (`pastor/fisica`, `juan/datos`, `cesar/ui`, `ale/docs`). No es una rama por prompt ni por feature: es tu espacio, y se reinicia sola cada vez que entregas.
3. **Entregas seguido y en pedazos chicos**: cada vez que algo funciona (idealmente cada 30 a 60 minutos) corres `scripts/ship.sh`. Eso lo mete a `main` con squash, y tu rama queda igual a `main` para seguir.
4. **Antes de cada prompt, tu rama se pone al día sola.** Un hook de Claude Code (`scripts/sync-main.sh`) trae lo nuevo de `main` y rebasea tu rama encima, y le cuenta al agente qué commits llegaron del equipo. Si hay un conflicto, no toca nada y le avisa al agente para que lo resuelva.
5. **Cada quien es dueño de su carpeta.** Puedes tocar código de otro cuando haga falta, pero en un cambio chico y separado, y avisas en el grupo.

Con eso, si Juan entregó 10 cosas en 20 minutos, Ale no hace nada: en su próximo prompt ya las tiene debajo.

## El ciclo, paso a paso

```bash
# Una vez, al empezar
git switch -c pastor/fisica

# Trabajas (con el agente o a mano) y commiteas cuando quieras
git add -A && git commit -m "feat(physics): add rigid bodies for the arena"

# Cuando algo funciona: a main
scripts/ship.sh
# o con título propio para el squash:
scripts/ship.sh "feat(physics): rigid bodies and collisions"
```

`ship.sh` hace, en orden: rebasea sobre `origin/main`, revisa los archivos de entrega (`scripts/check-submission.sh`), sube tu rama, abre el PR, lo mergea con squash, borra la rama remota, deja tu rama local igual a `main` y copia `main` al espejo del deploy (`scripts/mirror.sh`). Sigues trabajando en la misma rama sin hacer nada más.

Si cambias de tema, cambia el nombre: `git switch -c pastor/ragdoll` justo después de un `ship`.

## Deploy

Vercel y Render no se conectan a repos de la organización, así que despliegan desde un espejo público: [`Torpass/tridi`](https://github.com/Torpass/tridi). `ship.sh` lo actualiza solo después de cada merge, y Vercel publica en [tridi-alpha.vercel.app](https://tridi-alpha.vercel.app) en un minuto.

- **Acepta la invitación** a `Torpass/tridi` en [github.com/notifications](https://github.com/notifications). Sin eso tu ship funciona igual, pero el deploy queda atrás hasta que alguien con acceso corra `scripts/mirror.sh`.
- **Nadie commitea en el espejo:** cada ship lo pisa con `main`.
- Detalle en [`docs/decisiones/2026-10-23-deploy.md`](docs/decisiones/2026-10-23-deploy.md).

## Quién es dueño de qué

Se llena cuando definamos la idea y el stack. Cada área vive en su carpeta para que dos personas casi nunca editen el mismo archivo.

| Persona | Área | Carpeta |
| --- | --- | --- |
| Pastor | Motor de física | por definir |
| Juan | Datos: de dónde salen, qué hacemos con ellos y cómo se pintan | por definir |
| César | por definir | por definir |
| Ale | Documentación, pitch, guion | `docs/` |

## Lo compartido: el contrato

Lo que une las partes (formato de mensajes, tipos, el esquema de los datos) vive en **un solo lugar** (`docs/contrato.md` y su archivo de tipos cuando exista).

- Cambiar el contrato es su **propio** commit, chico, y se entrega con `ship.sh` **antes** del código que lo usa.
- Se avisa en el grupo: "cambié el contrato: X". El que depende de eso lo recibe en su próximo prompt.
- Si trabajas sobre algo que otro todavía no entregó, pídele que haga `ship` de lo que tenga, aunque sea incompleto pero sin romper `main`. Mejor eso que copiar su rama.

## Cuando hay conflicto

El hook no rebasea si hay conflicto: deja todo como estaba y le avisa al agente. Para resolverlo:

```bash
git rebase origin/main
# arreglas los archivos en conflicto, conservando lo de los dos
git add -A && git rebase --continue
```

Con agentes basta con decirle "resuelve el conflicto con main conservando el cambio del otro". Si el conflicto es en la carpeta de otro, pregúntale antes de decidir.

## Si `ship.sh` falla

Se detiene en el primer error y no borra nada. Arreglas lo que dice y lo vuelves a correr: retoma donde quedó (si el PR ya existe, no abre otro).

- **`submission: ...`:** Platanus revisa cada commit de `main` y marca "Submission Invalid" en Discord si `platanus-hack-project.jsonc` o `project-description.md` tienen el texto de plantilla. Llénalos (o recupera lo que se borró) y corre `ship.sh` otra vez.
- **Conflicto al rebasear:** se resuelve igual que arriba y se corre `ship.sh` otra vez.
- **`gh` sin sesión:** `gh auth login`.
- **El merge falla** (por ejemplo, porque `main` cambió en ese segundo): vuelves a correr `ship.sh`.

## Commits

- **En inglés, con [conventional commits](https://www.conventionalcommits.org/)**: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, con el área entre paréntesis: `feat(physics): ...`, `fix(data): ...`, `docs(pitch): ...`.
- Los textos para el equipo y la documentación, en español.
- Los jueces leen el repo con agentes de IA: cada número mágico lleva su porqué en un comentario o en el README.

## Horarios clave

- **Cada corte del plan:** todos hacen `ship` de lo que tengan funcionando.
- **Congelamiento de features:** solo entran `fix:` y `docs:`.
- **Domingo 08:30:** cierre de repos. Lo que no esté en `main` no existe.

## Bitácora: el historial con contexto

Además de los commits, cada sesión de trabajo deja un archivo en [`docs/bitacora/`](docs/bitacora) con qué se buscaba, qué se hizo, qué funcionó, qué no y qué sigue. El agente lo crea en el primer prompt de la sesión y lo actualiza después de cada prompt (un hook le recuerda cuál es su archivo). Encima de eso:

- [`docs/estado.md`](docs/estado.md): dónde está cada parte ahora; cada uno edita solo su sección.
- [`docs/decisiones/`](docs/decisiones): las decisiones que afectan a otros, con su porqué.
- [`docs/preguntas-abiertas.md`](docs/preguntas-abiertas.md): lo que falta decidir.

Reglas y plantilla en [`docs/bitacora/README.md`](docs/bitacora/README.md).

## Preparar tu máquina (una vez)

La forma fácil es la skill `platanus-hack`: instala todo con un solo pedido. Necesitas acceso a los dos repos: este (lo da la organización) y `juanevillam/platanus-ideas`, el privado con la investigación (Juan te invita; acepta en github.com/notifications).

1. Instala `gh`, la terminal de GitHub. En macOS: `brew install gh`. En Windows o Linux: [cli.github.com](https://cli.github.com).
2. Inicia sesión: `gh auth login` → GitHub.com → SSH → entrar con el navegador.
3. Instala la skill:

```bash
mkdir -p ~/.claude/skills/platanus-hack && gh api repos/platanus-hack/platanus-hack-26-ve-team-26/contents/.claude/skills/platanus-hack/SKILL.md -H "Accept: application/vnd.github.raw" > ~/.claude/skills/platanus-hack/SKILL.md
```

4. Abre Claude Code en la carpeta donde quieras tener todo (por ejemplo `~/Code`) y escribe `/platanus-hack setup`. Te pregunta cómo llamar la carpeta y deja:

```
<tu-carpeta>/
├── platanus-hack-26-ve-team-26/   el repo del hackathon, donde se construye
└── platanus-ideas/                la investigación del equipo (privado)
```

Además corre `scripts/setup.sh` y crea tu rama. Después abre Claude Code en `platanus-hack-26-ve-team-26/` y acepta confiar en la carpeta, para que corran los hooks.

### A mano, sin la skill

```bash
mkdir platanus-hack && cd platanus-hack
git clone git@github.com:platanus-hack/platanus-hack-26-ve-team-26.git
git clone git@github.com:juanevillam/platanus-ideas.git
cd platanus-hack-26-ve-team-26
scripts/setup.sh
git switch -c <nombre>/<tema>
```

`setup.sh` revisa que `gh` esté listo y activa en tu clon:

- un hook que **bloquea el push directo a `main`** (el repo es de la organización y no tenemos permiso para protegerlo en GitHub, así que lo cuidamos así);
- `pull.rebase`, para que los pulls no creen commits de merge;
- `rerere`, para que git recuerde cómo resolviste un conflicto y no te lo vuelva a preguntar.
