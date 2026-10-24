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

# The collision spheres of each foot: scene_mjx.xml pairs exactly these with the floor.
FOOT_SPHERES = {
    "left": ("left_foot1_collision", "left_foot2_collision", "left_foot3_collision"),
    "right": ("right_foot1_collision", "right_foot2_collision", "right_foot3_collision"),
}

# The retargeted pelvis path comes from video and jitters: its frame-to-frame speed jumps to 4 m/s
# in a 0.6 m/s walk. Velocities taken from it would launch the robot at every reset, so the path is
# smoothed over 0.3 s first (a step lasts ~0.5 s, so the gait survives).
SMOOTH_S = 0.3

# Joint angles carry MediaPipe's frame-to-frame jitter too, which the motors chase (0.12 rad of leg
# error with the pelvis held, diagnose_reference.py) and which shakes the grounded pelvis height.
# 0.1 s is 3 frames at 30 fps: it removes the jitter and keeps a swing (~0.4 s) intact.
JOINT_SMOOTH_S = 0.1

# How far ahead the policy also sees the reference. Hips and ankles follow it 60 to 100 ms late
# (diagnose_reference.py: soft position motors act like a slow filter), so seeing only the next
# 20 ms leaves the policy no way to step in time. 0.1 s covers that lag; 0.25 s is half a step.
LOOKAHEAD_S = (0.1, 0.25)

MIMIC_OBS_DIM = 93 + NU + 3 + 1 + len(LOOKAHEAD_S) * (NU + 3)


class Motion:
    """A RobotMotion sampled at any time, with velocities and foot positions precomputed."""

    def __init__(self, path: Path, model: mujoco.MjModel):
        m = json.loads(path.read_text())
        self.id = m["clip_id"]
        self.fps = float(m["fps"])
        self.qpos = np.array(m["qpos"], dtype=np.float64)
        self.duration = (len(self.qpos) - 1) / self.fps
        dt = 1 / self.fps
        window = max(1, int(round(SMOOTH_S * self.fps)))
        # The reference is cleaned for this model before anything is taken from it:
        # 1. joints lightly smoothed (JOINT_SMOOTH_S);
        # 2. pelvis path smoothed on the floor plane only: smoothing its height too left a foot 1 cm
        #    inside the floor in 10% of the walk and both feet in the air in 7%;
        # 3. pelvis height set frame by frame so the lowest foot sphere of this model touches the
        #    floor (the retargeting grounded it with the mesh feet of the display model);
        # 4. feet targets taken from that final pose. They used to come from the pose before
        #    smoothing, 2 cm (up to 13 cm) away from it, so feet and pelvis rewards disagreed.
        self.qpos[:, 7:] = smooth(self.qpos[:, 7:], max(1, int(round(JOINT_SMOOTH_S * self.fps))))
        self.qpos[:, :2] = smooth(self.qpos[:, :2], window)
        d = mujoco.MjData(model)
        feet_ids = [model.body(n).id for n in FEET]
        spheres = [model.geom(n).id for side in FOOT_SPHERES.values() for n in side]
        floor = model.geom("floor").id
        self.feet = np.zeros((len(self.qpos), 2, 3))
        for i in range(len(self.qpos)):
            d.qpos[:] = self.qpos[i]
            mujoco.mj_kinematics(model, d)
            self.qpos[i, 2] -= min(mujoco.mj_geomDistance(model, d, g, floor, 1.0, None) for g in spheres)
            d.qpos[2] = self.qpos[i, 2]
            mujoco.mj_kinematics(model, d)
            self.feet[i] = d.xpos[feet_ids]
        # Velocities by finite differences of smoothed signals: pelvis in the world, joints in rad/s.
        # The grounded height still wobbles a little, and its raw velocity would bounce the robot.
        path = np.column_stack([self.qpos[:, :2], smooth(self.qpos[:, 2:3], window)])
        self.root_vel = np.gradient(path, dt, axis=0)
        self.joint_vel = np.gradient(smooth(self.qpos[:, 7:], window), dt, axis=0)

    def sample(self, t: float):
        """Pose, pelvis velocity, joint velocities and feet at time t (linear between frames)."""
        x = np.clip(t * self.fps, 0, len(self.qpos) - 1)
        i = min(int(x), len(self.qpos) - 2)
        w = x - i
        q = (1 - w) * self.qpos[i] + w * self.qpos[i + 1]
        q[3:7] /= np.linalg.norm(q[3:7])  # interpolated quaternion, renormalized
        lerp = lambda a: (1 - w) * a[i] + w * a[i + 1]  # noqa: E731
        return q, lerp(self.root_vel), lerp(self.joint_vel), lerp(self.feet)


