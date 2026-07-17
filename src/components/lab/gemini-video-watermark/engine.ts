import {
  BlobSource,
  BufferTarget,
  Conversion,
  ConversionCanceledError,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  VideoSampleSink,
  canEncodeVideo,
  type InputVideoTrack,
} from 'mediabunny';
import legacy48MaskUrl from '../../../../src-tauri/src/assets/bg_48.png?url';

// WebCodecs lifecycle and backpressure are handled by Mediabunny's Conversion API.
// Sources:
// https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder
// https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder
// https://mediabunny.dev/guide/quick-start

const SUPPORTED_DIMENSIONS = new Set([
  '1280x720',
  '720x1280',
  '1920x1080',
  '1080x1920',
]);
const OPACITY_LEVELS = [1, 0.62] as const;
const OFFSETS_720 = [144, 120, 128, 72];
const OFFSETS_1080 = [222, 186];
const CALIBRATION_FRAME_COUNT = 5;

// 84x84 RGBA template observed in Gemini 1080p video output. The 720p template
// is byte-identical to sanOmni's existing bg_48.png asset and is imported above.
const VIDEO_MASK_1080_B64 = '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';

type AlphaMap = {
  values: Float32Array;
  colorValues?: Float32Array;
  width: number;
  height: number;
};

type Candidate = {
  x: number;
  y: number;
  alphaMap: AlphaMap;
  score: number;
  opacityVotes: Map<number, number>;
  baseStrength: number;
  opacity: number;
  ceiling?: number;
  overlayValue?: number;
  edgeCleanup?: { strength: number; radius: number };
};

export type GeminiVideoMetadata = {
  width: number;
  height: number;
  duration: number;
  frameRate: number;
  videoCodec: string;
  audioCodec: string | null;
  decodable: boolean;
  encodable: boolean;
  supportedDimensions: boolean;
  estimatedBitrate: number;
};

export type GeminiVideoCalibration = {
  x: number;
  y: number;
  size: number;
  opacity: number;
  score: number;
  rightMargin: number;
  bottomMargin: number;
};

export type GeminiVideoProgress = {
  stage: 'analyzing' | 'calibrating' | 'processing' | 'finalizing' | 'done';
  ratio: number;
};

export type GeminiVideoProcessResult = {
  blob: Blob;
  metadata: GeminiVideoMetadata;
  calibration: GeminiVideoCalibration;
  processingTimeMs: number;
};

export type GeminiVideoProcessOptions = {
  alphaScale?: number;
  shiftX?: number;
  shiftY?: number;
  signal?: AbortSignal;
  onProgress?: (progress: GeminiVideoProgress) => void;
};

let alpha720Promise: Promise<AlphaMap> | null = null;
let alpha1080Promise: Promise<AlphaMap> | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function abortError() {
  return new DOMException('视频处理已取消', 'AbortError');
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function base64PngBlob(base64: string) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return new Blob([bytes], { type: 'image/png' });
}

async function rasterizeAlphaMap(blob: Blob, size: number, withColor: boolean): Promise<AlphaMap> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error('无法创建视频水印模板画布');
  }

  context.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();
  const pixels = context.getImageData(0, 0, size, size).data;
  const values = new Float32Array(size * size);
  const colorValues = withColor ? new Float32Array(size * size * 3) : undefined;

  for (let index = 0; index < values.length; index += 1) {
    const offset = index * 4;
    if (withColor && colorValues) {
      values[index] = pixels[offset + 3] / 255;
      colorValues[index * 3] = pixels[offset];
      colorValues[index * 3 + 1] = pixels[offset + 1];
      colorValues[index * 3 + 2] = pixels[offset + 2];
    } else {
      values[index] = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) / 255;
    }
  }

  return { values, colorValues, width: size, height: size };
}

async function getAlphaMap(is1080: boolean) {
  if (is1080) {
    alpha1080Promise ??= rasterizeAlphaMap(base64PngBlob(VIDEO_MASK_1080_B64), 84, true);
    return alpha1080Promise;
  }

  alpha720Promise ??= fetch(legacy48MaskUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`加载 720p 水印模板失败：${response.status}`);
      return response.blob();
    })
    .then((blob) => rasterizeAlphaMap(blob, 48, false));
  return alpha720Promise;
}

