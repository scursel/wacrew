"use client";

import { useEffect, useState } from "react";
import { mensagemDe, pedirJson, useCarregar } from "@/app/components/pedirJson";
import { haQuanto } from "@/app/components/tempo";
import { Button, Card, Field, Icone } from "@/app/components/ui";
import { instanteLongo } from "@/lib/formatar-data";
import { lerMinutos } from "@/lib/minutos";
import { CampoMinutos, Carregando, FalhaAoCarregar, RodapeSalvar, useSalvar } from "./partes";
import { ANCORA_CARD, type AoResumir } from "./secoes";

interface Reconciliador {
  intervaloMin?: number;
  status?: {
    ultimaExecucao?: string | null;
    chatsVerificados?: number;
    pedidosBackfill?: number;
  } | null;
}

/** Intervalo do reconciliador: confere nomes de grupo e busca buracos de histórico de tempos em tempos. */
export function SincronizacaoCard({ aoResumir }: { aoResumir: AoResumir }) {
  const { dados, erro, recarregar } = useCarregar<Reconciliador>("/api/reconciler");
  const [salvo, setSalvo] = useState("15");
  const [intervalo, setIntervalo] = useState("15");
  const [invalido, setInvalido] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [feedbackAgora, setFeedbackAgora] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const salvar = useSalvar();

  useEffect(() => {
    if (!dados) return;
    const v = String(dados.intervaloMin ?? 15);
    setSalvo(v);
    setIntervalo(v);
  }, [dados]);

  useEffect(() => {
    aoResumir("sincronizacao", { texto: `${salvo} min` });
  }, [aoResumir, salvo]);

  async function aoSalvar() {
    const lido = lerMinutos(intervalo);
    if (!lido.ok) {
      setInvalido(lido.erro);
      return;
    }
    setInvalido(null);
    const ok = await salvar.rodar(() => pedirJson("/api/reconciler", { corpo: { intervaloMin: lido.valor } }));
    if (ok) {
      setSalvo(String(lido.valor));
      setIntervalo(String(lido.valor));
    }
  }

  async function sincronizarAgora() {
    setSincronizando(true);
    setFeedbackAgora(null);
    try {
      await pedirJson("/api/reconciler", { corpo: { acao: "agora" } });
      setFeedbackAgora({ tom: "ok", texto: "Sincronização iniciada." });
      await recarregar();
    } catch (e) {
      setFeedbackAgora({ tom: "erro", texto: mensagemDe(e) });
    } finally {
      setSincronizando(false);
    }
  }

  const ultima = dados?.status?.ultimaExecucao ?? null;
  const chats = dados?.status?.chatsVerificados;
  const backfill = dados?.status?.pedidosBackfill;
  const info = !dados ? null : ultima ? (
    <span title={instanteLongo(ultima)}>
      Última execução {haQuanto(ultima)}
      {typeof chats === "number" && (
        <>
          {" · "}
          <span className="font-mono tabular-nums">{chats}</span> chats
        </>
      )}
      {typeof backfill === "number" && (
        <>
          {" · "}
          <span className="font-mono tabular-nums">{backfill}</span> backfill
        </>
      )}
    </span>
  ) : (
    "Ainda não rodou"
  );

  return (
    <Card
      id="sincronizacao"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Sincronização automática"
      icone={<Icone nome="refresh" />}
      acoes={
        dados ? (
          <Button type="button" size="sm" variant="subtle" loading={sincronizando} onClick={() => void sincronizarAgora()}>
            <Icone nome="refresh" tamanho={14} />
            Sincronizar agora
          </Button>
        ) : undefined
      }
      rodape={
        dados ? (
          <RodapeSalvar info={info} estado={salvar.estado} erro={salvar.erro} alterado={intervalo !== salvo} aoSalvar={() => void aoSalvar()} />
        ) : undefined
      }
    >
      {erro ? (
        <FalhaAoCarregar erro={erro} aoTentar={() => void recarregar()} />
      ) : !dados ? (
        <Carregando linhas={2} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <p className="max-w-[56ch] min-w-0 flex-1 basis-[320px] text-[13.5px] leading-relaxed text-fg-dim">
              De tempos em tempos o coletor confere os nomes dos grupos e busca buracos no histórico, direto do WhatsApp. Use
              Sincronizar agora para rodar fora de hora.
            </p>
            <Field label="Intervalo" htmlFor="sync-intervalo" error={invalido ?? undefined} className="w-44">
              <CampoMinutos
                id="sync-intervalo"
                valor={intervalo}
                aoMudar={(v) => {
                  setIntervalo(v);
                  setInvalido(null);
                }}
                invalido={Boolean(invalido)}
              />
            </Field>
          </div>
          {feedbackAgora && (
            <p aria-live="polite" className={feedbackAgora.tom === "ok" ? "text-[12.5px] text-ok" : "text-[12.5px] text-danger"}>
              {feedbackAgora.texto}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
