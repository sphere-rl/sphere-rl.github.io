(() => {
  const DEG_MIN = -135;
  const DEG_MAX = 135;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function invLerp(a, b, v) {
    if (a === b) return 0;
    return (v - a) / (b - a);
  }

  function angleToValue(angleDeg, min, max, step) {
    const t = invLerp(DEG_MIN, DEG_MAX, angleDeg);
    const raw = lerp(min, max, clamp(t, 0, 1));
    if (!step) return raw;
    const snapped = Math.round((raw - min) / step) * step + min;
    return clamp(snapped, min, max);
  }

  function valueToAngle(value, min, max) {
    const t = invLerp(min, max, value);
    return lerp(DEG_MIN, DEG_MAX, clamp(t, 0, 1));
  }

  function pointerAngleDeg(event, element) {
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const angleRad = Math.atan2(dy, dx);
    const angleDeg = (angleRad * 180) / Math.PI;

    // Convert so that "up" is 0deg and we sweep around.
    // atan2 gives 0deg on +x; rotate by +90 to make +y (down) become 180, then invert.
    const rotated = angleDeg + 90;
    return clamp(rotated, DEG_MIN, DEG_MAX);
  }

  class TaskKnob {
    constructor(element, options) {
      this.el = element;
      this.min = options?.min ?? 0;
      this.max = options?.max ?? 4;
      this.step = options?.step ?? 1;
      this.onChange = options?.onChange ?? (() => {});

      this._value = clamp(options?.value ?? this.min, this.min, this.max);
      this._dragging = false;
      this._pointerId = null;

      this._applyVisual();
      this._bind();
    }

    _bind() {
      this.el.addEventListener("pointerdown", (e) => {
        this._dragging = true;
        this._pointerId = e.pointerId;
        this.el.setPointerCapture(e.pointerId);
        this._setFromPointer(e, true);
      });

      this.el.addEventListener("pointermove", (e) => {
        if (!this._dragging || e.pointerId !== this._pointerId) return;
        this._setFromPointer(e, true);
      });

      const end = (e) => {
        if (e.pointerId !== this._pointerId) return;
        this._dragging = false;
        this._pointerId = null;
      };
      this.el.addEventListener("pointerup", end);
      this.el.addEventListener("pointercancel", end);

      // Keyboard accessibility
      this.el.tabIndex = 0;
      this.el.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          this.setValue(this._value - this.step, true);
        }
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          this.setValue(this._value + this.step, true);
        }
        if (e.key === "Home") {
          e.preventDefault();
          this.setValue(this.min, true);
        }
        if (e.key === "End") {
          e.preventDefault();
          this.setValue(this.max, true);
        }
      });
    }

    _setFromPointer(event, emit) {
      const angle = pointerAngleDeg(event, this.el);
      const value = angleToValue(angle, this.min, this.max, this.step);
      this.setValue(value, emit);
    }

    _applyVisual() {
      const angle = valueToAngle(this._value, this.min, this.max);
      this.el.style.setProperty("--knob-angle", `${angle}deg`);
      this.el.setAttribute("aria-valuemin", String(this.min));
      this.el.setAttribute("aria-valuemax", String(this.max));
      this.el.setAttribute("aria-valuenow", String(this._value));
      this.el.setAttribute("role", "slider");
    }

    getValue() {
      return this._value;
    }

    setRange(min, max) {
      this.min = min;
      this.max = max;
      this._value = clamp(this._value, this.min, this.max);
      this._applyVisual();
    }

    setValue(value, emit = false) {
      const next = clamp(Math.round((value - this.min) / this.step) * this.step + this.min, this.min, this.max);
      if (next === this._value) return;
      this._value = next;
      this._applyVisual();
      if (emit) this.onChange(this._value);
    }
  }

  window.TaskKnob = TaskKnob;
})();

