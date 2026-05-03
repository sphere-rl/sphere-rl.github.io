# sphere.github.io

## Real Fig1 (seed=2)

This page can load real Fig1 geometry data exported from:
`code/data/visual_sphere/outputs_fig1_real_series_seed2`.

Generate website JSON:
```bash
python scripts/build_real_fig1_dataset.py \
  --src-dir /home/leadtek/Downloads/projects/SPHERE/code/data/visual_sphere/outputs_fig1_real_series_seed2 \
  --out-dir static/real_fig1/seed2 \
  --seed 2
```

Run locally (required for `fetch()`):
```bash
python -m http.server 8000 --directory .
```
