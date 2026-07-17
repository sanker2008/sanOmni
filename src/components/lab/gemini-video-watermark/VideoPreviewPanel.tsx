import { Film, Loader2 } from 'lucide-react';

type VideoPreviewPanelProps = {
  title: string;
  subtitle: string;
  src?: string;
  isLoading?: boolean;
  emptyLabel: string;
};

export default function VideoPreviewPanel({
  title,
  subtitle,
  src,
  isLoading = false,
  emptyLabel,
}: VideoPreviewPanelProps) {
  return (
    <section className="flex min-h-[300px] flex-col overflow-hidden rounded-md border border-border bg-card">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={subtitle}>
          {subtitle}
        </p>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-3">
        {src ? (
          <video
            className="max-h-[68vh] max-w-full rounded-sm bg-black"
            src={src}
            controls
            playsInline
            preload="metadata"
          />
        ) : (
          <div className="flex max-w-xs flex-col items-center text-center text-slate-300">
            {isLoading ? (
              <Loader2 className="mb-3 h-8 w-8 animate-spin" />
            ) : (
              <Film className="mb-3 h-8 w-8" />
            )}
            <p className="text-sm">{emptyLabel}</p>
          </div>
        )}
      </div>
    </section>
  );
}
