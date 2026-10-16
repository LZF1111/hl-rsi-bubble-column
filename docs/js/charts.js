/* Minimal dependency-free SVG chart helpers. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  let tip;
  function tipEl() {
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    return tip;
  }
  function showTip(e, html) { const t = tipEl(); t.innerHTML = html; t.style.opacity = 1; t.style.left = (e.clientX + 14) + 'px'; t.style.top = (e.clientY + 14) + 'px'; }
  function hideTip() { if (tip) tip.style.opacity = 0; }

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function text(parent, x, y, s, attrs) {
    const t = el('text', Object.assign({ x, y, 'font-size': 11, fill: '#6e6e73' }, attrs || {}), parent);
    t.textContent = s; return t;
  }
  function extent(vals, pad) {
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (lo === hi) { lo -= 1; hi += 1; }
    const p = (hi - lo) * (pad == null ? 0.08 : pad);
    return [lo - p, hi + p];
  }
  function ticks(lo, hi, n) {
    const step0 = (hi - lo) / (n || 5), mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) out.push(+v.toPrecision(10));
    return out;
  }
  function fmt(v) { const a = Math.abs(v); if (a < 1e-12) return '0'; return a >= 1000 ? (v / 1000).toFixed(a >= 10000 ? 0 : 1) + 'k' : a >= 10 ? v.toFixed(0) : a >= 1 ? v.toFixed(1) : v.toFixed(a >= 0.1 ? 2 : 3); }

  /* Frame with axes. opts: {w,h,x:[lo,hi],y:[lo,hi],xlabel,ylabel,zero} */
  function frame(container, opts) {
    const W = opts.w || 640, H = opts.h || 260, m = Object.assign({ l: 48, r: 16, t: 14, b: 36 }, opts.margin || {});
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.label || 'chart' });
    container.innerHTML = ''; container.appendChild(svg);
    const [x0, x1] = opts.x, [y0, y1] = opts.y;
    const sx = v => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r);
    const sy = v => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
    const g = el('g', {}, svg);
    for (const v of ticks(y0, y1, opts.yt || 5)) {
      el('line', { x1: m.l, x2: W - m.r, y1: sy(v), y2: sy(v), stroke: '#ececf0' }, g);
      text(g, m.l - 6, sy(v) + 4, opts.yfmt ? opts.yfmt(v) : fmt(v), { 'text-anchor': 'end' });
    }
    for (const v of ticks(x0, x1, opts.xt || 6)) text(g, sx(v), H - m.b + 16, opts.xfmt ? opts.xfmt(v) : fmt(v), { 'text-anchor': 'middle' });
    if (opts.zero && y0 < 0 && y1 > 0) el('line', { x1: m.l, x2: W - m.r, y1: sy(0), y2: sy(0), stroke: '#a1a1a6', 'stroke-dasharray': '3 3' }, g);
    if (opts.xlabel) text(g, (m.l + W - m.r) / 2, H - 4, opts.xlabel, { 'text-anchor': 'middle', 'font-size': 12 });
    if (opts.ylabel) text(g, 12, (m.t + H - m.b) / 2, opts.ylabel, { 'text-anchor': 'middle', 'font-size': 12, transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})` });
    return { svg, sx, sy, W, H, m, y0, y1, g: el('g', {}, svg) };
  }

  function path(f, pts, attrs) {
    const d = pts.filter(p => p[1] != null && isFinite(p[1])).map((p, i) => (i ? 'L' : 'M') + f.sx(p[0]).toFixed(1) + ',' + f.sy(p[1]).toFixed(1)).join('');
    return el('path', Object.assign({ d, fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, attrs), f.g);
  }

  /* series: [{name,color,pts:[[x,y]],dash,width,area}] */
  function lines(container, series, opts) {
    const xs = series.flatMap(s => s.pts.map(p => p[0])), ys = series.flatMap(s => s.pts.map(p => p[1]).filter(v => v != null));
    const f = frame(container, Object.assign({ x: opts.x || [Math.min(...xs), Math.max(...xs)], y: opts.y || extent(ys) }, opts));
    for (const s of series) {
      if (s.area) {
        const pts = s.pts; const base = f.sy(Math.min(Math.max(0, f.y0), f.y1));
        const d = 'M' + f.sx(pts[0][0]) + ',' + base + pts.map(p => 'L' + f.sx(p[0]) + ',' + f.sy(p[1])).join('') + 'L' + f.sx(pts[pts.length - 1][0]) + ',' + base + 'Z';
        el('path', { d, fill: s.color, opacity: 0.12 }, f.g);
      }
      const p = path(f, s.pts, { stroke: s.color, 'stroke-width': s.width || 2, 'stroke-dasharray': s.dash || '', opacity: s.opacity || 1 });
      if (s.anim) { const L = p.getTotalLength ? 2000 : 0; p.style.strokeDasharray = L; p.style.strokeDashoffset = L; p.style.transition = 'stroke-dashoffset 1.4s ease'; requestAnimationFrame(() => requestAnimationFrame(() => { p.style.strokeDashoffset = 0; })); }
    }
    if (opts.hover !== false) hoverX(f, series, opts);
    return f;
  }

  function hoverX(f, series, opts) {
    const rect = el('rect', { x: f.m.l, y: f.m.t, width: f.W - f.m.l - f.m.r, height: f.H - f.m.t - f.m.b, fill: 'transparent' }, f.svg);
    const guide = el('line', { y1: f.m.t, y2: f.H - f.m.b, stroke: '#1d1d1f', opacity: 0, 'stroke-width': 1 }, f.svg);
    rect.addEventListener('mousemove', e => {
      const bb = f.svg.getBoundingClientRect(), x = (e.clientX - bb.left) / bb.width * f.W;
      let best = null, bx = 0;
      const lines = series.filter(s => !s.nohover).map(s => {
        let p = s.pts[0], dmin = Infinity;
        for (const q of s.pts) { const d = Math.abs(f.sx(q[0]) - x); if (d < dmin) { dmin = d; p = q; } }
        best = p; bx = f.sx(p[0]);
        return `<i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${s.color};margin-right:6px"></i>${s.name}: <b>${p[1] == null ? '—' : (+p[1]).toFixed(opts.digits == null ? 3 : opts.digits)}</b>`;
      });
      if (!best) return;
      guide.setAttribute('x1', bx); guide.setAttribute('x2', bx); guide.setAttribute('opacity', 0.25);
      showTip(e, `<div style="opacity:.7;margin-bottom:4px">${opts.xname || 'x'} = ${(+best[0]).toFixed(opts.xdigits == null ? 1 : opts.xdigits)}</div>` + lines.join('<br>'));
    });
    rect.addEventListener('mouseleave', () => { hideTip(); guide.setAttribute('opacity', 0); });
  }

  /* groups: [{label, values:[{v,color,name}]}] */
  function bars(container, groups, opts) {
    const vals = groups.flatMap(g => g.values.map(v => v.v)).concat([0]);
    const n = groups.length;
    const f = frame(container, Object.assign({ x: [0, n], y: opts.y || extent(vals, 0.12), zero: true, xfmt: () => '' , xt: 1 }, opts));
    const gw = (f.sx(1) - f.sx(0)), inner = gw * 0.72;
    groups.forEach((g, i) => {
      const k = g.values.length, bw = inner / k;
      g.values.forEach((v, j) => {
        if (v.v == null) return;
        const x = f.sx(i) + (gw - inner) / 2 + j * bw, y0 = f.sy(0), y1 = f.sy(v.v);
        const r = el('rect', { x: x + 1, width: Math.max(1, bw - 2), y: Math.min(y0, y1), height: Math.max(1, Math.abs(y1 - y0)), rx: Math.min(4, bw / 3), fill: v.color, opacity: v.opacity || 1 }, f.g);
        r.addEventListener('mousemove', e => showTip(e, `${g.label}<br>${v.name || ''} <b>${(+v.v).toFixed(3)}</b>`));
        r.addEventListener('mouseleave', hideTip);
      });
      text(f.g, f.sx(i) + gw / 2, f.H - f.m.b + 16, g.label, { 'text-anchor': 'middle', 'font-size': 11 });
    });
    return f;
  }

  /* points: [{x,y,color,r,html,onclick,ring}] */
  function scatter(f, points) {
    for (const p of points) {
      const c = el('circle', { cx: f.sx(p.x), cy: f.sy(p.y), r: p.r || 5, fill: p.color, stroke: p.ring ? '#1d1d1f' : '#fff', 'stroke-width': p.ring ? 2.5 : 1.5, style: p.onclick ? 'cursor:pointer' : '' }, f.svg);
      if (p.html) { c.addEventListener('mousemove', e => showTip(e, p.html)); c.addEventListener('mouseleave', hideTip); }
      if (p.onclick) c.addEventListener('click', p.onclick);
    }
  }

  window.Charts = { el, text, frame, lines, bars, scatter, path, extent, showTip, hideTip, fmt };
})();
