"""Checkpoint -> policy.onnx + policy.json, as docs/contrato.md defines the Policy.

    uv run --project training python -m training.export training/runs/stand-v1/step_20000000.pt --id g1-stand

The ONNX takes the raw 93-number observation of env.observe() and returns the 29 motor targets
(MuJoCo ctrl) directly: normalization, the deterministic action, the 0.25 rad scale, the standing
offset and the motor ranges are all inside, so the browser only builds obs and writes ctrl.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from torch import nn

from .env import ACTION_SCALE, MJCF, NU, OBS_DIM, G1Env
from .ppo import ActorCritic

OUT = Path(__file__).parent / "policies"


class Deployed(nn.Module):
    def __init__(self, model: ActorCritic, env: G1Env):
        super().__init__()
        self.model = model
        self.register_buffer("default", torch.as_tensor(env.default, dtype=torch.float32))
        self.register_buffer("low", torch.as_tensor(env.ctrl_low, dtype=torch.float32))
        self.register_buffer("high", torch.as_tensor(env.ctrl_high, dtype=torch.float32))

    def forward(self, obs: torch.Tensor) -> torch.Tensor:
        action = self.model.actor(self.model.norm(obs))  # the mean: no exploration noise in the demo
        return torch.minimum(torch.maximum(self.default + ACTION_SCALE * action, self.low), self.high)


def export(checkpoint: Path, policy_id: str, out: Path) -> Path:
    state = torch.load(checkpoint)
    model = ActorCritic()
    model.load_state_dict(state["model"])
    model.eval()
    env = G1Env(seed=0, push=False)
    deployed = Deployed(model, env).eval()

    out.mkdir(parents=True, exist_ok=True)
    onnx_path = out / f"{policy_id}.onnx"
    torch.onnx.export(
        deployed, torch.zeros(1, OBS_DIM), str(onnx_path), input_names=["obs"], output_names=["ctrl"],
        dynamic_axes={"obs": {0: "batch"}, "ctrl": {0: "batch"}}, opset_version=17, dynamo=False,
    )

    # The ONNX must give the same targets as the training code, on real observations.
    session = ort.InferenceSession(str(onnx_path))
    obs = env.reset()
    worst = 0.0
    for _ in range(200):
        onnx_ctrl = session.run(None, {"obs": obs[None]})[0][0]
        with torch.no_grad():
            torch_ctrl = deployed(torch.as_tensor(obs)[None])[0].numpy()
        worst = max(worst, float(np.abs(onnx_ctrl - torch_ctrl).max()))
        env.data.ctrl[:] = onnx_ctrl
        obs, *_ = env.step((onnx_ctrl - env.default) / ACTION_SCALE)
    assert worst < 1e-4, f"ONNX and torch disagree by {worst} rad"

    meta = {
        "id": policy_id,
        "robot": "unitree_g1",
        "mjcf": MJCF,
        "obs_dim": OBS_DIM,
        "nu": NU,
        "trained_on": [],  # standing and pushes, no PoseClip yet
        "steps": int(state["step"]),
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (out / f"{policy_id}.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"{onnx_path} ({onnx_path.stat().st_size // 1024} KB), ONNX vs torch max diff {worst:.1e} rad")
    return onnx_path


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m training.export", description=__doc__.split("\n")[0])
    p.add_argument("checkpoint", type=Path)
    p.add_argument("--id", required=True, help="policy id, e.g. g1-stand")
    p.add_argument("--out", type=Path, default=OUT)
    args = p.parse_args()
    export(args.checkpoint, args.id, args.out)


if __name__ == "__main__":
    main()
