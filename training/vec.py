"""Many G1Envs stepping in parallel, one group per CPU core.

PPO learns from many robots at once. MuJoCo runs one world per core, so the robots are split into
worker processes, each stepping its group with numpy arrays sent through a pipe.
"""

from __future__ import annotations

import multiprocessing as mp

import numpy as np

from .env import PUSH_N, G1Env


def make_env(task: str, seed: int, push: bool, push_n: tuple[float, float]) -> G1Env:
    if task == "walk":
        from .imitate import MimicEnv

        return MimicEnv(seed=seed)
    return G1Env(seed=seed, push=push, push_n=push_n)


def _worker(conn, seeds: list[int], push: bool, push_n: tuple[float, float], task: str) -> None:
    envs = [make_env(task, s, push, push_n) for s in seeds]
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
                 push_n: tuple[float, float] = PUSH_N, task: str = "stand"):
        self.num_envs = num_envs
        groups = np.array_split(np.arange(num_envs) + seed * 10_000, workers)
        ctx = mp.get_context("spawn")  # fork is unsafe on macOS once torch is loaded
        self.conns, self.procs = [], []
        for g in groups:
            parent, child = ctx.Pipe()
            p = ctx.Process(target=_worker, args=(child, g.tolist(), push, push_n, task), daemon=True)
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
