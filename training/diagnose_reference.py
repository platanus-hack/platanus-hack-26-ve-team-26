"""Can the G1 do this RobotMotion? Checks a reference before (or while) training on it.

    uv run --project training python -m training.diagnose_reference [clip_id ...]

Imitation (imitate.py) learns to follow a RobotMotion with physics. If the reference itself is wrong
for the training model (feet inside the floor or floating, angles the motors cannot reach, joints
they cannot follow), no amount of training fixes it. Without a policy, in four parts:

1. Feet and floor: the reference pose, as MimicEnv samples it, placed on the training model.
2. Feet targets: the feet positions the reward asks for against the ones the reference pose gives.
3. Motor ranges: how often the reference asks for angles outside the actuators' range.
4. Pelvis held: the reference played through the motors while the pelvis is carried along its path,
   so the robot cannot fall. What is left is whether the motors follow the joint angles, and whether
   the feet touch the floor when the reference says they should.

Playing the reference with the pelvis free says nothing: without a policy the robot falls even
from a perfect reference (evaluate_walk.py's "no policy" row), the same way it falls standing still.
"""

from __future__ import annotations

import argparse

import mujoco
import numpy as np

from .env import DECIMATION
from .imitate import CONTROL_DT, FEET, FOOT_SPHERES, MimicEnv

DEFAULT_CLIPS = ("clip_2026-10-23_caminar-perfil_01", "clip_2026-10-23_correr-perfil_01")

# A foot within 1.5 cm of the floor counts as "on the floor" in the reference: MediaPipe's depth
# noise moves a planted foot by about a centimeter, and a swinging foot clears the floor by more.
CONTACT_M = 0.015

# Slip is measured over 0.3 s, as physics/README.md does: frame to frame, the jitter of the video
# inflates the speed of a foot that is not really moving.
SLIP_WINDOW_S = 0.3

# The retargeting clamps angles to the joint range, so a reference sits exactly on a limit often;
# only going past it by more than 0.01 rad (half a degree) counts.
RANGE_TOL_RAD = 0.01

# Thresholds of the verdict. Each is the point past which the problem changes what training sees.
SUNK_M = 0.01  # a foot 1 cm inside the floor: the contact solver pushes back hard
SUNK_SHARE = 0.05  # more than 1 frame in 20 sunk
FLOAT_M = 0.02  # both feet 2 cm up: a flight phase, which walking does not have
FLOAT_SHARE = 0.05  # more than 1 frame in 20 with both feet up, for a walk
FEET_TARGET_M = 0.02  # feet reward and pelvis reward 2 cm apart: the two terms pull to different places
RANGE_SHARE = 0.01  # a motor asked past its range in more than 1 frame in 100
TRACK_RAD = 0.10  # legs 0.1 rad off on average: 40% of one action unit (0.25 rad) spent catching up
CONTACT_AGREE = 0.80  # feet touching the floor when the reference says so, 4 times out of 5

# The observation shows the reference one decision (20 ms) ahead. A motor that lags more than 2
# decisions behind needs the policy to aim at a future it does not see.
MAX_DELAY_S = 0.2
LOOKAHEAD_S = CONTROL_DT
DELAY_S = 2 * CONTROL_DT


def foot_clearance(model: mujoco.MjModel, data: mujoco.MjData, floor: int, geoms: dict) -> dict:
    """Signed distance from each foot to the floor, in meters (negative: inside it). Needs kinematics."""
    return {s: min(mujoco.mj_geomDistance(model, data, g, floor, 1.0, None) for g in ids) for s, ids in geoms.items()}


