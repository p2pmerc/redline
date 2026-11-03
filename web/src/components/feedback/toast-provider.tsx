import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle, Info, WarningCircle, X, CircleNotch } from "@phosphor-icons/react";
import { spring } from "@/lib/springs";

type ToastTone = "success" | "error" | "info" | "pending";

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastApi {
  show: (toast: Omit<ToastItem, "id">, ms?: number) => number;
  dismiss: (id: number) => void;
  /** Shows a pending toast, then swaps it for success or error when the promise settles. */
  promise: <T>(
    work: Promise<T>,
    copy: { pending: string; success: string; error: string },
  ) => Promise<T>;
}

const ToastContext = createContext<ToastApi | null>(null);

const toneIcon = {
  success: <CheckCircle size={18} weight="fill" className="text-success" />,
  error: <WarningCircle size={18} weight="fill" className="text-destructive" />,
  info: <Info size={18} weight="fill" className="text-info" />,
  pending: <CircleNotch size={18} className="animate-spin text-muted-foreground" />,
};

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback<ToastApi["show"]>(
    (toast, ms = 4200) => {
      const id = ++counter;
      setItems((all) => [...all.slice(-3), { ...toast, id }]);
      if (toast.tone !== "pending") setTimeout(() => dismiss(id), ms);
      return id;
    },
    [dismiss],
  );

  const promise = useCallback<ToastApi["promise"]>(
    async (work, copy) => {
      const id = show({ tone: "pending", title: copy.pending });
      try {
        const result = await work;
        dismiss(id);
        show({ tone: "success", title: copy.success });
        return result;
      } catch (e) {
        dismiss(id);
        show({ tone: "error", title: copy.error, description: e instanceof Error ? e.message : undefined });
        throw e;
      }
    },
    [dismiss, show],
  );

  const api = useMemo(() => ({ show, dismiss, promise }), [show, dismiss, promise]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        <AnimatePresence initial={false}>
          {items.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={spring.moderate}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-surface-6 px-4 py-3 shadow-surface-5"
              role="status"
            >
              <span className="mt-0.5 shrink-0">{toneIcon[toast.tone]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-subtitle font-medium">{toast.title}</p>
                {toast.description && <p className="text-caption text-muted-foreground">{toast.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="-mr-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
