"""The data Tridi delivers: a trained imitation policy run in every world, saved as a dataset.

    uv run --project training python -m training.rollout <policy.json> [--motion <RobotMotion.json>]
        [--episodes 8] [--worlds plano,piedras,resbaloso,viento] [--out <clip_id>.zip]

Each episode starts at the first frame of the clip and runs the exported ONNX (what the customer
gets, not the torch weights) until the clip ends or the robot falls or leaves the path. Every world
parameter is drawn from its range in physics/worlds/<id>.json, the same file the web shows, with
the same formulas as physics/src/sim.js applyWorld(). The result is the person's motion corrected
by physics so the robot can do it, under varied conditions. Format: docs/contrato.md, "Datos para
entrenar robots".
"""

from __future__ import annotations

import argparse
import io
import json
import zipfile
from pathlib import Path

import mujoco
import numpy as np
import onnxruntime as ort

from .env import ACTION_SCALE, MJCF
from .imitate import MimicEnv

ROOT = Path(__file__).resolve().parent.parent
WORLDS_DIR = ROOT / "physics" / "worlds"
MODELS = ROOT / "physics" / "models"
OUT = Path(__file__).parent / "datasets"

# Display order of physics/src/worlds.js: the reference world first.
WORLD_ORDER = ["plano", "piedras", "resbaloso", "viento"]

# 8 episodes per world: enough to see how often it falls in each one (1 in 8 is the resolution),
# and 4 worlds x 8 x a 12 s clip is ~20k rows, a few MB, in under a minute on a laptop.
EPISODES = 8

# Wind -> force on the torso, as physics/src/worlds.js: F = 1/2 rho Cd A v^2 with air at
# 1.2 kg/m^3 and Cd A ~ 0.5 m^2 for a standing person (10 m/s ~ 30 N).
AIR_DENSITY = 1.2
DRAG_AREA_M2 = 0.5

GROUND = ("floor", "stones")


def wind_force(mps: float) -> float:
    return 0.5 * AIR_DENSITY * DRAG_AREA_M2 * mps * mps


def load_world(world_id: str) -> dict:
    return json.loads((WORLDS_DIR / f"{world_id}.json").read_text())


def draw_params(world: dict, rng: np.random.Generator) -> dict:
    """One value per parameter, uniform inside the world's ranges."""
    keys = ("friction", "wind_mps", "mass_scale", "motor_scale", "push_n")
    return {k: round(float(rng.uniform(*world[k])), 3) for k in keys}


class WorldEnv(MimicEnv):
    """MimicEnv in a world: its scene, floor grip, robot mass, motor strength, wind and pushes."""

    def __init__(self, world: dict, seed: int, motion: str):
        super().__init__(seed=seed, clips=(motion,), push=True)
        if world["scene"] != MJCF:
            # Swap in the world's scene. The reference keeps the cleaning done on the flat model:
            # the stones are a few cm, so its pelvis height still holds (physics/worlds/piedras.json).
            self.model = mujoco.MjModel.from_xml_path(str(MODELS / world["scene"]))
            self.data = mujoco.MjData(self.model)
            self.torso = self.model.body("torso_link").id
        self.ground = {self.model.geom(n).id for n in GROUND if mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_GEOM, n) >= 0}
        self.ground_pairs = [p for p in range(self.model.npair)
                             if self.model.pair_geom1[p] in self.ground or self.model.pair_geom2[p] in self.ground]
        self.foot_geoms = [{self.model.geom(f"{side}_foot{k}_collision").id for k in (1, 2, 3)} for side in ("left", "right")]
        m = self.model
        self.defaults = {
            "mass": m.body_mass.copy(), "inertia": m.body_inertia.copy(), "gain": m.actuator_gainprm[:, 0].copy(),
            "bias": m.actuator_biasprm[:, 1:3].copy(), "torque": m.jnt_actfrcrange.copy(),
        }
        self.wind = np.zeros(2)

    def apply_world(self, p: dict) -> None:
        """physics/src/sim.js applyWorld(), always from the model's own values so worlds never compound."""
        m, d = self.model, self.defaults
        m.pair_friction[self.ground_pairs, 0:2] = p["friction"]
        m.body_mass[:] = d["mass"] * p["mass_scale"]
        m.body_inertia[:] = d["inertia"] * p["mass_scale"]
        m.actuator_gainprm[:, 0] = d["gain"] * p["motor_scale"]
        m.actuator_biasprm[:, 1:3] = d["bias"] * p["motor_scale"]
        m.jnt_actfrcrange[:] = d["torque"] * p["motor_scale"]
        mujoco.mj_setConst(m, self.data)
        angle = self.rng.uniform(0, 2 * np.pi)  # the wind blows from a random side, steady all episode
        self.wind = wind_force(p["wind_mps"]) * np.array([np.cos(angle), np.sin(angle)])
        self.push_n = (0.0, p["push_n"])
        self.push_enabled = p["push_n"] > 0

    def _push(self) -> None:
        super()._push()
        self.data.xfrc_applied[self.torso, :2] += self.wind  # the wind keeps blowing during a push

    def _touch_ground(self) -> None:
        """MimicEnv._touch_ground, counting the stones as floor too."""
        d = self.data
        for _ in range(40):
            mujoco.mj_forward(self.model, d)
            dist = min((d.contact[i].dist for i in range(d.ncon) if self.ground & set(d.contact[i].geom)), default=None)
            if dist is None:
                d.qpos[2] -= 0.005
            elif dist < -0.002:
                d.qpos[2] -= dist
            else:
                return

    def foot_forces(self) -> np.ndarray:
        """Force of the ground on each foot (left, right), in the world frame, in N."""
        out = np.zeros((2, 3))
        f6 = np.zeros(6)
        d = self.data
        for i in range(d.ncon):
            c = d.contact[i]
            g1, g2 = int(c.geom[0]), int(c.geom[1])
            for side, feet in enumerate(self.foot_geoms):
                if (g1 in feet and g2 in self.ground) or (g2 in feet and g1 in self.ground):
                    mujoco.mj_contactForce(self.model, d, i, f6)
                    world = c.frame.reshape(3, 3).T @ f6[:3]  # contact frame -> world
                    # The contact normal points from geom1 to geom2, so the force is the one on geom2:
                    # flipped when the foot is geom1 (checked: standing gives +z, about its weight).
                    out[side] += -world if g1 in feet else world
        return out


