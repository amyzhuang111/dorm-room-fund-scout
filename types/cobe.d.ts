declare module "cobe" {
  type Globe = { destroy: () => void };
  // Loose options — campus-globe passes several cobe fields beyond the typed subset.
  export default function createGlobe(
    canvas: HTMLCanvasElement,
    opts: Record<string, unknown>,
  ): Globe;
}
