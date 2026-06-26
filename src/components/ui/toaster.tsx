import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { useToast } from "@/hooks/useToast"
import { Copy, Check } from "lucide-react"
import { useState } from "react"

function ToastCopyButton({ title, description }: { title?: React.ReactNode, description?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    let textToCopy = "";
    if (typeof title === "string") textToCopy += title + "\n";
    
    if (typeof description === "string") {
      textToCopy += description;
    } else if (description) {
      try {
        const descStr = String(description);
        if (!descStr.includes("[object Object]")) {
          textToCopy += descStr;
        }
      } catch (err) {}
    }

    navigator.clipboard.writeText(textToCopy.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      title="复制内容"
      className="absolute right-8 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600 group-[.success]:text-green-600/50 group-[.success]:hover:text-green-900 group-[.success]:focus:ring-green-500 dark:group-[.success]:text-green-200/50 dark:group-[.success]:hover:text-green-50 dark:group-[.success]:focus:ring-green-400"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastCopyButton title={title} description={description} />
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
