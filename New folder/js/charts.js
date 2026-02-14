import { formatXP, isoDateTiny, clamp } from "./utils.js";

function svgEl(tag, attrs = {}){
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export function renderXPLineChart(container, points, opts = {}) {
  container.innerHTML = "";

  if (!points || points.length < 2) {
    const empty = document.createElement("div");
    empty.className = "chart-empty";
    empty.textContent = "No data";
    container.appendChild(empty);
    return;
  }

  // ---- options ----
  const W = opts.width ?? 760;
  const H = opts.height ?? 280;

  const padL = opts.padL ?? 58;
  const padR = opts.padR ?? 18;
  const padT = opts.padT ?? 22;
  const padB = opts.padB ?? 36;

  // sort by time
  points = [...points].sort((a, b) => a.x - b.x);

  // ---- helpers ----
  const clampLocal = (v, a, b) => Math.max(a, Math.min(b, v));

  const formatDate = (ms) => {
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const formatXPLocal = (n) => {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${Math.round(n / 10_000) / 100} MB`;
    if (abs >= 1_000) return `${Math.round(n / 10) / 100} kB`;
    return `${Math.round(n)} B`;
  };

  // ---- scales ----
  const xMin = points[0].x;
  const xMax = points[points.length - 1].x;

  let yMin = 0;
  let yMax = Math.max(...points.map((p) => p.y));
  if (yMax <= 0) yMax = 1;

  // add a bit of headroom so the line doesn't touch top
  const headroom = yMax * 0.08;
  yMax += headroom;

  const xScale = (x) =>
    padL + ((x - xMin) / (xMax - xMin || 1)) * (W - padL - padR);

  const yScale = (y) =>
    H - padB - ((y - yMin) / (yMax - yMin || 1)) * (H - padT - padB);

  const xPix = points.map((p) => xScale(p.x)); // rendered X positions

  // ---- svg ----
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.display = "block";

  // background rect (optional)
  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", W);
  bg.setAttribute("height", H);
  bg.setAttribute("fill", "transparent");
  svg.appendChild(bg);

  // ---- grid + y labels ----
  const grid = document.createElementNS(svgNS, "g");
  grid.setAttribute("opacity", "0.35");

  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const t = i / yTicks;
    const yVal = yMin + t * (yMax - yMin);
    const y = yScale(yVal);

    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", padL);
    line.setAttribute("x2", W - padR);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", "rgba(255,255,255,0.25)");
    line.setAttribute("stroke-width", "1");
    grid.appendChild(line);

    const txt = document.createElementNS(svgNS, "text");
    txt.setAttribute("x", padL - 10);
    txt.setAttribute("y", y + 4);
    txt.setAttribute("text-anchor", "end");
    txt.setAttribute("fill", "rgba(255,255,255,0.75)");
    txt.setAttribute("font-size", "12");
    txt.textContent = formatXPLocal(yVal);
    grid.appendChild(txt);
  }
  svg.appendChild(grid);

  // ---- x labels (3) ----
  const xLabelG = document.createElementNS(svgNS, "g");
  xLabelG.setAttribute("opacity", "0.9");

  const labelCount = 3;
  for (let i = 0; i < labelCount; i++) {
    const t = i / (labelCount - 1);
    const xVal = xMin + t * (xMax - xMin);
    const x = xScale(xVal);

    const txt = document.createElementNS(svgNS, "text");
    txt.setAttribute("x", x);
    txt.setAttribute("y", H - 12);
    txt.setAttribute(
      "text-anchor",
      i === 0 ? "start" : i === labelCount - 1 ? "end" : "middle"
    );
    txt.setAttribute("fill", "rgba(255,255,255,0.75)");
    txt.setAttribute("font-size", "12");
    txt.textContent = formatDate(xVal);
    xLabelG.appendChild(txt);
  }
  svg.appendChild(xLabelG);

  // ---- line path ----
  let d = "";
  for (let i = 0; i < points.length; i++) {
    const x = xPix[i];
    const y = yScale(points[i].y);
    d += (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2) + " ";
  }

  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", d.trim());
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "rgba(255,255,255,0.95)");
  path.setAttribute("stroke-width", "2.5");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);

  // ---- hover elements ----
  const hoverG = document.createElementNS(svgNS, "g");
  hoverG.style.display = "none";

  const vLine = document.createElementNS(svgNS, "line");
  vLine.setAttribute("y1", padT);
  vLine.setAttribute("y2", H - padB);
  vLine.setAttribute("stroke", "rgba(255,255,255,0.25)");
  vLine.setAttribute("stroke-width", "1");

  const dot = document.createElementNS(svgNS, "circle");
  dot.setAttribute("r", "4.5");
  dot.setAttribute("fill", "rgba(255,255,255,0.95)");

  const tip = document.createElementNS(svgNS, "g");
  const tipRect = document.createElementNS(svgNS, "rect");
  tipRect.setAttribute("rx", "10");
  tipRect.setAttribute("fill", "rgba(0,0,0,0.65)");
  tipRect.setAttribute("stroke", "rgba(255,255,255,0.18)");
  tipRect.setAttribute("stroke-width", "1");

  const tipText1 = document.createElementNS(svgNS, "text");
  tipText1.setAttribute("fill", "rgba(255,255,255,0.95)");
  tipText1.setAttribute("font-size", "12");
  tipText1.setAttribute("font-weight", "600");

  const tipText2 = document.createElementNS(svgNS, "text");
  tipText2.setAttribute("fill", "rgba(255,255,255,0.85)");
  tipText2.setAttribute("font-size", "12");

  tip.appendChild(tipRect);
  tip.appendChild(tipText1);
  tip.appendChild(tipText2);

  hoverG.appendChild(vLine);
  hoverG.appendChild(dot);
  hoverG.appendChild(tip);
  svg.appendChild(hoverG);

  // accurate mouse->svg conversion
  function clientToSvgX(evt) {
    const e = evt.touches ? evt.touches[0] : evt;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return padL;
    const p = pt.matrixTransform(m.inverse());
    return p.x;
  }

  function nearestIndexByX(xSvg) {
    let lo = 0,
      hi = xPix.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (xPix[mid] < xSvg) lo = mid + 1;
      else hi = mid;
    }
    const i = lo;
    if (i <= 0) return 0;
    if (i >= xPix.length) return xPix.length - 1;
    return Math.abs(xPix[i - 1] - xSvg) <= Math.abs(xPix[i] - xSvg) ? i - 1 : i;
  }

  function updateHover(evt) {
    const xSvg = clientToSvgX(evt);
    const xClamped = clampLocal(xSvg, padL, W - padR);
    const idx = nearestIndexByX(xClamped);
    const p = points[idx];

    const x = xPix[idx];
    const y = yScale(p.y);

    hoverG.style.display = "";

    vLine.setAttribute("x1", x);
    vLine.setAttribute("x2", x);

    dot.setAttribute("cx", x);
    dot.setAttribute("cy", y);

    tipText1.textContent = formatXPLocal(p.y);
    tipText2.textContent = formatDate(p.x);

    // measure tooltip text sizes
    svg.appendChild(tipText1);
    svg.appendChild(tipText2);

    const t1bb = tipText1.getBBox();
    const t2bb = tipText2.getBBox();

    const tipPadX = 10;
    const tipPadY = 8;
    const tipW = Math.max(t1bb.width, t2bb.width) + tipPadX * 2;
    const tipH = t1bb.height + t2bb.height + tipPadY * 2 + 6;

    let tx = x + 12;
    let ty = y - tipH - 12;

    if (tx + tipW > W - padR) tx = x - tipW - 12;
    if (ty < padT) ty = y + 12;
    tx = clampLocal(tx, padL, W - padR - tipW);
    ty = clampLocal(ty, padT, H - padB - tipH);

    tipRect.setAttribute("x", tx);
    tipRect.setAttribute("y", ty);
    tipRect.setAttribute("width", tipW);
    tipRect.setAttribute("height", tipH);

    tipText1.setAttribute("x", tx + tipPadX);
    tipText1.setAttribute("y", ty + tipPadY + t1bb.height - 2);

    tipText2.setAttribute("x", tx + tipPadX);
    tipText2.setAttribute(
      "y",
      ty + tipPadY + t1bb.height + t2bb.height + 6 - 2
    );
  }

  function hideHover() {
    hoverG.style.display = "none";
  }

  svg.addEventListener("mousemove", updateHover);
  svg.addEventListener("mouseenter", updateHover);
  svg.addEventListener("mouseleave", hideHover);

  // touch support
  svg.addEventListener("touchstart", updateHover, { passive: true });
  svg.addEventListener("touchmove", updateHover, { passive: true });
  svg.addEventListener("touchend", hideHover);

  container.appendChild(svg);
}




export function renderBarChart(mount, items){
  mount.innerHTML = "";

  // IMPORTANT: make the SVG viewBox match the real container size.
  // This removes the left/right empty space and makes the chart fill the card.
  const W = Math.max(520, Math.floor(mount.clientWidth || 520));
  const H = Math.max(260, Math.floor(mount.clientHeight || 260));

  const padL = 10, padR = 10, padT = 18, padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}` });
  svg.appendChild(svgEl("rect", {
    x: 0, y: 0, width: W, height: H, rx: 14,
    fill: "rgba(0,0,0,0.18)"
  }));

  if (!items?.length){
    const t = svgEl("text", {
      x: W/2, y: H/2, "text-anchor": "middle",
      fill: "rgba(255,255,255,0.65)", "font-size": 14
    });
    t.textContent = "No data";
    svg.appendChild(t);
    mount.appendChild(svg);
    return;
  }

  const maxV = Math.max(...items.map(x => x.value), 1);

  // Horizontal grid (4 lines)
  for (let i = 0; i < 4; i++){
    const y = padT + (plotH * i / 3);
    svg.appendChild(svgEl("line", {
      x1: padL, y1: y, x2: W - padR, y2: y,
      stroke: "rgba(255,255,255,0.10)"
    }));
  }

  // --- Tooltip (custom, fast) ---
  const tipG = svgEl("g", { opacity: "0" });
  const tipBg = svgEl("rect", {
    x: 0, y: 0, width: 200, height: 44, rx: 10,
    fill: "rgba(0,0,0,0.75)",
    stroke: "rgba(255,255,255,0.12)"
  });
  const tipName = svgEl("text", {
    x: 0, y: 0,
    fill: "rgba(255,255,255,0.92)",
    "font-size": 12,
    "font-weight": "650"
  });
  const tipVal = svgEl("text", {
    x: 0, y: 0,
    fill: "rgba(255,255,255,0.72)",
    "font-size": 12
  });
  tipG.appendChild(tipBg);
  tipG.appendChild(tipName);
  tipG.appendChild(tipVal);

  function showTip(name, value, cx, topY){
    const safeName = String(name || "project");
    const line1 = safeName.length > 42 ? safeName.slice(0, 42) + "…" : safeName;
    const line2 = `XP: ${formatXP(value)}`;

    tipName.textContent = line1;
    tipVal.textContent = line2;

    // estimate tooltip width from text length (good enough)
    const w = Math.max(150, Math.min(340, line1.length * 7.2 + 34));
    tipBg.setAttribute("width", w);

    const bx = clamp(cx - w/2, 8, W - w - 8);
    const by = clamp(topY - 56, 8, H - 60);

    tipBg.setAttribute("x", bx);
    tipBg.setAttribute("y", by);
    tipName.setAttribute("x", bx + 12);
    tipName.setAttribute("y", by + 18);
    tipVal.setAttribute("x", bx + 12);
    tipVal.setAttribute("y", by + 36);

    tipG.setAttribute("opacity", "1");
  }

  function hideTip(){
    tipG.setAttribute("opacity", "0");
  }
  // --- end tooltip ---

  const n = items.length;
  const gap = n <= 6 ? 14 : 10; // slightly wider spacing when fewer bars

  // Fill the width (no max clamp, so it actually grows left/right)
  let barW = (plotW - gap * (n - 1)) / n;
  barW = clamp(barW, 18, 140);

  const totalBarsW = barW * n + gap * (n - 1);
  const startX = padL + (plotW - totalBarsW) / 2;

  items.forEach((it, i) => {
    const x = startX + i * (barW + gap);
    const h = (it.value / maxV) * plotH;
    const y = padT + (plotH - h);

    const rect = svgEl("rect", {
      x, y,
      width: barW,
      height: h,
      rx: 10,
      fill: "rgba(255,255,255,0.78)"
    });

    rect.style.cursor = "pointer";

    // Hover tooltip
    rect.addEventListener("mouseenter", () => {
      showTip(it.name, it.value, x + barW/2, y);
    });
    rect.addEventListener("mousemove", () => {
      showTip(it.name, it.value, x + barW/2, y);
    });
    rect.addEventListener("mouseleave", hideTip);

    svg.appendChild(rect);

    // XP value label above bar
    const t = svgEl("text", {
      x: x + barW/2,
      y: y - 6,
      "text-anchor": "middle",
      fill: "rgba(180,220,255,0.95)",
      "font-size": 12
    });
    t.textContent = formatXP(it.value);
    svg.appendChild(t);
  });

  

  // Tooltip must be last so it appears on top
  svg.appendChild(tipG);

  mount.appendChild(svg);
}


export function renderDonut(mount, pass, fail){
  mount.innerHTML="";
  // Donut lives in the right (narrow) card – use a smaller viewBox so it doesn't shrink.
  const W=320, H=260;
  const cx=140, cy=128, r=86, stroke=18;

  const svg=svgEl("svg",{viewBox:`0 0 ${W} ${H}`});
  svg.appendChild(svgEl("rect",{x:0,y:0,width:W,height:H,rx:14,fill:"rgba(0,0,0,0.18)"}));

  const total=pass+fail;
  const pct= total===0 ? 0 : pass/total;
  const circ=2*Math.PI*r;
  const passLen=circ*pct;

  svg.appendChild(svgEl("circle",{cx,cy,r,fill:"none",stroke:"rgba(255,255,255,0.12)","stroke-width":stroke}));
  svg.appendChild(svgEl("circle",{
    cx,cy,r,fill:"none",
    stroke:"rgba(255,255,255,0.88)",
    "stroke-width":stroke,
    "stroke-linecap":"round",
    "stroke-dasharray":`${passLen} ${circ}`,
    transform:`rotate(-90 ${cx} ${cy})`
  }));

  const big=svgEl("text",{x:cx,y:cy+6,"text-anchor":"middle",fill:"rgba(255,255,255,0.9)","font-size":18,"font-weight":"800"});
  big.textContent= total===0 ? "No data" : `${Math.round(pct*100)}% PASS`;
  const small=svgEl("text",{x:cx,y:cy+28,"text-anchor":"middle",fill:"rgba(255,255,255,0.65)","font-size":12});
  small.textContent=`Pass ${pass} • Fail ${fail}`;
  svg.appendChild(big); svg.appendChild(small);

  // Legend on the right (inside the donut card)
  const lx=W-78, ly=112;
  svg.appendChild(svgEl("rect",{x:lx,y:ly,width:10,height:10,fill:"rgba(255,255,255,0.88)",rx:2}));
  const lt1=svgEl("text",{x:lx+16,y:ly+10,fill:"rgba(255,255,255,0.75)","font-size":12});
  lt1.textContent="Pass";
  svg.appendChild(lt1);

  svg.appendChild(svgEl("rect",{x:lx,y:ly+22,width:10,height:10,fill:"rgba(255,255,255,0.20)",rx:2}));
  const lt2=svgEl("text",{x:lx+16,y:ly+32,fill:"rgba(255,255,255,0.75)","font-size":12});
  lt2.textContent="Fail";
  svg.appendChild(lt2);

  mount.appendChild(svg);
}