def run_episode(env: WorldEnv, session: ort.InferenceSession) -> dict[str, np.ndarray | bool | float]:
    obs = env.reset_at(0.0)  # from the start of the clip, like evaluate_walk.py
    rows: dict[str, list] = {k: [] for k in ("t", "qpos", "qvel", "ctrl", "foot_force", "pose_error", "pelvis_error")}
    fell = False
    while True:
        ctrl = session.run(None, {"obs": obs[None]})[0][0]
        obs, _, fell, done, _ = env.step((ctrl - env.ref_next) / ACTION_SCALE)
        ref = env.motion.sample(env.t)[0]
        d = env.data
        rows["t"].append(env.t)
        rows["qpos"].append(d.qpos.copy())
        rows["qvel"].append(d.qvel.copy())
        rows["ctrl"].append(d.ctrl.copy())
        rows["foot_force"].append(env.foot_forces())
        rows["pose_error"].append(float(np.mean(np.abs(d.qpos[7:] - ref[7:]))))
        rows["pelvis_error"].append(float(np.linalg.norm(d.qpos[:3] - ref[:3])))
        if fell or done:
            break
    out = {k: np.array(v, dtype=np.float32) for k, v in rows.items()}
    out["fell"], out["seconds"] = bool(fell), round(float(env.t), 2)
    return out


def rollout(policy_json: Path, motion: str | None, worlds: list[str], episodes: int, out: Path, seed: int = 0) -> Path:
    meta_in = json.loads(policy_json.read_text())
    if meta_in.get("task", "mimic") != "mimic" or "motion" not in meta_in:
        raise SystemExit(f"{policy_json} is not an imitation policy (task mimic with a motion)")
    session = ort.InferenceSession(str(policy_json.with_suffix(".onnx")))
    motion = motion or meta_in["motion"]  # a clip id in physics/motions/, if no file is given
    rng = np.random.default_rng(seed)

    episodes_meta, arrays = [], []
    for world_id in worlds:
        world = load_world(world_id)
        env = WorldEnv(world, seed, motion)
        if env.motion.id != meta_in["motion"]:
            raise SystemExit(f"the policy imitates {meta_in['motion']}, the motion file is {env.motion.id}")
        falls = 0
        for _ in range(episodes):
            params = draw_params(world, rng)
            env.apply_world(params)
            ep = run_episode(env, session)
            falls += ep["fell"]
            episodes_meta.append({"world": world_id, "params": params, "fell": ep["fell"], "seconds": ep["seconds"]})
            arrays.append(ep)
        print(f"{world_id:>10}: {episodes - falls}/{episodes} episodes to the end of the clip ({env.motion.duration:.1f} s)")

    n = [len(a["t"]) for a in arrays]
    npz = {"episode": np.repeat(np.arange(len(arrays)), n).astype(np.int32)}
    for k in ("t", "qpos", "qvel", "ctrl", "foot_force", "pose_error", "pelvis_error"):
        npz[k] = np.concatenate([a[k] for a in arrays])
    meta = {
        "clip_id": meta_in["motion"],
        "policy_id": meta_in["id"],
        "robot": meta_in["robot"],
        "mjcf": meta_in["mjcf"],
        "hz": 50,
        "episodes": episodes_meta,
    }
    buf = io.BytesIO()
    np.savez_compressed(buf, **npz)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".zip.tmp")  # written whole, then renamed: the server never serves half a zip
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("meta.json", json.dumps(meta, indent=2) + "\n")
        zf.writestr("rollouts.npz", buf.getvalue())
    tmp.replace(out)
    print(f"{out} ({out.stat().st_size // 1024} KB, {sum(n)} rows, {len(arrays)} episodes)")
    return out


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m training.rollout", description=__doc__.split("\n")[0])
    p.add_argument("policy", type=Path, help="the policy .json (its .onnx next to it)")
    p.add_argument("--motion", help="RobotMotion .json (default: physics/motions/<the policy's motion>.json)")
    p.add_argument("--episodes", type=int, default=EPISODES, help="episodes per world")
    p.add_argument("--worlds", default=",".join(WORLD_ORDER), help="comma separated world ids")
    p.add_argument("--out", type=Path, help="output .zip (default: training/datasets/<clip_id>.zip)")
    p.add_argument("--seed", type=int, default=0)
    args = p.parse_args()
    clip_id = json.loads(args.policy.read_text()).get("motion", "dataset")
    rollout(args.policy, args.motion, args.worlds.split(","), args.episodes, args.out or OUT / f"{clip_id}.zip", args.seed)


if __name__ == "__main__":
    main()
