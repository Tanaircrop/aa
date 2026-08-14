/* Biểu đồ SVG tự vẽ — không phụ thuộc CDN, app chạy được cả khi offline.
   Chỉ đủ 4 loại cần cho dashboard: bar, grouped bar, line, donut. */

const NS = 'http://www.w3.org/2000/svg';

const PALETTE = ['#1f5f8b', '#3f9c6d', '#c98a1d', '#a2543f', '#6a5aa0',
  '#2b7f8c', '#8b6b3f', '#9c4f6d'];

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgRoot(width, height) {
  const svg = el('svg', {
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
  });
  return svg;
}

function niceMax(value) {
  if (value <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(value));
  const norm = value / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function tooltipTitle(node, text) {
  node.appendChild(el('title', {}, text));
}

/** Bar chart dọc. data: {labels: [], values: [], categories?: []} */
export function barChart(container, data, options = {}) {
  const { labels = [], values = [], categories = [] } = data;
  const W = 460;
  const H = options.height || 210;
  const padL = 34, padR = 8, padT = 14, padB = 58;
  const svg = svgRoot(W, H);
  const max = niceMax(Math.max(...values, 0));
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = Math.max(values.length, 1);
  const slot = plotW / n;
  const barW = Math.min(slot * 0.68, 52);

  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH - (plotH * i) / 4;
    svg.appendChild(el('line', {
      x1: padL, x2: W - padR, y1: y, y2: y,
      stroke: i === 0 ? '#c3ccd6' : '#eef1f5', 'stroke-width': 1,
    }));
    svg.appendChild(el('text', {
      x: padL - 6, y: y + 3.5, 'text-anchor': 'end',
      'font-size': 9.5, fill: '#8a99a8',
    }, String(Math.round((max * i) / 4))));
  }

  values.forEach((value, i) => {
    const h = max ? (value / max) * plotH : 0;
    const x = padL + slot * i + (slot - barW) / 2;
    const y = padT + plotH - h;
    const rect = el('rect', {
      x, y, width: barW, height: Math.max(h, value > 0 ? 1.5 : 0),
      fill: options.color || PALETTE[0], rx: 2,
    });
    tooltipTitle(rect, `${labels[i]}: ${value}`);
    svg.appendChild(rect);
    if (value > 0) {
      svg.appendChild(el('text', {
        x: x + barW / 2, y: y - 3, 'text-anchor': 'middle',
        'font-size': 9.5, fill: '#5b6b7c', 'font-weight': 600,
      }, String(value)));
    }
    const code = categories[i] ?? labels[i];
    svg.appendChild(el('text', {
      x: x + barW / 2, y: padT + plotH + 13, 'text-anchor': 'middle',
      'font-size': 11.5, fill: '#17202a', 'font-weight': 600,
    }, String(code)));
    const label = labels[i];
    if (label !== undefined && String(label) !== String(code)) {
      const text = el('text', {
        x: x + barW / 2, y: padT + plotH + 24, 'text-anchor': 'middle',
        'font-size': 10, fill: '#8a99a8',
      });
      wrap(text, String(label), 9, x + barW / 2, padT + plotH + 24);
      svg.appendChild(text);
    }
  });

  render(container, svg);
}

function wrap(textNode, str, maxChars, x, y) {
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > maxChars && line) {
      lines.push(line.trim());
      line = word;
    } else {
      line = (line + ' ' + word).trim();
    }
  }
  if (line) lines.push(line);
  lines.slice(0, 2).forEach((text, i) => {
    textNode.appendChild(el('tspan', { x, y: y + i * 10 }, text));
  });
}

