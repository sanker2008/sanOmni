import { parseGIF, decompressFrames } from 'gifuct-js';

export interface FrameData {
  index: number;
  imageData: ImageData;
  dataUrl: string;
  delay: number;
  width: number;
  height: number;
  disposalMethod: number;
}

export interface DecodedAnimation {
  width: number;
  height: number;
  frames: FrameData[];
  totalDuration: number;
  loopCount: number; // 0 usually means infinite
  format: 'gif' | 'apng';
}

/**
 * Creates an invisible canvas to convert ImageData to a Blob URL (much lighter than DataURL)
 */
async function imageDataToBlobUrl(imageData: ImageData): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.putImageData(imageData, 0, 0);
    return new Promise<string>((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          resolve('');
        }
      }, 'image/png');
    });
  }
  return '';
}

/**
 * Decode GIF using gifuct-js
 */
async function decodeGif(buffer: ArrayBuffer): Promise<DecodedAnimation> {
  const gif = parseGIF(buffer);
  const frames = decompressFrames(gif, true);
  
  if (!frames || frames.length === 0) {
    throw new Error('No frames found in GIF');
  }
  
  const width = gif.lsd.width;
  const height = gif.lsd.height;
  
  // We need to render the frames on a canvas to handle disposal methods properly
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  
  let totalDuration = 0;
  const frameDataList: FrameData[] = [];
  
  let previousImageData: ImageData | null = null;
  
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    
    // Save previous state if disposal method is 3 (Restore to Previous)
    // 0: Unspecified, 1: Do not dispose, 2: Restore to background, 3: Restore to previous
    if (frame.disposalType === 3) {
      previousImageData = ctx.getImageData(0, 0, width, height);
    }
    
    // Create ImageData for the current patch
    const patchImageData = new ImageData(
      new Uint8ClampedArray(frame.patch),
      frame.dims.width,
      frame.dims.height
    );
    
    // Draw the patch onto the canvas
    const patchCanvas = document.createElement('canvas');
    patchCanvas.width = frame.dims.width;
    patchCanvas.height = frame.dims.height;
    const patchCtx = patchCanvas.getContext('2d')!;
    patchCtx.putImageData(patchImageData, 0, 0);
    
    ctx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);
    
    // Extract full frame state
    const currentFrameData = ctx.getImageData(0, 0, width, height);
    
    // delay is in hundredths of a second (10ms units)
    const delay = (frame.delay * 10) || 100; 
    totalDuration += delay;
    
    const dataUrl = await imageDataToBlobUrl(currentFrameData);
    
    frameDataList.push({
      index: i,
      imageData: currentFrameData,
      dataUrl: dataUrl,
      delay: delay,
      width: width,
      height: height,
      disposalMethod: frame.disposalType
    });
    
    // Handle disposal for the NEXT frame
    if (frame.disposalType === 2) {
      // Restore to background (transparent)
      ctx.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height);
    } else if (frame.disposalType === 3 && previousImageData) {
      // Restore to previous
      ctx.putImageData(previousImageData, 0, 0);
    }
  }
  
  return {
    width,
    height,
    frames: frameDataList,
    totalDuration,
    loopCount: 0, // gifuct-js doesn't easily expose loop count at top level, assume infinite
    format: 'gif'
  };
}

/**
 * Decode APNG using WebCodecs ImageDecoder API
 */
async function decodeApng(buffer: ArrayBuffer, mimeType: string): Promise<DecodedAnimation> {
  if (!('ImageDecoder' in window)) {
    throw new Error('Your browser does not support ImageDecoder API for APNG decoding.');
  }

  // @ts-ignore - ImageDecoder is relatively new, might not be in standard lib DOM yet
  const decoder = new ImageDecoder({ data: buffer, type: mimeType });
  await decoder.tracks.ready;

  const track = decoder.tracks.selectedTrack;
  if (!track) {
    throw new Error('No tracks found in the image');
  }

  const frameCount = track.frameCount;
  let totalDuration = 0;
  const frameDataList: FrameData[] = [];
  
  let width = 0;
  let height = 0;

  for (let i = 0; i < frameCount; i++) {
    const result = await decoder.decode({ frameIndex: i });
    const frame = result.image;
    
    if (i === 0) {
      width = frame.displayWidth;
      height = frame.displayHeight;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(frame, 0, 0, width, height);
    
    const imageData = ctx.getImageData(0, 0, width, height);
    const durationMs = (frame.duration || 100000) / 1000; // duration is in microseconds
    
    totalDuration += durationMs;
    
    const dataUrl = await imageDataToBlobUrl(imageData);
    
    frameDataList.push({
      index: i,
      imageData: imageData,
      dataUrl: dataUrl,
      delay: durationMs,
      width: width,
      height: height,
      disposalMethod: 0 // WebCodecs handles compositing for us
    });
    
    frame.close();
  }
  
  decoder.close();

  return {
    width,
    height,
    frames: frameDataList,
    totalDuration,
    loopCount: track.repetitionCount || 0,
    format: 'apng'
  };
}

export async function decodeAnimatedImage(file: File): Promise<DecodedAnimation> {
  const buffer = await file.arrayBuffer();
  const mimeType = file.type || 'image/gif';
  
  // Try WebCodecs first for PNG and WebP
  if (mimeType === 'image/png' || mimeType === 'image/apng' || mimeType === 'image/webp') {
    try {
      const anim = await decodeApng(buffer, mimeType);
      // Even if it only has 1 frame (e.g. a static PNG/WebP), returning it is fine as it allows viewing/exporting.
      return anim;
    } catch (e) {
      console.warn('Failed to decode APNG with ImageDecoder, it might not be animated or unsupported:', e);
      throw new Error(`APNG decoding failed: ${(e as Error).message}`);
    }
  }
  
  // Default to GIF
  return await decodeGif(buffer);
}
