"""Imitation: the G1 learns to move like a person by following a RobotMotion (DeepMimic style).

The RobotMotion (physics/motions/, from Pastor's retargeting of a PoseClip) says where every joint
and the pelvis should be at each instant. That pose is not physically guaranteed (feet can slide,
balance is not checked), so playing it back would fall; the policy learns to stay close to it while
the physics keeps it honest.

Same robot, actions and physics as env.G1Env, with three changes:
- the observation adds what the reference asks for next (joint angles, pelvis velocity and height);
- the action is a correction on top of the reference pose instead of the standing pose;
- the reward is how close the robot is to the reference.
"""

from __future__ import annotations

import json
from pathlib import Path

import mujoco
import numpy as np

from .env import ACTION_SCALE, DECIMATION, NU, G1Env, gravity_in_body

MOTIONS = Path(__file__).resolve().parent.parent / "physics" / "motions"
CONTROL_DT = DECIMATION * 0.004  # 20 ms

# A reference pelvis more than 0.6 m away, or a fall, ends the episode: past that the robot is
# doing something else, and every step spent there teaches nothing about the motion (DeepMimic's
# early termination).
MAX_ROOT_ERROR_M = 0.6

# Episodes start at a random instant of the clip (reference state initialization), so the policy
# practices every phase of the step, not only the first second.
MIN_REMAINING_S = 1.0

FEET = ("left_ankle_roll_link", "right_ankle_roll_link")

MIMIC_OBS_DIM = 93 + NU + 3 + 1


class Motion:
    """A RobotMotion sampled at any time, with velocities and foot positions precomputed."""

    def __init__(self, path: Path, model: mujoco.MjModel):
        m = json.loads(path.read_text())
        self.id = m["clip_id"]
        self.fps = float(m["fps"])
        self.qpos = np.array(m["qpos"], dtype=np.float64)
        self.duration = (len(self.qpos) - 1) / self.fps
        d = mujoco.MjData(model)
        feet_ids = [model.body(n).id for n in FEET]
        self.feet = np.zeros((len(self.qpos), 2, 3))
        for i, q in enumerate(self.qpos):
            d.qpos[:] = q
            mujoco.mj_kinematics(model, d)
            self.feet[i] = d.xpos[feet_ids]
        # Velocities by finite differences: pelvis in the world, joints in rad/s.
        dt = 1 / self.fps
        self.root_vel = np.gradient(self.qpos[:, :3], dt, axis=0)
        self.joint_vel = np.gradient(self.qpos[:, 7:], dt, axis=0)

    def sample(self, t: float):
        """Pose, pelvis velocity, joint velocities and feet at time t (linear between frames)."""
        x = np.clip(t * self.fps, 0, len(self.qpos) - 1)
        i = min(int(x), len(self.qpos) - 2)
        w = x - i
        q = (1 - w) * self.qpos[i] + w * self.qpos[i + 1]
        q[3:7] /= np.linalg.norm(q[3:7])  # interpolated quaternion, renormalized
        lerp = lambda a: (1 - w) * a[i] + w * a[i + 1]  # noqa: E731
        return q, lerp(self.root_vel), lerp(self.joint_vel), lerp(self.feet)


def load_motions(model: mujoco.MjModel, names: list[str]) -> list[Motion]:
    return [Motion(MOTIONS / f"{n}.json", model) for n in names]


