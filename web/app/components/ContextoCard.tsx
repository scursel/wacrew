"use client";

import { useEffect, useState } from "react";
import type { PainelCliente, Tom } from "@/lib/caixa";
import { EditorEtiquetas } from "./Etiqueta";
import { useRotas } from "./RotasPainel";
import { Avatar, Badge, Etiqueta, Icone } from "./ui";

const VARIANTE: Record<Tom, "ok" | "neutral" | "warn" | "danger"> = { ok: "ok", neutro: "neutral", warn: "warn", danger: "danger" };

/**
 * Topo do painel do cliente: quem é, desde quando, as etiquetas (editáveis) e
 * os sinais do painel que pedem decisão. Evita voltar à lista só para lembrar
 * com quem se está falando.
 */
export function ContextoCard({ dados, onEtiquetas }: { dados: PainelCliente; onEtiquetas?: () => void }) {
  const rotas = useRotas();
  const dono = dados.dono;
  const [etiquetas, setEtiquetas] = useState<string[]>(dono?.etiquetas ?? []);
  const [conhecidas, setConhecidas] = useState<string[]>(dono?.conhecidas ?? []);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (dono) {
      setEtiquetas(dono.etiquetas);
      setConhecidas(dono.conhecidas);
      return;
    }
    if (rotas.modo !== "atendimento") return;
    let alive = true;
    fetch(`/api/atendimento/etiquetas?slug=${encodeURIComponent(dados.slug)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { etiquetas?: string[]; conhecidas?: string[] } | null) => {
        if (!alive || !res) return;
        if (Array.isArray(res.etiquetas)) setEtiquetas(res.etiquetas);
        if (Array.isArray(res.conhecidas)) setConhecidas(res.conhecidas);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [dono, rotas.modo, dados.slug]);

  return (
    <div className="flex flex-col gap-3 border-b border-line p-5">
      <div className="flex items-center gap-3">
        <Avatar nome={dados.nome} tipo={dados.tipo} fotoUrl={dados.avatarPath ? rotas.midia(dados.avatarPath) : null} tamanho="md" ampliavel />
        <div className="min-w-0">
          <b className="block truncate text-[15px] font-semibold leading-snug text-fg">{dados.nome}</b>
          <small className="block text-[12.5px] text-fg-faint">{dados.desde ?? (dados.tipo === "dm" ? "conversa direta" : "grupo")}</small>
        </div>
      </div>
      {(dono || rotas.modo === "atendimento") && (
        <div className="relative flex flex-wrap items-center gap-1">
          {etiquetas.map((e) => (
            <Etiqueta key={e} nome={e} />
          ))}
          <button
            type="button"
            onClick={() => setEditando((v) => !v)}
            aria-expanded={editando}
            className="inline-flex h-[22px] items-center gap-1 rounded-full border border-dashed border-line-2 px-2 text-[12px] text-fg-faint transition-colors hover:border-fg-mute hover:text-fg"
          >
            <Icone nome="plus" tamanho={12} />
            {etiquetas.length === 0 ? "Etiqueta" : <span className="sr-only">Editar etiquetas</span>}
          </button>
          {dono?.sinais.map((s) => (
            <span key={s.id} title={s.explicacao}>
              <Badge variant={VARIANTE[s.tom]}>{s.texto}</Badge>
            </span>
          ))}
          {editando && (
            <EditorEtiquetas
              slug={dados.slug}
              atuais={etiquetas}
              conhecidas={conhecidas}
              modoAtendimento={rotas.modo === "atendimento"}
              onSalvo={(lista) => {
                setEtiquetas(lista);
                onEtiquetas?.();
              }}
              onFechar={() => setEditando(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