def kinematic_checks(env: MimicEnv, geoms: dict, floor: int) -> dict:
    """Parts 1 to 3: the reference placed pose by pose on the training model, at 50 Hz."""
    model, motion = env.model, env.motion
    data = mujoco.MjData(model)
    feet_ids = {"left": model.body(FEET[0]).id, "right": model.body(FEET[1]).id}
    times = np.arange(0.0, motion.duration, CONTROL_DT)
    lowest, lowest_side, both_up, target_gap, contact_ref, feet_xy = [], [], [], [], [], []
    outside = np.zeros(model.nu)
    excess = np.zeros(model.nu)
    low, high = model.actuator_ctrlrange.T
    for t in times:
        q, _, _, feet_ref = motion.sample(t)
        data.qpos[:] = q
        mujoco.mj_kinematics(model, data)
        c = foot_clearance(model, data, floor, geoms)
        side = min(c, key=c.get)
        lowest.append(c[side])
        lowest_side.append(side)
        both_up.append(min(c.values()) > FLOAT_M)
        contact_ref.append({s: c[s] < CONTACT_M for s in c})
        feet_xy.append({s: data.xpos[i][:2].copy() for s, i in feet_ids.items()})
        target_gap.append(np.linalg.norm(data.xpos[[feet_ids["left"], feet_ids["right"]]] - feet_ref, axis=1).max())
        past = np.maximum(low - q[7:], q[7:] - high)
        outside += past > RANGE_TOL_RAD
        excess = np.maximum(excess, past)
    # Slip: how far the planted foot moves over SLIP_WINDOW_S, when the same foot is the lowest one
    # and on the floor at both ends of the window.
    w = int(round(SLIP_WINDOW_S / CONTROL_DT))
    slip = [
        np.linalg.norm(feet_xy[i + w][s] - feet_xy[i][s]) / SLIP_WINDOW_S
        for i in range(len(times) - w)
        if (s := lowest_side[i]) == lowest_side[i + w] and contact_ref[i][s] and contact_ref[i + w][s]
    ]
    net_speed = np.linalg.norm(motion.qpos[-1, :2] - motion.qpos[0, :2]) / motion.duration
    lowest = np.array(lowest)
    return {
        "times": times,
        "contact_ref": contact_ref,
        "lowest_median": float(np.median(lowest)),
        "lowest_p5": float(np.percentile(lowest, 5)),
        "lowest_p95": float(np.percentile(lowest, 95)),
        "sunk_share": float(np.mean(lowest < -SUNK_M)),
        "float_share": float(np.mean(both_up)),
        "slip_speed": float(np.median(slip)) if slip else float("nan"),
        "net_speed": float(net_speed),
        "feet_target_median": float(np.median(target_gap)),
        "feet_target_max": float(np.max(target_gap)),
        "range_share": outside / len(times),
        "range_excess": excess,
    }


def held_pelvis(env: MimicEnv, geoms: dict, floor: int, contact_ref: list, static: bool = False) -> dict:
    """Part 4: motors aim at the reference (zero action, as MimicEnv.apply does) while the pelvis is
    set to the reference path before every physics step, with its velocity, so it cannot fall.

    With static=True the reference is frozen at its first pose: the error left is what gravity bends
    position motors by, which the policy has to add on top of the reference anyway."""
    model, data, motion = env.model, env.data, env.motion
    env.reset_at(0.0)  # reference pose, feet on the floor (the height offset _touch_ground found)
    offset = data.qpos[2] - motion.sample(0.0)[0][2]
    dt = model.opt.timestep
    clock = (lambda s: 0.0) if static else (lambda s: s)  # noqa: E731
    errors, actual, wanted, agree = [], [], [], []
    t = 0.0
    zero = np.zeros(model.nu)
    for k in range(len(contact_ref) - 1):
        env.apply(zero)  # targets = reference pose for the next 20 ms (ref_next, set by observe())
        for i in range(DECIMATION):
            ts = clock(t + i * dt)
            q, root_vel, _, _ = motion.sample(ts)
            q_next = motion.sample(clock(t + (i + 1) * dt))[0]
            data.qpos[:3] = q[:3] + [0.0, 0.0, offset]
            data.qpos[3:7] = q[3:7]
            data.qvel[:3] = 0.0 if static else root_vel
            ang = np.zeros(3)
            mujoco.mju_subQuat(ang, q_next[3:7], q[3:7])  # rotation to the next sample, in the pelvis frame
            data.qvel[3:6] = ang / dt
            mujoco.mj_step(model, data)
        t += CONTROL_DT
        env.t = clock(t)
        env.observe()  # refreshes ref_next for the next decision
        actual.append(data.qpos[7:].copy())
        wanted.append(motion.sample(clock(t))[0][7:])
        errors.append(actual[-1] - wanted[-1])
        touching = {s: False for s in geoms}
        for i in range(data.ncon):
            pair = data.contact[i].geom
            if floor in pair:
                for s, ids in geoms.items():
                    if pair[0] in ids or pair[1] in ids:
                        touching[s] = True
        agree.extend(touching[s] == contact_ref[k + 1][s] for s in geoms)  # both at time t
    rms = np.sqrt(np.mean(np.array(errors) ** 2, axis=0))
    return {"offset": float(offset), "rms": rms, "contact_agree": float(np.mean(agree)),
            "delay_s": delays(np.array(actual), np.array(wanted))}


def delays(actual: np.ndarray, wanted: np.ndarray) -> np.ndarray:
    """Per joint, the delay (up to MAX_DELAY_S) at which the motion matches the reference best: soft
    position motors behave like a slow filter, and the policy has to aim that far ahead."""
    out = np.zeros(actual.shape[1])
    for j in range(actual.shape[1]):
        lags = range(int(MAX_DELAY_S / CONTROL_DT) + 1)
        err = [np.mean((actual[lag:, j] - wanted[: len(wanted) - lag, j]) ** 2) for lag in lags]
        out[j] = int(np.argmin(err)) * CONTROL_DT
    return out


