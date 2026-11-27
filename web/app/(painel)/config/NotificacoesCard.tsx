"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Icone, Toggle } from "@/app/components/ui";
import {
  contextoSeguroParaPush,
  dispararTesteNotificacao,
  EVENTO_PREFS_NOTIFICACAO,
  lerPrefsNotificacao,
  PREFS_PADRAO,
  type PrefsNotificacao,
  salvarPrefsNotificacao,
  tocarSomNotificacao,
} from "@/lib/notificacoes-prefs";
import { ANCORA_CARD, type AoResumir } from "./secoes";

type EstadoSistema = "carregando" | "sem-https" | "sem-suporte" | "bloqueada" | "desligada" | "ativa";

function resumoPrefs(prefs: PrefsNotificacao): { texto: string; tom?: "ok" } {
  const partes: string[] = [];
  if (prefs.toast) partes.push("banner");
  if (prefs.som) partes.push("som");
  if (prefs.tituloAba) partes.push("aba");
  if (prefs.alertaSistema) partes.push("nativo");
  if (partes.length === 0) return { texto: "silenciadas" };
  if (partes.length === 4) return { texto: "todas", tom: "ok" };
  return { texto: partes.join(" + "), tom: "ok" };
}

/** Preferências de notificações neste dispositivo: banner, som, contador na aba e alertas do sistema. */
export function NotificacoesCard({ aoResumir }: { aoResumir: AoResumir }) {
  const [prefs, setPrefs] = useState<PrefsNotificacao>(PREFS_PADRAO);
  const [estadoSistema, setEstadoSistema] = useState<EstadoSistema>("carregando");
  const [feedback, setFeedback] = useState<{ tom: "ok" | "erro" | "info"; texto: string } | null>(null);
  const [ativandoSistema, setAtivandoSistema] = useState(false);
  const [origemAtual, setOrigemAtual] = useState("");

  useEffect(() => {
    setOrigemAtual(window.location.origin);
    const atualizar = () => {
      const p = lerPrefsNotificacao();
      setPrefs(p);
      if (typeof window === "undefined") return;
      if (!contextoSeguroParaPush()) {
        setEstadoSistema("sem-https");
      } else if (typeof Notification === "undefined") {
        setEstadoSistema("sem-suporte");
      } else if (Notification.permission === "denied") {
        setEstadoSistema("bloqueada");
      } else if (Notification.permission === "granted" && p.alertaSistema) {
        setEstadoSistema("ativa");
      } else {
        setEstadoSistema("desligada");
      }
    };
    atualizar();
    window.addEventListener(EVENTO_PREFS_NOTIFICACAO, atualizar);
    return () => window.removeEventListener(EVENTO_PREFS_NOTIFICACAO, atualizar);
  }, []);

  useEffect(() => {
    aoResumir("notificacoes", resumoPrefs(prefs));
  }, [aoResumir, prefs]);

  function mudarPref<K extends keyof PrefsNotificacao>(chave: K, valor: PrefsNotificacao[K]) {
    setFeedback(null);
    const proximo = salvarPrefsNotificacao({ [chave]: valor });
    setPrefs(proximo);
    if (chave === "som" && valor) {
      tocarSomNotificacao();
    }
  }

  async function alternarSistema() {
    setFeedback(null);
    if (prefs.alertaSistema) {
      setPrefs(salvarPrefsNotificacao({ alertaSistema: false }));
      setEstadoSistema("desligada");
      setFeedback({ tom: "ok", texto: "Alertas nativos desativados neste navegador." });
      return;
    }
    if (!contextoSeguroParaPush()) {
      setEstadoSistema("sem-https");
      return;
    }
    if (typeof Notification === "undefined") {
      setEstadoSistema("sem-suporte");
      return;
    }
    setAtivandoSistema(true);
    try {
      const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (perm !== "granted") {
        setEstadoSistema(perm === "denied" ? "bloqueada" : "desligada");
        setFeedback({
          tom: "erro",
          texto: "Permissão negada no navegador. Libere notificações nas configurações do site (cadeado na barra de endereço).",
        });
        return;
      }

      setPrefs(salvarPrefsNotificacao({ alertaSistema: true }));
      setEstadoSistema("ativa");
      setFeedback({
        tom: "ok",
        texto: "Alertas nativos ativados neste navegador (mesmo em outra aba ou janela).",
      });
    } catch (err) {
      setFeedback({
        tom: "erro",
        texto: err instanceof Error ? err.message : "Não foi possível ativar os alertas nativos.",
      });
    } finally {
      setAtivandoSistema(false);
    }
  }

  function testarAgora() {
    setFeedback(null);
    dispararTesteNotificacao();
    if (!prefs.som && !prefs.toast && !prefs.alertaSistema && !prefs.tituloAba) {
      setFeedback({ tom: "erro", texto: "Todos os alertas estão desligados. Ligue ao menos um acima para testar." });
    } else {
      setFeedback({ tom: "ok", texto: "Alerta de teste enviado (banner, som e nativo, conforme o que estiver ligado)." });
    }
  }

  const algumaAtiva = prefs.som || prefs.toast || prefs.alertaSistema || prefs.tituloAba;

  return (
    <Card
      id="notificacoes"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Alertas do painel"
      icone={<Icone nome="bell" />}
      acoes={
        <Badge variant={algumaAtiva ? "ok" : "neutral"} dot={algumaAtiva}>
          {algumaAtiva ? resumoPrefs(prefs).texto : "Silenciadas"}
        </Badge>
      }
      rodape={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span
            aria-live="polite"
            className={
              feedback?.tom === "ok"
                ? "text-[12.5px] text-ok"
                : feedback?.tom === "erro"
                  ? "text-[12.5px] text-danger"
                  : "text-[12.5px] text-fg-dim"
            }
          >
            {feedback?.texto ?? "Salvo automaticamente neste navegador."}
          </span>
          <Button type="button" size="sm" variant="subtle" onClick={testarAgora}>
            <Icone nome="bell" tamanho={14} />
            Testar notificação
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-fg-dim">
          Escolha como este navegador avisa quando chegar mensagem nova de cliente (conversas silenciadas ficam de fora).
        </p>

        <div className="divide-y divide-line rounded-control border border-line bg-surface-2">
          <label className="flex cursor-pointer items-center justify-between gap-4 px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-fg">Banner na tela</p>
              <p className="text-[12px] text-fg-dim">Mostra um cartão no canto inferior direito ao chegar mensagem em outra conversa.</p>
            </div>
            <Toggle checked={prefs.toast} onChange={(v) => mudarPref("toast", v)} aria-label="Banner na tela" />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-4 px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-fg">Som</p>
              <p className="text-[12px] text-fg-dim">Toca um toque discreto no navegador (funciona em HTTP e HTTPS).</p>
            </div>
            <Toggle checked={prefs.som} onChange={(v) => mudarPref("som", v)} aria-label="Som ao receber mensagem" />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-4 px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-fg">Contador na aba</p>
              <p className="text-[12px] text-fg-dim">Exibe a quantidade de alertas não lidos no título da aba, ex.: (3) WACrew.</p>
            </div>
            <Toggle checked={prefs.tituloAba} onChange={(v) => mudarPref("tituloAba", v)} aria-label="Contador na aba do navegador" />
          </label>
        </div>

        <div className="rounded-control border border-line bg-surface-2/60 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-medium text-fg">Notificação nativa do navegador</p>
              {estadoSistema === "ativa" && (
                <Badge variant="ok" dot>
                  Ativas
                </Badge>
              )}
              {estadoSistema === "sem-https" && <Badge variant="neutral">Requer HTTPS</Badge>}
              {estadoSistema === "bloqueada" && <Badge variant="danger">Bloqueadas</Badge>}
            </div>
            {estadoSistema !== "sem-https" && estadoSistema !== "sem-suporte" && estadoSistema !== "carregando" && (
              <Button
                type="button"
                size="sm"
                variant={prefs.alertaSistema ? "ghost" : "subtle"}
                loading={ativandoSistema}
                onClick={() => void alternarSistema()}
              >
                {prefs.alertaSistema ? "Desativar" : "Ativar alertas nativos"}
              </Button>
            )}
          </div>

          {estadoSistema === "sem-https" ? (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-dim">
              Este painel está aberto em{" "}
              <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11.5px] text-fg">{origemAtual || "http://…"}</code>.
              Por segurança, o navegador só libera notificações nativas fora da aba em{" "}
              <strong className="font-medium text-fg">HTTPS</strong> (ou <code className="font-mono text-[11.5px]">localhost</code>).
              Abra o painel por HTTPS (ex.: Tailscale HTTPS) para liberar os alertas nativos; banner, som e contador na aba já
              funcionam aqui.
            </p>
          ) : estadoSistema === "bloqueada" ? (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-dim">
              Você bloqueou notificações para este endereço no navegador. Clique no ícone de cadeado na barra de endereço para liberar e tente novamente.
            </p>
          ) : estadoSistema === "sem-suporte" ? (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-dim">
              Este navegador não oferece a API de notificações. Use o banner, o som e o contador na aba acima.
            </p>
          ) : (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-dim">
              Dispara um popup nativo mesmo quando você estiver em outra aba ou janela (enquanto este navegador estiver aberto).
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
