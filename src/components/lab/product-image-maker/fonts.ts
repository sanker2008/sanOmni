/**
 * Product Image Maker — Google Fonts Configuration & Loader
 * 
 * Standalone module. No dependencies on sanOmni core.
 * Fonts are loaded on-demand from Google Fonts CDN.
 */

// ─── Font Definition ───────────────────────────────────────

export interface GoogleFontDef {
  name: string;
  category: 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace' | 'chinese';
  weights: number[];
}

// ─── Curated Font List ─────────────────────────────────────

export const GOOGLE_FONTS: GoogleFontDef[] = [
  // ── Sans-serif ──
  { name: 'Inter', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { name: 'Roboto', category: 'sans-serif', weights: [100, 300, 400, 500, 700, 900] },
  { name: 'Open Sans', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800] },
  { name: 'Montserrat', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { name: 'Poppins', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { name: 'Outfit', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { name: 'Nunito', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  { name: 'Raleway', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { name: 'Work Sans', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { name: 'DM Sans', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { name: 'Manrope', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800] },
  { name: 'Space Grotesk', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },

  // ── Serif ──
  { name: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700, 800, 900] },
  { name: 'Merriweather', category: 'serif', weights: [300, 400, 700, 900] },
  { name: 'Lora', category: 'serif', weights: [400, 500, 600, 700] },
  { name: 'Crimson Text', category: 'serif', weights: [400, 600, 700] },
  { name: 'Source Serif 4', category: 'serif', weights: [200, 300, 400, 500, 600, 700, 800, 900] },

  // ── Display ──
  { name: 'Bebas Neue', category: 'display', weights: [400] },
  { name: 'Oswald', category: 'display', weights: [200, 300, 400, 500, 600, 700] },
  { name: 'Anton', category: 'display', weights: [400] },
  { name: 'Archivo Black', category: 'display', weights: [400] },
  { name: 'Righteous', category: 'display', weights: [400] },
  { name: 'Alfa Slab One', category: 'display', weights: [400] },

  // ── Handwriting ──
  { name: 'Dancing Script', category: 'handwriting', weights: [400, 500, 600, 700] },
  { name: 'Pacifico', category: 'handwriting', weights: [400] },
  { name: 'Caveat', category: 'handwriting', weights: [400, 500, 600, 700] },
  { name: 'Sacramento', category: 'handwriting', weights: [400] },

  // ── Monospace ──
  { name: 'JetBrains Mono', category: 'monospace', weights: [100, 200, 300, 400, 500, 600, 700, 800] },
  { name: 'Fira Code', category: 'monospace', weights: [300, 400, 500, 600, 700] },
  { name: 'Source Code Pro', category: 'monospace', weights: [200, 300, 400, 500, 600, 700, 800, 900] },

  // ── Chinese ──
  { name: 'Noto Sans SC', category: 'chinese', weights: [100, 300, 400, 500, 700, 900] },
  { name: 'Noto Serif SC', category: 'chinese', weights: [200, 300, 400, 500, 600, 700, 900] },
  { name: 'ZCOOL XiaoWei', category: 'chinese', weights: [400] },
  { name: 'ZCOOL QingKe HuangYou', category: 'chinese', weights: [400] },
  { name: 'Ma Shan Zheng', category: 'chinese', weights: [400] },
  { name: 'Liu Jian Mao Cao', category: 'chinese', weights: [400] },
  { name: 'Zhi Mang Xing', category: 'chinese', weights: [400] },
  { name: 'Long Cang', category: 'chinese', weights: [400] },
];

// ─── Category Labels ───────────────────────────────────────

export const FONT_CATEGORY_LABELS: Record<GoogleFontDef['category'], string> = {
  'sans-serif': 'Sans Serif',
  'serif': 'Serif',
  'display': 'Display',
  'handwriting': 'Handwriting',
  'monospace': 'Monospace',
  'chinese': '中文',
};

// ─── Font Loader ───────────────────────────────────────────

const loadedFonts = new Set<string>();

/**
 * Dynamically load a Google Font by injecting a <link> tag.
 * Idempotent — calling multiple times for the same font is a no-op.
 */
export function loadGoogleFont(fontName: string, weights?: number[]): void {
  if (loadedFonts.has(fontName)) return;
  loadedFonts.add(fontName);

  const fontDef = GOOGLE_FONTS.find((f) => f.name === fontName);
  const resolvedWeights = weights || fontDef?.weights || [400, 700];

  const link = document.createElement('link');
  link.id = `gfont-${fontName.replace(/\s+/g, '-').toLowerCase()}`;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@${resolvedWeights.join(';')}&display=swap`;
  document.head.appendChild(link);
}

/**
 * Preload a set of commonly used fonts at startup.
 */
export function preloadDefaultFonts(): void {
  const defaults = ['Inter', 'Montserrat', 'Bebas Neue', 'Playfair Display', 'Noto Sans SC'];
  defaults.forEach((name) => loadGoogleFont(name));
}

/**
 * Check if a font has been loaded (link injected).
 */
export function isFontLoaded(fontName: string): boolean {
  return loadedFonts.has(fontName);
}

/**
 * Wait for a font to be ready for rendering.
 * Uses the Font Loading API when available.
 */
export async function waitForFont(fontFamily: string, weight: number = 400): Promise<boolean> {
  if (!document.fonts) return true; // fallback: assume loaded
  try {
    await document.fonts.load(`${weight} 16px "${fontFamily}"`);
    return true;
  } catch {
    return false;
  }
}
