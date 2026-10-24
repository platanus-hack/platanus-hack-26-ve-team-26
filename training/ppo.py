"""PPO for the G1: an MLP policy learns to stand and take pushes, saving checkpoints along the way.

    uv run --project training python -m training.ppo [--steps 20000000] [--run stand]

Checkpoints go to training/runs/<run>/ as step_<N>.pt plus a progress.csv, at 0, 10k, 100k, 1M,
3M, 10M... environment steps: the pitch shows the same robot at several of them side by side.
"""

from __future__ import annotations

import argparse
import csv
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

from .env import NU, OBS_DIM
from .vec import VecEnv

RUNS = Path(__file__).parent / "runs"

# 64 robots x 64 steps = 4096 transitions per update. 64 robots fill the 8 cores of an M2 (11.8k
# steps/s measured); 64 steps (1.3 s of robot time) is long enough for GAE to see a stumble's cost.
NUM_ENVS = 64
WORKERS = 8
ROLLOUT = 64

# Standard PPO for continuous control (CleanRL, legged_gym), not tuned for this robot.
GAMMA = 0.99  # values ~2 s ahead (1 / (1 - 0.99) = 100 steps at 50 Hz): enough to feel a coming fall
LAMBDA = 0.95
CLIP = 0.2
EPOCHS = 5
MINIBATCHES = 4
LR = 3e-4
MAX_GRAD_NORM = 1.0
VALUE_COEF = 1.0
ENTROPY_COEF = 0.0  # exploration comes from the learned std, which starts at 0.5 (0.12 rad)
INIT_LOG_STD = np.log(0.5)

# Environment steps where a checkpoint is saved. 1k from the original plan is left out: it is less
# than one update (4096), so it would be the same untrained policy as step 0.
CHECKPOINTS = [0, 10_000, 100_000, 1_000_000, 3_000_000, 10_000_000, 30_000_000, 100_000_000]


class RunningNorm(nn.Module):
    """Running mean and std of the observations, so the network sees inputs near N(0, 1).
    Stored as buffers: the exported ONNX normalizes by itself and the browser sends raw obs."""

    def __init__(self, dim: int):
        super().__init__()
        self.register_buffer("mean", torch.zeros(dim))
        self.register_buffer("var", torch.ones(dim))
        self.register_buffer("count", torch.tensor(1e-4))

    def update(self, x: torch.Tensor) -> None:
        batch_mean, batch_var, n = x.mean(0), x.var(0, unbiased=False), x.shape[0]
        delta = batch_mean - self.mean
        total = self.count + n
        self.mean += delta * n / total
        self.var = (self.var * self.count + batch_var * n + delta**2 * self.count * n / total) / total
        self.count = total

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Clipped at 5 std: one strange reading (a contact spike) cannot saturate the network.
        return torch.clamp((x - self.mean) / torch.sqrt(self.var + 1e-8), -5, 5)


def mlp(inp: int, out: int, hidden=(256, 128, 64)) -> nn.Sequential:
    layers, last = [], inp
    for h in hidden:
        layers += [nn.Linear(last, h), nn.ELU()]
        last = h
    layers.append(nn.Linear(last, out))
    return nn.Sequential(*layers)


class ActorCritic(nn.Module):
    """Small enough to run every 20 ms in a phone's browser: ~70k parameters per network."""

    def __init__(self):
        super().__init__()
        self.norm = RunningNorm(OBS_DIM)
        self.actor = mlp(OBS_DIM, NU)
        self.critic = mlp(OBS_DIM, 1)
        self.log_std = nn.Parameter(torch.full((NU,), float(INIT_LOG_STD)))
        # Small last layer: the untrained policy starts near the standing pose instead of random.
        nn.init.orthogonal_(self.actor[-1].weight, 0.01)
        nn.init.zeros_(self.actor[-1].bias)

    def dist(self, obs: torch.Tensor) -> torch.distributions.Normal:
        return torch.distributions.Normal(self.actor(self.norm(obs)), self.log_std.exp())

    def value(self, obs: torch.Tensor) -> torch.Tensor:
        return self.critic(self.norm(obs)).squeeze(-1)


def save(model: ActorCritic, run_dir: Path, step: int) -> None:
    torch.save({"model": model.state_dict(), "step": step}, run_dir / f"step_{step}.pt")


