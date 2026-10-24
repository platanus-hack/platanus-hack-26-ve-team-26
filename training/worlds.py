"""The worlds of physics/worlds/<id>.json in Python: floor grip, robot mass, motor strength, wind,
pushes and the stones scene, applied with the same formulas as physics/src/sim.js applyWorld().

Training and the dataset share them. ppo.py --worlds gives each robot one world (robot i gets world
i mod n) and draws new values inside that world's ranges at every reset, so the policy never learns
one floor and one robot: it has to catch itself on a slippery floor, in a side wind, on stones, with
weaker motors. rollout.py runs a finished policy in the same worlds.
"""

from __future__ import annotations

import json
from pathlib import Path

import mujoco
import numpy as np

from .env import MJCF, PUSH_EVERY_S, PUSH_N, G1Env, Stance
from .imitate import DEFAULT_MOTION, MimicEnv

ROOT = Path(__file__).resolve().parent.parent
WORLDS_DIR = ROOT / "physics" / "worlds"
MODELS = ROOT / "physics" / "models"

# Display order of physics/src/worlds.js: the reference world first.
WORLD_ORDER = ["plano", "piedras", "resbaloso", "viento"]

# Wind -> force on the torso, as physics/src/worlds.js: F = 1/2 rho Cd A v^2 with air at
# 1.2 kg/m^3 and Cd A ~ 0.5 m^2 for a standing person (10 m/s ~ 30 N).
AIR_DENSITY = 1.2
DRAG_AREA_M2 = 0.5

GROUND = ("floor", "stones")

# The ranges of physics/worlds/<id>.json that an episode draws from.
PARAMS = ("friction", "wind_mps", "mass_scale", "motor_scale", "push_n")


def wind_force(mps: float) -> float:
    return 0.5 * AIR_DENSITY * DRAG_AREA_M2 * mps * mps


def load_world(world_id: str) -> dict:
    return json.loads((WORLDS_DIR / f"{world_id}.json").read_text())


def draw_params(world: dict, rng: np.random.Generator) -> dict:
    """One value per parameter, uniform inside the world's ranges."""
    return {k: round(float(rng.uniform(*world[k])), 3) for k in PARAMS}


class InWorld:
    """Mixin for G1Env and MimicEnv: the world's scene, and apply_world() for one draw of its values.

    With redraw=True (training), every reset draws new values first. Pushes take the world's
    strongest push, capped by the env's own push_n: ppo.py --push-max still works as a curriculum
    (e.g. a walk that starts with 100 N and is continued with 300 N). The wind is capped the same
    way by wind_max (ppo.py --wind-max): stand-worlds-v1 met 14 m/s (~59 N, steady) from its first
    step and lost what it knew on every floor (training/README.md).
    """

    def setup_world(self, world: dict, redraw: bool, wind_max: float | None = None) -> None:
        self.world = world
        self.redraw = redraw
        self.push_cap = self.push_n
        self.wind_max = wind_max
        if world["scene"] != MJCF:
            # Swap in the world's scene. Stones are a few cm, so a reference grounded on the flat
            # model keeps its pelvis height (physics/worlds/piedras.json).
            self.model = mujoco.MjModel.from_xml_path(str(MODELS / world["scene"]))
            self.data = mujoco.MjData(self.model)
            self.torso = self.model.body("torso_link").id
        self.ground = {self.model.geom(n).id for n in GROUND if mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_GEOM, n) >= 0}
        self.ground_pairs = [p for p in range(self.model.npair)
                             if self.model.pair_geom1[p] in self.ground or self.model.pair_geom2[p] in self.ground]
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
        mps = p["wind_mps"] if self.wind_max is None else min(p["wind_mps"], self.wind_max)
        self.wind = wind_force(mps) * np.array([np.cos(angle), np.sin(angle)])
        low, high = self.push_cap
        strongest = min(p["push_n"], high)
        self.push_n = (min(low, strongest), strongest)
        self.push_enabled = strongest > 0

    def reset(self) -> np.ndarray:
        if self.redraw:
            self.apply_world(draw_params(self.world, self.rng))
        obs = super().reset()
        if self.world["scene"] == MJCF:
            return obs
        # G1Env starts from the keyframe, which may sit inside a stone: rest it on the ground first.
        self._touch_ground()
        self.feet_rest = self.data.xpos[self.feet, 2].copy()
        self.prev_feet = self.data.xpos[self.feet, :2].copy()
        return self.observe()

    def _push(self) -> None:
        super()._push()
        self.data.xfrc_applied[self.torso, :2] += self.wind  # the wind keeps blowing during a push

    def _touch_ground(self) -> None:
        """Moves the pelvis up or down so the lowest foot rests on the ground, stones included."""
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


class StandInWorld(InWorld, G1Env):
    def __init__(self, world: dict, seed: int, redraw: bool = True, push_n: tuple[float, float] = PUSH_N,
                 push_every: tuple[float, float] = PUSH_EVERY_S, stance: Stance | None = None,
                 wind_max: float | None = None):
        G1Env.__init__(self, seed=seed, push=True, push_n=push_n, push_every=push_every, stance=stance)
        self.setup_world(world, redraw, wind_max)


class MimicInWorld(InWorld, MimicEnv):
    def __init__(self, world: dict, seed: int, motion: str = DEFAULT_MOTION, redraw: bool = True,
                 push_n: tuple[float, float] = PUSH_N, push_every: tuple[float, float] = PUSH_EVERY_S,
                 wind_max: float | None = None):
        MimicEnv.__init__(self, seed=seed, clips=(motion,), push=True)
        self.push_n = push_n
        self.push_every = push_every
        self.setup_world(world, redraw, wind_max)
