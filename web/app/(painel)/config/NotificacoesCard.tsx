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

function base64ParaUint8Array(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type EstadoSistema = "carregando" | "sem-https" | "sem-suporte" | "bloqueada" | "desligada" | "ativa";

/** Preferências de notificações neste dispositivo: banner, som, contador na aba e alertas do sistema. */
export function NotificacoesCard({ aoResumir }: { aoResumir: AoResumir }) {
  const [prefs, setPrefs] = useState<PrefsNotificacao>(PREFS_PADRAO);
  const [estadoSistema, setEstadoSistema] = useState<EstadoSistema>("carregando");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [ativandoSistema, setAtivandoSistema] = useState(false);

  useEffect(() => {
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
    const ativos = [prefs.toast, prefs.som, prefs.tituloAba, prefs.alertaSistema].filter(Boolean).length;
    aoResumir(
      "notificacoes",
      ativos > 0
        ? { texto: prefs.som ? "som + banner" : "ativas", tom: "ok" }
        : { texto: "silenciadas" },
    );
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
      setFeedback("Alertas do sistema desativados neste navegador.");
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
        setFeedback("Permissão negada no navegador. Libere notificações nas configurações do site (cadeado na barra de endereço).");
        return;
      }

      setPrefs(salvarPrefsNotificacao({ alertaSistema: true }));
      setEstadoSistema("ativa");

      // Se houver Service Worker + VAPID configurado no servidor, inscreve também Web Push em segundo plano.
      if ("serviceWorker" in navigator) {
        const cfg = (await fetch("/api/push", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({}))) as { vapidPublicKey?: string };
        if (cfg.vapidPublicKey) {
          const reg = await navigator.serviceWorker.ready;
          const appServerKey = base64ParaUint8Array(cfg.vapidPublicKey);
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appServerKey.buffer as ArrayBuffer,
          });
          const json = sub.toJSON();
          await fetch("/api/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
          });
          setFeedback("Alertas do sistema e Web Push ativados neste dispositivo.");
          return;
        }
      }
      setFeedback("Alertas do sistema ativados neste navegador (enquanto a aba estiver aberta).");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Não foi possível ativar os alertas do sistema.");
    } finally {
      setAtivandoSistema(false);
    }
  }

  function testarAgora() {
    setFeedback(null);
    dispararTesteNotificacao();
    if (!prefs.som && !prefs.toast && !prefs.alertaSistema) {
      setFeedback("Todos os alertas estão desligados. Ligue som ou banner acima para testar.");
    } else {
      setFeedback("Alerta de teste enviado (canto inferior direito + som, se ligado).");
    }
  }

  return (
    <Card
      id="notificacoes"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Alertas do painel"
      icone={<Icone nome="bell" />}
      acoes={
        <Badge variant={prefs.som || prefs.toast || prefs.alertaSistema ? "ok" : "neutral"} dot={prefs.som || prefs.toast || prefs.alertaSistema}>
          {prefs.som || prefs.toast || prefs.alertaSistema ? "Ativas" : "Silenciadas"}
        </Badge>
      }
      rodape={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-[12.5px] text-fg-faint">
            {feedback ?? "Salvo automaticamente neste navegador."}
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
              <p className="text-[13px] font-medium text-fg">Som ao receber mensagem</p>
              <p className="text-[12px] text-fg-dim">Toca um toque discreto no navegador (funciona em HTTP e HTTPS).</p>
            </div>
            <Toggle checked={prefs.som} onChange={(v) => mudarPref("som", v)} aria-label="Som ao receber mensagem" />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-4 px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-fg">Contador na aba do navegador</p>
              <p className="text-[12px] text-fg-dim">Exibe a quantidade de alertas não lidos no título da aba, ex.: (3) WACrew.</p>
            </div>
            <Toggle checked={prefs.tituloAba} onChange={(v) => mudarPref("tituloAba", v)} aria-label="Contador na aba do navegador" />
          </label>
        </div>

        <div className="rounded-control border border-line bg-surface-2/60 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-medium text-fg">Notificações do sistema (Windows, Mac ou celular)</p>
              {estadoSistema === "ativa" && <Badge variant="ok" dot>Ativas</Badge>}
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
                {prefs.alertaSistema ? "Desativar" : "Ativar alertas do sistema"}
              </Button>
            )}
          </div>

          {estadoSistema === "sem-https" ? (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-dim">
              Este painel está aberto por <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11.5px] text-fg">http://</code>.
              Por segurança, os navegadores bloqueiam notificações do sistema operacional e Web Push fora de{" "}
              <strong className="font-medium text-fg">HTTPS</strong> (ou <code className="font-mono text-[11.5px]">localhost</code>).
              Para receber alertas fora da aba, acesse por um endereço HTTPS (ex.: Tailscale HTTPS ou domínio com SSL). Os 3 alertas acima já funcionam normalmente aqui.
            </p>
          ) : estadoSistema === "bloqueada" ? (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-dim">
              Você bloqueou notificações para este endereço no navegador. Clique no ícone de cadeado na barra de endereço para liberar e tente novamente.
            </p>
          ) : estadoSistema === "sem-suporte" ? (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-dim">
              Este navegador não oferece a API de notificações do sistema. Use o banner e o som acima.
            </p>
          ) : (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-dim">
              Dispara um popup nativo do sistema operacional mesmo quando você estiver em outra aba ou janela.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
