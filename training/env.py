"""The world where the G1 learns: observations, actions, reward and falls, on top of MuJoCo.

MuJoCo solves contacts and joints; everything here is ours. One `G1Env` is one robot in its own
MuJoCo world. It has no dependency on gym: `reset()` and `step(action)` with numpy arrays.

The browser (physics/, MuJoCo WASM 3.16.0, same version as here) has to build exactly the same
observation and apply the policy's output the same way, so both are spelled out in `observe()` and
`apply()`. The layout is also in training/README.md.
"""

from __future__ import annotations

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


class G1Env:
    def __init__(self, seed: int = 0, push: bool = True, push_n: tuple[float, float] = PUSH_N):
        self.model = mujoco.MjModel.from_xml_path(str(SCENE))
        self.data = mujoco.MjData(self.model)
        self.rng = np.random.default_rng(seed)
        self.push_enabled = push
        self.push_n = push_n
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
        fell = self.fallen()
        return self.observe(), reward, fell, self.steps >= EPISODE_STEPS and not fell, info

    def fallen(self) -> bool:
        up = -gravity_in_body(self.data.qpos[3:7])[2]
        return self.data.qpos[2] < FALL_HEIGHT or up < FALL_UPRIGHT

    def reward(self, ctrl: np.ndarray) -> tuple[float, dict]:
        """About 1 per step when standing still and upright; less when tilted, sagging or twitching.

        Every term is positive, so falling (which ends the episode and its future rewards) is the
        worst outcome without a separate penalty.
        """
        qpos, qvel = self.data.qpos, self.data.qvel
        g = gravity_in_body(qpos[3:7])
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
        # Smoothness: big jumps between consecutive targets shake the robot (and a real one's gears).
        rate = np.sum(((ctrl - self.prev_ctrl) / ACTION_SCALE) ** 2)
        total = sum(terms.values()) - 0.005 * rate
        terms["rate"] = -0.005 * rate
        return float(total), terms

    # --- Pushes ----------------------------------------------------------------------------------

    def _draw_push_time(self) -> int:
        return self.steps + int(self.rng.uniform(*PUSH_EVERY_S) * 50)

    def _push(self) -> None:
        f = self.data.xfrc_applied
        # Random pushes only when enabled; a push_now() push runs its 0.1 s either way.
        if self.push_enabled and self.push_left == 0 and self.steps >= self.next_push:
            angle = self.rng.uniform(0, 2 * np.pi)
            self.push_force = self.rng.uniform(*self.push_n) * np.array([np.cos(angle), np.sin(angle), 0])
            self.push_left = PUSH_STEPS
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


def gravity_in_body(quat: np.ndarray) -> np.ndarray:
    """World gravity direction (0, 0, -1) rotated into the pelvis frame. quat is MuJoCo's (w, x, y, z)."""
    w, x, y, z = quat
    # Third row of the rotation matrix body->world, negated: R^T @ (0, 0, -1).
    return -np.array([2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)])
