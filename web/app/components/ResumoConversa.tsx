"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/app/components/ui";

interface Resumo {
  texto: string;
  em: string;
}

/** "27/11/2026 às 10:52" no fuso de Brasília (UTC-3). */
function dataHoraGeracao(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms - 3 * 60 * 60 * 1000);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} às ${hh}:${min}`;
}

/**
 * Histórico de resumos gerados para a conversa, com data e hora de geração.
 * Carrega os já salvos sem chamar a IA; gera um novo quando o operador clica
 * em "Resumir" no compositor ou em "Gerar novo resumo" aqui.
 */
export function ResumoConversa({
  slug,
  gatilhoGerar = 0,
  onQuantidade,
}: {
  slug: string;
  /** Quando incrementa (botão Resumir no menu do compositor), dispara uma nova geração. */
  gatilhoGerar?: number;
  onQuantidade?: (n: number) => void;
}) {
  const [historico, setHistorico] = useState<Resumo[] | undefined>(undefined);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const ultimoGatilhoRef = useRef(gatilhoGerar);

  useEffect(() => {
    let vivo = true;
    setHistorico(undefined);
    setErro("");
    fetch(`/api/resumo-conversa?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { resumo?: Resumo | null; historico?: Resumo[] } | null) => {
        if (!vivo) return;
        const lista = Array.isArray(j?.historico)
          ? j.historico
          : j?.resumo
            ? [j.resumo]
            : [];
        setHistorico(lista);
        onQuantidade?.(lista.length);
      })
      .catch(() => {
        if (vivo) {
          setHistorico([]);
          onQuantidade?.(0);
        }
      });
    return () => {
      vivo = false;
    };
  }, [slug, onQuantidade]);

  const gerar = useCallback(async () => {
    setGerando(true);
    setErro("");
    try {
      const r = await fetch("/api/resumo-conversa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const j = (await r.json()) as { resumo?: Resumo; historico?: Resumo[]; error?: string };
      if (!r.ok || (!j.resumo && !Array.isArray(j.historico))) {
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const lista = Array.isArray(j.historico) && j.historico.length > 0
        ? j.historico
        : j.resumo
          ? [j.resumo, ...(historico ?? [])]
          : (historico ?? []);
      setHistorico(lista);
      onQuantidade?.(lista.length);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não resumiu");
    } finally {
      setGerando(false);
    }
  }, [slug, historico, onQuantidade]);

  useEffect(() => {
    if (gatilhoGerar > ultimoGatilhoRef.current) {
      ultimoGatilhoRef.current = gatilhoGerar;
      void gerar();
    }
  }, [gatilhoGerar, gerar]);

  const atual = historico?.[0] ?? null;
  const anteriores = historico ? historico.slice(1) : [];

  return (
    <div className="flex flex-col gap-3">
      {historico === undefined ? (
        <p className="text-[13px] text-fg-faint">Carregando…</p>
      ) : atual ? (
        <div className="rounded-control border border-line bg-surface p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[11.5px] text-fg-faint">
            <span className="font-medium text-fg-dim">Último resumo</span>
            <time dateTime={atual.em} className="font-mono tabular-nums">
              {dataHoraGeracao(atual.em)}
            </time>
          </div>
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-fg">{atual.texto}</p>
        </div>
      ) : (
        <p className="text-[13px] text-fg-dim">
          Nenhum resumo gerado ainda. Use o botão de IA ao lado do emoji ou gere abaixo.
        </p>
      )}

      <div>
        <Button variant="subtle" size="sm" loading={gerando} onClick={() => void gerar()}>
          {gerando ? "Gerando resumo…" : atual ? "Gerar novo resumo" : "Gerar resumo"}
        </Button>
      </div>

      {erro && <p className="text-[12px] text-danger">{erro}</p>}

      {anteriores.length > 0 && (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-[11.5px] font-medium text-fg-faint">
            Anteriores ({anteriores.length})
          </p>
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
            {anteriores.map((item, idx) => (
              <li
                key={`${item.em}-${idx}`}
                className="rounded-control border border-line/80 bg-surface/60 p-2.5 text-[12.5px]"
              >
                <time dateTime={item.em} className="mb-1 block font-mono text-[11px] tabular-nums text-fg-faint">
                  {dataHoraGeracao(item.em)}
                </time>
                <p className="whitespace-pre-line leading-relaxed text-fg-dim">{item.texto}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
