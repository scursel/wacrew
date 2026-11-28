"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tipoPeloSlug } from "@/lib/aparencia";
import { quandoCurto } from "@/lib/caixa";
import type { GroupSummary } from "@/lib/data";
import type {
  EstadoSistemaNotificacao,
  EventoEntregaCru,
  NotificacaoItem,
} from "@/lib/notificacoes";
import {
  contextoSeguroParaPush,
  EVENTO_PREFS_NOTIFICACAO,
  EVENTO_TESTE_NOTIFICACAO,
  lerPrefsNotificacao,
  PREFS_PADRAO,
  type PrefsNotificacao,
  salvarPrefsNotificacao,
  tocarSomNotificacao,
} from "@/lib/notificacoes-prefs";
import { useRotas } from "./RotasPainel";
import { useTempoReal } from "./TempoRealProvider";
import { haQuanto } from "./tempo";
import { Avatar } from "./ui/Avatar";
import { Icone } from "./ui/Icone";

export type GroupMeta = Pick<GroupSummary, "slug" | "name" | "avatarPath" | "muted">;

type AbaFiltro = "todas" | "mensagens" | "sistema";

const CHAVE_VISTO_EM = "balcao:notificacoes:vistoEm";
const MAX_ITENS = 40;
const TOAST_MS = 5_000;

const TYPE_LABEL: Record<string, string> = {
  audio: "áudio",
  image: "imagem",
  video: "vídeo",
  gif: "GIF",
  document: "documento",
  sticker: "figurinha",
  location: "localização",
  contact: "contato",
  poll: "enquete",
  event: "evento",
};

function previaMensagem(r: { text?: string | null; type?: string | null }): string {
  const body = r.text?.trim() ?? "";
  if (body) return body.length > 120 ? `${body.slice(0, 117)}…` : body;
  if (r.type && r.type !== "text") return `[${TYPE_LABEL[r.type] ?? r.type}]`;
  return "[mensagem]";
}

function normalizarEstado(estado?: string | null, motivo?: string | null): EstadoSistemaNotificacao | null {
  const e = (estado ?? "").trim().toLowerCase();
  const m = (motivo ?? "").trim().toLowerCase();
  if (e === "falhou" || e === "falha" || m === "falha") return "falhou";
  if (e === "interrompida" || e === "interrompido") return "interrompida";
  if (e === "entregue") return "entregue";
  if (e === "entregando") return "entregando";
  if (e === "enfileirada" || e === "enfileirado" || e === "agendado" || e === "agendada") {
    return "enfileirada";
  }
  if (e === "cancelada" || e === "cancelado") return "cancelada";
  return null;
}

function textoEntrega(estado: EstadoSistemaNotificacao, previa?: string | null): string {
  const limpa = previa?.trim() ?? "";
  const curta = limpa.length > 90 ? `${limpa.slice(0, 87)}…` : limpa;
  switch (estado) {
    case "entregue":
      return curta ? `IA respondeu na conversa: ${curta}` : "IA respondeu na conversa";
    case "interrompida":
      return "Entrega da IA interrompida (nova mensagem ou envio manual)";
    case "enfileirada":
    case "entregando":
      return "IA preparando resposta humanizada...";
    case "falhou":
      return "Falha ao entregar resposta da IA";
    case "cancelada":
      return "Entrega da IA cancelada";
  }
}

function tempoNotificacao(iso: string): string {
  const rel = haQuanto(iso);
  if (rel && rel !== "—" && !rel.includes("dia")) return rel;
  return quandoCurto(iso, Date.now()) || rel;
}

