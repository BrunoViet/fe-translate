import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type ToastVariant = "success" | "info" | "warning";

export type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastCtx = {
  showToast: (message: string, variant?: ToastVariant) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setItems((prev) => [...prev, { id, message, variant }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 5200);
  }, []);

  return (
    <Ctx.Provider value={{ showToast }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast-item toast-${t.variant}`} role="status">
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const x = useContext(Ctx);
  if (!x) throw new Error("useToast requires ToastProvider");
  return x;
}
