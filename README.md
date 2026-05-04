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


## Publication boundary

Camera-ready PDF, code, and slides are intentionally shown as pending on the page.
Do not commit unfinished camera-ready PDFs under this static site root; otherwise
static hosting can expose them even without a visible link. Keep unpublished drafts
outside the repo (for example `../local-unpublished/`) until they are ready to link.
