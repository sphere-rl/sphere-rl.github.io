#!/usr/bin/env python3
"""Build website-friendly JSON from real Fig1 outputs (NPZ).

Input: directory produced by `code/data/visual_sphere/scripts/fig1/*`:
  - baseline__<task_key>__seedN.npz
  - sphere__<task_key>__seedN.npz
  - untrained__<task_key>__seedN.npz (optional)

Output: `static/real_fig1/seedN/manifest.json` + one json per (method, task).

We only export the minimal pieces needed by the website visualization:
  - top-3 eigenvalues of K_sub (for axis-aligned map in eigenbasis)
  - erank(K_sub)
  - gradient samples on the unit sphere in that subspace (grad_coords_unit)
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import re

import numpy as np


_NPZ_RE = re.compile(r"^(baseline|sphere|untrained)__(.+)__seed(\d+)$")
_TASK_ORDER = {"h1_stand": 1, "h1_walk": 2, "h1_pole": 3, "h1_slide": 4, "h1_run": 5}


def _erank_from_eigs(eigs: np.ndarray, eps: float = 1e-12) -> float:
    eigs = np.asarray(eigs, dtype=np.float64)
    eigs = np.maximum(eigs, 0.0)
    s = float(np.sum(eigs))
    if not math.isfinite(s) or s <= eps:
        return 0.0
    p = eigs / s
    H = -float(np.sum(p * np.log(p + eps)))
    return float(np.exp(H))


def _pad_last_dim(x: np.ndarray, k_out: int = 3) -> np.ndarray:
    x = np.asarray(x, dtype=np.float64)
    if x.shape[-1] == k_out:
        return x
    if x.shape[-1] > k_out:
        return x[..., :k_out]
    pad = [(0, 0)] * x.ndim
    pad[-1] = (0, int(k_out - x.shape[-1]))
    return np.pad(x, pad, mode="constant")


def _load_case(npz_path: Path) -> dict:
    m = _NPZ_RE.match(npz_path.stem)
    if not m:
        raise ValueError(f"Bad NPZ name: {npz_path.name}")
    method, task_key, seed_s = m.group(1), m.group(2), m.group(3)
    seed = int(seed_s)

    data = np.load(npz_path)
    K_sub = np.asarray(data["K_sub"], dtype=np.float64)
    eigs = np.linalg.eigvalsh(0.5 * (K_sub + K_sub.T))
    eigs = np.maximum(eigs, 0.0)
    eigs = np.sort(eigs)[::-1]
    eigs3 = _pad_last_dim(eigs.reshape(1, -1), 3).reshape(-1)

    coords = np.asarray(data["grad_coords_unit"], dtype=np.float64)
    coords3 = _pad_last_dim(coords, 3)
    # Ensure unit normalization in exported coords.
    n = np.linalg.norm(coords3, axis=1, keepdims=True)
    coords3 = coords3 / (n + 1e-12)

    return {
        "method": str(method),
        "task_key": str(task_key),
        "seed": int(seed),
        "subspace_dim": int(K_sub.shape[0]),
        "eigs": [float(x) for x in eigs3.tolist()],
        "erank": float(_erank_from_eigs(eigs)),
        "grad_samples": coords3.astype(np.float32).tolist(),
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--src-dir", type=Path, required=True, help="e.g. data/visual_sphere/outputs_fig1_real_series_seed2")
    p.add_argument("--out-dir", type=Path, required=True, help="e.g. website/.../static/real_fig1/seed2")
    p.add_argument("--seed", type=int, required=True)
    args = p.parse_args()

    src_dir = args.src_dir
    if not src_dir.exists():
        raise FileNotFoundError(str(src_dir))

    npz_paths = sorted(p for p in src_dir.glob("*.npz") if _NPZ_RE.match(p.stem))
    npz_paths = [p for p in npz_paths if int(_NPZ_RE.match(p.stem).group(3)) == int(args.seed)]
    if not npz_paths:
        raise FileNotFoundError(f"No Fig1 NPZ found for seed={int(args.seed)} under: {src_dir}")

    cases = [_load_case(pth) for pth in npz_paths]

    tasks = sorted({c["task_key"] for c in cases}, key=lambda k: _TASK_ORDER.get(k, 999))
    methods = sorted({c["method"] for c in cases})

    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    files: dict[str, dict[str, str]] = {}
    for c in cases:
        method = c["method"]
        task_key = c["task_key"]
        out_name = f"{method}__{task_key}__seed{int(args.seed)}.json"
        out_path = out_dir / out_name
        out_path.write_text(json.dumps(c, indent=2, sort_keys=True))
        files.setdefault(method, {})[task_key] = str(Path("static") / "real_fig1" / f"seed{int(args.seed)}" / out_name)

    manifest = {
        "seed": int(args.seed),
        "tasks": tasks,
        "methods": methods,
        "files": files,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True))
    print(f"Wrote: {out_dir / 'manifest.json'}")


if __name__ == "__main__":
    main()

