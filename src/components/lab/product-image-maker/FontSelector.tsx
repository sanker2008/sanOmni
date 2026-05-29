/**
 * FontSelector — Google Fonts dropdown selector with preview.
 * 
 * Standalone component. Only depends on local fonts.ts config.
 */

import { useState, useMemo, useEffect } from 'react';
import { GOOGLE_FONTS, FONT_CATEGORY_LABELS, loadGoogleFont, type GoogleFontDef } from './fonts';
import { Search, ChevronDown } from 'lucide-react';

interface FontSelectorProps {
  value: string;
  onChange: (fontName: string) => void;
}

export default function FontSelector({ value, onChange }: FontSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<GoogleFontDef['category'] | 'all'>('all');

  // Load current font on mount
  useEffect(() => {
    loadGoogleFont(value);
  }, [value]);

  const filteredFonts = useMemo(() => {
    let fonts = GOOGLE_FONTS;

    if (activeCategory !== 'all') {
      fonts = fonts.filter((f) => f.category === activeCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      fonts = fonts.filter((f) => f.name.toLowerCase().includes(q));
    }

    return fonts;
  }, [search, activeCategory]);

  const handleSelect = (font: GoogleFontDef) => {
    loadGoogleFont(font.name);
    onChange(font.name);
    setIsOpen(false);
    setSearch('');
  };

  const categories: Array<{ key: GoogleFontDef['category'] | 'all'; label: string }> = [
    { key: 'all', label: '全部' },
    ...Object.entries(FONT_CATEGORY_LABELS).map(([key, label]) => ({
      key: key as GoogleFontDef['category'],
      label,
    })),
  ];

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm bg-muted/50 hover:bg-muted rounded-md transition-colors text-left"
      >
        <span
          className="truncate flex-1"
          style={{ fontFamily: `"${value}", sans-serif` }}
        >
          {value}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => { setIsOpen(false); setSearch(''); }}
          />

          <div className="absolute top-full left-0 mt-1 w-72 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索字体..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/50 rounded-md outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
              </div>
            </div>

            {/* Category tabs */}
            <div className="flex flex-wrap gap-1 p-2 border-b border-border">
              {categories.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveCategory(key)}
                  className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                    activeCategory === key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Font list */}
            <div className="max-h-64 overflow-y-auto p-1">
              {filteredFonts.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  未找到匹配的字体
                </div>
              ) : (
                filteredFonts.map((font) => (
                  <button
                    key={font.name}
                    type="button"
                    onClick={() => handleSelect(font)}
                    onMouseEnter={() => loadGoogleFont(font.name)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                      font.name === value
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <span
                      className="truncate"
                      style={{ fontFamily: `"${font.name}", sans-serif` }}
                    >
                      {font.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0 uppercase">
                      {font.category === 'chinese' ? '中文' : font.category}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