function scorePosition(image: ImageData, candidate: Candidate) {
  let sumGray = 0;
  let sumGraySq = 0;
  let sumAlpha = 0;
  let sumAlphaSq = 0;
  let sumProduct = 0;
  let count = 0;

  for (let row = 0; row < candidate.alphaMap.height; row += 1) {
    for (let col = 0; col < candidate.alphaMap.width; col += 1) {
      const alpha = candidate.alphaMap.values[row * candidate.alphaMap.width + col];
      if (alpha <= 0.08) continue;
      const pixelIndex = ((candidate.y + row) * image.width + candidate.x + col) * 4;
      const gray = (
        image.data[pixelIndex]
        + image.data[pixelIndex + 1]
        + image.data[pixelIndex + 2]
      ) / 765;
      sumGray += gray;
      sumGraySq += gray * gray;
      sumAlpha += alpha;
      sumAlphaSq += alpha * alpha;
      sumProduct += gray * alpha;
      count += 1;
    }
  }

  if (count === 0) return Number.NEGATIVE_INFINITY;
  const meanGray = sumGray / count;
  const meanAlpha = sumAlpha / count;
  const denominator = Math.sqrt(
    (sumGraySq - count * meanGray * meanGray)
    * (sumAlphaSq - count * meanAlpha * meanAlpha),
  );
  if (denominator <= 0) return Number.NEGATIVE_INFINITY;
  return (sumProduct - count * meanGray * meanAlpha) / denominator;
}

function estimateOpacity(image: ImageData, candidate: Candidate) {
  if (candidate.alphaMap.colorValues) return 1;

  const padding = Math.max(8, Math.round(candidate.alphaMap.width * 0.25));
  const x0 = Math.max(0, candidate.x - padding);
  const y0 = Math.max(0, candidate.y - padding);
  const x1 = Math.min(image.width, candidate.x + candidate.alphaMap.width + padding);
  const y1 = Math.min(image.height, candidate.y + candidate.alphaMap.height + padding);
  let surroundingSum = 0;
  let surroundingCount = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (
        x >= candidate.x
        && x < candidate.x + candidate.alphaMap.width
        && y >= candidate.y
        && y < candidate.y + candidate.alphaMap.height
      ) continue;
      const index = (y * image.width + x) * 4;
      surroundingSum += (
        0.2126 * image.data[index]
        + 0.7152 * image.data[index + 1]
        + 0.0722 * image.data[index + 2]
      );
      surroundingCount += 1;
    }
  }

  if (surroundingCount === 0) return OPACITY_LEVELS[0];
  const surroundingLuma = surroundingSum / surroundingCount;
  let bestOpacity: number = OPACITY_LEVELS[0];
  let bestError = Number.POSITIVE_INFINITY;

  for (const opacity of OPACITY_LEVELS) {
    let errorSum = 0;
    let weightSum = 0;
    for (let row = 0; row < candidate.alphaMap.height; row += 1) {
      for (let col = 0; col < candidate.alphaMap.width; col += 1) {
        const maskIndex = row * candidate.alphaMap.width + col;
        const alpha = candidate.alphaMap.values[maskIndex];
        if (alpha <= 0.04) continue;
        const effectiveAlpha = Math.min(alpha * candidate.baseStrength * opacity, opacity);
        const remainder = 1 - effectiveAlpha;
        if (remainder <= 1e-4) continue;
        const pixelIndex = ((candidate.y + row) * image.width + candidate.x + col) * 4;
        const red = (image.data[pixelIndex] - effectiveAlpha * 250) / remainder;
        const green = (image.data[pixelIndex + 1] - effectiveAlpha * 250) / remainder;
        const blue = (image.data[pixelIndex + 2] - effectiveAlpha * 250) / remainder;
        const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        const weight = Math.min(1, alpha * 8);
        errorSum += Math.abs(luma - surroundingLuma) * weight;
        weightSum += weight;
      }
    }

    const error = weightSum > 0 ? errorSum / weightSum : Number.POSITIVE_INFINITY;
    if (error < bestError) {
      bestError = error;
      bestOpacity = opacity;
    }
  }

  return bestOpacity;
}

