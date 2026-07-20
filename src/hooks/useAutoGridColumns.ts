import { useRef, useState, useEffect } from "react";

/**
 * Measures the container's width via ResizeObserver and calculates
 * how many grid columns fit at a given target item width.
 *
 * This is needed because Radix ScrollArea uses `display: table` on its
 * viewport wrapper, which breaks CSS Grid `auto-fill` (the grid thinks
 * it has infinite width). By measuring the *actual* constrained parent,
 * we compute the correct column count in JS.
 *
 * @param targetItemWidth  desired item width in px (default 200)
 * @param gap              grid gap in px (default 16, i.e. Tailwind gap-4)
 * @param padding          horizontal padding inside the measured element (default 0)
 */
export function useAutoGridColumns(
  targetItemWidth: number = 200,
  gap: number = 16,
  padding: number = 0,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const calculate = () => {
      const width = el.clientWidth - padding;
      if (width > 0) {
        const cols = Math.max(
          2,
          Math.floor((width + gap) / (targetItemWidth + gap)),
        );
        setColumns(cols);
      }
    };

    calculate();
    const observer = new ResizeObserver(calculate);
    observer.observe(el);
    return () => observer.disconnect();
  }, [targetItemWidth, gap, padding]);

  return { containerRef, columns };
}
