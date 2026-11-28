"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CabecalhoPagina, Card, CorpoPagina, Grade12, Icone, type NomeIcone } from "@/app/components/ui";
import { GruposCard } from "../GruposCard";
import type { IdSecao, Resumo } from "../secoes";
import { SincronizacaoCard } from "../SincronizacaoCard";
import { TimeCard } from "../TimeCard";

/**
 * Gestão de grupos: tudo que define como o WACrew acompanha os grupos de WhatsApp —
 * quais grupos são capturados, quem é do time e de quanto em quanto o histórico é conferido.
 */
export function GestaoGruposView() {
  const [resumos, setResumos] = useState<Partial<Record<IdSecao, Resumo>>>({});
  const resumir = useCallback((id: IdSecao, r: Resumo) => {
    setResumos((prev) => (prev[id]?.texto === r.texto && prev[id]?.tom === r.tom ? prev : { ...prev, [id]: r }));
  }, []);

  // Link direto para um card (/config/grupos#time, ou o antigo /config#time que vem para cá):
  // rola ao abrir e de novo quando os cards terminam de carregar, porque os de cima crescem.
  // Para assim que a pessoa rola por conta própria.
  const rolagem = useRef<HTMLDivElement>(null);
  const seguirAncora = useRef(true);
  const carregados = Object.keys(resumos).length;
  useEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    const parar = () => {
      seguirAncora.current = false;
    };
    el.addEventListener("wheel", parar, { passive: true });
    el.addEventListener("touchmove", parar, { passive: true });
    el.addEventListener("keydown", parar);
    return () => {
      el.removeEventListener("wheel", parar);
      el.removeEventListener("touchmove", parar);
      el.removeEventListener("keydown", parar);
    };
  }, []);
  useEffect(() => {
    if (!seguirAncora.current) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const quadro = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(quadro);
  }, [carregados]);

  return (
    <>
      <CabecalhoPagina
        variante="barra"
        titulo="Gestão de grupos"
        subtitulo={<span className="max-[860px]:hidden">Quais grupos acompanhar, quem é do time e a sincronização</span>}
        acoes={
          <Link
            href="/config"
            className="focus-ring inline-flex h-8 items-center gap-1 rounded-control px-2.5 text-[13px] text-fg-dim transition-colors hover:bg-elevated hover:text-fg"
          >
            <Icone nome="chev-l" tamanho={14} />
            Configurações
          </Link>
        }
      />
      <CorpoPagina ref={rolagem}>
        <div className="min-[1021px]:max-w-[960px]">
          <Grade12>
            <ComoFunciona resumos={resumos} />
            <GruposCard aoResumir={resumir} />
            <TimeCard aoResumir={resumir} />
            <SincronizacaoCard aoResumir={resumir} />
          </Grade12>
        </div>
      </CorpoPagina>
    </>
  );
}

const PASSOS: Array<{ id: IdSecao; icone: NomeIcone; titulo: string; texto: string; rotuloResumo: (t: string) => string }> = [
  {
    id: "grupos",
    icone: "users",
    titulo: "Escolha os grupos",
    texto: "Só os grupos monitorados têm as mensagens capturadas. Grupo novo começa desligado. Tags ajudam a filtrar.",
    rotuloResumo: (t) => `${t} monitorados`,
  },
  {
    id: "time",
    icone: "user",
    titulo: "Marque o seu time",
    texto: "Quando a última mensagem é de alguém do time, o grupo sai de cliente esperando. Nos resumos, a fala dele conta como de vocês.",
    rotuloResumo: (t) => (t === "1" ? "1 pessoa no time" : `${t} pessoas no time`),
  },
  {
    id: "sincronizacao",
    icone: "refresh",
    titulo: "Deixe sincronizar",
    texto: "De tempos em tempos o coletor confere o nome dos grupos e busca no WhatsApp as mensagens que faltaram.",
    rotuloResumo: (t) => `a cada ${t}`,
  },
];

/** Explicação curta da funcionalidade, com o estado atual de cada passo. */
function ComoFunciona({ resumos }: { resumos: Partial<Record<IdSecao, Resumo>> }) {
  return (
    <Card id="como-funciona" largura="inteiro" titulo="Como funciona" icone={<Icone nome="spark" />}>
      <p className="max-w-[72ch] text-[13.5px] leading-relaxed text-fg-dim">
        O WACrew acompanha os grupos de WhatsApp onde você atende clientes. Em cada grupo monitorado, o coletor guarda as
        mensagens (texto, áudio e mídia), separa o que o cliente disse do que o seu time respondeu e mostra na Caixa quem
        está esperando resposta.
      </p>
      <ol className="mt-4 grid grid-cols-3 gap-3 max-[860px]:grid-cols-1">
        {PASSOS.map((p, i) => {
          const resumo = resumos[p.id]?.texto;
          return (
            <li key={p.id} className="flex flex-col gap-1.5 rounded-control border border-line bg-bg p-3.5">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-elevated font-mono text-[11.5px] tabular-nums text-fg-dim">
                  {i + 1}
                </span>
                <a href={`#${p.id}`} className="focus-ring rounded-tag text-[13.5px] font-medium text-fg hover:underline">
                  {p.titulo}
                </a>
              </div>
              <p className="text-[12.5px] leading-relaxed text-fg-dim">{p.texto}</p>
              {resumo && (
                <p className="mt-auto flex items-center gap-1.5 pt-1 text-[12px] text-fg-faint">
                  <Icone nome={p.icone} tamanho={12} />
                  {p.rotuloResumo(resumo)}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-[12.5px] text-fg-faint">
        O aviso de quem ficou sem resposta por muito tempo é o{" "}
        <Link href="/config#radar" className="text-accent underline-offset-2 hover:underline">
          Radar
        </Link>
        , que vale para grupos e conversas diretas.
      </p>
    </Card>
  );
}
