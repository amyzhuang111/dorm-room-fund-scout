import { NodeSquareProgram } from "@sigma/node-square";
import { NodeCircleProgram, type NodeHoverDrawingFunction, type NodeLabelDrawingFunction } from "sigma/rendering";
import { LABEL_CAMPUS, LABEL_REGION, REGION_TRACKING } from "./network-style";

const LABEL_FONT = "500 12px Satoshi, Arial, sans-serif";

export const drawHaloLabel: NodeLabelDrawingFunction = (context, data, settings) => {
  if (!data.label) return;
  const marker = Boolean((data as { marker?: boolean }).marker);
  const anchor = Boolean((data as { anchor?: boolean }).anchor);
  const preferred = (data as { labelPx?: number }).labelPx;
  const size = preferred ?? (marker ? LABEL_REGION : anchor ? LABEL_CAMPUS : settings.labelSize);
  const limit = marker ? 32 : anchor ? 26 : 28;
  const raw = data.label.length > limit ? `${data.label.slice(0, limit - 1)}…` : data.label;
  const text = marker ? raw.toUpperCase() : raw;
  context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
  context.textAlign = "center";
  context.textBaseline = marker ? "middle" : anchor ? "bottom" : "top";
  context.lineJoin = "round";
  const dx = (data as { labelDx?: number }).labelDx ?? 0;
  const dy = (data as { labelDy?: number }).labelDy ?? 0;
  const x = data.x + dx;
  const y = (marker ? data.y : anchor ? data.y - data.size - 3 : data.y + data.size + 3) + dy;
  if (marker) {
    drawTracked(context, text, x, y, REGION_TRACKING, (data as { tint?: string }).tint || "#8d939c");
    return;
  }
  const ink = (data as { labelColor?: string }).labelColor;
  // A thin white stroke keeps colored club labels readable over dots without covering the letters.
  context.lineWidth = ink ? 3 : 3.5;
  context.strokeStyle = "#ffffff";
  context.strokeText(text, x, y);
  context.fillStyle = ink || "#111111";
  context.fillText(text, x, y);
};

function drawTracked(context: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number, fill: string) {
  const widths: number[] = [];
  let total = 0;
  for (const char of text) {
    const width = context.measureText(char).width;
    widths.push(width);
    total += width;
  }
  total += tracking * Math.max(0, text.length - 1);
  let cursor = x - total / 2;
  context.textAlign = "left";
  context.lineWidth = 2.5;
  context.strokeStyle = "rgba(255, 255, 255, 0.94)";
  for (let i = 0; i < text.length; i++) {
    context.strokeText(text[i], cursor, y);
    cursor += widths[i] + tracking;
  }
  cursor = x - total / 2;
  context.fillStyle = fill;
  context.globalAlpha = 0.88;
  for (let i = 0; i < text.length; i++) {
    context.fillText(text[i], cursor, y);
    cursor += widths[i] + tracking;
  }
  context.globalAlpha = 1;
  context.textAlign = "center";
}

export const drawLightHover: NodeHoverDrawingFunction = (context, data, settings) => {
  context.beginPath();
  context.arc(data.x, data.y, data.size + 2, 0, Math.PI * 2);
  context.strokeStyle = "#111111";
  context.lineWidth = 1;
  context.stroke();
  const text = (data as { fullLabel?: string }).fullLabel || data.label;
  if (!text) return;
  const tip = (data as { signalTip?: string }).signalTip;
  const size = settings.labelSize;
  context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
  const titleWidth = context.measureText(text).width;
  context.font = "11px Satoshi, Arial, sans-serif";
  const tipWidth = tip ? context.measureText(tip).width : 0;
  const width = Math.max(titleWidth, tipWidth);
  const x = data.x + data.size + 8;
  const y = data.y - size / 2 - 4;
  const boxW = width + 12;
  const boxH = tip ? size + 22 : size + 8;
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#111111";
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(x, y, boxW, boxH, 4);
  context.fill();
  context.stroke();
  context.fillStyle = (data as { labelColor?: string }).labelColor || "#111111";
  context.font = LABEL_FONT;
  context.fillText(text, x + 6, data.y + size / 3);
  if (tip) {
    context.font = "11px Satoshi, Arial, sans-serif";
    context.fillStyle = "#404040";
    context.fillText(tip, x + 6, data.y + size / 3 + 14);
  }
};

type SquareArgs = ConstructorParameters<typeof NodeSquareProgram>;
type ProgramDefinition = ReturnType<NodeSquareProgram["getDefinition"]>;

/**
 * Vertex offsets are normalized onto the unit circle (`v_local`). Each fragment
 * shader turns that into a distance that is 1 on the polygon edge, then paints
 * a soft edge. Large nodes can pick up a 0.5px white hairline; small ones stay unstroked.
 */
const POLY_VERT = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_cameraAngle;
uniform float u_correctionRatio;

varying vec4 v_color;
varying vec2 v_local;
varying float v_size;

const float bias = 255.0 / 254.0;
const float sqrt_8 = sqrt(8.0);

void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * sqrt_8;
  float angle = a_angle + u_cameraAngle;
  vec2 diffVector = size * vec2(cos(angle), sin(angle));
  vec2 position = a_position + diffVector;
  gl_Position = vec4((u_matrix * vec3(position, 1)).xy, 0, 1);
  v_local = diffVector / max(size, 0.0001);
  v_size = a_size;

  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`;

function polygonFragment(shapeDist: string): string {
  return `precision highp float;

varying vec4 v_color;
varying vec2 v_local;
varying float v_size;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

${shapeDist}

