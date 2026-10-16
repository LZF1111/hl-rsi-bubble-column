/* Canvas renderer for real OpenFOAM mid-plane fields: alpha.air contour (ParaView-like jet) + liquid tracers advected by U.water. */
(function () {
  // ParaView "Cool to Warm" (Moreland) control points
  const JET = [[0, [59, 76, 192]], [0.25, [124, 159, 249]], [0.5, [221, 221, 221]], [0.75, [246, 154, 121]], [1, [180, 4, 38]]];
  const jet = t => {
    t = Math.max(0, Math.min(1, t)); let k = 0;
    while (k < JET.length - 2 && t > JET[k + 1][0]) k++;
    const [a, ca] = JET[k], [b, cb] = JET[k + 1], f = (t - a) / (b - a);
    return ca.map((c, i) => Math.round(c + (cb[i] - c) * f));
  };
  const FREE = [246, 247, 250];          // freeboard (gas above the liquid) fades to page white
  const RANGE = { lo: 0.06, hi: 0.2 };
  function alphaRGB(a, lo, hi) {
    lo = lo == null ? RANGE.lo : lo; hi = hi == null ? RANGE.hi : hi;
    const c = jet((a - lo) / (hi - lo)), f = Math.max(0, Math.min(1, (a - 0.4) / 0.35));
    return c.map((v, i) => Math.round(v + (FREE[i] - v) * f));
  }
  const DIVERGE = v => { // cool-warm for vertical liquid velocity
    const t = Math.max(-1, Math.min(1, v));
    const lo = [59, 76, 192], mid = [235, 235, 238], hi = [180, 4, 38], e = t < 0 ? lo : hi, f = Math.abs(t);
    return mid.map((m, k) => Math.round(m + (e[k] - m) * f));
  };

  function b64(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function unpack(s, lo, hi) { const u = b64(s), f = new Float32Array(u.length); for (let i = 0; i < u.length; i++) f[i] = lo + (hi - lo) * u[i] / 255; return f; }
  function grid(arr2d) { const ny = arr2d.length, nx = arr2d[0].length, f = new Float32Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) f[j * nx + i] = arr2d[j][i]; return f; }
  function frames(packed, n, lo, hi) { const all = unpack(packed, lo, hi), m = all.length / n; return Array.from({ length: n }, (_, i) => all.subarray(i * m, (i + 1) * m)); }

  // binomial blur on the cell grid: shows the gas-holdup distribution rather than individual plumes
  function smooth(f, nx, ny, passes) {
    let a = Float32Array.from(f), b = new Float32Array(a.length);
    for (let p = 0; p < passes; p++) {
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const l = a[j * nx + Math.max(0, i - 1)], r = a[j * nx + Math.min(nx - 1, i + 1)];
        b[j * nx + i] = 0.25 * l + 0.5 * a[j * nx + i] + 0.25 * r;
      }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const d = b[Math.max(0, j - 1) * nx + i], u = b[Math.min(ny - 1, j + 1) * nx + i];
        a[j * nx + i] = 0.25 * d + 0.5 * b[j * nx + i] + 0.25 * u;
      }
    }
    return a;
  }
  // mean of frames[k-w+1..k]
  function windowMean(fr, k, w) {
    const s = Math.max(0, k - w + 1), out = new Float32Array(fr[k].length);
    for (let q = s; q <= k; q++) { const f = fr[q]; for (let i = 0; i < out.length; i++) out[i] += f[i]; }
    const n = k - s + 1; for (let i = 0; i < out.length; i++) out[i] /= n;
    return out;
  }

  function sample(f, nx, ny, x, y) { // x,y in cell units, row 0 = bottom
    x = Math.max(0, Math.min(nx - 1, x - 0.5)); y = Math.max(0, Math.min(ny - 1, y - 0.5));
    const i = Math.min(nx - 2, Math.floor(x)), j = Math.min(ny - 2, Math.floor(y)), fx = x - i, fy = y - j;
    const a = f[j * nx + i], b = f[j * nx + i + 1], c = f[(j + 1) * nx + i], d = f[(j + 1) * nx + i + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  /* opts: {nx, ny, tracers, mode:'alpha'|'uy', inlets, speed} */
  class FieldView {
    constructor(canvas, opts) {
      this.c = canvas; this.o = Object.assign({ tracers: 0, mode: 'alpha', inlets: true, speed: 1, lo: RANGE.lo, hi: RANGE.hi, smooth: 2 }, opts);
      this.g = canvas.getContext('2d'); this.parts = []; this.raf = 0; this.u = [0.03, 0.03, 0.03];
      this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.off = document.createElement('canvas');
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas);
      this.io = new IntersectionObserver(es => { this.visible = es[0].isIntersecting; if (this.visible) this.loop(); });
      this.io.observe(canvas); this.resize();
    }
    resize() {
      const r = this.c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      if (!r.width) return;
      this.W = Math.round(r.width * dpr); this.H = Math.round(r.height * dpr); this.dpr = dpr;
      this.c.width = this.W; this.c.height = this.H; this.dirty = true; this.draw();
    }
    set(a, ux, uy, u) { this.a = this.o.smooth ? smooth(a, this.o.nx, this.o.ny, this.o.smooth) : a; this.ux = ux; this.uy = uy; if (u) this.u = u; this.dirty = true; if (!this.raf) { this.draw(); this.loop(); } }
    box() { const ib = this.o.inlets ? Math.round(this.H * 0.045) : 0; return { w: this.W, h: this.H - ib, ib }; }
    render() {
      // render at grid-ish resolution then let canvas upscale smoothly: fast and looks like a CFD contour
      const { nx, ny } = this.o, b = this.box(), w = Math.min(b.w, nx * 8), h = Math.min(b.h, ny * 8);
      this.off.width = w; this.off.height = h;
      const oc = this.off.getContext('2d'), img = oc.createImageData(w, h), d = img.data;
      for (let py = 0; py < h; py++) {
        const y = (1 - (py + 0.5) / h) * ny;
        for (let px = 0; px < w; px++) {
          const x = (px + 0.5) / w * nx, o = (py * w + px) * 4;
          const c = this.o.mode === 'uy' ? DIVERGE(sample(this.uy, nx, ny, x, y) / 0.25) : alphaRGB(sample(this.a, nx, ny, x, y), this.o.lo, this.o.hi);
          d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        }
      }
      oc.putImageData(img, 0, 0);
    }
    spawn() { const { nx, ny } = this.o; return { x: 0.2 + Math.random() * (nx - 0.4), y: 0.2 + Math.random() * ny * 0.66, age: 0, life: 60 + Math.random() * 140, tr: [] }; }
    step() {
      const { nx, ny } = this.o, dt = 0.012 * this.o.speed, kx = nx / 0.15, ky = ny / 1.0;
      for (const p of this.parts) {
        p.tr.push(p.x, p.y); if (p.tr.length > 16) p.tr.splice(0, 2);
        p.x += sample(this.ux, nx, ny, p.x, p.y) * kx * dt; p.y += sample(this.uy, nx, ny, p.x, p.y) * ky * dt; p.age++;
        if (p.age > p.life || p.x < 0.1 || p.x > nx - 0.1 || p.y < 0.1 || sample(this.a, nx, ny, p.x, p.y) > 0.45) Object.assign(p, this.spawn());
      }
    }
    draw() {
      if (!this.W || !this.a) return;
      const g = this.g, b = this.box();
      if (this.dirty) { this.render(); this.dirty = false; }
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(this.off, 0, 0, b.w, b.h);
      if (this.o.window) {
        const y0 = b.h * (1 - 0.05), y1 = b.h * (1 - 0.6);
        g.save(); g.strokeStyle = 'rgba(29,29,31,.45)'; g.lineWidth = this.dpr; g.setLineDash([3 * this.dpr, 3 * this.dpr]);
        g.beginPath(); g.moveTo(0, y0); g.lineTo(b.w, y0); g.moveTo(0, y1); g.lineTo(b.w, y1);
        g.moveTo(b.w / 3, y0); g.lineTo(b.w / 3, y1); g.moveTo(2 * b.w / 3, y0); g.lineTo(2 * b.w / 3, y1); g.stroke(); g.restore();
      }
      if (this.ux && !this.reduce && this.o.tracers) {
        if (this.parts.length !== this.o.tracers) this.parts = Array.from({ length: this.o.tracers }, () => Object.assign(this.spawn(), { age: Math.random() * 100 }));
        const sx = b.w / this.o.nx, sy = b.h / this.o.ny;
        g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = Math.max(1, 1.1 * this.dpr);
        for (const p of this.parts) {
          if (p.tr.length < 4) continue;
          const life = Math.sin(Math.PI * Math.min(1, p.age / p.life));
          g.strokeStyle = `rgba(255,255,255,${0.5 * life})`;
          g.beginPath(); g.moveTo(p.tr[0] * sx, b.h - p.tr[1] * sy);
          for (let k = 2; k < p.tr.length; k += 2) g.lineTo(p.tr[k] * sx, b.h - p.tr[k + 1] * sy);
          g.lineTo(p.x * sx, b.h - p.y * sy); g.stroke();
        }
      }
      if (this.o.inlets) {
        const cols = ['#5b9cff', '#ffc24a', '#ff6fa3'];
        g.fillStyle = '#e8e8ed'; g.fillRect(0, b.h, this.W, b.ib);
        this.u.forEach((v, i) => {
          const w = this.W / 3, f = Math.max(0, Math.min(1, (v - 0.01) / 0.04)), y = b.h + b.ib * 0.3, hh = b.ib * 0.4;
          g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(i * w + w * 0.1, y, w * 0.8, hh);
          g.fillStyle = cols[i]; g.fillRect(i * w + w * 0.1, y, w * 0.8 * f, hh);
        });
      }
    }
    loop() {
      if (this.raf || this.reduce || !this.ux || !this.visible || !this.o.tracers) { this.draw(); return; }
      const tick = () => { if (!this.visible || !this.c.isConnected) { this.raf = 0; return; } this.step(); this.draw(); this.raf = requestAnimationFrame(tick); };
      this.raf = requestAnimationFrame(tick);
    }
    destroy() { cancelAnimationFrame(this.raf); this.raf = 0; this.ro.disconnect(); this.io.disconnect(); }
  }

  function colorbar(mode, label, lo, hi) {
    lo = lo == null ? RANGE.lo : lo; hi = hi == null ? RANGE.hi : hi;
    const n = 16, stops = Array.from({ length: n + 1 }, (_, i) => {
      const v = i / n, c = mode === 'uy' ? DIVERGE(v * 2 - 1) : jet(v);
      return `<stop offset="${v}" stop-color="rgb(${c})"/>`;
    }).join('');
    const id = 'cb' + Math.random().toString(36).slice(2, 8);
    const t = mode === 'uy' ? ['−0.25', '0', '+0.25 m/s'] : [lo.toFixed(2), ((lo + hi) / 2).toFixed(2), hi.toFixed(2)];
    return `<div class="cbar"><svg viewBox="0 0 200 8" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}">${stops}</linearGradient></defs><rect width="200" height="8" rx="4" fill="url(#${id})"/></svg><div class="cbar-t"><span>${t[0]}</span><span>${label}</span><span>${t[2]}</span></div></div>`;
  }

    // gas fraction in left/centre/right thirds of the scoring window 0.05-0.6 m, and I = std/(mean+0.01)
  function thirds(a, nx, ny) {
    const g = [0, 0, 0], n = [0, 0, 0];
    for (let j = 0; j < ny; j++) {
      const y = (j + 0.5) / ny; if (y < 0.05 || y > 0.6) continue;
      for (let i = 0; i < nx; i++) { const k = Math.min(2, Math.floor(3 * i / nx)); g[k] += a[j * nx + i]; n[k]++; }
    }
    const v = g.map((s, k) => s / n[k]), m = (v[0] + v[1] + v[2]) / 3;
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / 3);
    return { g: v, I: sd / (m + 0.01) };
  }

  window.CFD = { FieldView, unpack, grid, frames, colorbar, alphaRGB, jet, RANGE, smooth, windowMean, thirds };
})();
