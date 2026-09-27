import { NodeSquareProgram } from "@sigma/node-square";
import { NodeCircleProgram, type NodeHoverDrawingFunction, type NodeLabelDrawingFunction } from "sigma/rendering";

const LABEL_FONT = "500 12px Satoshi, Arial, sans-serif";

export const drawHaloLabel: NodeLabelDrawingFunction = (context, data, settings) => {
  if (!data.label) return;
  const marker = Boolean((data as { marker?: boolean }).marker);
  const anchor = Boolean((data as { anchor?: boolean }).anchor);
  const size = marker ? 13 : anchor ? 12 : settings.labelSize;
  const limit = marker ? 28 : anchor ? 22 : 28;
  const text = data.label.length > limit ? `${data.label.slice(0, limit - 1)}…` : data.label;
  context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
  context.textAlign = "center";
  context.textBaseline = marker ? "middle" : anchor ? "bottom" : "top";
  context.lineWidth = 3;
  context.strokeStyle = "#ffffff";
  context.lineJoin = "round";
  const x = data.x;
  const y = marker ? data.y : anchor ? data.y - data.size - 2 : data.y + data.size + 2;
  context.strokeText(text, x, y);
  context.fillStyle = marker ? ((data as { color?: string }).color ?? "#141414") : "#141414";
  context.fillText(text, x, y);
};

export const drawLightHover: NodeHoverDrawingFunction = (context, data, settings) => {
  context.beginPath();
  context.arc(data.x, data.y, data.size + 2, 0, Math.PI * 2);
  context.strokeStyle = "#111111";
  context.lineWidth = 1;
  context.stroke();
  const text = (data as { fullLabel?: string }).fullLabel || data.label;
  if (!text) return;
  const size = settings.labelSize;
  context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
  const width = context.measureText(text).width;
  const x = data.x + data.size + 8;
  const y = data.y - size / 2 - 4;
  const boxW = width + 12;
  const boxH = size + 8;
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#111111";
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(x, y, boxW, boxH, 4);
  context.fill();
  context.stroke();
  context.fillStyle = "#111111";
  context.font = LABEL_FONT;
  context.fillText(text, x + 6, data.y + size / 3);
};

type SquareArgs = ConstructorParameters<typeof NodeSquareProgram>;
type ProgramDefinition = ReturnType<NodeSquareProgram["getDefinition"]>;

/**
 * Vertex offsets are normalized onto the unit circle (`v_local`). Each fragment
 * shader turns that into a distance that is 1 on the polygon edge, then paints
 * a ~1px ink stroke so corners survive the fitted zoom.
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

function polygonFragment(shapeDist: string, strokePx: string): string {
  return `precision highp float;

varying vec4 v_color;
varying vec2 v_local;
varying float v_size;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

${shapeDist}

void main(void) {
  float d = shapeDist(v_local);
  #ifdef PICKING_MODE
  gl_FragColor = d > 1.0 ? transparent : v_color;
  #else
  float w = ${strokePx} / max(v_size, 0.5);
  float cover = 1.0 - smoothstep(1.0 - w, 1.0 + w, d);
  float inner = 1.0 - 1.35 * w;
  float stroke = smoothstep(inner - w, inner, d);
  vec4 color = mix(v_color, vec4(0.08, 0.08, 0.08, v_color.a), clamp(stroke, 0.0, 1.0));
  color.a *= cover;
  gl_FragColor = color;
  #endif
}
`;
}

const SQUARE_FRAG = polygonFragment(
  /* glsl */ `
float shapeDist(vec2 p) {
  return max(abs(p.x), abs(p.y)) * 1.41421356;
}
`,
  "1.2",
);

const DIAMOND_FRAG = polygonFragment(
  /* glsl */ `
float shapeDist(vec2 p) {
  return abs(p.x) + abs(p.y);
}
`,
  "1.2",
);

const HEX_FRAG = polygonFragment(
  /* glsl */ `
float shapeDist(vec2 p) {
  p = abs(p);
  return max(p.y, 0.8660254 * p.x + 0.5 * p.y);
}
`,
  "1.7",
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
  "1.7",
);

const CIRCLE_FRAG = /* glsl */ `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;

uniform float u_correctionRatio;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float px = u_correctionRatio * 2.0;
  float dist = length(v_diffVector);
  #ifdef PICKING_MODE
  gl_FragColor = dist > v_radius ? transparent : v_color;
  #else
  float cover = 1.0 - smoothstep(v_radius - px * 0.35, v_radius + px, dist);
  float inner = v_radius - px * 1.25;
  float stroke = smoothstep(inner - px, inner, dist);
  vec4 color = mix(v_color, vec4(0.08, 0.08, 0.08, v_color.a), clamp(stroke, 0.0, 1.0));
  color.a *= cover;
  gl_FragColor = color;
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
    return { ...base, FRAGMENT_SHADER_SOURCE: CIRCLE_FRAG };
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