export function Notificacoes({ groups }: { groups: GroupMeta[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const rotas = useRotas();
  const tempoReal = useTempoReal();

  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<AbaFiltro>("todas");
  const [itens, setItens] = useState<NotificacaoItem[]>([]);
  const [vistoEm, setVistoEm] = useState<string>("");
  const [prefs, setPrefs] = useState<PrefsNotificacao>(PREFS_PADRAO);
  const [avisoPermissao, setAvisoPermissao] = useState<string | null>(null);
  const [rotuloSO, setRotuloSO] = useState("Alerta no navegador");
  const [toast, setToast] = useState<NotificacaoItem | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const plat = navigator.platform || "";
    if (/Mac/i.test(plat) || /Macintosh|Mac OS/i.test(ua)) setRotuloSO("Alerta no Mac");
    else if (/Win/i.test(plat) || /Windows/i.test(ua)) setRotuloSO("Alerta no Windows");
    else if (/Linux/i.test(plat) || /Linux/i.test(ua)) setRotuloSO("Alerta no Linux");
    else setRotuloSO("Alerta no navegador");
  }, []);

  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const porSlug = useMemo(() => new Map(groups.map((g) => [g.slug, g])), [groups]);
  const porSlugRef = useRef(porSlug);
  porSlugRef.current = porSlug;

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const tituloBaseRef = useRef<string | null>(null);

  const salvarVisto = useCallback((iso: string) => {
    setVistoEm(iso);
    try {
      window.localStorage.setItem(CHAVE_VISTO_EM, iso);
    } catch {
      /* navegador sem localStorage */
    }
  }, []);

  const marcarTodasComoLidas = useCallback(() => {
    const maisRecente = itens[0]?.timestamp;
    const agoraIso = new Date().toISOString();
    const novoVisto = maisRecente && maisRecente > agoraIso ? maisRecente : agoraIso;
    salvarVisto(novoVisto);
  }, [itens, salvarVisto]);

  useEffect(() => {
    try {
      const salvoVisto = window.localStorage.getItem(CHAVE_VISTO_EM);
      if (salvoVisto) setVistoEm(salvoVisto);
      setPrefs(lerPrefsNotificacao());
    } catch {
      /* ignora */
    }
    const aoMudarPrefs = (ev: Event) => {
      const detalhe = (ev as CustomEvent<PrefsNotificacao>).detail;
      setPrefs(detalhe ?? lerPrefsNotificacao());
    };
    window.addEventListener(EVENTO_PREFS_NOTIFICACAO, aoMudarPrefs);
    return () => window.removeEventListener(EVENTO_PREFS_NOTIFICACAO, aoMudarPrefs);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const dispararAlertaNavegador = useCallback(
    (item: NotificacaoItem) => {
      if (!prefsRef.current.alertaSistema) return;
      if (typeof window === "undefined" || typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;
      try {
        const titulo =
          item.tipo === "mensagem"
            ? `${item.chatNome}${item.remetente && item.remetente !== item.chatNome ? ` · ${item.remetente}` : ""}`
            : `${item.chatNome} · Sistema`;
        const n = new Notification(titulo, {
          body: item.texto,
          tag: `balcao-${item.slug}`,
        });
        n.onclick = () => {
          window.focus();
          if (item.slug) router.push(rotas.chat(item.slug));
          n.close();
        };
      } catch {
        /* Notification bloqueada pelo contexto */
      }
    },
    [rotas, router],
  );

  // Teste disparado pela tela de Configurações (mostra banner + toca som + dispara alerta nativo se ativo).
  useEffect(() => {
    const aoTestar = () => {
      const exemplo: NotificacaoItem = {
        id: `teste:${Date.now()}`,
        tipo: "sistema",
        slug: "",
        chatNome: "Teste de notificação",
        remetente: "WACrew",
        texto: "As notificações no painel estão funcionando.",
        timestamp: new Date().toISOString(),
        estado: "entregue",
      };
      if (prefsRef.current.toast) setToast(exemplo);
      if (prefsRef.current.som) tocarSomNotificacao();
      dispararAlertaNavegador(exemplo);
    };
    window.addEventListener(EVENTO_TESTE_NOTIFICACAO, aoTestar);
    return () => window.removeEventListener(EVENTO_TESTE_NOTIFICACAO, aoTestar);
  }, [dispararAlertaNavegador]);

  const chatEstaAberto = useCallback(
    (slug: string): boolean => {
      const atual = pathnameRef.current || "";
      if (atual === rotas.chat(slug) || atual === `/g/${slug}`) return true;
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get("chat") === slug) return true;
      }
      return false;
    },
    [rotas],
  );

  useEffect(() => {
    let cancelado = false;
    fetch("/api/notificacoes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((dados: { itens?: NotificacaoItem[] } | null) => {
        if (cancelado || !dados || !Array.isArray(dados.itens)) return;
        setItens((atuais) => {
          const porId = new Map<string, NotificacaoItem>();
          for (const it of [...atuais, ...dados.itens!]) {
            if (!porId.has(it.id)) porId.set(it.id, it);
          }
          return [...porId.values()]
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
            .slice(0, MAX_ITENS);
        });
      })
      .catch(() => {});

    const processarMensagem = (msg: {
      id?: string;
      slug?: string;
      group?: string;
      senderName?: string;
      fromMe?: boolean;
      origem?: string;
      ator?: string;
      type?: string;
      text?: string;
      timestamp?: string;
    }) => {
      if (msg.fromMe && msg.origem === "coletor" && msg.ator !== "painel") return;
      const slug = msg.slug?.trim();
      if (!slug) return;
      const meta = porSlugRef.current.get(slug);
      if (meta?.muted) return;
      const chatNome = meta?.name || msg.group?.trim() || slug;
      const timestamp = msg.timestamp || new Date().toISOString();

      if (!msg.fromMe) {
        const novo: NotificacaoItem = {
          id: msg.id || `msg:${slug}:${timestamp}`,
          tipo: "mensagem",
          slug,
          chatNome,
          remetente: msg.senderName?.trim() || chatNome,
          texto: previaMensagem(msg),
          timestamp,
        };
        setItens((atuais) => {
          const filtrados = atuais.filter((i) => i.id !== novo.id);
          return [novo, ...filtrados].slice(0, MAX_ITENS);
        });
        if (!chatEstaAberto(slug)) {
          if (prefsRef.current.toast) setToast(novo);
          if (prefsRef.current.som) tocarSomNotificacao();
          dispararAlertaNavegador(novo);
        }
      } else if (msg.origem === "ia_meta" || msg.origem === "ia") {
        const novo: NotificacaoItem = {
          id: `ia:${msg.id || `${slug}:${timestamp}`}`,
          tipo: "sistema",
          slug,
          chatNome,
          remetente: "IA",
          texto: textoEntrega("entregue", msg.text),
          timestamp,
          estado: "entregue",
        };
        setItens((atuais) => {
          const filtrados = atuais.filter((i) => i.id !== novo.id);
          return [novo, ...filtrados].slice(0, MAX_ITENS);
        });
      }
    };

    const processarEntrega = (raw: EventoEntregaCru) => {
      const slug = raw.slug?.trim();
      if (!slug) return;
      const meta = porSlugRef.current.get(slug);
      if (meta?.muted) return;
      const estado = normalizarEstado(raw.estado, raw.motivo);
      if (!estado) return;
      const chatNome = meta?.name || raw.chatNome?.trim() || slug;
      const timestamp = raw.ts?.trim() || raw.timestamp?.trim() || new Date().toISOString();
      const previa =
        raw.texto?.trim() ||
        raw.previa?.trim() ||
        (Array.isArray(raw.baloes) ? raw.baloes.join(" ") : "");
      const ticketId = raw.ticket?.trim() || raw.id?.trim() || `${slug}:${timestamp}:${estado}`;
      const novo: NotificacaoItem = {
        id: `entrega:${ticketId}`,
        tipo: "sistema",
        slug,
        chatNome,
        remetente: "IA",
        texto: textoEntrega(estado, previa),
        timestamp,
        estado,
      };
      setItens((atuais) => {
        const filtrados = atuais.filter((i) => i.id !== novo.id);
        return [novo, ...filtrados].slice(0, MAX_ITENS);
      });
      if (
        estado === "entregue" ||
        estado === "interrompida" ||
        estado === "falhou" ||
        estado === "entregando"
      ) {
        if (prefsRef.current.toast) setToast(novo);
        if (estado === "interrompida" || estado === "falhou") {
          if (prefsRef.current.som) tocarSomNotificacao();
          dispararAlertaNavegador(novo);
        }
      }
    };

    if (tempoReal) {
      const unsub = tempoReal.assinar((ev) => {
        if (ev.tipo === "message") processarMensagem(ev.data as Parameters<typeof processarMensagem>[0]);
        else if (ev.tipo === "entrega") processarEntrega(ev.data as EventoEntregaCru);
      });
      return () => {
        cancelado = true;
        unsub();
      };
    }

    if (typeof EventSource === "undefined") return () => {};
    const es = new EventSource("/api/events?todos=1&ocultar=coletor");

    es.onmessage = (ev) => {
      try {
        processarMensagem(JSON.parse(ev.data) as Parameters<typeof processarMensagem>[0]);
      } catch {
        /* ignora frame malformado */
      }
    };

    const onEntrega = (ev: Event) => {
      try {
        processarEntrega(JSON.parse((ev as MessageEvent).data) as EventoEntregaCru);
      } catch {
        /* ignora */
      }
    };

    es.addEventListener("entrega", onEntrega);
    return () => {
      cancelado = true;
      es.removeEventListener("entrega", onEntrega);
      es.close();
    };
  }, [chatEstaAberto, dispararAlertaNavegador, tempoReal]);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setAberto(false);
        gatilhoRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (gatilhoRef.current?.contains(alvo)) return;
      if (painelRef.current && !painelRef.current.contains(alvo)) {
        setAberto(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [aberto]);

  const naoLidas = useMemo(
    () => itens.filter((i) => !vistoEm || i.timestamp > vistoEm).length,
    [itens, vistoEm],
  );

  // Mantém o contador `(N)` no título da aba quando habilitado.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const limpo = document.title.replace(/^\(\d+\+?\)\s*/, "");
    if (!tituloBaseRef.current || limpo !== tituloBaseRef.current) {
      tituloBaseRef.current = limpo;
    }
    const base = tituloBaseRef.current || "WACrew";
    if (prefs.tituloAba && naoLidas > 0) {
      document.title = `(${naoLidas > 99 ? "99+" : naoLidas}) ${base}`;
    } else {
      document.title = base;
    }
  }, [naoLidas, prefs.tituloAba, pathname]);

  const itensFiltrados = useMemo(() => {
    if (aba === "mensagens") return itens.filter((i) => i.tipo === "mensagem");
    if (aba === "sistema") return itens.filter((i) => i.tipo === "sistema");
    return itens;
  }, [aba, itens]);

  const alternarPainel = useCallback(() => {
    setAberto((atual) => !atual);
    setAvisoPermissao(null);
  }, []);

  const alternarSom = useCallback(() => {
    const proximo = salvarPrefsNotificacao({ som: !prefs.som });
    setPrefs(proximo);
    if (proximo.som) tocarSomNotificacao();
  }, [prefs.som]);

  const alternarAlertaNativo = useCallback(async () => {
    setAvisoPermissao(null);
    if (prefs.alertaSistema) {
      setPrefs(salvarPrefsNotificacao({ alertaSistema: false }));
      return;
    }
    if (typeof window === "undefined") return;
    if (!contextoSeguroParaPush()) {
      setAvisoPermissao("Alertas do sistema exigem HTTPS (ex.: Tailscale HTTPS). Som e banner no painel já funcionam aqui.");
      return;
    }
    if (typeof Notification === "undefined") {
      setAvisoPermissao("Este navegador não oferece alertas do sistema.");
      return;
    }
    try {
      const perm =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      const ativo = perm === "granted";
      setPrefs(salvarPrefsNotificacao({ alertaSistema: ativo }));
      if (!ativo) {
        setAvisoPermissao("Permissão bloqueada no navegador. Libere nas configurações do site (ícone de cadeado).");
      }
    } catch {
      setAvisoPermissao("Não foi possível solicitar permissão de notificação neste navegador.");
    }
  }, [prefs.alertaSistema]);

  const abrirChat = useCallback(
    (slug: string) => {
      setAberto(false);
      setToast((t) => (t?.slug === slug ? null : t));
      if (slug) router.push(rotas.chat(slug));
    },
    [rotas, router],
  );

  return (
    <div className="relative">
      <button
        ref={gatilhoRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        onClick={alternarPainel}
        title={naoLidas > 0 ? `Notificações (${naoLidas} ${naoLidas === 1 ? "nova" : "novas"})` : "Notificações"}
        aria-label={naoLidas > 0 ? `Notificações, ${naoLidas} ${naoLidas === 1 ? "não lida" : "não lidas"}` : "Notificações"}
        className={`relative grid h-[38px] w-[38px] place-items-center rounded-[9px] transition-colors ${
          aberto
            ? "bg-accent-soft text-accent"
            : "text-fg-faint hover:bg-elevated hover:text-fg"
        }`}
      >
        <Icone nome="bell" tamanho={18} />
        {naoLidas > 0 && (
          <span className="absolute -right-1 -top-0.5 min-w-[18px] rounded-full bg-danger px-[5px] text-center font-mono text-[10px] font-semibold leading-[17px] text-on-ink shadow-[0_0_0_2px_var(--color-rail)]">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div
          ref={painelRef}
          role="dialog"
          aria-label="Notificações"
          className="pop-in fixed bottom-3 left-[64px] z-50 flex max-h-[min(520px,calc(100dvh-24px))] w-[360px] flex-col overflow-hidden rounded-[12px] border border-line bg-surface [box-shadow:var(--float)] max-[860px]:inset-x-3 max-[860px]:bottom-[62px] max-[860px]:left-3 max-[860px]:w-auto"
        >
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-semibold text-fg">Notificações</span>
              {itens.length > 0 && (
                <span className="mono rounded-full bg-elevated px-1.5 py-0.5 text-[11px] text-fg-faint">
                  {itens.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <a
                href="/config#notificacoes"
                onClick={() => setAberto(false)}
                className="rounded-[6px] px-2 py-1 text-[11.5px] font-medium text-fg-faint transition-colors hover:bg-elevated hover:text-fg"
              >
                Configurar
              </a>
              <button
                type="button"
                onClick={marcarTodasComoLidas}
                className="rounded-[6px] px-2 py-1 text-[11.5px] font-medium text-accent transition-colors hover:bg-accent-soft"
              >
                Ler todas
              </button>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar notificações"
                className="grid h-6 w-6 place-items-center rounded-[6px] text-fg-faint hover:bg-elevated hover:text-fg"
              >
                <Icone nome="x" tamanho={14} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 px-2.5 py-1.5">
            <div className="flex items-center gap-1" role="tablist" aria-label="Filtrar notificações">
              {(
                [
                  { id: "todas", rotulo: "Todas" },
                  { id: "mensagens", rotulo: "Mensagens" },
                  { id: "sistema", rotulo: "Sistema" },
                ] as const
              ).map((t) => {
                const ativa = aba === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={ativa}
                    onClick={() => setAba(t.id)}
                    className={`rounded-[6px] px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                      ativa
                        ? "bg-surface text-fg shadow-xs"
                        : "text-fg-faint hover:text-fg"
                    }`}
                  >
                    {t.rotulo}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                role="switch"
                aria-checked={prefs.som}
                onClick={alternarSom}
                title={prefs.som ? "Som ligado (clique para silenciar)" : "Som silenciado (clique para ligar)"}
                className={`flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] font-medium transition-colors ${
                  prefs.som
                    ? "bg-accent-soft text-accent"
                    : "text-fg-faint hover:bg-elevated hover:text-fg"
                }`}
              >
                <Icone nome={prefs.som ? "bell" : "mute"} tamanho={12} />
                <span>Som</span>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.alertaSistema}
                onClick={alternarAlertaNativo}
                title={`Disparar notificação nativa (${rotuloSO}) quando chegar mensagem nova`}
                className={`flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] font-medium transition-colors ${
                  prefs.alertaSistema
                    ? "bg-accent-soft text-accent"
                    : "text-fg-faint hover:bg-elevated hover:text-fg"
                }`}
              >
                <span>{rotuloSO.replace("Alerta no ", "")}</span>
              </button>
            </div>
          </div>

          {avisoPermissao && (
            <div className="border-b border-line bg-elevated px-3 py-2 text-[11.5px] leading-snug text-fg-dim">
              {avisoPermissao}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-line">
            {itensFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
                <Icone nome="bell" tamanho={20} className="text-fg-mute" />
                <p className="text-[12.5px] text-fg-faint">Nenhuma notificação recente</p>
              </div>
            ) : (
              itensFiltrados.map((item) => {
                const meta = porSlug.get(item.slug);
                const alertaCritico =
                  item.estado === "interrompida" || item.estado === "falhou";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => abrirChat(item.slug)}
                    className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
                  >
                    {item.tipo === "mensagem" ? (
                      <Avatar
                        nome={item.chatNome}
                        tipo={tipoPeloSlug(item.slug)}
                        fotoUrl={meta?.avatarPath ? rotas.midia(meta.avatarPath) : null}
                        tamanho="sm"
                        className="mt-0.5"
                      />
                    ) : (
                      <span
                        className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border ${
                          alertaCritico
                            ? "border-danger/30 bg-danger-bg text-danger"
                            : "border-accent-line bg-accent-soft text-accent"
                        }`}
                      >
                        <Icone nome={alertaCritico ? "alert" : "spark"} tamanho={14} />
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[12.5px] font-medium text-fg">
                          {item.chatNome}
                        </span>
                        <span className="mono shrink-0 text-[10.5px] text-fg-faint">
                          {tempoNotificacao(item.timestamp)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.35] text-fg-dim">
                        {item.tipo === "mensagem" &&
                        item.remetente &&
                        item.remetente !== item.chatNome ? (
                          <>
                            <span className="font-medium text-fg">{item.remetente}: </span>
                            {item.texto}
                          </>
                        ) : (
                          item.texto
                        )}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pop-in fixed bottom-4 right-4 z-50 flex w-[340px] max-w-[calc(100vw-32px)] items-start gap-2.5 rounded-[12px] border border-line bg-surface p-3 [box-shadow:var(--float)] max-[860px]:bottom-[68px]"
        >
          <button
            type="button"
            onClick={() => abrirChat(toast.slug)}
            className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
          >
            {toast.tipo === "mensagem" ? (
              <Avatar
                nome={toast.chatNome}
                tipo={tipoPeloSlug(toast.slug)}
                fotoUrl={
                  porSlug.get(toast.slug)?.avatarPath
                    ? rotas.midia(porSlug.get(toast.slug)!.avatarPath!)
                    : null
                }
                tamanho="sm"
                className="mt-0.5"
              />
            ) : (
              <span
                className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border ${
                  toast.estado === "interrompida" || toast.estado === "falhou"
                    ? "border-danger/30 bg-danger-bg text-danger"
                    : "border-accent-line bg-accent-soft text-accent"
                }`}
              >
                <Icone
                  nome={
                    toast.estado === "interrompida" || toast.estado === "falhou"
                      ? "alert"
                      : "spark"
                  }
                  tamanho={14}
                />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[12.5px] font-semibold text-fg">
                  {toast.chatNome}
                </span>
                <span className="mono text-[10px] text-fg-faint">agora</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.35] text-fg-dim">
                {toast.tipo === "mensagem" &&
                toast.remetente &&
                toast.remetente !== toast.chatNome
                  ? `${toast.remetente}: ${toast.texto}`
                  : toast.texto}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Fechar alerta"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-fg-faint hover:bg-elevated hover:text-fg"
          >
            <Icone nome="x" tamanho={14} />
          </button>
        </div>
      )}
    </div>
  );
}
