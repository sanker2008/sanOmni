declare module 'gifuct-js' {
  export interface GIF {
    lsd: {
      width: number;
      height: number;
    };
  }

  export interface GIFFrame {
    patch: Uint8Array;
    dims: {
      width: number;
      height: number;
      top: number;
      left: number;
    };
    delay: number;
    disposalType: number;
  }

  export function parseGIF(buffer: ArrayBuffer): GIF;
  export function decompressFrames(gif: GIF, buildImagePatches: boolean): GIFFrame[];
}