class MimicEnv(G1Env):
    def __init__(self, seed: int = 0, clips: tuple[str, ...] = ("clip_2026-10-23_caminar-perfil_01",), push: bool = False):
        super().__init__(seed=seed, push=push)
        self.motions = load_motions(self.model, list(clips))
        self.feet_ids = [self.model.body(n).id for n in FEET]
        self.motion = self.motions[0]
        self.t = 0.0
        self.ref_next = self.default

    # --- Observation and action ------------------------------------------------------------------

    def observe(self) -> np.ndarray:
        """The 93 numbers of G1Env.observe(), then what the reference asks for in the next 20 ms:

        - [93:122]  reference joint angles minus the standing pose
        - [122:125] reference pelvis velocity, in the pelvis frame (m/s)
        - [125]     reference pelvis height minus the current one (m)
        """
        q, root_vel, _, _ = self.motion.sample(self.t + CONTROL_DT)
        self.ref_next = q[7:]
        rot = np.zeros(9)
        mujoco.mju_quat2Mat(rot, self.data.qpos[3:7])
        vel_body = rot.reshape(3, 3).T @ root_vel
        return np.concatenate([
            super().observe(),
            self.ref_next - self.default,
            vel_body,
            [q[2] - self.data.qpos[2]],
        ]).astype(np.float32)

    def apply(self, action: np.ndarray) -> np.ndarray:
        """Targets = the reference pose for the next step + 0.25 rad per action unit, clipped.
        The policy only learns the correction that keeps the motion balanced."""
        ctrl = np.clip(self.ref_next + ACTION_SCALE * action, self.ctrl_low, self.ctrl_high)
        self.data.ctrl[:] = ctrl
        return ctrl

    # --- Episode ---------------------------------------------------------------------------------

    def reset(self) -> np.ndarray:
        self.motion = self.motions[self.rng.integers(len(self.motions))]
        return self.reset_at(self.rng.uniform(0, max(0.0, self.motion.duration - MIN_REMAINING_S)))

    def reset_at(self, t: float) -> np.ndarray:
        """Start the episode at second t of the current clip, in its reference pose."""
        self.t = t
        q, root_vel, joint_vel, _ = self.motion.sample(self.t)
        d = self.data
        mujoco.mj_resetData(self.model, d)
        d.qpos[:] = q
        d.qvel[:] = 0
        d.qvel[:3] = root_vel
        d.qvel[6:] = joint_vel
        mujoco.mj_forward(self.model, d)
        self.prev_ctrl = q[7:].copy()
        self.steps = 0
        self.push_left = 0
        self.next_push = self._draw_push_time()
        return self.observe()

    def step(self, action: np.ndarray):
        ctrl = self.apply(action)
        self._push()
        for _ in range(DECIMATION):
            mujoco.mj_step(self.model, self.data)
        self.steps += 1
        self.t += CONTROL_DT
        reward, info = self.reward(ctrl)
        self.prev_ctrl = ctrl
        q_ref = self.motion.sample(self.t)[0]
        off_track = np.linalg.norm(self.data.qpos[:2] - q_ref[:2]) > MAX_ROOT_ERROR_M
        fell = self.fallen() or off_track
        done = self.t >= self.motion.duration
        return self.observe(), reward, fell, done and not fell, info

    def reward(self, ctrl: np.ndarray) -> tuple[float, dict]:
        """DeepMimic's terms and weights (Peng et al. 2018), each exp(-k * error) in [0, 1]:
        pose 0.5, velocity 0.05, feet 0.15, pelvis position 0.2, pelvis orientation 0.1."""
        q_ref, root_vel_ref, joint_vel_ref, feet_ref = self.motion.sample(self.t)
        qpos, qvel = self.data.qpos, self.data.qvel
        feet = self.data.xpos[self.feet_ids]
        quat_err = np.zeros(3)
        mujoco.mju_subQuat(quat_err, q_ref[3:7], qpos[3:7])
        terms = {
            "pose": 0.5 * np.exp(-2.0 * np.sum((qpos[7:] - q_ref[7:]) ** 2)),
            "velocity": 0.05 * np.exp(-0.1 * np.sum((qvel[6:] - joint_vel_ref) ** 2)),
            "feet": 0.15 * np.exp(-40.0 * np.sum((feet - feet_ref) ** 2)),
            "pelvis": 0.2 * np.exp(-10.0 * np.sum((qpos[:3] - q_ref[:3]) ** 2)),
            "orientation": 0.1 * np.exp(-2.0 * np.sum(quat_err**2)),
        }
        return float(sum(terms.values())), terms


__all__ = ["MimicEnv", "MIMIC_OBS_DIM", "gravity_in_body"]
