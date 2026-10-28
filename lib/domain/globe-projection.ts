// Screen position of a campus on a cobe globe. The mapping follows cobe's
// marker vector and the sphere ray in its fragment shader.

export interface GlobePoint {
  x: number;
  y: number;
  front: boolean;
}

function markerVector(lat: number, lon: number): [number, number, number] {
  const latitude = (lat * Math.PI) / 180;
  const longitude = (lon * Math.PI) / 180 - Math.PI;
  const cosLat = Math.cos(latitude);
  return [-cosLat * Math.cos(longitude), Math.sin(latitude), cosLat * Math.sin(longitude)];
}

function rotationColumns(theta: number, phi: number): [number, number, number][] {
  const cosTheta = Math.cos(theta);
  const cosPhi = Math.cos(phi);
  const sinTheta = Math.sin(theta);
  const sinPhi = Math.sin(phi);
  return [
    [cosPhi, sinPhi * sinTheta, -sinPhi * cosTheta],
    [0, cosTheta, sinTheta],
    [sinPhi, -cosPhi * sinTheta, cosPhi * cosTheta],
  ];
}

function rotate(columns: [number, number, number][], vector: [number, number, number]): [number, number, number] {
  return [
    columns[0][0] * vector[0] + columns[1][0] * vector[1] + columns[2][0] * vector[2],
    columns[0][1] * vector[0] + columns[1][1] * vector[1] + columns[2][1] * vector[2],
    columns[0][2] * vector[0] + columns[1][2] * vector[1] + columns[2][2] * vector[2],
  ];
}

/** Same sample count the globe passes to cobe. Markers are drawn on the snapped point. */
export const GLOBE_MAP_SAMPLES = 16000;

/** Opening angle. North America faces the camera; phi 0 would center longitude -90. */
export const GLOBE_PHI = 0.12;
export const GLOBE_THETA = 0.2;

const SQRT5 = 2.23606797749979;
const GOLDEN = 1.618033988749895;
const INV_GOLDEN = 0.618033988749895;
const SNAP_BIAS = 0.7202100452062783;
const TWO_PI = 6.283185307179586;
const SNAP_SHIFT = 3.8832220774509327;

/** cobe's `tt()`: nearest Fibonacci-sphere sample. Returns the vector the marker is drawn at. */
function snapMarker(vector: [number, number, number], samples: number): [number, number, number] {
  const swapped: [number, number, number] = [vector[0], vector[2], vector[1]];
  const inverse = 1 / samples;
  const level = Math.max(2, Math.floor(Math.log2(SQRT5 * samples * Math.PI * (1 - swapped[2] * swapped[2]) * SNAP_BIAS)));
  const scale = GOLDEN ** level / SQRT5;
  const gridA = Math.floor(scale + 0.5);
  const gridB = Math.floor(scale * GOLDEN + 0.5);
  const offsetA = ((gridA + 1) * INV_GOLDEN) % 1 * TWO_PI - SNAP_SHIFT;
  const offsetB = ((gridB + 1) * INV_GOLDEN) % 1 * TWO_PI - SNAP_SHIFT;
  const stepA = -2 * gridA;
  const stepB = -2 * gridB;
  const polarA = Math.atan2(swapped[1], swapped[0]);
  const polarB = swapped[2] - 1;
  const determinant = offsetA * stepB - stepA * offsetB;
  const cellA = Math.floor((stepB * polarA - offsetB * (polarB * samples + 1)) / determinant);
  const cellB = Math.floor((-stepA * polarA + offsetA * (polarB * samples + 1)) / determinant);
  let best = Math.PI;
  let found: [number, number, number] | null = null;
  for (let corner = 0; corner < 4; corner += 1) {
    const index = gridA * (cellA + (corner % 2)) + gridB * (cellB + Math.floor(corner * 0.5));
    if (index > samples) continue;
    const angle = (index * INV_GOLDEN) % 1 * TWO_PI;
    const height = 1 - 2 * index * inverse;
    const radial = Math.sqrt(Math.max(0, 1 - height * height));
    const point: [number, number, number] = [Math.cos(angle) * radial, Math.sin(angle) * radial, height];
    const distance = Math.hypot(swapped[0] - point[0], swapped[1] - point[1], swapped[2] - point[2]);
    if (distance < best) {
      best = distance;
      found = point;
    }
  }
  if (!found) return vector;
  return [found[0], found[2], found[1]];
}

/** CSS pixels, origin at the top left of the square canvas. */
export function projectCampus(lat: number, lon: number, phi: number, theta: number, size: number): GlobePoint {
  const view = rotate(rotationColumns(theta, phi), snapMarker(markerVector(lat, lon), GLOBE_MAP_SAMPLES));
  const ndcX = view[0] * 0.8;
  const ndcY = view[1] * 0.8;
  return {
    x: ((ndcX + 1) / 2) * size,
    y: size - ((ndcY + 1) / 2) * size,
    front: view[2] > 0.12,
  };
}

export function markerSize(signals: number, maxSignals: number): number {
  const span = Math.max(1, maxSignals);
  return 0.02 + 0.08 * Math.sqrt(Math.max(0, signals) / span);
}
