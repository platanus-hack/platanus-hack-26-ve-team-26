"""The world where the G1 learns: observations, actions, reward and falls, on top of MuJoCo.

MuJoCo solves contacts and joints; everything here is ours. One `G1Env` is one robot in its own
MuJoCo world. It has no dependency on gym: `reset()` and `step(action)` with numpy arrays.

The browser (physics/, MuJoCo WASM 3.16.0, same version as here) has to build exactly the same
observation and apply the policy's output the same way, so both are spelled out in `observe()` and
`apply()`. The layout is also in training/README.md.
"""

from __future__ import annotations

from dataclasses import dataclass

from pathlib import Path

import mujoco
import numpy as np

SCENE = Path(__file__).resolve().parent.parent / "physics" / "models" / "unitree_g1" / "scene_mjx.xml"
MJCF = "unitree_g1/scene_mjx.xml"  # as policy.json names it, relative to physics/models/

# The policy decides 50 times per second: 5 physics steps of 4 ms. Fast enough to catch a stumble
# (a fall takes ~0.5 s), slow enough that each decision moves the robot measurably.
DECIMATION = 5

# One action unit moves a joint target 0.25 rad from the standing pose. The usual scale for position
# actuators on humanoids (legged_gym, MuJoCo Playground): the policy outputs ~[-1, 1] and still
# reaches big corrections, and a random untrained policy only jitters around standing.
ACTION_SCALE = 0.25

# Observation scaling: keeps every input around [-1, 1] so no term dominates the first layer.
ANG_VEL_SCALE = 0.25  # rad/s -> a hard stumble is ~4 rad/s
JOINT_VEL_SCALE = 0.05  # rad/s -> joints swing at up to ~20 rad/s

# Standing height of the pelvis in the "home" keyframe, in meters.
STAND_HEIGHT = 0.7837

# A fall: pelvis below 0.5 m (knees on the ground, from 0.78 standing) or the torso tilted more than
# 60 degrees (the gravity vector seen from the pelvis has lost half its downward part). Past either
# the G1 cannot get back up with these motors, so the episode ends there.
FALL_HEIGHT = 0.5
FALL_UPRIGHT = 0.5

# 20 s episodes: long enough to take several pushes, short enough that every robot restarts often
# and the policy keeps seeing the first second after a reset.
EPISODE_STEPS = 1000

# The push of physics/ (the pitch's "Empujar" button) is 250 N for 0.1 s on the torso. Training uses
# up to 300 N, a bit more than the demo, so 250 N is inside what it learned and not its edge. A run
# that continues a trained policy can raise the floor (--push-min) to spend its time on hard pushes.
PUSH_N = (0.0, 300.0)
PUSH_STEPS = 5  # 0.1 s at 50 Hz
PUSH_EVERY_S = (2.0, 4.0)  # a new push every 2 to 4 s, at random

# Start each episode a little off the keyframe: the policy must stand from many nearby poses, not
# replay one. 0.05 rad per joint is a visible but harmless wobble.
INIT_JOINT_NOISE = 0.05
INIT_VEL_NOISE = 0.1

OBS_DIM = 3 + 3 + 29 + 29 + 29
NU = 29


@dataclass(frozen=True)
class Stance:
    """What a quiet stance is worth, on top of the base reward. All zero (the default) is the reward
    g1-stand learned with: it balances and takes pushes, but it learned to do so pivoting on one foot
    at 57 deg/s, because nothing below cared. ppo.py --reward sets these (training/README.md).

    Penalties are quadratic, not exp(-x^2/s): a saturated exp has no gradient once the robot is
    far from still (stand-v4 kept its feet moving 1 m for that reason). The foot terms only count
    when calm, i.e. no push in the last calm_s: a step is how a 250 N push is survived (its 25 N s
    move the pelvis 0.7 m/s, past the edge of the foot), and stand-v5 never learned to step because
    it was charged for it from step 0.
    """

    turn: float = 0.0  # per (rad/s)^2 of yaw rate: 0.3 makes today's 1 rad/s pivot cost a third of the reward
    feet: float = 0.0  # per (m/s)^2 of both ankles' horizontal speed, when calm: 0.5 charges a 0.47 m/s tap 0.11
    planted: float = 0.0  # bonus when calm with both feet on the floor (a tap lifts a foot 2-4 cm)
    rate: float = 0.005  # per unit of squared action change: 0.005 is what g1-stand learned with (0.5 % of its reward); 0.02 is the usual share
    calm_s: float = 1.0  # a push's recovery takes 1.0-1.8 s (measured on g1-stand); the first second is free


