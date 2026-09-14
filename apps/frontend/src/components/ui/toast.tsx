"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ToastItem = { id: number; message: string };

const ToastContext = createContext<(message: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string) => {
    const id = Date.now();
    setItems((current) => [...current, { id, message }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 3200);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 space-y-2" role="status" aria-live="polite">
        {items.map((item) => (
          <p key={item.id} className="rounded-[var(--acf-radius-sm)] bg-[var(--acf-text)] px-3 py-2 text-sm text-white">
            {item.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
