const canvas = document.getElementById("siteCanvas");
const ctx = canvas.getContext("2d");

const defaults = {
  width: 24,
  depth: 14,
  height: 22,
  rotation: 18,
  sunAltitude: 45,
  sunAzimuth: 135,
  gridSpacing: 5,
  groundSize: 140,
  offsetX: 0,
  offsetY: 0,
};

const state = { ...defaults };
let currentScale = 1;

const statEls = {
  shadowLength: document.getElementById("shadowLength"),
  footprintArea: document.getElementById("footprintArea"),
  sunVector: document.getElementById("sunVector"),
};

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyStep(value, min, step) {
  const snapped = Math.round((value - min) / step) * step + min;
  return Number(snapped.toFixed(4));
}

function worldToCanvas(point) {
  return {
    x: canvas.width / 2 + point.x * currentScale,
    y: canvas.height / 2 - point.y * currentScale,
  };
}

function drawPolygon(points, options = {}) {
  if (!points.length) return;
  ctx.beginPath();
  points.forEach((pt, idx) => {
    const canvasPt = worldToCanvas(pt);
    if (idx === 0) ctx.moveTo(canvasPt.x, canvasPt.y);
    else ctx.lineTo(canvasPt.x, canvasPt.y);
  });
  ctx.closePath();

  if (options.fill) {
    ctx.fillStyle = options.fill;
    ctx.fill();
  }
  if (options.stroke) {
    ctx.lineWidth = options.lineWidth || 1;
    ctx.setLineDash(options.dash || []);
    ctx.strokeStyle = options.stroke;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawGrid(halfSize) {
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  for (let g = -halfSize; g <= halfSize; g += state.gridSpacing) {
    const top = worldToCanvas({ x: g, y: halfSize });
    const bottom = worldToCanvas({ x: g, y: -halfSize });
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bottom.x, bottom.y);

    const left = worldToCanvas({ x: -halfSize, y: g });
    const right = worldToCanvas({ x: halfSize, y: g });
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
  }
  ctx.stroke();
}

function drawAxes(halfSize) {
  const axisLength = Math.min(halfSize, 12);
  const northStart = worldToCanvas({ x: 0, y: 0 });
  const northEnd = worldToCanvas({ x: 0, y: axisLength });
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(northStart.x, northStart.y);
  ctx.lineTo(northEnd.x, northEnd.y);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "12px Inter, sans-serif";
  ctx.fillText("N", northEnd.x + 6, northEnd.y + 4);
}

function drawSunArrow(center, shadowVector) {
  const sunDir = { x: -shadowVector.x, y: -shadowVector.y };
  const length = Math.min(20, Math.hypot(sunDir.x, sunDir.y));
  const scale = length === 0 ? 0 : 18 / length;
  const end = {
    x: center.x + sunDir.x * scale,
    y: center.y + sunDir.y * scale,
  };
  const start = { x: center.x, y: center.y };
  const startPt = worldToCanvas(start);
  const endPt = worldToCanvas(end);

  ctx.strokeStyle = "rgba(255, 200, 134, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startPt.x, startPt.y);
  ctx.lineTo(endPt.x, endPt.y);
  ctx.stroke();

  const angle = Math.atan2(startPt.y - endPt.y, startPt.x - endPt.x);
  const headLength = 8;
  ctx.beginPath();
  ctx.moveTo(endPt.x, endPt.y);
  ctx.lineTo(
    endPt.x + headLength * Math.cos(angle + Math.PI / 7),
    endPt.y + headLength * Math.sin(angle + Math.PI / 7)
  );
  ctx.lineTo(
    endPt.x + headLength * Math.cos(angle - Math.PI / 7),
    endPt.y + headLength * Math.sin(angle - Math.PI / 7)
  );
  ctx.lineTo(endPt.x, endPt.y);
  ctx.fillStyle = "rgba(255, 200, 134, 0.9)";
  ctx.fill();
}

function getFootprint() {
  const halfWidth = state.width / 2;
  const halfDepth = state.depth / 2;
  const rad = toRadians(state.rotation);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const baseRect = [
    { x: -halfWidth, y: -halfDepth },
    { x: halfWidth, y: -halfDepth },
    { x: halfWidth, y: halfDepth },
    { x: -halfWidth, y: halfDepth },
  ];

  return baseRect.map((pt) => ({
    x: state.offsetX + pt.x * cos - pt.y * sin,
    y: state.offsetY + pt.x * sin + pt.y * cos,
  }));
}

function computeShadow(footprint) {
  const altitudeRad = toRadians(clamp(state.sunAltitude, 1, 89.9));
  const azimuthRad = toRadians(state.sunAzimuth);
  let shadowLength = state.height / Math.tan(altitudeRad);
  const maxLength = state.groundSize * 1.5;
  shadowLength = Math.min(shadowLength, maxLength);
  const direction = { x: -Math.sin(azimuthRad), y: -Math.cos(azimuthRad) };
  const shadowVector = {
    x: direction.x * shadowLength,
    y: direction.y * shadowLength,
  };
  const offsetCorners = footprint.map((pt) => ({
    x: pt.x + shadowVector.x,
    y: pt.y + shadowVector.y,
  }));

  const shadowPolygon = convexHull([...footprint, ...offsetCorners]);
  return { shadowPolygon, shadowLength, shadowVector };
}

function convexHull(points) {
  if (points.length <= 3) return points;
  const sorted = points
    .slice()
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const buildHalf = (pts) => {
    const half = [];
    pts.forEach((pt) => {
      while (
        half.length >= 2 &&
        cross(
          subtract(half[half.length - 1], half[half.length - 2]),
          subtract(pt, half[half.length - 1])
        ) <= 0
      ) {
        half.pop();
      }
      half.push(pt);
    });
    return half;
  };

  const lower = buildHalf(sorted);
  const upper = buildHalf(sorted.slice().reverse());
  upper.pop();
  lower.pop();
  return [...lower, ...upper];
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(680, rect.width);
  canvas.width = width;
  canvas.height = Math.round(width * 0.7);
}

function render() {
  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const halfSize = state.groundSize / 2;
  currentScale = Math.min(canvas.width, canvas.height) / (state.groundSize * 1.1);

  const footprint = getFootprint();
  const { shadowPolygon, shadowLength, shadowVector } = computeShadow(footprint);

  drawPolygon(
    [
      { x: -halfSize, y: -halfSize },
      { x: halfSize, y: -halfSize },
      { x: halfSize, y: halfSize },
      { x: -halfSize, y: halfSize },
    ],
    {
      fill: "rgba(255,255,255,0.02)",
      stroke: "rgba(255,255,255,0.06)",
      lineWidth: 1.2,
    }
  );

  drawGrid(halfSize);
  drawAxes(halfSize);

  const buildingCenter = { x: state.offsetX, y: state.offsetY };
  const gradient = ctx.createLinearGradient(
    worldToCanvas(buildingCenter).x,
    worldToCanvas(buildingCenter).y,
    worldToCanvas({
      x: buildingCenter.x + shadowVector.x,
      y: buildingCenter.y + shadowVector.y,
    }).x,
    worldToCanvas({
      x: buildingCenter.x + shadowVector.x,
      y: buildingCenter.y + shadowVector.y,
    }).y
  );
  gradient.addColorStop(0, "rgba(79, 139, 255, 0.35)");
  gradient.addColorStop(1, "rgba(79, 139, 255, 0.05)");

  drawPolygon(shadowPolygon, {
    fill: gradient,
    stroke: "rgba(79, 139, 255, 0.35)",
    lineWidth: 1.5,
  });

  drawPolygon(footprint, {
    fill: "rgba(167, 243, 208, 0.22)",
    stroke: "rgba(167, 243, 208, 0.9)",
    lineWidth: 2,
  });

  drawSunArrow(buildingCenter, shadowVector);
  updateStats(shadowLength);
}

function updateStats(shadowLength) {
  statEls.shadowLength.textContent = `${shadowLength.toFixed(1)} m`;
  statEls.footprintArea.textContent = `${(state.width * state.depth).toFixed(1)} m²`;
  statEls.sunVector.textContent = `Az ${state.sunAzimuth.toFixed(0)}° • Alt ${state.sunAltitude.toFixed(0)}°`;
}

function wireControl(key) {
  const range = document.getElementById(`${key}Range`);
  const number = document.getElementById(`${key}Number`);
  const min = parseFloat(range.min);
  const max = parseFloat(range.max);
  const step = parseFloat(range.step) || 1;

  const syncValue = (raw) => {
    const clamped = clamp(Number(raw), min, max);
    const snapped = applyStep(clamped, min, step);
    state[key] = snapped;
    range.value = snapped;
    number.value = snapped;
    render();
  };

  range.addEventListener("input", (event) => syncValue(event.target.value));
  number.addEventListener("input", (event) => syncValue(event.target.value));
  syncValue(range.value);
}

function resetView() {
  Object.entries(defaults).forEach(([key, value]) => {
    state[key] = value;
    const range = document.getElementById(`${key}Range`);
    const number = document.getElementById(`${key}Number`);
    if (range) range.value = value;
    if (number) number.value = value;
  });
  render();
}

function init() {
  [
    "width",
    "depth",
    "height",
    "rotation",
    "sunAltitude",
    "sunAzimuth",
    "gridSpacing",
    "groundSize",
    "offsetX",
    "offsetY",
  ].forEach(wireControl);

  document.getElementById("resetButton").addEventListener("click", resetView);
  window.addEventListener("resize", render);
  render();
}

init();