function diffuseEdges(
  output: Uint8ClampedArray,
  imageWidth: number,
  candidate: Candidate,
  cleanupMask: Uint8Array,
) {
  if (!candidate.edgeCleanup) return;
  const { radius, strength } = candidate.edgeCleanup;
  const maskWidth = candidate.alphaMap.width;
  const maskHeight = candidate.alphaMap.height;
  const active = new Uint8Array(maskWidth * maskHeight);

  for (let row = 0; row < maskHeight; row += 1) {
    for (let col = 0; col < maskWidth; col += 1) {
      if (!cleanupMask[row * maskWidth + col]) continue;
      for (let deltaY = -radius; deltaY <= radius; deltaY += 1) {
        for (let deltaX = -radius; deltaX <= radius; deltaX += 1) {
          const x = col + deltaX;
          const y = row + deltaY;
          if (x >= 0 && x < maskWidth && y >= 0 && y < maskHeight) {
            active[y * maskWidth + x] = 1;
          }
        }
      }
    }
  }

  const passes = Math.min(120, Math.max(8, maskWidth + maskHeight));
  for (let iteration = 0; iteration < passes; iteration += 1) {
    let changed = 0;
    const next = new Uint8Array(active);
    for (let row = 0; row < maskHeight; row += 1) {
      for (let col = 0; col < maskWidth; col += 1) {
        if (!active[row * maskWidth + col]) continue;
        const sum = [0, 0, 0];
        let count = 0;
        for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
          for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
            if (deltaX === 0 && deltaY === 0) continue;
            const x = col + deltaX;
            const y = row + deltaY;
            if (
              x < 0
              || x >= maskWidth
              || y < 0
              || y >= maskHeight
              || active[y * maskWidth + x]
            ) continue;
            const index = ((candidate.y + y) * imageWidth + candidate.x + x) * 4;
            sum[0] += output[index];
            sum[1] += output[index + 1];
            sum[2] += output[index + 2];
            count += 1;
          }
        }
        if (count === 0) continue;
        const index = ((candidate.y + row) * imageWidth + candidate.x + col) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const average = sum[channel] / count;
          output[index + channel] = Math.round(
            output[index + channel] * (1 - strength) + average * strength,
          );
        }
        next[row * maskWidth + col] = 0;
        changed += 1;
      }
    }
    active.set(next);
    if (changed === 0) break;
  }
}

export function reverseAlphaBlendFrame(
  image: ImageData,
  candidate: Candidate,
  alphaScale: number,
) {
  const output = image.data;
  const colorMap = candidate.alphaMap.colorValues;
  const cleanupMask = candidate.edgeCleanup
    ? new Uint8Array(candidate.alphaMap.width * candidate.alphaMap.height)
    : null;
  const overlayValue = candidate.overlayValue ?? 250;
  const ceiling = candidate.ceiling ?? 1;

  for (let row = 0; row < candidate.alphaMap.height; row += 1) {
    for (let col = 0; col < candidate.alphaMap.width; col += 1) {
      const maskIndex = row * candidate.alphaMap.width + col;
      const alpha = Math.min(
        candidate.alphaMap.values[maskIndex]
          * candidate.baseStrength
          * candidate.opacity
          * alphaScale,
        ceiling,
      );
      if (alpha < 0.002 || 1 - alpha <= 1e-4) continue;
      if (cleanupMask) cleanupMask[maskIndex] = 1;
      const pixelIndex = ((candidate.y + row) * image.width + candidate.x + col) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const expected = colorMap ? colorMap[maskIndex * 3 + channel] : overlayValue;
        output[pixelIndex + channel] = Math.round(clamp(
          (output[pixelIndex + channel] - alpha * expected) / (1 - alpha),
          0,
          255,
        ));
      }
    }
  }

  if (cleanupMask) diffuseEdges(output, image.width, candidate, cleanupMask);
  return image;
}

function makeInput(file: Blob) {
  return new Input({
    formats: [MP4],
    source: new BlobSource(file),
  });
}