void main(void) {
  float d = shapeDist(v_local);
  #ifdef PICKING_MODE
  float pick = v_size < 3.2 ? 1.7 : 1.04;
  gl_FragColor = d > pick ? transparent : v_color;
  #else
  float w = 0.7 / max(v_size, 0.5);
  float cover = 1.0 - smoothstep(1.0 - w, 1.0 + w, d);
  float gate = smoothstep(5.2, 6.8, v_size);
  float hair = 0.5 / max(v_size, 0.5);
  float stroke = smoothstep(1.0 - 2.2 * hair, 1.0 - 0.35 * hair, d) * gate;
  vec4 color = mix(v_color, vec4(1.0, 1.0, 1.0, v_color.a), clamp(stroke, 0.0, 1.0));
  color.a *= cover;
  gl_FragColor = color;
  #endif
}
`;
}

const SQUARE_FRAG = polygonFragment(
  /* glsl */ `
float shapeDist(vec2 p) {
  float halfExtent = 0.70710678;
  float radius = 0.13;
  vec2 q = abs(p) - vec2(halfExtent - radius);
  float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
  return (dist + halfExtent) / halfExtent;
}
`,
);

const DIAMOND_FRAG = polygonFragment(
  /* glsl */ `
float shapeDist(vec2 p) {
  return abs(p.x) + abs(p.y);
}
`,
);

const HEX_FRAG = polygonFragment(
  /* glsl */ `
float shapeDist(vec2 p) {
  p = abs(p);
  return max(p.y, 0.8660254 * p.x + 0.5 * p.y);
}
`,
);

const TRIANGLE_FRAG = polygonFragment(
  /* glsl */ `
float shapeDist(vec2 p) {
  p.y = -p.y;
  p.x = abs(p.x);
  float sdSlant = (1.5 * p.x + 0.8660254 * p.y - 0.8660254) / 1.7320508;
  float sdBottom = -p.y - 0.5;
  return max(sdSlant, sdBottom) * 2.0 + 1.0;
}
`,
);

const CIRCLE_VERT = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
varying float v_size;

const float bias = 255.0 / 254.0;

void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;
  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));
  vec2 position = a_position + diffVector;
  gl_Position = vec4((u_matrix * vec3(position, 1)).xy, 0, 1);
  v_diffVector = diffVector;
  v_radius = size / 2.0;
  v_size = a_size;

  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`;

const CIRCLE_FRAG = /* glsl */ `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
varying float v_size;

uniform float u_correctionRatio;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float border = u_correctionRatio * 2.0;
  float dist = length(v_diffVector) - v_radius + border;
  #ifdef PICKING_MODE
  float slop = v_size < 3.2 ? border * 2.4 : 0.0;
  gl_FragColor = dist > border + slop ? transparent : v_color;
  #else
  float t = dist > border ? 1.0 : (dist > 0.0 ? dist / border : 0.0);
  float gate = smoothstep(5.2, 6.8, v_size);
  float hair = smoothstep(border * 0.15, border * 0.85, dist);
  vec4 color = mix(v_color, vec4(1.0, 1.0, 1.0, v_color.a), clamp(hair, 0.0, 1.0) * gate * (1.0 - t));
  gl_FragColor = mix(color, transparent, t);
  #endif
}
`;

function crispPolygon(base: ProgramDefinition, fragment: string, constant?: number[][]): ProgramDefinition {
  return {
    ...base,
    ...(constant ? { VERTICES: constant.length, CONSTANT_DATA: constant } : {}),
    VERTEX_SHADER_SOURCE: POLY_VERT,
    FRAGMENT_SHADER_SOURCE: fragment,
  };
}

class LightSquareProgram extends NodeSquareProgram {
  constructor(...args: SquareArgs) {
    super(...args);
    this.drawHover = drawLightHover as typeof this.drawHover;
    this.drawLabel = drawHaloLabel as typeof this.drawLabel;
  }
}

export class NodeCircleCrispProgram extends NodeCircleProgram {
  getDefinition() {
    const base = super.getDefinition();
    return { ...base, VERTEX_SHADER_SOURCE: CIRCLE_VERT, FRAGMENT_SHADER_SOURCE: CIRCLE_FRAG };
  }
}

const DIAMOND = [
  [0],
  [Math.PI / 2],
  [Math.PI],
  [0],
  [Math.PI],
  [-Math.PI / 2],
];

const HEX = hexAngles();

function hexAngles(): number[][] {
  const corners = Array.from({ length: 6 }, (_, index) => -Math.PI / 2 + (index * Math.PI) / 3);
  const fans = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5];
  return fans.map((index) => [corners[index]]);
}

export class NodeSquareLightProgram extends LightSquareProgram {
  getDefinition() {
    return crispPolygon(NodeSquareProgram.prototype.getDefinition.call(this), SQUARE_FRAG);
  }
}

export class NodeDiamondProgram extends LightSquareProgram {
  getDefinition() {
    const base = NodeSquareProgram.prototype.getDefinition.call(this);
    return crispPolygon(base, DIAMOND_FRAG, DIAMOND);
  }
}

const TRIANGLE = [[-Math.PI / 2], [Math.PI / 6], [(5 * Math.PI) / 6]];

export class NodeTriangleProgram extends LightSquareProgram {
  getDefinition() {
    const base = NodeSquareProgram.prototype.getDefinition.call(this);
    return crispPolygon(base, TRIANGLE_FRAG, TRIANGLE);
  }
}

export class NodeHexProgram extends LightSquareProgram {
  getDefinition() {
    const base = NodeSquareProgram.prototype.getDefinition.call(this);
    return crispPolygon(base, HEX_FRAG, HEX);
  }
}
