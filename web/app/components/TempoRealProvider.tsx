"use client";

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";

export type TipoEventoTempoReal = "message" | "entrega" | "reaction" | "receipt" | "edit" | "delete" | "atribuicao";

export interface EventoTempoReal {
  tipo: TipoEventoTempoReal;
  slug?: string;
  data: Record<string, unknown>;
}

interface ContextoTempoReal {
  ativo: boolean;
  assinar: (fn: (ev: EventoTempoReal) => void) => () => void;
}

const TempoRealCtx = createContext<ContextoTempoReal | null>(null);

/** Provedor único de SSE (/api/events?todos=1) para ListaConversas, Timeline e Notificações. */
export function ProvedorTempoReal({ children }: { children: ReactNode }) {
  const [ativo, setAtivo] = useState(false);
  const listenersRef = useRef<Set<(ev: EventoTempoReal) => void>>(new Set());

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource("/api/events?todos=1");

    const emitir = (tipo: TipoEventoTempoReal, raw: string) => {
      try {
        const data = JSON.parse(raw) as Record<string, unknown>;
        const slug = typeof data.slug === "string" ? data.slug.trim() : undefined;
        const ev: EventoTempoReal = { tipo, slug, data };
        for (const fn of listenersRef.current) fn(ev);
      } catch {
        /* payload inválido */
      }
    };

    es.onopen = () => setAtivo(true);
    es.onerror = () => setAtivo(false);
    es.onmessage = (e) => emitir("message", e.data);

    const eventos: TipoEventoTempoReal[] = ["entrega", "reaction", "receipt", "edit", "delete", "atribuicao"];
    const handlers = eventos.map((tipo) => {
      const h = (e: MessageEvent) => emitir(tipo, String(e.data ?? "{}"));
      es.addEventListener(tipo, h as EventListener);
      return [tipo, h] as const;
    });

    return () => {
      setAtivo(false);
      for (const [tipo, h] of handlers) es.removeEventListener(tipo, h as EventListener);
      es.close();
    };
  }, []);

  const value: ContextoTempoReal = {
    ativo,
    assinar(fn) {
      listenersRef.current.add(fn);
      return () => {
        listenersRef.current.delete(fn);
      };
    },
  };

  return <TempoRealCtx.Provider value={value}>{children}</TempoRealCtx.Provider>;
}

export function useTempoReal(): ContextoTempoReal | null {
  return useContext(TempoRealCtx);
}
