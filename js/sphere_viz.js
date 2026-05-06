(() => {
  function getCssVar(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch {
      return fallback;
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function hexColorLerp(a, b, t) {
    const ah = a.replace("#", "");
    const bh = b.replace("#", "");
    const ar = parseInt(ah.slice(0, 2), 16);
    const ag = parseInt(ah.slice(2, 4), 16);
    const ab = parseInt(ah.slice(4, 6), 16);
    const br = parseInt(bh.slice(0, 2), 16);
    const bg = parseInt(bh.slice(2, 4), 16);
    const bb = parseInt(bh.slice(4, 6), 16);
    const rr = Math.round(lerp(ar, br, t));
    const rg = Math.round(lerp(ag, bg, t));
    const rb = Math.round(lerp(ab, bb, t));
    return `rgb(${rr}, ${rg}, ${rb})`;
  }

  function taskKeyToName(taskKey) {
    const m = {
      h1_stand: "Stand",
      h1_walk: "Walk",
      h1_pole: "Pole",
      h1_slide: "Slide",
      h1_run: "Run",
    };
    return m[taskKey] ?? taskKey;
  }

  // NOTE: We intentionally avoid synthetic presets here.
  // The HumanoidBench visualization loads real data exported from Fig1 NPZ outputs.

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`fetch failed: ${url} (${res.status})`);
    return res.json();
  }

  function meanDirection(samples) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const s of samples) {
      x += s[0] ?? 0;
      y += s[1] ?? 0;
      z += s[2] ?? 0;
    }
    const n = Math.sqrt(x * x + y * y + z * z) || 1;
    return [x / n, y / n, z / n];
  }

  function flattenSamples(samples) {
    const out = new Float32Array(samples.length * 3);
    for (let i = 0; i < samples.length; i++) {
      out[i * 3 + 0] = samples[i][0] ?? 0;
      out[i * 3 + 1] = samples[i][1] ?? 0;
      out[i * 3 + 2] = samples[i][2] ?? 0;
    }
    return out;
  }

  async function loadRealHumanoidBenchPreset({ seed = 2 } = {}) {
    const base = `static/real_fig1/seed${seed}`;
    const manifest = await fetchJson(`${base}/manifest.json`);
    const taskKeys = manifest.tasks ?? [];

    const tasks = taskKeys.map((k) => taskKeyToName(k));
    const baselineEigs = [];
    const sphereEigs = [];
    const baselineRank = [];
    const sphereRank = [];
    const baselineErank = [];
    const sphereErank = [];
    const baselineGradDirs = [];
    const sphereGradDirs = [];
    const baselineClouds = [];
    const sphereClouds = [];

    for (const taskKey of taskKeys) {
      const bPath = manifest.files?.baseline?.[taskKey];
      const sPath = manifest.files?.sphere?.[taskKey];
      if (!bPath || !sPath) throw new Error(`missing baseline/sphere for task=${taskKey}`);
      const b = await fetchJson(bPath);
      const s = await fetchJson(sPath);

      baselineEigs.push(b.eigs ?? [1, 1, 1]);
      sphereEigs.push(s.eigs ?? [1, 1, 1]);
      baselineErank.push(b.erank ?? 0);
      sphereErank.push(s.erank ?? 0);
      baselineRank.push(clamp((b.erank ?? 0) / 3.0, 0.0, 1.0));
      sphereRank.push(clamp((s.erank ?? 0) / 3.0, 0.0, 1.0));

      const bSamples = b.grad_samples ?? [];
      const sSamples = s.grad_samples ?? [];
      baselineGradDirs.push(meanDirection(bSamples));
      sphereGradDirs.push(meanDirection(sSamples));
      baselineClouds.push(flattenSamples(bSamples));
      sphereClouds.push(flattenSamples(sSamples));
    }

    return {
      source: `real_fig1_seed${seed}`,
      seed,
      taskKeys,
      tasks,
      baselineEigs,
      sphereEigs,
      baselineRank,
      sphereRank,
      baselineErank,
      sphereErank,
      baselineGradDirs,
      sphereGradDirs,
      baselineClouds,
      sphereClouds,
    };
  }

  function randomPointsOnSphere(count) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Random direction via Gaussian then normalize.
      let x = 0;
      let y = 0;
      let z = 0;
      for (let j = 0; j < 6; j++) {
        x += Math.random() - 0.5;
        y += Math.random() - 0.5;
        z += Math.random() - 0.5;
      }
      const n = Math.sqrt(x * x + y * y + z * z) || 1;
      positions[i * 3 + 0] = x / n;
      positions[i * 3 + 1] = y / n;
      positions[i * 3 + 2] = z / n;
    }
    return positions;
  }

  function normalize3FlatInPlace(arr) {
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i + 0];
      const y = arr[i + 1];
      const z = arr[i + 2];
      const n = Math.sqrt(x * x + y * y + z * z) || 1;
      arr[i + 0] = x / n;
      arr[i + 1] = y / n;
      arr[i + 2] = z / n;
    }
  }

  function writeScaledShapePositions({ srcUnit, dst, radius }) {
    for (let i = 0; i < srcUnit.length; i += 3) {
      dst[i + 0] = radius * srcUnit[i + 0];
      dst[i + 1] = radius * srcUnit[i + 1];
      dst[i + 2] = radius * srcUnit[i + 2];
    }
  }

  function setup3D(canvas) {
    if (!window.THREE) return { ok: false, reason: "THREE not loaded" };

    const STAGE_COUNT = 2; // ∇fL and K∇fL

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return { ok: false, reason: "WebGLRenderer failed" };
    }

    const wireColor = getCssVar("--viz-wire", "#0f172a");
    const wireSoftColor = getCssVar("--viz-wire-soft", "#64748b");

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.15, 10.2);

    // Keep the interactive geometry flat and paper-like: no directional lighting,
    // highlights, or specular shadows. MeshBasicMaterial below ignores scene lights.
    const geometry = new THREE.IcosahedronGeometry(0.72, 4);

    function _setArrowOpacity(arrow, opacity) {
      if (!arrow) return;
      const lineMat = arrow.line?.material;
      const coneMat = arrow.cone?.material;
      if (lineMat) {
        lineMat.transparent = true;
        lineMat.opacity = opacity;
      }
      if (coneMat) {
        coneMat.transparent = true;
        coneMat.opacity = opacity;
      }
    }

    function _setArrowLength(arrow, length) {
      const len = Math.max(0.06, length);
      const headLength = Math.max(0.10, len * 0.22);
      const headWidth = Math.max(0.07, len * 0.14);
      arrow.setLength(len, headLength, headWidth);
    }

    function _setArrowSignedComponent(arrow, axisVec, value, minAbs = 0.0) {
      const v = value;
      const abs = Math.max(minAbs, Math.abs(v));
      const sign = v >= 0 ? 1 : -1;
      const dir = axisVec.clone().multiplyScalar(sign).normalize();
      arrow.setDirection(dir);
      _setArrowLength(arrow, abs);
    }

    function makeBlob(hexColor, pointHexColor) {
      const group = new THREE.Group();

      // Reference: the "input" unit sphere (before multiplying by K).
      const refWireMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(wireSoftColor),
        wireframe: true,
        transparent: true,
        opacity: 0.14,
      });
      const refWire = new THREE.Mesh(geometry, refWireMat);
      group.add(refWire);

      const deformed = new THREE.Group();
      group.add(deformed);

      // Deformed: the "output" ellipsoid after applying an eNTK-like linear map.
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(hexColor),
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      deformed.add(mesh);

      const wireMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(wireSoftColor),
        wireframe: true,
        transparent: true,
        opacity: 0.14,
      });
      const wire = new THREE.Mesh(geometry, wireMat);
      deformed.add(wire);

      const R = 0.72; // matches IcosahedronGeometry(0.72, ...)
      const sourcePositions = randomPointsOnSphere(900);
      normalize3FlatInPlace(sourcePositions); // keep as unit directions for consistent scaling
      const positions = new Float32Array(sourcePositions.length);
      writeScaledShapePositions({ srcUnit: sourcePositions, dst: positions, radius: R });
      const pointsGeom = new THREE.BufferGeometry();
      const positionAttr = new THREE.BufferAttribute(positions, 3);
      positionAttr.setUsage(THREE.DynamicDrawUsage);
      pointsGeom.setAttribute("position", positionAttr);
      const pointsMat = new THREE.PointsMaterial({
        color: new THREE.Color(pointHexColor),
        size: 0.025,
        transparent: true,
        opacity: 0.42,
      });
      const points = new THREE.Points(pointsGeom, pointsMat);
      deformed.add(points);

      // Show a single "new task" gradient direction and how K changes it.
      // We render:
      // - a white arrow for the transformed vector (stage-specific)
      // - 3 colored component arrows along the axes showing per-axis components
      // Color convention aligned with teaser intuition:
      // Pick = blue (x), Push = gray (y), Close = orange (z).
      const origin = new THREE.Vector3(0, 0, 0);
      const gradArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, 1.0, new THREE.Color(wireColor));
      _setArrowOpacity(gradArrow, 0.62);
      group.add(gradArrow);

      const componentPick = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, 0.2, 0x3b82f6);
      const componentPush = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, 0.2, 0x9ca3af);
      const componentClose = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, 0.2, 0xf59e0b);
      _setArrowOpacity(componentPick, 0.72);
      _setArrowOpacity(componentPush, 0.58);
      _setArrowOpacity(componentClose, 0.72);
      group.add(componentPick);
      group.add(componentPush);
      group.add(componentClose);

      const markerGeom = new THREE.SphereGeometry(0.06, 16, 16);
      const markerMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(wireSoftColor),
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      });
      const gradPoint = new THREE.Mesh(markerGeom, markerMat);
      group.add(gradPoint);

      const inputPointMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color("#f8fafc"),
        transparent: true,
        opacity: 0.90,
        side: THREE.DoubleSide,
      });
      const inputPoint = new THREE.Mesh(markerGeom, inputPointMat);
      inputPoint.visible = false;
      group.add(inputPoint);

      const mapLineGeom = new THREE.BufferGeometry();
      mapLineGeom.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0]), 3)
      );
      const mapLineMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(wireSoftColor),
        transparent: true,
        opacity: 0.35,
      });
      const mapLine = new THREE.Line(mapLineGeom, mapLineMat);
      mapLine.visible = false;
      group.add(mapLine);

      const axes = new THREE.AxesHelper(1.18);
      {
        const mats = Array.isArray(axes.material) ? axes.material : [axes.material];
        for (const m of mats) {
          m.transparent = true;
          m.opacity = 0.14;
        }
      }
      group.add(axes);

      // A faint plane to make "collapse to 2D" visually obvious when one axis ~0.
      const planeGeom = new THREE.PlaneGeometry(2.2, 2.2, 1, 1);
      const planeMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(wireSoftColor),
        transparent: true,
        opacity: 0.07,
        side: THREE.DoubleSide,
      });
      const plane = new THREE.Mesh(planeGeom, planeMat);
      plane.rotation.x = Math.PI / 2;
      plane.visible = false;
      group.add(plane);

      return {
        group,
        deformed,
        refWire,
        mesh,
        wire,
        axes,
        points,
        sourcePositions,
        positions,
        positionAttr,
        pointsMode: "shape",
        plane,
        gradArrow,
        gradPoint,
        inputPoint,
        mapLine,
        componentPick,
        componentPush,
        componentClose,
        radius: R,
      };
    }

    function makeStages(hexColor, x) {
      const pointHexColor = hexColor;
      const stages = Array.from({ length: STAGE_COUNT }, () => makeBlob(hexColor, pointHexColor));
      for (let s = 0; s < stages.length; s++) scene.add(stages[s].group);
      return stages;
    }

    const baselineStages = makeStages("#ef4444", -2.0);
    const sphereStages = makeStages("#0ea5e9", 2.0);

    const dividerGeom = new THREE.PlaneGeometry(0.04, 6.4);
    const dividerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(wireSoftColor),
      transparent: true,
      opacity: 0.16,
    });
    const divider = new THREE.Mesh(dividerGeom, dividerMat);
    divider.position.set(0, 0.0, 0);
    scene.add(divider);

    function applyLayout(rect) {
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const aspect = w / h;
      const compact = w < 980 || aspect < 1.15;

      const x = compact ? 1.55 : 1.95;
      // Vertical spacing between the 2 rows (∇fL, K∇fL). Keep the lower row a touch higher
      // so the bottom stage label reads as aligned instead of sitting on the canvas edge.
      const y = compact ? 1.14 : 1.42;

      const ys = [y, -y];
      for (let s = 0; s < STAGE_COUNT; s++) {
        baselineStages[s].group.position.set(-x, ys[s], 0);
        sphereStages[s].group.position.set(x, ys[s], 0);
      }

      // Auto-fit camera distance to keep all blobs inside view (avoid clipping on narrow screens).
      const blobR = 0.72 * 1.25; // sphere radius + padding for arrows/axes
      const xExtent = x + blobR;
      const yExtent = y + blobR;
      const fovRad = (camera.fov * Math.PI) / 180.0;
      const tan = Math.tan(fovRad / 2.0);
      const dForY = yExtent / Math.max(1e-6, tan);
      const dForX = xExtent / Math.max(1e-6, tan * aspect);
      const camZ = Math.max(compact ? 9.8 : 9.2, dForX, dForY) + 0.35;

      camera.position.set(0, 0.15, camZ);

      divider.scale.set(1, compact ? 0.92 : 1.0, 1);
    }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      applyLayout(rect);
      const w = Math.max(10, Math.floor(rect.width));
      const h = Math.max(10, Math.floor(rect.height));
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    function render() {
      resize();
      renderer.render(scene, camera);
    }

    function setBlobPointCloud(blob, cloudFlat) {
      const arr = cloudFlat instanceof Float32Array ? cloudFlat : new Float32Array(cloudFlat);
      if (arr.length % 3 !== 0) throw new Error("point cloud must be flat xyz array");

      blob.sourcePositions = new Float32Array(arr);
      normalize3FlatInPlace(blob.sourcePositions);

      if (!blob.positionAttr || blob.positionAttr.array.length !== arr.length) {
        blob.positions = new Float32Array(arr.length);
        const nextAttr = new THREE.BufferAttribute(blob.positions, 3);
        nextAttr.setUsage(THREE.DynamicDrawUsage);
        blob.points.geometry.setAttribute("position", nextAttr);
        blob.positionAttr = nextAttr;
      }

      writeScaledShapePositions({ srcUnit: blob.sourcePositions, dst: blob.positions, radius: blob.radius ?? 0.72 });
      blob.positionAttr.needsUpdate = true;
      blob.pointsMode = "shape";
    }

    function setCloudForStages(stages, cloudFlat) {
      for (const blob of stages) setBlobPointCloud(blob, cloudFlat);
    }

    function applyEigs(blob, eigs, stageIdx, gradDir, processAlpha = 1.0) {
      // Interpret eigs as axis gains of K (or its top-3 spectrum), mapping a unit sphere to an ellipsoid.
      const ex = Math.max(0.02, eigs[0] ?? 1);
      const ey = Math.max(0.02, eigs[1] ?? 1);
      const ez = Math.max(0.02, eigs[2] ?? 1);

      // Stage mapping:
      // 0: ∇f L (input) -> identity map (sphere)
      // 1: K ∇f L -> show the stretching process (interpolate identity -> eigs)
      const alpha = stageIdx === 1 ? clamp(processAlpha, 0.0, 1.0) : 1.0;
      const s =
        stageIdx === 0
          ? [1, 1, 1]
          : [lerp(1, ex, alpha), lerp(1, ey, alpha), lerp(1, ez, alpha)];
      blob.deformed.scale.set(s[0], s[1], s[2]);

      // Visualize a single gradient direction g on the unit sphere, then apply K:
      // v = diag(s) * g (axis-aligned approximation).
      const g = gradDir ?? [0.58, 0.44, 0.68];
      const gn = Math.sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]) || 1;
      const gx = g[0] / gn;
      const gy = g[1] / gn;
      const gz = g[2] / gn;
      const kx = ex * gx;
      const ky = ey * gy;
      const kz = ez * gz;
      const vx = (stageIdx === 0 ? 1 : s[0]) * gx;
      const vy = (stageIdx === 0 ? 1 : s[1]) * gy;
      const vz = (stageIdx === 0 ? 1 : s[2]) * gz;

      const R = blob.radius ?? 0.72; // matches the base icosahedron radius
      const vecLen = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      const dir = new THREE.Vector3(vx / vecLen, vy / vecLen, vz / vecLen);

      // White arrow for v, plus a marker point on the corresponding sphere/ellipsoid.
      const arrowLen = 1.15 * R * vecLen;
      blob.gradArrow.setDirection(dir);
      _setArrowLength(blob.gradArrow, arrowLen);
      blob.gradPoint.position.set(R * vx, R * vy, R * vz);

      // Component arrows along axes (signed) – these should visibly vanish if a component is suppressed.
      _setArrowSignedComponent(blob.componentPick, new THREE.Vector3(1, 0, 0), R * vx, 0.02);
      _setArrowSignedComponent(blob.componentPush, new THREE.Vector3(0, 1, 0), R * vy, 0.02);
      _setArrowSignedComponent(blob.componentClose, new THREE.Vector3(0, 0, 1), R * vz, 0.02);

      // Stage-specific: show input point and mapping line in stage 1 to emphasize "process".
      if (stageIdx === 1) {
        blob.inputPoint.visible = true;
        blob.mapLine.visible = true;
        blob.inputPoint.position.set(R * gx, R * gy, R * gz);
        const lineAttr = blob.mapLine.geometry.getAttribute("position");
        lineAttr.setXYZ(0, R * gx, R * gy, R * gz);
        lineAttr.setXYZ(1, R * kx, R * ky, R * kz);
        lineAttr.needsUpdate = true;
      } else {
        blob.inputPoint.visible = false;
        blob.mapLine.visible = false;
      }

      blob.mesh.visible = true;
      blob.wire.visible = true;

      // Stage styling hints.
      blob.refWire.material.opacity = 0.12;
      blob.wire.material.opacity = 0.18;
      // The shell color itself is light; keep it opaque so the geometry stays readable
      // after removing directional lighting and specular highlights.
      blob.mesh.material.opacity = 1.0;
      _setArrowOpacity(blob.gradArrow, 0.56);
      _setArrowOpacity(blob.componentPick, 0.62);
      _setArrowOpacity(blob.componentPush, 0.48);
      _setArrowOpacity(blob.componentClose, 0.62);

      blob.plane.visible = false;
    }

    return { ok: true, renderer, scene, camera, baselineStages, sphereStages, render, applyEigs, setCloudForStages, stageCount: STAGE_COUNT };
  }

  async function initSphereViz() {
    const taskSlider = document.getElementById("taskSlider");
    const playBtn = document.getElementById("playBtn");
    const resetBtn = document.getElementById("resetBtn");
    const meshToggle = document.getElementById("meshToggle");
    const taskIdxBadge = document.getElementById("taskIdxBadge");
    const taskName = document.getElementById("taskName");
    const fallback = document.getElementById("vizFallback");

    const sphereCanvas = document.getElementById("sphereCanvas");

    if (!taskSlider || !playBtn || !resetBtn || !taskIdxBadge || !taskName) return;
    if (!sphereCanvas) return;

    const viz3d = setup3D(sphereCanvas);
    if (!viz3d.ok) {
      if (fallback) fallback.hidden = false;
    }

    let preset;
    try {
      preset = await loadRealHumanoidBenchPreset({ seed: 2 });
    } catch (e) {
      console.error("[sphere_viz] failed to load real Fig1 data:", e);
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent =
          "Real Fig1 data (seed=2) not found. Run this page via a local server (e.g. `python -m http.server`) and ensure `static/real_fig1/seed2/manifest.json` exists.";
      }
      playBtn.disabled = true;
      resetBtn.disabled = true;
      taskSlider.disabled = true;
      return;
    }
    const defaultIdx = Math.max(0, preset.tasks.length - 1); // default: last task (Run)
    let idx = defaultIdx;
    let activeBaselineEigs = preset.baselineEigs?.[idx] ?? [1, 1, 1];
    let activeSphereEigs = preset.sphereEigs?.[idx] ?? [1, 1, 1];
    let activeBaselineGradDir = preset.baselineGradDirs?.[idx] ?? [0.58, 0.44, 0.68];
    let activeSphereGradDir = preset.sphereGradDirs?.[idx] ?? [0.58, 0.44, 0.68];

    // One-shot animation state for stage-1 (K∇fL): show the process once on task change.
    let stage1Alpha = 1.0;
    let stage1AnimStartMs = 0;
    let stage1AnimDurationMs = 420;
    let stage1Animating = false;

    let meshEnabled = true;
    function applyMeshVisibility() {
      if (!viz3d.ok) return;
      for (let stage = 0; stage < viz3d.stageCount; stage++) {
        for (const blob of [viz3d.baselineStages[stage], viz3d.sphereStages[stage]]) {
          blob.mesh.visible = meshEnabled;
          if (blob.points) {
            blob.points.visible = true;
            const mat = blob.points.material;
            // When the mesh is hidden, make the point cloud easier to see.
            mat.opacity = meshEnabled ? 0.42 : 0.58;
            mat.size = meshEnabled ? 0.025 : 0.031;
          }
          if (blob.wire?.material) {
            blob.wire.material.opacity = meshEnabled ? 0.18 : 0.12;
          }
        }
      }
    }

    if (meshToggle) {
      meshEnabled = !!meshToggle.checked;
      meshToggle.addEventListener("change", () => {
        meshEnabled = !!meshToggle.checked;
        applyMeshVisibility();
        viz3d.render();
      });
    }

    function easeOutCubic(t) {
      const x = clamp(t, 0, 1);
      return 1 - Math.pow(1 - x, 3);
    }

    taskSlider.min = "0";
    taskSlider.max = String(Math.max(0, preset.tasks.length - 1));
    taskSlider.step = "1";
    taskSlider.value = String(idx);

    function setTask(nextIdx, { from } = {}) {
      void from;
      idx = clamp(nextIdx, 0, preset.tasks.length - 1);
      taskSlider.value = String(idx);

      taskIdxBadge.textContent = `Task ${idx + 1}`;
      taskName.textContent = preset.tasks[idx] ?? `Task ${idx + 1}`;
      const taskText = `${taskIdxBadge.textContent}: ${taskName.textContent}`;
      taskSlider.setAttribute("aria-valuetext", taskText);

      const p = preset.tasks.length <= 1 ? 0 : idx / (preset.tasks.length - 1);

      const bRank = preset.baselineRank[idx] ?? 0;
      const sRank = preset.sphereRank[idx] ?? 0;
      void bRank;
      void sRank;

      if (viz3d.ok) {
        const bEigs = preset.baselineEigs[idx] ?? [1, 1, 1];
        const sEigs = preset.sphereEigs[idx] ?? [1, 1, 1];
        const bG = preset.baselineGradDirs?.[idx] ?? [0.58, 0.44, 0.68];
        const sG = preset.sphereGradDirs?.[idx] ?? [0.58, 0.44, 0.68];
        activeBaselineEigs = bEigs;
        activeSphereEigs = sEigs;
        activeBaselineGradDir = bG;
        activeSphereGradDir = sG;

        if (preset.baselineClouds?.[idx] && preset.sphereClouds?.[idx]) {
          viz3d.setCloudForStages(viz3d.baselineStages, preset.baselineClouds[idx]);
          viz3d.setCloudForStages(viz3d.sphereStages, preset.sphereClouds[idx]);
        }

        stage1Alpha = 0.0;
        stage1AnimStartMs = performance.now();
        stage1Animating = true;

        for (let stage = 0; stage < viz3d.stageCount; stage++) {
          const alpha = stage === 1 ? stage1Alpha : 1.0;
          viz3d.applyEigs(viz3d.baselineStages[stage], bEigs, stage, bG, alpha);
          viz3d.applyEigs(viz3d.sphereStages[stage], sEigs, stage, sG, alpha);
        }
        applyMeshVisibility();

        const baselineHex = hexColorLerp("#ef4444", "#fb7185", p);
        const sphereHex = hexColorLerp("#0ea5e9", "#38bdf8", p);
        for (let stage = 0; stage < viz3d.stageCount; stage++) {
          viz3d.baselineStages[stage].mesh.material.color = new THREE.Color(baselineHex);
          viz3d.sphereStages[stage].mesh.material.color = new THREE.Color(sphereHex);
        }

        // Make baseline axes more salient as it collapses (more anisotropy).
        for (let stage = 0; stage < viz3d.stageCount; stage++) {
          const bAxes = viz3d.baselineStages[stage].axes;
          const sAxes = viz3d.sphereStages[stage].axes;
          const bMats = Array.isArray(bAxes.material) ? bAxes.material : [bAxes.material];
          const sMats = Array.isArray(sAxes.material) ? sAxes.material : [sAxes.material];
          for (const m of bMats) {
            m.transparent = true;
            m.opacity = 0.14 + 0.40 * p;
          }
          for (const m of sMats) {
            m.transparent = true;
            m.opacity = 0.14;
          }
        }

        viz3d.render();
      }
    }

    let playing = false;
    let playTimer = null;

    function stopPlay() {
      playing = false;
      playBtn.textContent = "Play";
      playBtn.setAttribute("aria-pressed", "false");
      if (playTimer) {
        clearInterval(playTimer);
        playTimer = null;
      }
    }

    function startPlay() {
      playing = true;
      playBtn.textContent = "Pause";
      playBtn.setAttribute("aria-pressed", "true");
      playTimer = setInterval(() => {
        const next = (idx + 1) % preset.tasks.length;
        setTask(next, { from: "play" });
      }, 650);
    }

    taskSlider.addEventListener("input", () => {
      stopPlay();
      setTask(parseInt(taskSlider.value, 10) || 0, { from: "slider" });
    });

    resetBtn.addEventListener("click", () => {
      stopPlay();
      setTask(defaultIdx, { from: "reset" });
    });

    playBtn.addEventListener("click", () => {
      if (playing) stopPlay();
      else startPlay();
    });

    // Continuous rotation / render loop for 3D.
    if (viz3d.ok) {
      let last = performance.now();
      const loop = (t) => {
        const dt = Math.min(0.05, (t - last) / 1000);
        last = t;
        const rot = 0.26 * dt;

        // Stage-1 (K∇fL) animates once per task change, then holds at alpha=1.
        if (stage1Animating) {
          const elapsed = t - stage1AnimStartMs;
          const u = elapsed / stage1AnimDurationMs;
          stage1Alpha = u >= 1 ? 1.0 : easeOutCubic(u);
          if (u >= 1) stage1Animating = false;
          viz3d.applyEigs(viz3d.baselineStages[1], activeBaselineEigs, 1, activeBaselineGradDir, stage1Alpha);
          viz3d.applyEigs(viz3d.sphereStages[1], activeSphereEigs, 1, activeSphereGradDir, stage1Alpha);
          applyMeshVisibility();
        }

        for (let stage = 0; stage < viz3d.stageCount; stage++) {
          viz3d.baselineStages[stage].group.rotation.y += rot;
          viz3d.sphereStages[stage].group.rotation.y -= rot * 0.80;
          viz3d.baselineStages[stage].group.rotation.x += rot * 0.18;
          viz3d.sphereStages[stage].group.rotation.x -= rot * 0.14;
        }
        viz3d.render();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    window.addEventListener("resize", () => {
      if (viz3d.ok) viz3d.render();
    });

    // Initial paint
    setTask(defaultIdx, { from: "init" });
  }

  function whenReady() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", whenReady, { once: true });
      return;
    }
    if (!window.THREE) {
      window.addEventListener("sphere:three-ready", () => initSphereViz().catch((e) => console.error(e)), { once: true });
      setTimeout(() => {
        if (!window.THREE) initSphereViz().catch((e) => console.error(e));
      }, 4000);
      return;
    }
    initSphereViz().catch((e) => console.error(e));
  }

  whenReady();
})();