/** Grouped bar: series = [{name, values, color?}] */
export function groupedBarChart(container, labels, series, options = {}) {
  const W = 460;
  const H = options.height || 220;
  const padL = 38, padR = 8, padT = 12, padB = 46;
  const svg = svgRoot(W, H);
  const all = series.flatMap((s) => s.values);
  const max = niceMax(Math.max(...all, 0));
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const slot = plotW / Math.max(labels.length, 1);
  const barW = Math.min((slot * 0.7) / series.length, 26);

  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH - (plotH * i) / 4;
    svg.appendChild(el('line', {
      x1: padL, x2: W - padR, y1: y, y2: y,
      stroke: i === 0 ? '#c3ccd6' : '#eef1f5',
    }));
    svg.appendChild(el('text', {
      x: padL - 6, y: y + 3.5, 'text-anchor': 'end', 'font-size': 9.5, fill: '#8a99a8',
    }, String(Math.round((max * i) / 4))));
  }

  labels.forEach((label, i) => {
    series.forEach((s, j) => {
      const value = s.values[i] ?? 0;
      const h = max ? (value / max) * plotH : 0;
      const groupW = barW * series.length;
      const x = padL + slot * i + (slot - groupW) / 2 + j * barW;
      const rect = el('rect', {
        x, y: padT + plotH - h, width: barW - 2, height: Math.max(h, value > 0 ? 1.5 : 0),
        fill: s.color || PALETTE[j % PALETTE.length], rx: 2,
      });
      tooltipTitle(rect, `${label} — ${s.name}: ${value}`);
      svg.appendChild(rect);
    });
    const text = el('text', {
      'text-anchor': 'middle', 'font-size': 9.5, fill: '#5b6b7c',
    });
    wrap(text, String(label), 16, padL + slot * i + slot / 2, padT + plotH + 13);
    svg.appendChild(text);
  });

  series.forEach((s, j) => {
    const x = padL + j * 92;
    svg.appendChild(el('rect', {
      x, y: H - 14, width: 9, height: 9, rx: 2,
      fill: s.color || PALETTE[j % PALETTE.length],
    }));
    svg.appendChild(el('text', {
      x: x + 13, y: H - 6, 'font-size': 10, fill: '#5b6b7c',
    }, s.name));
  });

  render(container, svg);
}