function computeBitrate(width: number, height: number, frameRate: number) {
  return Math.max(2_000_000, Math.min(20_000_000, Math.round(width * height * frameRate * 0.12)));
}

async function getMetadata(input: Input, videoTrack: InputVideoTrack): Promise<GeminiVideoMetadata> {
  const width = await videoTrack.getDisplayWidth();
  const height = await videoTrack.getDisplayHeight();
  const videoCodec = await videoTrack.getCodec();
  const audioTrack = await input.getPrimaryAudioTrack();
  const audioCodec = audioTrack ? await audioTrack.getCodec() : null;
  const duration = await input.computeDuration();
  const stats = await videoTrack.computePacketStats(100).catch(() => null);
  const frameRate = Math.max(1, Math.round(stats?.averagePacketRate || 30));
  const estimatedBitrate = computeBitrate(width, height, frameRate);
  const decodable = await videoTrack.canDecode();
  const encodable = await canEncodeVideo('avc', {
    width,
    height,
    bitrate: estimatedBitrate,
  });

  return {
    width,
    height,
    duration,
    frameRate,
    videoCodec: videoCodec ?? 'unknown',
    audioCodec,
    decodable,
    encodable,
    supportedDimensions: SUPPORTED_DIMENSIONS.has(`${width}x${height}`),
    estimatedBitrate,
  };
}

export async function inspectGeminiVideo(file: Blob): Promise<GeminiVideoMetadata> {
  if (typeof VideoDecoder === 'undefined' || typeof VideoEncoder === 'undefined') {
    throw new Error('当前 WebView 不支持 WebCodecs，无法处理视频');
  }

  const input = makeInput(file);
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('所选 MP4 中没有视频轨道');
    return await getMetadata(input, videoTrack);
  } finally {
    input.dispose();
  }
}

async function calibrate(
  videoTrack: InputVideoTrack,
  metadata: GeminiVideoMetadata,
  signal: AbortSignal | undefined,
  onProgress: ((progress: GeminiVideoProgress) => void) | undefined,
) {
  const is1080 = metadata.width === 1920 || metadata.height === 1920;
  const alphaMap = await getAlphaMap(is1080);
  const offsets = is1080 ? OFFSETS_1080 : OFFSETS_720;
  const candidates: Candidate[] = offsets.map((offset) => ({
    x: clamp(metadata.width - offset, 0, metadata.width - alphaMap.width),
    y: clamp(metadata.height - offset, 0, metadata.height - alphaMap.height),
    alphaMap,
    score: 0,
    opacityVotes: new Map<number, number>(),
    baseStrength: 1,
    opacity: 1,
  }));

  const canvas = document.createElement('canvas');
  canvas.width = metadata.width;
  canvas.height = metadata.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法创建视频分析画布');

  const sink = new VideoSampleSink(videoTrack, { optimizeForLatency: true });
  let frameCount = 0;
  for await (const sample of sink.samples()) {
    try {
      assertNotAborted(signal);
      context.clearRect(0, 0, metadata.width, metadata.height);
      sample.draw(context, 0, 0, metadata.width, metadata.height);
      const image = context.getImageData(0, 0, metadata.width, metadata.height);
      for (const candidate of candidates) {
        candidate.score += scorePosition(image, candidate);
        const opacity = estimateOpacity(image, candidate);
        candidate.opacityVotes.set(opacity, (candidate.opacityVotes.get(opacity) ?? 0) + 1);
      }
      frameCount += 1;
      onProgress?.({
        stage: 'calibrating',
        ratio: frameCount / CALIBRATION_FRAME_COUNT,
      });
    } finally {
      sample.close();
    }
    if (frameCount >= CALIBRATION_FRAME_COUNT) break;
  }

  if (frameCount === 0) throw new Error('无法从视频中解码校准帧');
  const best = candidates.reduce((winner, candidate) => (
    candidate.score > winner.score ? candidate : winner
  ));
  const tieMargin = 0.04 * frameCount;
  const chosen = best.score >= candidates[0].score + tieMargin ? best : candidates[0];
  let modalOpacity = 1;
  let modalCount = -1;
  for (const [opacity, count] of chosen.opacityVotes) {
    if (count > modalCount) {
      modalOpacity = opacity;
      modalCount = count;
    }
  }
  chosen.opacity = modalOpacity;
  if (modalOpacity >= 1 && !chosen.alphaMap.colorValues) {
    chosen.overlayValue = 255;
    chosen.ceiling = 0.99;
    chosen.edgeCleanup = { strength: 0.6, radius: 2 };
  }

  return chosen;
}

