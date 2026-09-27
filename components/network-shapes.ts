import { NodeSquareProgram } from "@sigma/node-square";
import { type NodeHoverDrawingFunction, type NodeLabelDrawingFunction } from "sigma/rendering";

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

class LightSquareProgram extends NodeSquareProgram {
  constructor(...args: SquareArgs) {
    super(...args);
    this.drawHover = drawLightHover as typeof this.drawHover;
    this.drawLabel = drawHaloLabel as typeof this.drawLabel;
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

export class NodeSquareLightProgram extends LightSquareProgram {}

export class NodeDiamondProgram extends LightSquareProgram {
  getDefinition() {
    const base = super.getDefinition();
    return { ...base, CONSTANT_DATA: DIAMOND };
  }
}

const TRIANGLE = [[-Math.PI / 2], [Math.PI / 6], [(5 * Math.PI) / 6]];

export class NodeTriangleProgram extends LightSquareProgram {
  getDefinition() {
    const base = super.getDefinition();
    return { ...base, VERTICES: TRIANGLE.length, CONSTANT_DATA: TRIANGLE };
  }
}

export class NodeHexProgram extends LightSquareProgram {
  getDefinition() {
    const base = super.getDefinition();
    return { ...base, VERTICES: HEX.length, CONSTANT_DATA: HEX };
  }
}