def report(clip: str) -> None:
    env = MimicEnv(seed=0, clips=(clip,), push=False)
    model = env.model
    floor = model.geom("floor").id
    geoms = {s: [model.geom(n).id for n in names] for s, names in FOOT_SPHERES.items()}
    k = kinematic_checks(env, geoms, floor)
    h = held_pelvis(env, geoms, floor, k["contact_ref"])
    still = held_pelvis(env, geoms, floor, k["contact_ref"], static=True)
    names = [model.actuator(i).name.removesuffix("_joint") for i in range(model.nu)]
    legs = [i for i, n in enumerate(names) if any(p in n for p in ("hip", "knee", "ankle"))]
    walking = "caminar" in clip

    print(f"\n=== {clip} ({env.motion.duration:.1f} s, {len(k['times'])} decisiones de 20 ms)")
    print("1. Pies y piso (referencia sobre el modelo de entrenamiento)")
    print(f"   pie más bajo sobre el piso: mediana {100 * k['lowest_median']:+.1f} cm "
          f"(p5 {100 * k['lowest_p5']:+.1f}, p95 {100 * k['lowest_p95']:+.1f}); negativo = hundido")
    print(f"   cuadros con un pie hundido más de {100 * SUNK_M:.0f} cm: {100 * k['sunk_share']:.0f} %")
    print(f"   cuadros con los dos pies a más de {100 * FLOAT_M:.0f} cm (en el aire): {100 * k['float_share']:.0f} %")
    print(f"   pie apoyado: se desliza a {k['slip_speed']:.2f} m/s en ventanas de {SLIP_WINDOW_S} s; "
          f"la pelvis avanza a {k['net_speed']:.2f} m/s")
    print(f"   altura que _touch_ground corrige al arrancar: {100 * h['offset']:+.1f} cm")
    print("2. Objetivos de los pies en la recompensa contra los pies de la pose de referencia")
    print(f"   distancia: mediana {100 * k['feet_target_median']:.1f} cm, máxima {100 * k['feet_target_max']:.1f} cm")
    print(f"3. Rangos de los motores (pasarse más de {RANGE_TOL_RAD} rad)")
    bad = [(names[i], k["range_share"][i], k["range_excess"][i]) for i in range(model.nu) if k["range_share"][i] > 0]
    for n, share, ex in sorted(bad, key=lambda b: -b[1]):
        print(f"   {n:24s} fuera de rango en {100 * share:4.1f} % de los cuadros, hasta {ex:.2f} rad")
    if not bad:
        print("   ningún ángulo fuera de rango")
    print("4. Pelvis sostenida: los motores siguen la referencia")
    print(f"   error medio de las piernas: {h['rms'][legs].mean():.3f} rad en movimiento, "
          f"{still['rms'][legs].mean():.3f} rad con la pose quieta (lo que la gravedad dobla); "
          f"todo el cuerpo: {h['rms'].mean():.3f} rad")
    worst = np.argsort(-h["rms"])[:5]
    print("   peores en movimiento: " + ", ".join(f"{names[i]} {h['rms'][i]:.3f}" for i in worst))
    print("   retraso de los motores: " + ", ".join(f"{names[i]} {1000 * h['delay_s'][i]:.0f} ms" for i in worst)
          + f" (la observación muestra la referencia {1000 * LOOKAHEAD_S:.0f} ms adelante)")
    print(f"   pies en el piso cuando la referencia lo dice: {100 * h['contact_agree']:.0f} %")

    problems = []
    if k["sunk_share"] > SUNK_SHARE:
        problems.append("pies hundidos en muchos cuadros: la altura de la pelvis no deja un pie justo sobre el piso")
    if walking and k["float_share"] > FLOAT_SHARE:
        problems.append("caminando no hay fase de vuelo, pero la referencia tiene a los dos pies en el aire")
    if k["feet_target_median"] > FEET_TARGET_M:
        problems.append("la recompensa de los pies apunta a otro lugar que la pose de referencia")
    if any(share > RANGE_SHARE for _, share, _ in bad):
        problems.append("la referencia pide ángulos fuera del rango de los motores")
    if h["rms"][legs].mean() > TRACK_RAD:
        problems.append("los motores de las piernas quedan lejos de la referencia aunque no tengan que equilibrarse")
    if np.median(h["delay_s"][legs]) > DELAY_S or h["delay_s"][worst].max() > DELAY_S:
        problems.append(f"los motores van hasta {1000 * h['delay_s'][worst].max():.0f} ms detrás de la referencia y "
                        f"la red solo ve {1000 * LOOKAHEAD_S:.0f} ms adelante: no puede anticiparse")
    if h["contact_agree"] < CONTACT_AGREE:
        problems.append("los pies no tocan el piso cuando la referencia dice que deberían (o al revés)")
    print("Veredicto: " + ("la referencia parece viable." if not problems else ""))
    for p in problems:
        print(f"   - {p}")


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m training.diagnose_reference", description=__doc__.split("\n")[0])
    p.add_argument("clips", nargs="*", default=list(DEFAULT_CLIPS), help="clip ids in physics/motions/")
    for clip in p.parse_args().clips:
        report(clip)


if __name__ == "__main__":
    main()