def train(total_steps: int, run: str, device: str) -> None:
    run_dir = RUNS / run
    run_dir.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(0)
    model = ActorCritic()
    opt = torch.optim.Adam(model.parameters(), lr=LR, eps=1e-5)
    envs = VecEnv(NUM_ENVS, WORKERS)
    obs = envs.reset()
    pending = [c for c in CHECKPOINTS if c <= total_steps]
    save(model, run_dir, 0)
    pending.remove(0)

    log = open(run_dir / "progress.csv", "w", newline="")
    writer = csv.writer(log)
    writer.writerow(["step", "seconds", "reward_per_step", "episode_s", "falls", "steps_per_s"])
    ep_len = np.zeros(NUM_ENVS)
    step, start = 0, time.time()

    while step < total_steps:
        t0 = time.time()
        buf_obs = np.zeros((ROLLOUT, NUM_ENVS, OBS_DIM), np.float32)
        buf_act = np.zeros((ROLLOUT, NUM_ENVS, NU), np.float32)
        buf_logp = np.zeros((ROLLOUT, NUM_ENVS), np.float32)
        buf_rew = np.zeros((ROLLOUT, NUM_ENVS), np.float32)
        buf_done = np.zeros((ROLLOUT, NUM_ENVS), np.float32)
        buf_val = np.zeros((ROLLOUT + 1, NUM_ENVS), np.float32)
        finished, falls = [], 0

        # Rollouts run the policy on CPU: 64 observations per call is too small for the GPU to pay
        # off its transfer cost.
        with torch.no_grad():
            for t in range(ROLLOUT):
                o = torch.as_tensor(obs)
                d = model.dist(o)
                a = d.sample()
                buf_obs[t], buf_act[t] = obs, a.numpy()
                buf_logp[t] = d.log_prob(a).sum(-1).numpy()
                buf_val[t] = model.value(o).numpy()
                obs, rew, term, trunc, final, _ = envs.step(a.numpy())
                if trunc.any():
                    # Time ran out, the robot did not fall: count the future it would still have had.
                    rew = rew + GAMMA * trunc * model.value(torch.as_tensor(final)).numpy()
                buf_rew[t], buf_done[t] = rew, term | trunc
                ep_len += 1
                for i in np.flatnonzero(term | trunc):
                    finished.append(ep_len[i] / 50)
                    ep_len[i] = 0
                falls += int(term.sum())
            buf_val[ROLLOUT] = model.value(torch.as_tensor(obs)).numpy()
        model.norm.update(torch.as_tensor(buf_obs.reshape(-1, OBS_DIM)))

        # Generalized advantage estimation.
        adv = np.zeros_like(buf_rew)
        last = np.zeros(NUM_ENVS, np.float32)
        for t in reversed(range(ROLLOUT)):
            nonterminal = 1.0 - buf_done[t]
            delta = buf_rew[t] + GAMMA * buf_val[t + 1] * nonterminal - buf_val[t]
            last = delta + GAMMA * LAMBDA * nonterminal * last
            adv[t] = last
        ret = adv + buf_val[:ROLLOUT]

        # PPO update, in minibatches of 1024.
        model.to(device)
        b_obs = torch.as_tensor(buf_obs.reshape(-1, OBS_DIM), device=device)
        b_act = torch.as_tensor(buf_act.reshape(-1, NU), device=device)
        b_logp = torch.as_tensor(buf_logp.reshape(-1), device=device)
        b_adv = torch.as_tensor(adv.reshape(-1), device=device)
        b_ret = torch.as_tensor(ret.reshape(-1), device=device)
        b_adv = (b_adv - b_adv.mean()) / (b_adv.std() + 1e-8)
        n = b_obs.shape[0]
        mb = n // MINIBATCHES
        for _ in range(EPOCHS):
            perm = torch.randperm(n, device=device)
            for k in range(MINIBATCHES):
                idx = perm[k * mb : (k + 1) * mb]
                d = model.dist(b_obs[idx])
                logp = d.log_prob(b_act[idx]).sum(-1)
                ratio = (logp - b_logp[idx]).exp()
                pg = -torch.min(ratio * b_adv[idx], ratio.clamp(1 - CLIP, 1 + CLIP) * b_adv[idx]).mean()
                v_loss = ((model.value(b_obs[idx]) - b_ret[idx]) ** 2).mean()
                loss = pg + VALUE_COEF * v_loss - ENTROPY_COEF * d.entropy().sum(-1).mean()
                opt.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), MAX_GRAD_NORM)
                opt.step()
        model.to("cpu")

        step += ROLLOUT * NUM_ENVS
        sps = ROLLOUT * NUM_ENVS / (time.time() - t0)
        ep = float(np.mean(finished)) if finished else float("nan")
        writer.writerow([step, round(time.time() - start, 1), round(float(buf_rew.mean()), 4), round(ep, 2), falls, int(sps)])
        log.flush()
        print(f"\rstep {step:>10,} / {total_steps:,} ({100 * step / total_steps:4.1f}%)  reward/step {buf_rew.mean():.3f}  "
              f"episode {ep:5.1f} s  falls {falls:3d}  {sps:,.0f} steps/s", end="", flush=True)
        while pending and step >= pending[0]:
            save(model, run_dir, pending.pop(0))
    save(model, run_dir, step)
    print(f"\ndone: {step:,} steps in {(time.time() - start) / 60:.1f} min -> {run_dir}")
    envs.close()


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m training.ppo", description=__doc__.split("\n")[0])
    p.add_argument("--steps", type=int, default=20_000_000)
    p.add_argument("--run", default="stand")
    # CPU by default: measured on an M2, 11.2k steps/s on CPU vs 10.1k on MPS. This network is so small
    # that moving each minibatch to the GPU costs more than the GPU saves. --device mps to compare.
    p.add_argument("--device", default="cpu")
    args = p.parse_args()
    train(args.steps, args.run, args.device)


if __name__ == "__main__":
    main()
