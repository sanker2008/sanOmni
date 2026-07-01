declare module 'gifenc' {
  export function GIFEncoder(): any;
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: any): any;
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: any, options?: any): Uint8Array;
}
