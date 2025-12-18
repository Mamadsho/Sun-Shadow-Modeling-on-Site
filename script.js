const canvas = document.getElementById("siteCanvas");
const gl = canvas.getContext("webgl", { antialias: true });

if (!gl) {
  throw new Error("WebGL not supported in this browser.");
}

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

const statEls = {
  shadowLength: document.getElementById("shadowLength"),
  footprintArea: document.getElementById("footprintArea"),
  sunVector: document.getElementById("sunVector"),
};

const vertexSource = `
  attribute vec2 aPosition;
  varying vec2 vUV;

  void main() {
    vUV = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const fragmentSource = `
  precision mediump float;

  varying vec2 vUV;

  uniform float uHalfWidth;
  uniform float uHalfDepth;
  uniform float uHeight;
  uniform float uRotation;
  uniform float uSunAltitude;
  uniform float uSunAzimuth;
  uniform float uGridSpacing;
  uniform float uGroundSize;
  uniform float uOffsetX;
  uniform float uOffsetY;
  uniform float uAspect;
  uniform float uShadowLength;

  const float PI = 3.14159265359;

  vec2 rotate(vec2 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  float boxSDF(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  bool rayHitsBox(vec2 worldPos, vec2 offset, float rot, vec2 halfSize, vec2 dir, float maxLen) {
    vec2 p = rotate(worldPos - offset, -rot);
    vec2 d = rotate(dir, -rot);

    float tMin = 0.0;
    float tMax = maxLen;
    const float EPS = 1e-5;

    if (abs(d.x) < EPS) {
      if (p.x < -halfSize.x || p.x > halfSize.x) return false;
    } else {
      float t1 = (-halfSize.x - p.x) / d.x;
      float t2 = (halfSize.x - p.x) / d.x;
      if (t1 > t2) { float temp = t1; t1 = t2; t2 = temp; }
      tMin = max(tMin, t1);
      tMax = min(tMax, t2);
    }

    if (abs(d.y) < EPS) {
      if (p.y < -halfSize.y || p.y > halfSize.y) return false;
    } else {
      float t1 = (-halfSize.y - p.y) / d.y;
      float t2 = (halfSize.y - p.y) / d.y;
      if (t1 > t2) { float temp = t1; t1 = t2; t2 = temp; }
      tMin = max(tMin, t1);
      tMax = min(tMax, t2);
    }

    return tMax >= tMin && tMax >= 0.0 && tMin <= maxLen;
  }

  float gridLines(vec2 world, float spacing) {
    float wrapX = abs(mod(world.x + 0.5 * spacing, spacing) - 0.5 * spacing);
    float wrapY = abs(mod(world.y + 0.5 * spacing, spacing) - 0.5 * spacing);
    float lineDist = min(wrapX, wrapY);
    return 1.0 - smoothstep(0.08, 0.25, lineDist);
  }

  void main() {
    vec2 ndc = vUV * 2.0 - 1.0;
    float scale = uGroundSize * 0.5;
    vec2 world = (uAspect > 1.0)
      ? vec2(ndc.x * scale * uAspect, ndc.y * scale)
      : vec2(ndc.x * scale, ndc.y * scale / uAspect);

    vec2 offset = vec2(uOffsetX, uOffsetY);
    float rot = radians(uRotation);
    float alt = radians(uSunAltitude);
    float az = radians(uSunAzimuth);
    vec2 sunDir = normalize(vec2(-sin(az), -cos(az)));
    vec2 halfSize = vec2(uHalfWidth, uHalfDepth);

    vec2 local = rotate(world - offset, -rot);
    float insideFootprint = step(abs(local.x), uHalfWidth) * step(abs(local.y), uHalfDepth);

    float shadowMask = rayHitsBox(world, offset, rot, halfSize, sunDir, uShadowLength) ? 1.0 : 0.0;

    float grid = gridLines(world, uGridSpacing);

    float distToGround = max(abs(world.x), abs(world.y)) - (uGroundSize * 0.5);
    float groundMask = 1.0 - smoothstep(-0.5, 0.5, distToGround);

    vec3 base = mix(vec3(0.06, 0.08, 0.13), vec3(0.11, 0.14, 0.22), groundMask);
    base += grid * 0.12 * groundMask;

    vec3 shadowColor = vec3(0.24, 0.44, 0.86);
    vec3 buildingColor = vec3(0.44, 0.87, 0.66);

    vec3 color = base;
    color = mix(color, shadowColor, shadowMask * 0.45);
    color = mix(color, buildingColor, insideFootprint * 0.9);

    float edge = smoothstep(0.0, 0.6, abs(boxSDF(local, halfSize)));
    color = mix(color, buildingColor * 0.7 + vec3(0.05, 0.09, 0.12), edge * insideFootprint * 0.2);

    float vignette = smoothstep(1.6, 0.2, length(ndc));
    color *= vignette + 0.35;

    gl_FragColor = vec4(color, 1.0);
  }
`;

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed.");
  }
  return shader;
}

function createProgram() {
  const program = gl.createProgram();
  const vs = createShader(gl.VERTEX_SHADER, vertexSource);
  const fs = createShader(gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Program link failed.");
  }
  return program;
}

const program = createProgram();
gl.useProgram(program);

const quadBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    -1, 1,
    1, -1,
    1, 1,
  ]),
  gl.STATIC_DRAW
);

const positionLocation = gl.getAttribLocation(program, "aPosition");
gl.enableVertexAttribArray(positionLocation);
gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

const uniforms = {
  uHalfWidth: gl.getUniformLocation(program, "uHalfWidth"),
  uHalfDepth: gl.getUniformLocation(program, "uHalfDepth"),
  uHeight: gl.getUniformLocation(program, "uHeight"),
  uRotation: gl.getUniformLocation(program, "uRotation"),
  uSunAltitude: gl.getUniformLocation(program, "uSunAltitude"),
  uSunAzimuth: gl.getUniformLocation(program, "uSunAzimuth"),
  uGridSpacing: gl.getUniformLocation(program, "uGridSpacing"),
  uGroundSize: gl.getUniformLocation(program, "uGroundSize"),
  uOffsetX: gl.getUniformLocation(program, "uOffsetX"),
  uOffsetY: gl.getUniformLocation(program, "uOffsetY"),
  uAspect: gl.getUniformLocation(program, "uAspect"),
  uShadowLength: gl.getUniformLocation(program, "uShadowLength"),
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyStep(value, min, step) {
  const snapped = Math.round((value - min) / step) * step + min;
  return Number(snapped.toFixed(4));
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function computeShadowLength() {
  const altitudeRad = toRadians(clamp(state.sunAltitude, 1, 89.9));
  const rawLength = state.height / Math.tan(altitudeRad);
  const maxLength = state.groundSize * 1.6;
  return Math.min(rawLength, maxLength);
}

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(680, rect.width);
  const height = Math.round(width * 0.7);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function updateUniforms() {
  const aspect = canvas.width / canvas.height;
  const shadowLength = computeShadowLength();

  gl.uniform1f(uniforms.uHalfWidth, state.width / 2);
  gl.uniform1f(uniforms.uHalfDepth, state.depth / 2);
  gl.uniform1f(uniforms.uHeight, state.height);
  gl.uniform1f(uniforms.uRotation, state.rotation);
  gl.uniform1f(uniforms.uSunAltitude, state.sunAltitude);
  gl.uniform1f(uniforms.uSunAzimuth, state.sunAzimuth);
  gl.uniform1f(uniforms.uGridSpacing, state.gridSpacing);
  gl.uniform1f(uniforms.uGroundSize, state.groundSize);
  gl.uniform1f(uniforms.uOffsetX, state.offsetX);
  gl.uniform1f(uniforms.uOffsetY, state.offsetY);
  gl.uniform1f(uniforms.uAspect, aspect);
  gl.uniform1f(uniforms.uShadowLength, shadowLength);

  return shadowLength;
}

function render() {
  resizeCanvas();
  const shadowLength = updateUniforms();

  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

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