/** Line chart: labels (ngày) + một hoặc nhiều series. */
export function lineChart(container, labels, series, options = {}) {
  const W = 700;
  const H = options.height || 220;
  const padL = 42, padR = 12, padT = 12, padB = 40;
  const svg = svgRoot(W, H);
  const all = series.flatMap((s) => s.values);
  const max = niceMax(Math.max(...all, 0));
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = labels.length;

  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH - (plotH * i) / 4;
    svg.appendChild(el('line', {
      x1: padL, x2: W - padR, y1: y, y2: y,
      stroke: i === 0 ? '#c3ccd6' : '#eef1f5',
    }));
    svg.appendChild(el('text', {
      x: padL - 6, y: y + 3.5, 'text-anchor': 'end', 'font-size': 9.5, fill: '#8a99a8',
    }, String(Math.round((max * i) / 4))));
  }

  if (!n) {
    svg.appendChild(el('text', {
      x: W / 2, y: H / 2, 'text-anchor': 'middle', 'font-size': 12, fill: '#8a99a8',
    }, 'Chưa có dữ liệu'));
    render(container, svg);
    return;
  }

  const xOf = (i) => padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const yOf = (v) => padT + plotH - (max ? (v / max) * plotH : 0);

  series.forEach((s, j) => {
    const color = s.color || PALETTE[j % PALETTE.length];
    const points = s.values.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ');
    svg.appendChild(el('polyline', {
      points, fill: 'none', stroke: color, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
    s.values.forEach((v, i) => {
      const dot = el('circle', { cx: xOf(i), cy: yOf(v), r: 3, fill: color });
      tooltipTitle(dot, `${labels[i]} — ${s.name}: ${v}`);
      svg.appendChild(dot);
    });
    const lx = padL + j * 120;
    svg.appendChild(el('line', {
      x1: lx, x2: lx + 14, y1: H - 9, y2: H - 9, stroke: color, 'stroke-width': 2,
    }));
    svg.appendChild(el('text', { x: lx + 19, y: H - 5.5, 'font-size': 10, fill: '#5b6b7c' }, s.name));
  });

  const step = Math.max(1, Math.ceil(n / 8));
  labels.forEach((label, i) => {
    if (i % step && i !== n - 1) return;
    svg.appendChild(el('text', {
      x: xOf(i), y: padT + plotH + 13, 'text-anchor': 'middle',
      'font-size': 9.5, fill: '#5b6b7c',
    }, String(label).slice(5)));
  });

  render(container, svg);
}

/** Donut chart. data: [{label, value, color?}] */
export function donutChart(container, data, options = {}) {
  const W = 300;
  const H = options.height || 190;
  const svg = svgRoot(W, H);
  const cx = 92, cy = H / 2, r = 62, inner = 38;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (!total) {
    svg.appendChild(el('text', {
      x: W / 2, y: H / 2, 'text-anchor': 'middle', 'font-size': 12, fill: '#8a99a8',
    }, 'Chưa có dữ liệu'));
    render(container, svg);
    return;
  }

  let angle = -Math.PI / 2;
  data.forEach((d, i) => {
    const sweep = (d.value / total) * Math.PI * 2;
    const color = d.color || PALETTE[i % PALETTE.length];
    const title = `${d.label}: ${d.value} (${((d.value / total) * 100).toFixed(1)}%)`;
    if (d.value > 0) {
      // 100% một loại: cung tròn khép kín có điểm đầu trùng điểm cuối nên path
      // rỗng — vẽ bằng hai vòng tròn thay vì arc.
      svg.appendChild(d.value === total
        ? fullRing(cx, cy, r, inner, color, title)
        : arc(cx, cy, r, inner, angle, angle + sweep, color, title));
    }
    angle += sweep;
  });

  svg.appendChild(el('text', {
    x: cx, y: cy + 1, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 700,
    fill: '#17202a',
  }, String(total)));
  svg.appendChild(el('text', {
    x: cx, y: cy + 15, 'text-anchor': 'middle', 'font-size': 9.5, fill: '#8a99a8',
  }, options.centerLabel || 'video'));

  data.forEach((d, i) => {
    const y = 34 + i * 19;
    svg.appendChild(el('rect', {
      x: 178, y: y - 8, width: 10, height: 10, rx: 2,
      fill: d.color || PALETTE[i % PALETTE.length],
    }));
    svg.appendChild(el('text', { x: 193, y, 'font-size': 10.5, fill: '#17202a' },
      `${d.label} — ${d.value}`));
  });

  render(container, svg);
}

function fullRing(cx, cy, r, inner, color, title) {
  const path = el('path', {
    d: `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} `
      + `A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z `
      + `M ${cx - inner} ${cy} A ${inner} ${inner} 0 1 0 ${cx + inner} ${cy} `
      + `A ${inner} ${inner} 0 1 0 ${cx - inner} ${cy} Z`,
    fill: color, 'fill-rule': 'evenodd',
  });
  tooltipTitle(path, title);
  return path;
}

function arc(cx, cy, r, inner, from, to, color, title) {
  const large = to - from > Math.PI ? 1 : 0;
  const p = (radius, angle) => [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  const [x1, y1] = p(r, from);
  const [x2, y2] = p(r, to);
  const [x3, y3] = p(inner, to);
  const [x4, y4] = p(inner, from);
  const path = el('path', {
    d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} `
      + `A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`,
    fill: color, stroke: '#fff', 'stroke-width': 1.5,
  });
  tooltipTitle(path, title);
  return path;
}

function render(container, svg) {
  const node = typeof container === 'string' ? document.getElementById(container) : container;
  if (!node) return;
  node.innerHTML = '';
  node.appendChild(svg);
}

export { PALETTE };
