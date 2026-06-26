import { Command } from '@tauri-apps/plugin-shell';
import { tempDir } from '@tauri-apps/api/path';

export type BgStrategy = 'A' | 'B';

/**
 * Parameters for Strategy A (Pillow-based white/colored background removal).
 */
export interface StrategyAParams {
  /** Pixels with color distance below this are fully opaque. Range: 0-255. Default: 220. */
  lowerThreshold: number;
  /** Pixels with color distance above this are fully transparent. Range: 0-255. Default: 250. */
  upperThreshold: number;
  /** Background color to remove as "R,G,B". Default: "255,255,255" (white). */
  bgColor: string;
}

/**
 * Parameters for Strategy B (IS-Net + Guided Filter professional removal).
 */
export interface StrategyBParams {
  /** Guided filter radius. Larger = smoother edges. Range: 3-60. Default: 15. */
  guidedRadius: number;
  /** Guided filter epsilon. Smaller = sharper edges. Range: 1e-6 to 0.1. Default: 0.0001. */
  guidedEps: number;
  /** Background luminance threshold. Lower = more aggressive halo removal. Range: 50-250. Default: 150. */
  bgThreshold: number;
  /** Background feathering transition width. Smaller = harder cut. Range: 20-200. Default: 80. */
  bgFeathering: number;
  /** Decontamination erosion kernel size. Range: 3-30. Default: 15. */
  decontamErode: number;
  /** Whether to fill internal transparent holes (1=True, 0=False). */
  fillHoles?: boolean;
}

export const DEFAULT_STRATEGY_A_PARAMS: StrategyAParams = {
  lowerThreshold: 220,
  upperThreshold: 250,
  bgColor: '255,255,255',
};

export const DEFAULT_STRATEGY_B_PARAMS: StrategyBParams = {
  guidedRadius: 15,
  guidedEps: 0.0001,
  bgThreshold: 150,
  bgFeathering: 80,
  decontamErode: 15,
  fillHoles: false,
};

/** Preset configurations for common use cases. */
export const PRESETS = {
  A: {
    '白底商品图': { lowerThreshold: 220, upperThreshold: 250, bgColor: '255,255,255' },
    '浅灰背景': { lowerThreshold: 200, upperThreshold: 240, bgColor: '230,230,230' },
    '绿幕抠像': { lowerThreshold: 180, upperThreshold: 240, bgColor: '0,177,64' },
    '蓝幕抠像': { lowerThreshold: 180, upperThreshold: 240, bgColor: '0,71,187' },
  } as Record<string, StrategyAParams>,
  B: {
    '复杂发丝/毛发': { guidedRadius: 20, guidedEps: 0.00005, bgThreshold: 150, bgFeathering: 100, decontamErode: 12, fillHoles: false },
    '简单物体': { guidedRadius: 10, guidedEps: 0.001, bgThreshold: 160, bgFeathering: 60, decontamErode: 18, fillHoles: true },
    '深色背景': { guidedRadius: 15, guidedEps: 0.0001, bgThreshold: 80, bgFeathering: 60, decontamErode: 15, fillHoles: false },
    '默认均衡': { guidedRadius: 15, guidedEps: 0.0001, bgThreshold: 150, bgFeathering: 80, decontamErode: 15, fillHoles: false },
  } as Record<string, StrategyBParams>,
};

export interface BgRemovalOptions {
  inputPath: string;
  strategy: BgStrategy;
  pythonPath?: string;
  engineMode?: 'local' | 'download';
  enginePath?: string;
  /** Strategy-specific parameters. If omitted, defaults are used. */
  params?: StrategyAParams | StrategyBParams;
}

/**
 * 调用 Python 脚本进行背景移除
 */