def smooth(x: np.ndarray, window: int) -> np.ndarray:
    """Centered moving average along time, repeating the edges."""
    if window < 2:
        return x
    pad = window // 2
    padded = np.pad(x, ((pad, window - 1 - pad), (0, 0)), mode="edge")
    kernel = np.ones(window) / window
    return np.stack([np.convolve(padded[:, j], kernel, mode="valid") for j in range(x.shape[1])], axis=1)


def load_motions(model: mujoco.MjModel, names: list[str]) -> list[Motion]:
    return [Motion(MOTIONS / f"{n}.json", model) for n in names]


class MimicEnv(G1Env):
    def __init__(self, seed: int = 0, clips: tuple[str, ...] = ("clip_2026-10-23_caminar-perfil_01",), push: bool = False):
        super().__init__(seed=seed, push=push)
        self.motions = load_motions(self.model, list(clips))
        self.feet_ids = [self.model.body(n).id for n in FEET]
        self.floor = self.model.geom("floor").id
        self.motion = self.motions[0]
        self.t = 0.0
        self.ref_next = self.default

    # --- Observation and action ------------------------------------------------------------------

    def observe(self) -> np.ndarray:
        """The 93 numbers of G1Env.observe(), then what the reference asks for in the next 20 ms:

        - [93:122]  reference joint angles minus the standing pose
        - [122:125] reference pelvis velocity, in the pelvis frame (m/s)
        - [125]     reference pelvis height minus the current one (m)

        and, for each instant in LOOKAHEAD_S (0.1 s, then 0.25 s), 32 more:

        - 29: reference joint angles minus the standing pose
        - 3:  reference pelvis position minus the current one, in the pelvis frame (m). It also tells
              the policy how far it has drifted from the path, which ends the episode at 0.6 m.
        """
        q, root_vel, _, _ = self.motion.sample(self.t + CONTROL_DT)
        self.ref_next = q[7:]
        rot = np.zeros(9)
        mujoco.mju_quat2Mat(rot, self.data.qpos[3:7])
        to_body = rot.reshape(3, 3).T
        ahead = []
        for s in LOOKAHEAD_S:
            q_ahead = self.motion.sample(self.t + s)[0]
            ahead += [q_ahead[7:] - self.default, to_body @ (q_ahead[:3] - self.data.qpos[:3])]
        return np.concatenate([
            super().observe(),
            self.ref_next - self.default,
            to_body @ root_vel,
            [q[2] - self.data.qpos[2]],
            *ahead,
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
        self._touch_ground()
        self.prev_ctrl = q[7:].copy()
        self.steps = 0
        self.push_left = 0
        self.next_push = self._draw_push_time()
        return self.observe()

    def _touch_ground(self) -> None:
        """Moves the pelvis up or down so the lowest foot rests on the floor. The reference was put on
        the floor with the mesh model; the training model's foot capsules sit a few cm differently,
        and a robot that starts in the air or inside the floor falls or bounces."""
        d = self.data
        for _ in range(40):
            mujoco.mj_forward(self.model, d)
            # Only contacts with the floor: the robot touching itself (a hand on a thigh) does not count.
            dist = min((d.contact[i].dist for i in range(d.ncon) if self.floor in d.contact[i].geom), default=None)
            if dist is None:
                d.qpos[2] -= 0.005  # in the air: lower 5 mm
            elif dist < -0.002:
                d.qpos[2] -= dist  # sunk into the floor: lift by the penetration
            else:
                return

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
