"""Many G1Envs stepping in parallel, one group per CPU core.

PPO learns from many robots at once. MuJoCo runs one world per core, so the robots are split into
worker processes, each stepping its group with numpy arrays sent through a pipe.
"""

from __future__ import annotations

import multiprocessing as mp

import numpy as np

from .env import PUSH_EVERY_S, PUSH_N, G1Env, Stance


def make_env(task: str, seed: int, push: bool, push_n: tuple[float, float], motion: str | None = None,
             push_every: tuple[float, float] = PUSH_EVERY_S, stance: Stance | None = None) -> G1Env:
    if task == "mimic":
        from .imitate import DEFAULT_MOTION, MimicEnv

        return MimicEnv(seed=seed, clips=(motion or DEFAULT_MOTION,))
    return G1Env(seed=seed, push=push, push_n=push_n, push_every=push_every, stance=stance)


def _worker(conn, seeds: list[int], push: bool, push_n: tuple[float, float], task: str, motion: str | None,
            push_every: tuple[float, float], stance: Stance | None) -> None:
    envs = [make_env(task, s, push, push_n, motion, push_every, stance) for s in seeds]
    while True:
        cmd, payload = conn.recv()
        if cmd == "reset":
            conn.send(np.stack([e.reset() for e in envs]))
        elif cmd == "step":
            out = []
            for env, action in zip(envs, payload):
                obs, reward, terminated, truncated, info = env.step(action)
                final = obs
                if terminated or truncated:
                    obs = env.reset()  # auto-reset; the last obs goes back for bootstrapping
                out.append((obs, reward, terminated, truncated, final, info))
            conn.send(out)
        elif cmd == "close":
            conn.close()
            return


class VecEnv:
    def __init__(self, num_envs: int, workers: int, seed: int = 0, push: bool = True,
                 push_n: tuple[float, float] = PUSH_N, task: str = "stand", motion: str | None = None,
                 push_every: tuple[float, float] = PUSH_EVERY_S, stance: Stance | None = None):
        self.num_envs = num_envs
        groups = np.array_split(np.arange(num_envs) + seed * 10_000, workers)
        ctx = mp.get_context("spawn")  # fork is unsafe on macOS once torch is loaded
        self.conns, self.procs = [], []
        for g in groups:
            parent, child = ctx.Pipe()
            p = ctx.Process(target=_worker, args=(child, g.tolist(), push, push_n, task, motion, push_every, stance), daemon=True)
            p.start()
            self.conns.append(parent)
            self.procs.append(p)
        self.sizes = [len(g) for g in groups]

    def reset(self) -> np.ndarray:
        for c in self.conns:
            c.send(("reset", None))
        return np.concatenate([c.recv() for c in self.conns])

    def step(self, actions: np.ndarray):
        start = 0
        for c, n in zip(self.conns, self.sizes):
            c.send(("step", actions[start : start + n]))
            start += n
        results = [r for c in self.conns for r in c.recv()]
        obs, reward, terminated, truncated, final, info = zip(*results)
        return (
            np.stack(obs),
            np.array(reward, dtype=np.float32),
            np.array(terminated),
            np.array(truncated),
            np.stack(final),
            info,
        )

    def close(self) -> None:
        for c in self.conns:
            c.send(("close", None))
        for p in self.procs:
            p.join(timeout=5)