export async function executeBgRemoval(options: BgRemovalOptions): Promise<string> {
  const { inputPath, strategy, pythonPath, engineMode, params } = options;

  const outName = `bg_removed_${Date.now()}.png`;
  const tDir = await tempDir();
  const outputPath = `${tDir}\\${outName}`;

  let commandStr = '';
  const cliArgs: string[] = [];

  // Convert Tauri v2 asset URLs back to physical paths
  let actualInputPath = inputPath;
  const match = actualInputPath.match(/^(?:asset:\/\/localhost|https?:\/\/asset\.localhost)(.+)$/);
  if (match) {
    try {
      let path = decodeURIComponent(match[1]);
      if (path.startsWith('/') && path.length > 2 && path[2] === ':') {
        path = path.substring(1); // Remove leading slash for Windows paths
      }
      actualInputPath = path;
    } catch (e) {
      console.error("Failed to parse asset URL:", e);
    }
  }

  if (engineMode === 'download') {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const appData = await appDataDir();
    
    let exeName = strategy === 'A' ? 'pillow_matting.exe' : 'perfect_matting\\perfect_matting.exe';
    if (!window.navigator.userAgent.includes('Windows')) {
      exeName = exeName.replace('.exe', '');
    }
    
    commandStr = await join(appData, 'engine', exeName);
    
    const { exists } = await import('@tauri-apps/plugin-fs');
    if (!(await exists(commandStr))) {
      throw new Error('独立引擎包未找到，请在设置中重新下载！');
    }
    
    cliArgs.push(actualInputPath, outputPath);
  } else {
    commandStr = pythonPath && pythonPath.trim() !== '' ? pythonPath.trim() : 'python';
    
    const scriptName = strategy === 'A' ? 'pillow_matting.py' : 'perfect_matting.py';
    const { resolveResource } = await import('@tauri-apps/api/path');
    const { exists } = await import('@tauri-apps/plugin-fs');
    
    let scriptPath = await resolveResource(`scripts/${scriptName}`);
    
    let isExist = false;
    try {
      isExist = await exists(scriptPath);
    } catch (e) {
      console.warn("fs.exists check failed (likely scope error):", e);
    }
    
    if (!isExist) {
      scriptPath = `../scripts/${scriptName}`;
    }

    cliArgs.push(scriptPath, actualInputPath, outputPath);
  }

  if (strategy === 'A') {
      const p = (params as StrategyAParams) || DEFAULT_STRATEGY_A_PARAMS;
      cliArgs.push(`--lower_threshold=${p.lowerThreshold}`);
      cliArgs.push(`--upper_threshold=${p.upperThreshold}`);
      cliArgs.push(`--bg_color=${p.bgColor}`);
    } else {
      const p = (params as StrategyBParams) || DEFAULT_STRATEGY_B_PARAMS;
      cliArgs.push(`--guided_radius=${p.guidedRadius}`);
      cliArgs.push(`--guided_eps=${p.guidedEps}`);
      cliArgs.push(`--bg_threshold=${p.bgThreshold}`);
      cliArgs.push(`--bg_feathering=${p.bgFeathering}`);
      cliArgs.push(`--decontam_erode=${p.decontamErode}`);
      if (p.fillHoles) {
        cliArgs.push(`--fill_holes=1`);
      }
    }

    console.log(`执行抠图: ${commandStr} ${cliArgs.join(' ')}`);

    const command = Command.create(commandStr, cliArgs, {
      encoding: 'raw',
      env: {
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8:replace',
        ONNXRUNTIME_SUPPRESS_WARNINGS: '1',
        ORT_LOGGING_LEVEL: '4'
      }
    });

    try {
      const output = await command.execute();
      if (output.code !== 0) {
        const stderrData = output.stderr as any;
        let stderrStr = 'Unknown error';
        if (stderrData) {
          const u8 = stderrData instanceof Uint8Array ? stderrData : new Uint8Array(stderrData);
          stderrStr = new TextDecoder('utf-8', { fatal: false }).decode(u8);
        }
        throw new Error(`Python script exited with code ${output.code}\n${stderrStr}`);
      }
      return outputPath;
    } catch (e: any) {
      throw new Error(`Failed to execute python process: ${e.message || e}`);
    }
}
