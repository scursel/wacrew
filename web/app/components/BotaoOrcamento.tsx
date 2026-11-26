"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const OFFSET_BRT_MS = 3 * 60 * 60 * 1000;

/** "12 nov" no fuso de Brasília. */
function diaCurto(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) - OFFSET_BRT_MS);
  return Number.isNaN(d.getTime()) ? "" : `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

interface Estado {
  total: number;
  ultimo: string | null;
  manual: boolean;
}

/**
 * Orçamentos do chat e o botão de marcar/desmarcar à mão. Na tabela (compacto)
 * vem com os números do servidor; no painel da conversa busca sozinho.
 */
export function BotaoOrcamento({
  slug,
  total,
  ultimo,
  compacto = false,
  aoMudar,
}: {
  slug: string;
  total?: number;
  ultimo?: string | null;
  compacto?: boolean;
  aoMudar?: () => void;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado | null>(total === undefined ? null : { total, ultimo: ultimo ?? null, manual: false });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (total !== undefined) {
      setEstado((e) => ({ total, ultimo: ultimo ?? null, manual: e?.manual ?? false }));
      return;
    }
    let vivo = true;
    fetch(`/api/orcamentos?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Estado | null) => {
        if (vivo && j) setEstado({ total: j.total, ultimo: j.ultimo, manual: j.manual });
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [slug, total, ultimo]);

  async function marcar(marcado: boolean) {
    setSalvando(true);
    setErro("");
    try {
      const r = await fetch("/api/orcamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, marcado }),
      });
      const j = (await r.json()) as Estado & { error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setEstado({ total: j.total, ultimo: j.ultimo, manual: j.manual });
      aoMudar?.();
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não salvou");
    } finally {
      setSalvando(false);
    }
  }

  const n = estado?.total ?? 0;

  if (compacto) {
    if (n > 0) {
      return (
        <span className="font-mono tabular-nums text-fg" title={`Último orçamento em ${diaCurto(estado?.ultimo ?? null)}`}>
          {n}
          <span className="ml-1.5 text-fg-faint">{diaCurto(estado?.ultimo ?? null)}</span>
        </span>
      );
    }
    return (
      <Button variant="ghost" size="sm" className="-ml-2.5" loading={salvando} onClick={() => marcar(true)} title="Marcar que este chat recebeu orçamento">
        + Orçamento
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <p className="text-[13px] text-fg-dim">
        {estado === null
          ? "Carregando…"
          : n > 0
            ? `${n} orçamento${n > 1 ? "s" : ""} enviado${n > 1 ? "s" : ""} · último em ${diaCurto(estado.ultimo)}`
            : "Nenhum orçamento enviado ainda."}
      </p>
      <div>
        {n > 0 ? (
          <Button variant="ghost" size="sm" className="-ml-2.5" loading={salvando} onClick={() => marcar(false)}>
            Desmarcar orçamento
          </Button>
        ) : (
          <Button variant="subtle" size="sm" loading={salvando} onClick={() => marcar(true)}>
            Orçamento enviado
          </Button>
        )}
      </div>
      {erro && <p className="text-[12px] text-danger">{erro}</p>}
    </div>
  );
}