# A foot is planted when its ankle is within this of where it rests when standing: a tap lifts it
# 2 to 4.5 cm, a planted foot rolling on its sole moves its ankle less than 1 cm.
PLANTED_M = 0.01
FEET = ("left_ankle_roll_link", "right_ankle_roll_link")


class G1Env:
    def __init__(self, seed: int = 0, push: bool = True, push_n: tuple[float, float] = PUSH_N,
                 push_every: tuple[float, float] = PUSH_EVERY_S, stance: Stance | None = None):
        self.model = mujoco.MjModel.from_xml_path(str(SCENE))
        self.data = mujoco.MjData(self.model)
        self.rng = np.random.default_rng(seed)
        self.push_enabled = push
        self.push_n = push_n
        self.push_every = push_every
        self.stance = stance or Stance()
        self.feet = [self.model.body(name).id for name in FEET]
        self.feet_rest = np.zeros(2)  # ankle heights when standing, set at reset
        self.prev_feet = np.zeros((2, 2))  # ankle xy at the previous decision
        self.last_push = -10**9  # decision when the last push started
        key = self.model.key("home")
        self.home_qpos = key.qpos.copy()
        self.default = key.ctrl.copy()  # joint targets of the standing pose
        self.ctrl_low, self.ctrl_high = self.model.actuator_ctrlrange.T.copy()
        self.torso = self.model.body("torso_link").id
        self.prev_ctrl = self.default.copy()
        self.steps = 0
        self.next_push = 0
        self.push_left = 0
        self.push_force = np.zeros(3)

    # --- What the policy sees and does (mirrored in the browser) ---------------------------------

    def observe(self) -> np.ndarray:
        """93 numbers, in this order:

        - [0:3]   pelvis angular velocity in its own frame (qvel[3:6]) x 0.25
        - [3:6]   gravity direction seen from the pelvis (unit vector; (0, 0, -1) when upright)
        - [6:35]  joint angles minus the standing pose (qpos[7:] - default)
        - [35:64] joint velocities (qvel[6:]) x 0.05
        - [64:93] previous motor targets as actions: (prev_ctrl - default) / 0.25
        """
        qpos, qvel = self.data.qpos, self.data.qvel
        return np.concatenate([
            qvel[3:6] * ANG_VEL_SCALE,
            gravity_in_body(qpos[3:7]),
            qpos[7:] - self.default,
            qvel[6:] * JOINT_VEL_SCALE,
            (self.prev_ctrl - self.default) / ACTION_SCALE,
        ]).astype(np.float32)

    def apply(self, action: np.ndarray) -> np.ndarray:
        """Policy output -> motor targets (ctrl): the standing pose plus 0.25 rad per unit, clipped
        to each motor's range. The exported ONNX already does this and outputs ctrl directly."""
        ctrl = np.clip(self.default + ACTION_SCALE * action, self.ctrl_low, self.ctrl_high)
        self.data.ctrl[:] = ctrl
        return ctrl

    # --- Episode ---------------------------------------------------------------------------------

    def reset(self) -> np.ndarray:
        d = self.data
        mujoco.mj_resetData(self.model, d)
        d.qpos[:] = self.home_qpos
        d.qpos[7:] += self.rng.normal(0, INIT_JOINT_NOISE, NU)
        d.qvel[:] = self.rng.normal(0, INIT_VEL_NOISE, self.model.nv)
        mujoco.mj_forward(self.model, d)
        self.prev_ctrl = self.default.copy()
        self.feet_rest = d.xpos[self.feet, 2].copy()
        self.prev_feet = d.xpos[self.feet, :2].copy()
        self.last_push = -10**9
        self.steps = 0
        self.push_left = 0
        self.next_push = self._draw_push_time()
        return self.observe()

    def step(self, action: np.ndarray) -> tuple[np.ndarray, float, bool, bool, dict]:
        """Returns obs, reward, terminated (fell), truncated (time up), info."""
        ctrl = self.apply(action)
        self._push()
        for _ in range(DECIMATION):
            mujoco.mj_step(self.model, self.data)
        self.steps += 1
        reward, info = self.reward(ctrl)
        self.prev_ctrl = ctrl
        self.prev_feet = self.data.xpos[self.feet, :2].copy()
        fell = self.fallen()
        return self.observe(), reward, fell, self.steps >= EPISODE_STEPS and not fell, info

    def fallen(self) -> bool:
        up = -gravity_in_body(self.data.qpos[3:7])[2]
        return self.data.qpos[2] < FALL_HEIGHT or up < FALL_UPRIGHT

    def reward(self, ctrl: np.ndarray) -> tuple[float, dict]:
        """About 1 per step when standing still and upright; less when tilted, sagging or twitching.

        Every term is positive and the total never goes below 0, so falling (which ends the episode
        and its future rewards) is the worst outcome without a separate penalty.
        """
        qpos, qvel = self.data.qpos, self.data.qvel
        g = gravity_in_body(qpos[3:7])
        w = self.stance
        calm = self.steps - self.last_push >= w.calm_s * 50
        terms = {
            # Upright: tilt of 0.2 rad (11 degrees) already halves it.
            "upright": 0.4 * np.exp(-(g[0] ** 2 + g[1] ** 2) / 0.04),
            # Height: 5 cm of sag halves it, so it learns to keep its knees, not to crouch.
            "height": 0.3 * np.exp(-((qpos[2] - STAND_HEIGHT) ** 2) / 0.0036),
            # Near the standing pose: keeps arms and waist calm instead of flailing to balance.
            "pose": 0.2 * np.exp(-np.sum((qpos[7:] - self.default) ** 2) / 1.0),
            # Still: pelvis drifting at 0.5 m/s halves it.
            "still": 0.1 * np.exp(-np.sum(qvel[:2] ** 2) / 0.25),
        }
        if w.planted:
            down = np.all(self.data.xpos[self.feet, 2] - self.feet_rest < PLANTED_M)
            terms["planted"] = w.planted * float(calm and down)
        # Smoothness: big jumps between consecutive targets shake the robot (and a real one's gears).
        rate = np.sum(((ctrl - self.prev_ctrl) / ACTION_SCALE) ** 2)
        terms["rate"] = -w.rate * rate
        if w.turn:
            terms["turn"] = -w.turn * qvel[5] ** 2  # qvel[5]: the pelvis' angular velocity about its own z, the yaw rate while upright
        if w.feet:
            dt = DECIMATION * self.model.opt.timestep
            speed2 = np.sum((self.data.xpos[self.feet, :2] - self.prev_feet) ** 2) / dt**2
            terms["feet"] = -w.feet * speed2 * float(calm)
        total = max(sum(terms.values()), 0.0)
        return float(total), terms

    # --- Pushes ----------------------------------------------------------------------------------

    def _draw_push_time(self) -> int:
        return self.steps + int(self.rng.uniform(*self.push_every) * 50)

    def _push(self) -> None:
        f = self.data.xfrc_applied
        # Random pushes only when enabled; a push_now() push runs its 0.1 s either way.
        if self.push_enabled and self.push_left == 0 and self.steps >= self.next_push:
            angle = self.rng.uniform(0, 2 * np.pi)
            self.push_force = self.rng.uniform(*self.push_n) * np.array([np.cos(angle), np.sin(angle), 0])
            self.push_left = PUSH_STEPS
            self.last_push = self.steps
            self.next_push = self._draw_push_time()
        if self.push_left > 0:
            f[self.torso, :3] = self.push_force
            self.push_left -= 1
        else:
            f[self.torso, :3] = 0

    def push_now(self, force_n: float, angle: float) -> None:
        """A push like the web's button, for evaluation."""
        self.push_force = force_n * np.array([np.cos(angle), np.sin(angle), 0])
        self.push_left = PUSH_STEPS
        self.last_push = self.steps


def gravity_in_body(quat: np.ndarray) -> np.ndarray:
    """World gravity direction (0, 0, -1) rotated into the pelvis frame. quat is MuJoCo's (w, x, y, z)."""
    w, x, y, z = quat
    # Third row of the rotation matrix body->world, negated: R^T @ (0, 0, -1).
    return -np.array([2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)])
