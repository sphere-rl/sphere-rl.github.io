# SPHERE Project Page

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

## Local preview

This repository is the static project page for the ICML 2026 accepted paper **SPHERE: Mitigating the Loss of Spectral Plasticity in Mixture-of-Experts for Deep Reinforcement Learning**.

Public site: <https://liruiluo.github.io/sphere-page/>

The page is currently optimized for desktop / laptop reading, matching the expected paper-project-page audience. Mobile support should not drive layout decisions unless that requirement changes.


## Publication boundary

Camera-ready PDF and slides are intentionally shown as pending on the page until the final artifacts are ready. The public code link points to `https://github.com/sphere-rl/sphere`.

Do not commit unfinished camera-ready PDFs under this static site root; otherwise
static hosting can expose them even without a visible link. Keep unpublished drafts
outside the repo (for example `../local-unpublished/`) until they are ready to link.