export async function processGeminiVideo(
  file: Blob,
  options: GeminiVideoProcessOptions = {},
): Promise<GeminiVideoProcessResult> {
  const startedAt = performance.now();
  const alphaScale = clamp(options.alphaScale ?? 1, 0.5, 1.5);
  const shiftX = Math.round(clamp(options.shiftX ?? 0, -128, 128));
  const shiftY = Math.round(clamp(options.shiftY ?? 0, -128, 128));
  const input = makeInput(file);
  let conversion: Conversion | null = null;
  const handleAbort = () => {
    if (conversion) void conversion.cancel();
  };

  try {
    assertNotAborted(options.signal);
    options.onProgress?.({ stage: 'analyzing', ratio: 0 });
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('所选 MP4 中没有视频轨道');
    const metadata = await getMetadata(input, videoTrack);
    if (!metadata.supportedDimensions) {
      throw new Error(
        `暂不支持 ${metadata.width} × ${metadata.height}；当前支持 1280×720、720×1280、1920×1080、1080×1920`,
      );
    }
    if (!metadata.decodable) throw new Error(`当前 WebView 无法解码 ${metadata.videoCodec} 视频`);
    if (!metadata.encodable) throw new Error('当前 WebView 不支持 H.264 视频编码');

    const candidate = await calibrate(videoTrack, metadata, options.signal, options.onProgress);
    candidate.x = clamp(candidate.x + shiftX, 0, metadata.width - candidate.alphaMap.width);
    candidate.y = clamp(candidate.y + shiftY, 0, metadata.height - candidate.alphaMap.height);
    assertNotAborted(options.signal);

    const canvas = document.createElement('canvas');
    canvas.width = metadata.width;
    canvas.height = metadata.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('无法创建视频处理画布');

    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target,
    });
    conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: {
        codec: 'avc',
        bitrate: metadata.estimatedBitrate,
        keyFrameInterval: 2,
        forceTranscode: true,
        processedWidth: metadata.width,
        processedHeight: metadata.height,
        process: (sample) => {
          assertNotAborted(options.signal);
          context.clearRect(0, 0, metadata.width, metadata.height);
          sample.draw(context, 0, 0, metadata.width, metadata.height);
          const image = context.getImageData(0, 0, metadata.width, metadata.height);
          reverseAlphaBlendFrame(image, candidate, alphaScale);
          context.putImageData(image, 0, 0);
          return canvas;
        },
      },
      showWarnings: false,
    });

    if (!conversion.isValid) {
      throw new Error('当前视频轨道无法转换为 H.264 MP4');
    }
    conversion.onProgress = (ratio) => {
      options.onProgress?.({ stage: 'processing', ratio });
    };
    options.signal?.addEventListener('abort', handleAbort, { once: true });

    await conversion.execute();
    options.onProgress?.({ stage: 'finalizing', ratio: 1 });
    if (!target.buffer) throw new Error('视频封装完成但没有生成输出数据');
    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    options.onProgress?.({ stage: 'done', ratio: 1 });

    return {
      blob,
      metadata,
      calibration: {
        x: candidate.x,
        y: candidate.y,
        size: candidate.alphaMap.width,
        opacity: candidate.opacity,
        score: candidate.score / CALIBRATION_FRAME_COUNT,
        rightMargin: metadata.width - candidate.x - candidate.alphaMap.width,
        bottomMargin: metadata.height - candidate.y - candidate.alphaMap.height,
      },
      processingTimeMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    if (error instanceof ConversionCanceledError || options.signal?.aborted) throw abortError();
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', handleAbort);
    input.dispose();
  }
}
