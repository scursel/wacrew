"use client";

import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui";

interface Resumo {
  texto: string;
  em: string;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "26 nov, 15:40" no fuso de Brasília. */
function quando(iso: string): string {
  const d = new Date(Date.parse(iso) - 3 * 60 * 60 * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}, ${hh}:${mm}`;
}

/**
 * Resumo fixo da conversa. Mostra o guardado (feito de carona na pré-seleção de
 * departamento) e só chama a IA de novo quando o operador clica em Atualizar.
 */
export function ResumoConversa({ slug }: { slug: string }) {
  const [resumo, setResumo] = useState<Resumo | null | undefined>(undefined);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    setResumo(undefined);
    setErro("");
    fetch(`/api/resumo-conversa?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { resumo?: Resumo | null } | null) => {
        if (vivo) setResumo(j?.resumo ?? null);
      })
      .catch(() => {
        if (vivo) setResumo(null);
      });
    return () => {
      vivo = false;
    };
  }, [slug]);

  async function atualizar() {
    setGerando(true);
    setErro("");
    try {
      const r = await fetch("/api/resumo-conversa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const j = (await r.json()) as { resumo?: Resumo; error?: string };
      if (!r.ok || !j.resumo) throw new Error(j.error ?? `HTTP ${r.status}`);
      setResumo(j.resumo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não resumiu");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      {resumo === undefined ? (
        <p className="text-[13px] text-fg-faint">Carregando…</p>
      ) : resumo ? (
        <>
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-fg">{resumo.texto}</p>
          <p className="text-[12px] text-fg-faint">Resumo de {quando(resumo.em)}</p>
        </>
      ) : (
        <p className="text-[13px] text-fg-dim">Sem resumo ainda.</p>
      )}
      <div>
        <Button variant="ghost" size="sm" className="-ml-2.5" loading={gerando} onClick={atualizar}>
          {resumo ? "Atualizar" : "Gerar resumo"}
        </Button>
      </div>
      {erro && <p className="text-[12px] text-danger">{erro}</p>}
    </div>
  );
}
