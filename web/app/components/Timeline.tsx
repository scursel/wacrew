"use client";

import { useRouter } from "next/navigation";
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AvisoEntrega,
  autoria,
  blocosDaConversa,
  chaveDia,
  type EventoEntrega,
  ligarEntregas,
  rotuloDia,
  ultimoGroupJid,
} from "@/lib/caixa";
import type { MessageView } from "@/lib/data";
import { fundirMensagens, mesclarCaudaMensagens } from "@/lib/dm-irmaos";
import { type EventoAuditoriaView, filtrarEventos, textoEventoAuditoria } from "@/lib/eventos-atribuicao";
import type { PresencaAgente } from "@/lib/equipe/presenca-interna";
import { instanteLongo } from "@/lib/formatar-data";
import type { NotaInterna } from "@/lib/notas-internas";
import { frasePresencaEquipe } from "@/lib/presenca-equipe";
import type { ResultadoBuscaMensagem } from "@/lib/busca-mensagens";
import type { UltimoAtendimento } from "@/lib/ultimo-atendimento";
import { casaBusca } from "@/lib/busca";
import { contactsFromMessages } from "@/lib/chat-contacts";
import { Bubble } from "./chat/Bubble";
import { Composer, type MembroEquipeInterna, type ParticipanteGrupo, type ReplyTarget } from "./chat/Composer";
import { numberFromJid } from "./chat/format";
import { liberarSugestao, SuggestionCard } from "./chat/SuggestionCard";
import { PresenceLine } from "./PresenceLine";
import { checarSessao, useRotas } from "./RotasPainel";
import { useTempoReal } from "./TempoRealProvider";
import { Avatar, Button, CampoBusca, IconButton, Segmentado, cn, Icone } from "./ui";

function SeparadorDia({ iso, agora }: { iso: string; agora: number }) {
  return (
    <div className="mb-1 mt-6 flex items-center gap-3 font-mono text-[11px] font-medium leading-none text-fg-faint before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
      {rotuloDia(iso, agora)}
    </div>
  );
}

/** Aviso da fila de envio (entrega interrompida ou cancelada), como linha de sistema. */
function AvisoLine({ aviso }: { aviso: AvisoEntrega }) {
  return (
    <div
      className="mt-4 inline-flex max-w-full items-center gap-2 self-center rounded-full border border-line bg-surface px-3 py-1.5 text-center text-[12.5px] text-fg-dim"
      title={instanteLongo(aviso.ts)}
    >
      <Icone nome="alert" tamanho={14} className="shrink-0 text-warn" />
      {aviso.texto}
    </div>
  );
}

function EventoAuditoriaLine({ evento }: { evento: EventoAuditoriaView }) {
  const daIA = evento.tipo === "sugestao";
  return (
    <div
      className={cn(
        "mt-3 inline-flex max-w-full items-center gap-1.5 self-center rounded-full bg-surface-2 px-3 py-1 text-center text-[11.5px]",
        daIA ? "text-id-ia" : "text-fg-faint",
      )}
      title={instanteLongo(evento.ts)}
    >
      <Icone nome={daIA ? "spark" : "history"} tamanho={12} className="shrink-0" />
      <span>{textoEventoAuditoria(evento)}</span>
      <span className="font-mono text-[10.5px] opacity-80">{evento.ts.slice(11, 16)}</span>
    </div>
  );
}

function NotaLine({ nota }: { nota: NotaInterna }) {
  const partes = nota.texto.split(/(@[a-z0-9._-]{2,32})/gi);
  return (
    <div
      className="mt-4 flex max-w-[82%] flex-col self-end rounded-[12px] border border-warn/40 bg-warn-bg px-3.5 py-2.5 text-[13.5px] text-fg [box-shadow:var(--shadow-xs)]"
      title={instanteLongo(nota.timestamp)}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-warn">
        <Icone nome="lock" tamanho={12} />
        <span>Nota privada</span>
        <span className="text-fg-dim">· {nota.autorNome}</span>
        <span className="ml-auto font-mono font-normal text-fg-faint">{nota.timestamp.slice(11, 16)}</span>
      </div>
      <p className="whitespace-pre-wrap break-words leading-[1.45]">
        {partes.map((p, i) =>
          p.startsWith("@") && p.length > 2 ? (
            <strong key={`${i}-${p}`} className="rounded bg-warn/15 px-1 font-semibold text-warn">
              {p}
            </strong>
          ) : (
            <Fragment key={`${i}-${p}`}>{p}</Fragment>
          ),
        )}
      </p>
    </div>
  );
}

/** Chamada vira uma linha de sistema no meio da conversa, não um balão. */
function CallLine({ m }: { m: MessageView }) {
  const call = m.call;
  if (!call) return null;
  const kind = call.isVideo ? "Chamada de vídeo" : "Chamada de voz";
  const outcomeLabel: Record<string, string> = {
    missed: "perdida",
    accepted: "atendida",
    rejected: "recusada",
    ongoing: "em andamento",
  };
  const outcome = outcomeLabel[call.outcome] ?? call.outcome;
  const missed = call.outcome === "missed";
  const who = m.senderName && m.senderName !== "desconhecido" ? ` de ${m.senderName}` : "";
  return (
    <div
      className="mt-4 inline-flex items-center gap-2 self-center rounded-full border border-line bg-surface px-3 py-1.5 text-center text-[12.5px] text-fg-dim"
      title={instanteLongo(m.timestamp)}
    >
      <Icone nome={call.isVideo ? "video" : "call"} tamanho={14} className={missed ? "text-danger" : "text-fg-faint"} />
      {kind}
      {who} {outcome}
    </div>
  );
}

// Tempo que a MINHA última mensagem precisa ficar sem resposta para sugerir acompanhamento.
// (Espelha COPILOT_FOLLOWUP_AFTER_MIN do servidor; a rota revalida.)
const FOLLOWUP_AFTER_MS = 60 * 60_000;

const ROTULO_TIPO: Record<string, string> = {
  audio: "Áudio",
  image: "Imagem",
  video: "Vídeo",
  gif: "GIF",
  document: "Documento",
  sticker: "Figurinha",
};

function ObservacaoAtendimento({ atendimento }: { atendimento: UltimoAtendimento }) {
  return (
    <aside
      aria-label="Último atendimento"
      className="my-2 rounded-lg border border-accent-line bg-accent-soft px-3 py-2 text-[12px] leading-relaxed text-fg"
    >
      <p className="font-semibold">Conversa reaberta pelo cliente</p>
      <p className="break-words text-fg-dim">
        Último atendimento por <strong className="font-medium text-fg">{atendimento.atendente || "responsável não identificado"}</strong>
        {" · Resolvido em "}
        <time dateTime={atendimento.resolvidoEm}>{instanteLongo(atendimento.resolvidoEm)}</time>
      </p>
    </aside>
  );
}

export interface CabecalhoConversa {
  avatarPath: string | null;
  tipo: "grupo" | "dm";
  /** Quantas pessoas (fora a própria conta) escreveram na conversa. */
  pessoas: number;
  /** Ações à direita: modo de envio, silenciar, resolver, painel. */
  acoes?: ReactNode;
}

export function Timeline({
  slug,
  groupName,
  messages: initial,
  ultimoAtendimentoInicial = null,
  total,
  agoraInicial,
  donoLogin = null,
  cabecalho,
  draft,
  onPedirResumo,
  lastSeenInicial = null,
  participantes,
  atendenteNome = null,
  departamentoNome = null,
  acoesComposer,
}: {
  slug: string;
  groupName: string;
  messages: MessageView[];
  ultimoAtendimentoInicial?: UltimoAtendimento | null;
  /** Total real do chat (a lista inicial é só a janela final, paginada). */
  total?: number;
  /** Relógio do servidor, para "hoje"/"ontem" saírem iguais no servidor e no navegador. */
  agoraInicial: number;
  /** Login do dono no painel: separa "você pelo painel" de alguém da equipe. */
  donoLogin?: string | null;
  cabecalho: CabecalhoConversa;
  /** Rascunho do copiloto do painel para o compositor. */
  draft?: { text: string; nonce: number } | null;
  /** Dispara a geração de um novo resumo no painel lateral (menu de IA do compositor). */
  onPedirResumo?: () => void;
  lastSeenInicial?: string | null;
  participantes?: ParticipanteGrupo[];
  atendenteNome?: string | null;
  departamentoNome?: string | null;
  /** Ações rápidas (Assumir atendimento / Resolver) exibidas junto à caixa de mensagem. */
  acoesComposer?: ReactNode;
}) {
  const [messages, setMessages] = useState<MessageView[]>(initial);
  const [ultimoAtendimento, setUltimoAtendimento] = useState(ultimoAtendimentoInicial);
  useEffect(() => setUltimoAtendimento(ultimoAtendimentoInicial), [ultimoAtendimentoInicial]);
  const [totalCount, setTotalCount] = useState(total ?? initial.length);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [buscandoHistorico, setBuscandoHistorico] = useState(false);
  const [avisoHistorico, setAvisoHistorico] = useState<string | null>(null);
  // Há mais histórico acima? (some quando uma paginação volta vazia ou incompleta)
  const [hasMore, setHasMore] = useState((total ?? initial.length) > initial.length);
  const [teamIds, setTeamIds] = useState<Set<string>>(new Set());
  const [copilotOn, setCopilotOn] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [mediaFilter, setMediaFilter] = useState("all");
  const [filtroAberto, setFiltroAberto] = useState(false);
  // Pedido explícito de rascunho ("Responder com IA" no menu do compositor): funciona mesmo com copiloto desligado.
  const [pedidoRascunho, setPedidoRascunho] = useState<{ id: string; n: number; manual: boolean } | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [forwardMsg, setForwardMsg] = useState<MessageView | null>(null);
  const [droppedFiles, setDroppedFiles] = useState<{ files: File[]; nonce: number } | null>(null);
  const [failedMsgs, setFailedMsgs] = useState<
    Array<{ id: string; text: string; quotedId?: string; mentions?: string[]; error: string; retrying?: boolean }>
  >([]);
  const [unreadCutoff] = useState<string | null>(lastSeenInicial);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [buscaTexto, setBuscaTexto] = useState("");
  const [buscaResultados, setBuscaResultados] = useState<ResultadoBuscaMensagem[]>([]);
  const [buscaCarregando, setBuscaCarregando] = useState(false);
  const [notasInternas, setNotasInternas] = useState<NotaInterna[]>([]);
  const [eventosAuditoria, setEventosAuditoria] = useState<EventoAuditoriaView[]>([]);
  const [equipeInterna, setEquipeInterna] = useState<MembroEquipeInterna[]>([]);
  const [outrosAgentes, setOutrosAgentes] = useState<PresencaAgente[]>([]);
  const [isTypingLocal, setIsTypingLocal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const rotas = useRotas();
  const tempoReal = useTempoReal();

  const filterOptions = useMemo(() => {
    const order = ["audio", "image", "video", "gif", "document", "sticker"] as const;
    const present = new Set(messages.map((m) => m.type));
    return [{ valor: "all", rotulo: "Tudo" }, ...order.filter((t) => present.has(t)).map((t) => ({ valor: t, rotulo: ROTULO_TIPO[t] ?? t }))];
  }, [messages]);

  const shown = useMemo(
    () => (mediaFilter === "all" ? messages : messages.filter((m) => m.type === mediaFilter)),
    [messages, mediaFilter],
  );

  // Preso ao fim: enquanto a pessoa não sobe, o que cresce (imagem, áudio, mensagem nova) mantém o fim à vista.
  // Só um gesto da pessoa (roda, toque, tecla) solta o fim; a rolagem que o próprio
  // conteúdo provoca ao crescer não conta.
  const presoNoFim = useRef(true);
  const ultimoGesto = useRef(0);
  const conteudoRef = useRef<HTMLDivElement>(null);
  const marcarGesto = useCallback(() => {
    ultimoGesto.current = Date.now();
  }, []);

  // Pagina o histórico para cima (como no WhatsApp), preservando a posição.
  const loadOlder = useCallback(async () => {
    const first = messages.find((m) => m.type !== "call");
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = checarSessao(
        await fetch(rotas.mensagens(slug, { before: first.id, limit: 150 }), { cache: "no-store" }),
        rotas,
      );
      if (!res.ok) return;
      const older = (await res.json()) as MessageView[];
      const n = older.filter((m) => m.type !== "call").length;
      if (n === 0) {
        setHasMore(false);
        return;
      }
      const el = scrollRef.current;
      const prevHeight = el?.scrollHeight ?? 0;
      setMessages((cur) => fundirMensagens([older, cur]));
      // Página cheia = ainda pode haver mais no disco (ex.: bloco que o WhatsApp acabou de devolver).
      setHasMore(n >= 150);
      // Reancora a rolagem depois que o bloco novo pintar acima.
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - prevHeight;
      });
    } catch {
      /* rede ou reinício: tenta de novo no próximo clique */
    } finally {
      setLoadingOlder(false);
    }
  }, [messages, slug, loadingOlder, rotas]);

  const buscarMaisAntigasWhatsApp = useCallback(async () => {
    const first = messages.find((m) => m.type !== "call");
    if (!first || buscandoHistorico || rotas.modo !== "dono") return;
    setBuscandoHistorico(true);
    setAvisoHistorico(null);
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          jid: first.groupJid || ultimoGroupJid(messages) || undefined,
          anchor: {
            id: first.id,
            timestampMs: Date.parse(first.timestamp),
            fromMe: Boolean(first.fromMe),
            sender: first.sender,
          },
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setAvisoHistorico(data?.error ? String(data.error) : "Não deu pra pedir o histórico agora.");
        return;
      }
      setAvisoHistorico(
        "Pedido enviado ao WhatsApp — se houver mais histórico no celular, aparece em instantes",
      );
      // O celular devolve o bloco com atraso; tenta puxar sem perder a rolagem.
      window.setTimeout(() => {
        void loadOlder();
      }, 3000);
      window.setTimeout(() => {
        void loadOlder();
      }, 8000);
    } catch {
      setAvisoHistorico("Não deu pra pedir o histórico agora.");
    } finally {
      setBuscandoHistorico(false);
    }
  }, [messages, buscandoHistorico, rotas.modo, slug, loadOlder]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distancia = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distancia < 200) presoNoFim.current = true;
    else if (Date.now() - ultimoGesto.current < 1500) presoNoFim.current = false;
    setShowJump(distancia > 400);
    if (el.scrollTop < 120 && hasMore && !loadingOlder && mediaFilter === "all") {
      void loadOlder();
    }
  }, [hasMore, loadingOlder, mediaFilter, loadOlder]);

  const jumpToBottom = useCallback(() => {
    presoNoFim.current = true;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  // Ids do carregamento inicial: só anima a entrada do que chegar depois.
  const initialIds = useRef(new Set(initial.map((m) => m.id)));

  // Quem é do time (para marcar e separar de cliente).
  useEffect(() => {
    if (!rotas.recursos.time) return;
    fetch("/api/team", { cache: "no-store" })
      .then((r) => r.json())
      .then((cs: Array<{ id: string; ids?: string[]; role: string }>) =>
        setTeamIds(new Set(cs.filter((c) => c.role === "team").flatMap((c) => c.ids ?? [c.id]))),
      )
      .catch(() => {});
  }, [rotas]);

  // Copiloto ligado neste chat: sem ele, nenhum rascunho é pedido.
  useEffect(() => {
    let alive = true;
    setCopilotOn(false);
    if (!rotas.recursos.copiloto) return;
    const ler = () =>
      fetch("/api/triage", { cache: "no-store" })
        .then((r) => r.json())
        .then((t: { copilot?: Record<string, boolean> }) => {
          if (alive) setCopilotOn(Boolean(t.copilot?.[slug]));
        })
        .catch(() => {});
    void ler();
    // O painel do cliente liga e desliga o copiloto: acompanha sem recarregar.
    window.addEventListener("copiloto:mudou", ler);
    return () => {
      alive = false;
      window.removeEventListener("copiloto:mudou", ler);
    };
  }, [slug, rotas]);

  // Marca a conversa como vista ao abrir e atualiza a fila (zera as não lidas).
  useEffect(() => {
    const v = rotas.visto(slug, new Date().toISOString());
    fetch(v.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v.body),
    })
      .then((r) => {
        checarSessao(r, rotas);
        router.refresh();
      })
      .catch(() => {});
  }, [slug, router, rotas]);

  // Mapa de id → nome (de quem já mandou mensagem) e os ids que são "você".
  // Também amarra o LID do quotedSender ao autor da msg citada — sem isso a
  // barra de citação mostra o número do LID em vez de "você"/nome do contato.
  const contacts = useMemo(
    () => contactsFromMessages(messages, teamIds),
    [messages, teamIds],
  );

  // Entregas da IA nesta conversa (só no painel do dono): numeram os balões e avisam o que não saiu.
  const [eventos, setEventos] = useState<EventoEntrega[]>([]);
  const primeiraTs = messages[0]?.timestamp ?? "";
  useEffect(() => {
    if (rotas.modo !== "dono") return;
    let vivo = true;
    // Uma hora antes da primeira mensagem carregada: pega a entrega que começou um pouco antes.
    const desde = primeiraTs ? new Date(Date.parse(primeiraTs) - 3_600_000).toISOString() : "";
    const ler = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/entregas/historico?slug=${encodeURIComponent(slug)}&desde=${encodeURIComponent(desde)}`, { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as { eventos?: EventoEntrega[] };
        if (vivo) setEventos(d.eventos ?? []);
      } catch {
        /* painel reiniciando: fica o que já havia */
      }
    };
    void ler();
    const id = setInterval(ler, 10_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [slug, rotas, primeiraTs]);

  // Relógio da tela: começa no do servidor (sem diferença na hidratação) e anda a cada minuto,
  // para "hoje"/"ontem" virarem e o acompanhamento amadurecer sem recarregar.
  const [agora, setAgora] = useState(agoraInicial);
  useEffect(() => {
    setAgora(Date.now());
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Alvo do rascunho:
  //  - pedido explícito ("Responder com IA") funciona sempre, mesmo com copiloto desligado;
  //  - automático (com copiloto ligado): última recebida ou última minha parada há >= FOLLOWUP_AFTER_MS.
  const suggest = useMemo<{ id: string; followup: boolean; manual: boolean } | null>(() => {
    if (pedidoRascunho?.manual) {
      const alvo = messages.find((m) => m.id === pedidoRascunho.id);
      if (alvo) return { id: alvo.id, followup: Boolean(alvo.fromMe), manual: true };
    }
    if (!copilotOn) return null;
    const last = [...messages].reverse().find((m) => m.type !== "call");
    if (!last) return null;
    if (pedidoRascunho?.id === last.id) return { id: last.id, followup: Boolean(last.fromMe), manual: true };
    if (!last.fromMe) return { id: last.id, followup: false, manual: false };
    const ageMs = agora - new Date(last.timestamp).getTime();
    if (ageMs < FOLLOWUP_AFTER_MS) return null;
    return { id: last.id, followup: true, manual: false };
  }, [messages, copilotOn, agora, pedidoRascunho]);

  const pedirRascunho = useCallback(() => {
    const last = [...messages].reverse().find((m) => m.type !== "call");
    if (!last) return;
    liberarSugestao(last.id);
    setPedidoRascunho((p) => ({ id: last.id, n: (p?.n ?? 0) + 1, manual: true }));
  }, [messages]);

  // Busca mensagens novas a cada 3 s (a tela atualiza sozinha). Só mexe no estado
  // quando a resposta muda de verdade: compara o corpo cru antes de parsear.
  const lastBodyRef = useRef<string>("");
  const poll = useCallback(async () => {
    try {
      const res = checarSessao(await fetch(rotas.mensagens(slug, { incluirUltimoAtendimento: true }), { cache: "no-store" }), rotas);
      if (!res.ok) return;
      const body = await res.text();
      if (body === lastBodyRef.current) return;
      const { messages: tail, ultimoAtendimento: atendimento } = JSON.parse(body) as {
        messages: MessageView[];
        ultimoAtendimento: UltimoAtendimento | null;
      };
      if (!Array.isArray(tail)) return;
      lastBodyRef.current = body;
      setUltimoAtendimento(atendimento);
      // Preserva o histórico paginado acima e troca só a cauda (o que veio agora, por id).
      // Cauda vazia não zera a tela (fusão transitória / reinício).
      setMessages((cur) => {
        const next = mesclarCaudaMensagens(cur, tail);
        setTotalCount((t) => Math.max(t, next.length));
        return next;
      });
    } catch {
      /* coletor ou painel reiniciando */
    }
  }, [slug, rotas]);

  // Responder assume a conversa no servidor: além das mensagens, refaz a página para o cabeçalho
  // (responsável e departamento) mostrar o estado novo.
  const aoEnviar = useCallback(() => {
    void poll();
    router.refresh();
  }, [poll, router]);

  useEffect(() => {
    const intervalo = tempoReal?.ativo ? 30_000 : 3000;
    const id = setInterval(poll, intervalo);
    return () => clearInterval(id);
  }, [poll, tempoReal?.ativo]);

  const carregarColaboracao = useCallback(async () => {
    try {
      const [resNotas, resAud] = await Promise.all([
        fetch(`/api/atendimento/notas-internas?slug=${encodeURIComponent(slug)}`, { cache: "no-store" }),
        fetch(`/api/atendimento/atribuicao?slug=${encodeURIComponent(slug)}`, { cache: "no-store" }),
      ]);
      if (resNotas.ok) {
        const d = (await resNotas.json()) as { notas?: NotaInterna[]; equipe?: MembroEquipeInterna[] };
        if (Array.isArray(d.notas)) setNotasInternas(d.notas);
        if (Array.isArray(d.equipe)) setEquipeInterna(d.equipe);
      }
      if (resAud.ok) {
        const d = (await resAud.json()) as { eventos?: EventoAuditoriaView[] };
        if (Array.isArray(d.eventos)) setEventosAuditoria(d.eventos);
      }
    } catch {
      /* ignora erro transitório */
    }
  }, [slug]);

  useEffect(() => {
    void carregarColaboracao();
    const id = setInterval(() => void carregarColaboracao(), 20_000);
    return () => clearInterval(id);
  }, [carregarColaboracao]);

  useEffect(() => {
    let alive = true;
    const enviarPresenca = (estado: "vendo" | "digitando") => {
      fetch("/api/atendimento/presenca-interna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, estado }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { outros?: PresencaAgente[] } | null) => {
          if (alive && Array.isArray(d?.outros)) setOutrosAgentes(d.outros);
        })
        .catch(() => {});
    };
    enviarPresenca(isTypingLocal ? "digitando" : "vendo");
    const id = setInterval(() => enviarPresenca(isTypingLocal ? "digitando" : "vendo"), 6000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [slug, isTypingLocal]);

  useEffect(() => {
    return () => {
      fetch("/api/atendimento/presenca-interna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, estado: "saindo" }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [slug]);

  useEffect(() => {
    if (!tempoReal) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = tempoReal.assinar((ev) => {
      if (ev.slug !== slug) return;
      if (ev.tipo === "message" || ev.tipo === "reaction" || ev.tipo === "receipt" || ev.tipo === "edit" || ev.tipo === "delete") {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void poll(), 120);
      } else if (ev.tipo === "atribuicao") {
        void carregarColaboracao();
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [tempoReal, slug, poll, carregarColaboracao]);

  // Atalho ⌘F / Ctrl+F para busca na conversa.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setBuscaAberta(true);
      } else if (e.key === "Escape" && buscaAberta) {
        setBuscaAberta(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [buscaAberta]);

  useEffect(() => {
    const q = buscaTexto.trim();
    if (!buscaAberta || q.length < 2) {
      setBuscaResultados([]);
      return;
    }
    const ac = new AbortController();
    setBuscaCarregando(true);
    const t = setTimeout(() => {
      fetch(rotas.busca(q, slug), { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { resultados?: ResultadoBuscaMensagem[] } | null) => {
          setBuscaResultados(d?.resultados ?? []);
        })
        .catch(() => {})
        .finally(() => setBuscaCarregando(false));
    }, 200);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [buscaAberta, buscaTexto, rotas, slug]);

  // Ao abrir ou trocar de conversa, vai direto para o fim e acompanha o que crescer depois.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rola ao abrir/trocar
  useEffect(() => {
    const el = scrollRef.current;
    const conteudo = conteudoRef.current;
    if (!el || !conteudo) return;
    presoNoFim.current = true;
    el.scrollTop = el.scrollHeight;
    // Observa o conteúdo (imagem que carrega, mensagem nova) e a própria janela
    // (o compositor cresce com o rascunho da IA e encolhe a área da conversa).
    const obs = new ResizeObserver(() => {
      if (presoNoFim.current) el.scrollTop = el.scrollHeight;
    });
    obs.observe(conteudo);
    obs.observe(el);
    return () => obs.disconnect();
  }, [slug]);

  const nomeDe = useCallback(
    (numero: string) => (cabecalho.tipo === "dm" ? groupName : (contacts.names.get(numero) ?? null)),
    [cabecalho.tipo, groupName, contacts],
  );

  const entregas = useMemo(() => ligarEntregas(messages, eventos, agora), [messages, eventos, agora]);

  const eventosVisiveis = useMemo(() => filtrarEventos(eventosAuditoria), [eventosAuditoria]);
  const frasePresenca = useMemo(() => frasePresencaEquipe(outrosAgentes), [outrosAgentes]);

  // Mensagens, avisos da fila, notas privadas e histórico de atribuição em ordem cronológica.
  const itens = useMemo(() => {
    type Item =
      | { tipo: "msg"; m: MessageView }
      | { tipo: "aviso"; a: AvisoEntrega }
      | { tipo: "nota"; n: NotaInterna }
      | { tipo: "evento"; e: EventoAuditoriaView };
    const lista: Item[] = shown.map((m) => ({ tipo: "msg", m }));
    if (mediaFilter !== "all") return lista;
    const inicio = shown[0]?.timestamp ?? "";
    for (const a of entregas.avisos) {
      if (!inicio || a.ts >= inicio) lista.push({ tipo: "aviso", a });
    }
    for (const n of notasInternas) {
      if (!inicio || n.timestamp >= inicio) lista.push({ tipo: "nota", n });
    }
    for (const e of eventosVisiveis) {
      if (e.tipo === "responder") continue;
      if (!inicio || e.ts >= inicio) lista.push({ tipo: "evento", e });
    }
    const ts = (i: Item) =>
      i.tipo === "msg" ? i.m.timestamp : i.tipo === "aviso" ? i.a.ts : i.tipo === "nota" ? i.n.timestamp : i.e.ts;
    return lista.sort((x, y) => ts(x).localeCompare(ts(y)));
  }, [shown, entregas.avisos, notasInternas, eventosVisiveis, mediaFilter]);

  // Quem continua o bloco da mensagem anterior e o rótulo de cada bloco da IA.
  const blocos = useMemo(() => {
    const simples = itens.map((it) => (it.tipo === "msg" ? it : { tipo: "aviso" as const }));
    return blocosDaConversa(simples, entregas.baloes, donoLogin);
  }, [itens, entregas.baloes, donoLogin]);

  const contagem = new Intl.NumberFormat("pt-BR").format(totalCount);
  const filtroAtivo = mediaFilter !== "all";
  const groupJidAtual = ultimoGroupJid(messages);

  const unreadInfo = useMemo(() => {
    if (!unreadCutoff || mediaFilter !== "all") return null;
    const incoming = shown.filter((m) => m.type !== "call" && !m.fromMe && m.timestamp > unreadCutoff);
    if (incoming.length === 0) return null;
    return { firstId: incoming[0]!.id, count: incoming.length };
  }, [shown, unreadCutoff, mediaFilter]);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const jumpToMessage = useCallback(
    async (id: string) => {
      const rolar = () => {
        const container = scrollRef.current;
        if (!container) return false;
        const target = container.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(id)}"]`);
        if (!target) return false;
        presoNoFim.current = false;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedId(id);
        setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 2000);
        return true;
      };
      if (rolar()) return;

      // Carrega janelas anteriores até encontrar a mensagem (limite de 10 páginas).
      let lista = messagesRef.current;
      for (let i = 0; i < 10; i++) {
        const first = lista.find((m) => m.type !== "call");
        if (!first) break;
        try {
          const res = checarSessao(
            await fetch(rotas.mensagens(slug, { before: first.id, limit: 150 }), { cache: "no-store" }),
            rotas,
          );
          if (!res.ok) break;
          const older = (await res.json()) as MessageView[];
          if (older.length === 0) {
            setHasMore(false);
            break;
          }
          lista = fundirMensagens([older, lista]);
          setMessages(lista);
          if (older.filter((m) => m.type !== "call").length < 150) setHasMore(false);
          if (lista.some((m) => m.id === id)) {
            requestAnimationFrame(() => requestAnimationFrame(() => rolar()));
            return;
          }
        } catch {
          break;
        }
      }
    },
    [rotas, slug],
  );

  // Salto automático quando a página abre com ?msg=<id> (ex.: vindo da paleta ⌘K).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const msgId = new URLSearchParams(window.location.search).get("msg");
    if (msgId) void jumpToMessage(msgId);
  }, [jumpToMessage]);

  const handleEdited = useCallback((id: string, novoTexto: string) => {
    setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, text: novoTexto, edited: true } : m)));
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, text: "", mediaPath: null, deleted: true } : m)));
  }, []);

  const retryFailed = useCallback(
    async (item: { id: string; text: string; quotedId?: string; mentions?: string[] }) => {
      const pedido = rotas.enviarTexto(slug, groupJidAtual, item.text, {
        mentions: item.mentions,
        quotedId: item.quotedId,
      });
      if (!pedido) return;
      setFailedMsgs((cur) => cur.map((f) => (f.id === item.id ? { ...f, retrying: true } : f)));
      try {
        const res = checarSessao(
          await fetch(pedido.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pedido.body),
          }),
          rotas,
        );
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "falha no envio");
        setFailedMsgs((cur) => cur.filter((f) => f.id !== item.id));
        setTimeout(aoEnviar, 1000);
      } catch (e) {
        const err = e instanceof Error ? e.message : "erro";
        setFailedMsgs((cur) => cur.map((f) => (f.id === item.id ? { ...f, retrying: false, error: err } : f)));
      }
    },
    [rotas, slug, groupJidAtual, aoEnviar],
  );

  return (
    <>
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-5 max-[860px]:gap-2 max-[860px]:px-3">
        <IconButton
          title="Voltar para a fila"
          aria-label="Voltar para a fila"
          onClick={() => router.push(rotas.caixa)}
          className="-ml-1 min-[861px]:hidden max-[860px]:h-10 max-[860px]:w-10"
        >
          <Icone nome="chev-l" />
        </IconButton>
        <Avatar
          nome={groupName}
          tipo={cabecalho.tipo}
          fotoUrl={cabecalho.avatarPath ? rotas.midia(cabecalho.avatarPath) : null}
          tamanho="md"
          ampliavel
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-semibold leading-tight tracking-[-0.01em] text-fg">{groupName}</h2>
          <div className="truncate text-[12.5px] text-fg-faint">
            {cabecalho.tipo === "dm"
              ? "conversa direta"
              : `grupo · ${cabecalho.pessoas} ${cabecalho.pessoas === 1 ? "pessoa" : "pessoas"}`}
            {" · "}
            <PresenceLine
              slug={slug}
              nomeDe={nomeDe}
              fallback={
                <span>
                  <span className="font-mono tabular-nums">{contagem}</span> {totalCount === 1 ? "mensagem" : "mensagens"}
                </span>
              }
            />
          </div>
        </div>
        <IconButton
          size="sm"
          title="Buscar nesta conversa (⌘F)"
          aria-label="Buscar nesta conversa"
          aria-pressed={buscaAberta}
          active={buscaAberta}
          onClick={() => setBuscaAberta((v) => !v)}
        >
          <Icone nome="search" />
        </IconButton>
        {filterOptions.length > 1 && (
          <IconButton
            size="sm"
            title="Mostrar só um tipo de mídia"
            aria-label="Mostrar só um tipo de mídia"
            aria-pressed={filtroAberto || filtroAtivo}
            active={filtroAberto || filtroAtivo}
            onClick={() => setFiltroAberto((v) => !v)}
            className="max-[860px]:hidden"
          >
            <Icone nome="filter" />
          </IconButton>
        )}
        {cabecalho.acoes}
      </header>

      {buscaAberta && (
        <div className="shrink-0 border-b border-line bg-surface px-5 py-2.5 max-[860px]:px-3">
          <div className="flex items-center gap-2">
            <CampoBusca
              valor={buscaTexto}
              aoMudar={setBuscaTexto}
              placeholder="Buscar mensagens ou transcrições nesta conversa…"
              rotulo="Buscar na conversa"
              className="flex-1"
            />
            <Button type="button" size="sm" variant="ghost" onClick={() => setBuscaAberta(false)}>
              Fechar
            </Button>
          </div>
          {buscaTexto.trim().length >= 2 && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-[8px] border border-line bg-surface-2">
              {buscaCarregando ? (
                <p className="px-3 py-2 text-[12px] text-fg-faint">Buscando…</p>
              ) : buscaResultados.length === 0 ? (
                <p className="px-3 py-2 text-[12px] text-fg-faint">Nenhuma mensagem encontrada.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {buscaResultados.map((r) => (
                    <li key={`${r.source}-${r.id}`}>
                      <button
                        type="button"
                        onClick={() => void jumpToMessage(r.id)}
                        className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-elevated"
                      >
                        <span className="min-w-0 flex-1 truncate text-fg">
                          <strong className="font-medium">{r.senderName}: </strong>
                          {r.trecho}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-fg-faint">
                          {r.source === "transcricao" ? "áudio · " : ""}
                          {r.timestamp.slice(0, 10)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {(filtroAberto || filtroAtivo) && filterOptions.length > 1 && (
        <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-5 py-2 max-[860px]:px-3">
          <Segmentado rotulo="Tipo de mensagem" valor={mediaFilter} aoMudar={setMediaFilter} opcoes={filterOptions} />
        </div>
      )}

      <div
        className="relative flex min-h-0 flex-1 flex-col"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          if (e.dataTransfer.files?.length) {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            setDroppedFiles((d) => ({ files, nonce: (d?.nonce ?? 0) + 1 }));
          }
        }}
      >
        <div
          ref={scrollRef}
          onScroll={onScroll}
          onWheel={marcarGesto}
          onTouchMove={marcarGesto}
          onKeyDown={marcarGesto}
          onPointerDown={marcarGesto}
          className="min-h-0 flex-1 overflow-y-auto bg-bg px-7 pb-7 pt-2 [overflow-anchor:none] max-[860px]:px-4 max-[860px]:pb-5 max-[860px]:pt-1"
        >
          <div ref={conteudoRef} className="mx-auto flex max-w-[720px] flex-col">
            {hasMore && mediaFilter === "all" && shown.length > 0 && (
              <div className="mt-4 flex justify-center">
                <Button variant="ghost" size="sm" onClick={loadOlder} disabled={loadingOlder}>
                  {loadingOlder ? "Carregando…" : (
                    <>
                      Carregar anteriores
                      <span className="font-mono tabular-nums text-fg-faint">{new Intl.NumberFormat("pt-BR").format(Math.max(0, totalCount - messages.length))}</span>
                    </>
                  )}
                </Button>
              </div>
            )}
            {!hasMore && mediaFilter === "all" && shown.length > 0 && rotas.modo === "dono" && (
              <div className="mt-4 flex flex-col items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void buscarMaisAntigasWhatsApp()}
                  disabled={buscandoHistorico}
                >
                  {buscandoHistorico ? "Pedindo ao WhatsApp…" : "Buscar mais antigas no WhatsApp"}
                </Button>
                {avisoHistorico && (
                  <p className="max-w-[28rem] text-center text-[12px] text-fg-faint">{avisoHistorico}</p>
                )}
              </div>
            )}
            {ultimoAtendimento && !shown.some((m) => m.id === ultimoAtendimento.reabertoPorMensagem) && (
              <ObservacaoAtendimento atendimento={ultimoAtendimento} />
            )}
            {shown.length === 0 && notasInternas.length === 0 && eventosVisiveis.length === 0 ? (
              <p className="mt-16 text-center text-[13.5px] text-fg-faint">
                {mediaFilter === "all" ? "Nenhuma mensagem capturada ainda nesta conversa." : "Nada deste tipo nas mensagens carregadas."}
              </p>
            ) : (
              itens.map((item, i) => {
                const tsOf = (x: typeof item) =>
                  x.tipo === "msg" ? x.m.timestamp : x.tipo === "aviso" ? x.a.ts : x.tipo === "nota" ? x.n.timestamp : x.e.ts;
                const anterior = itens[i - 1];
                const tsAnterior = anterior ? tsOf(anterior) : null;
                const ts = tsOf(item);
                const novoDia = !tsAnterior || chaveDia(tsAnterior) !== chaveDia(ts);
                if (item.tipo === "aviso") {
                  return (
                    <Fragment key={`aviso-${item.a.ticket}`}>
                      {novoDia && <SeparadorDia iso={ts} agora={agora} />}
                      <AvisoLine aviso={item.a} />
                    </Fragment>
                  );
                }
                if (item.tipo === "nota") {
                  return (
                    <Fragment key={item.n.id}>
                      {novoDia && <SeparadorDia iso={ts} agora={agora} />}
                      <NotaLine nota={item.n} />
                    </Fragment>
                  );
                }
                if (item.tipo === "evento") {
                  return (
                    <Fragment key={`ev-${item.e.ts}-${i}`}>
                      {novoDia && <SeparadorDia iso={ts} agora={agora} />}
                      <EventoAuditoriaLine evento={item.e} />
                    </Fragment>
                  );
                }
                const m = item.m;
                return (
                  <Fragment key={m.id}>
                    {novoDia && <SeparadorDia iso={m.timestamp} agora={agora} />}
                    {unreadInfo?.firstId === m.id && (
                      <div className="my-4 flex items-center gap-3 text-[11.5px] font-medium text-accent before:h-px before:flex-1 before:bg-accent/40 after:h-px after:flex-1 after:bg-accent/40">
                        {unreadInfo.count === 1 ? "1 mensagem não lida" : `${unreadInfo.count} mensagens não lidas`}
                      </div>
                    )}
                    {ultimoAtendimento?.reabertoPorMensagem === m.id && (
                      <ObservacaoAtendimento atendimento={ultimoAtendimento} />
                    )}
                    {m.type === "call" && m.call ? (
                      <CallLine m={m} />
                    ) : (
                      <div
                        data-msg-id={m.id}
                        className={cn(
                          "flex flex-col",
                          highlightedId === m.id && "rounded-[14px] ring-2 ring-accent/70 transition-shadow",
                        )}
                      >
                        <Bubble
                          slug={slug}
                          m={m}
                          contacts={contacts}
                          autoria={autoria(m, donoLogin, Boolean(entregas.baloes[m.id]))}
                          entrega={blocos.rotulos[m.id]}
                          continua={!novoDia && blocos.continua.has(m.id)}
                          direta={cabecalho.tipo === "dm"}
                          fresh={!initialIds.current.has(m.id)}
                          onReply={(msg) =>
                            setReplyTo({
                              id: msg.id,
                              senderName: msg.fromMe ? "Você" : msg.senderName,
                              text: msg.text || `[${msg.type}]`,
                            })
                          }
                          onForward={setForwardMsg}
                          onEdited={handleEdited}
                          onDeleted={handleDeleted}
                          onJumpToMessage={jumpToMessage}
                        />
                      </div>
                    )}
                  </Fragment>
                );
              })
            )}
            {failedMsgs.map((f) => (
              <div
                key={f.id}
                className="mt-3 flex max-w-[76%] flex-col items-end self-end rounded-[12px] border border-danger/40 bg-danger-bg px-3.5 py-2.5 text-[13.5px] text-fg"
              >
                <span className="whitespace-pre-wrap break-words">{f.text}</span>
                <div className="mt-2 flex items-center gap-2 text-[12px]">
                  <span className="text-danger">Falhou: {f.error}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="subtle"
                    loading={f.retrying}
                    onClick={() => void retryFailed(f)}
                  >
                    Tentar novamente
                  </Button>
                  <button
                    type="button"
                    onClick={() => setFailedMsgs((cur) => cur.filter((x) => x.id !== f.id))}
                    className="text-fg-faint hover:text-fg"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {showJump && (
          <button
            type="button"
            onClick={jumpToBottom}
            aria-label="Descer para o fim"
            className={cn(
              "pop-in absolute bottom-4 right-5 grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-fg-dim [box-shadow:var(--float)] transition-colors hover:text-fg",
            )}
          >
            <Icone nome="download" tamanho={18} />
          </button>
        )}
      </div>

      {frasePresenca && (
        <div className="mx-auto flex w-full max-w-[776px] items-center gap-2 px-7 pb-1.5 text-[12px] text-warn max-[860px]:px-3">
          <span className="h-2 w-2 animate-pulse rounded-full bg-warn" />
          <span>{frasePresenca}</span>
        </div>
      )}

      <Composer
        slug={slug}
        nome={groupName}
        groupJid={groupJidAtual}
        onSent={aoEnviar}
        draft={draft}
        onPedirRascunho={rotas.recursos.copiloto ? pedirRascunho : undefined}
        onPedirResumo={onPedirResumo}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        participantes={cabecalho.tipo === "grupo" ? participantes : undefined}
        equipeInterna={equipeInterna}
        onNotaCriada={(nota) => setNotasInternas((cur) => [...cur, nota])}
        onTypingChange={setIsTypingLocal}
        atendente={atendenteNome}
        departamento={departamentoNome}
        droppedFiles={droppedFiles}
        acoesBarra={acoesComposer}
        onSendFailed={(item) =>
          setFailedMsgs((cur) => [
            ...cur,
            { id: `fail-${Date.now()}-${Math.random().toString(36).slice(2)}`, ...item },
          ])
        }
        rascunho={
          suggest
            ? (usar) => (
                <SuggestionCard
                  key={`${suggest.id}-${pedidoRascunho?.n ?? 0}`}
                  slug={slug}
                  messageId={suggest.id}
                  followup={suggest.followup}
                  manual={suggest.manual}
                  onUseDraft={usar}
                />
              )
            : undefined
        }
      />

      {forwardMsg && (
        <ForwardModal
          msg={forwardMsg}
          onClose={() => setForwardMsg(null)}
          onForwarded={() => {
            setForwardMsg(null);
            aoEnviar();
          }}
        />
      )}
    </>
  );
}

function ForwardModal({
  msg,
  onClose,
  onForwarded,
}: {
  msg: MessageView;
  onClose: () => void;
  onForwarded: () => void;
}) {
  const rotas = useRotas();
  const [alvos, setAlvos] = useState<Array<{ slug: string; nome: string; jid: string | null }>>([]);
  const [busca, setBusca] = useState("");
  const [enviandoSlug, setEnviandoSlug] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (rotas.modo === "dono") {
      fetch("/api/groups/summary", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((list: Array<{ slug: string; name: string; jid: string | null }>) => {
          if (!alive || !Array.isArray(list)) return;
          setAlvos(
            list.map((g) => ({
              slug: g.slug,
              nome: g.name,
              jid: g.jid ?? (g.slug.startsWith("dm-") ? `${g.slug.slice(3)}@s.whatsapp.net` : null),
            })),
          );
        })
        .catch(() => {});
    } else {
      fetch(rotas.fila, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { conversas?: Array<{ slug: string; nome: string }> } | null) => {
          if (!alive || !data?.conversas) return;
          setAlvos(data.conversas.map((c) => ({ slug: c.slug, nome: c.nome, jid: null })));
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [rotas]);

  const filtrados = useMemo(() => alvos.filter((a) => casaBusca(a.nome, busca)).slice(0, 60), [alvos, busca]);

  async function encaminharPara(alvo: { slug: string; nome: string; jid: string | null }) {
    if (enviandoSlug) return;
    const texto = msg.text?.trim() || (msg.mediaPath ? `[mídia encaminhada: ${msg.type}]` : "");
    if (!texto) {
      setErro("Mensagem sem conteúdo encaminhável.");
      return;
    }
    const pedido = rotas.enviarTexto(alvo.slug, alvo.jid, texto);
    if (!pedido) {
      setErro("Destino indisponível para este chat.");
      return;
    }
    setEnviandoSlug(alvo.slug);
    setErro(null);
    try {
      const res = checarSessao(
        await fetch(pedido.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pedido.body),
        }),
        rotas,
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "falha ao encaminhar");
      onForwarded();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro ao encaminhar");
      setEnviandoSlug(null);
    }
  }

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Encaminhar mensagem"
        onClick={(e) => e.stopPropagation()}
        className="pop-in flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-[14px] border border-line bg-surface [box-shadow:var(--float)]"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-[14.5px] font-semibold text-fg">Encaminhar mensagem</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-7 w-7 place-items-center rounded-[6px] text-fg-faint hover:bg-elevated hover:text-fg"
          >
            <Icone nome="x" tamanho={14} />
          </button>
        </div>
        <div className="border-b border-line p-3">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar conversa destino…" rotulo="Buscar conversa" />
          {erro && <p className="mt-2 text-[12px] text-danger">{erro}</p>}
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {filtrados.length === 0 ? (
            <li className="px-4 py-8 text-center text-[13px] text-fg-faint">Nenhuma conversa encontrada.</li>
          ) : (
            filtrados.map((a) => (
              <li key={a.slug}>
                <button
                  type="button"
                  disabled={enviandoSlug !== null}
                  onClick={() => void encaminharPara(a)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13.5px] text-fg hover:bg-surface-2 disabled:opacity-50"
                >
                  <Avatar nome={a.nome} tipo={a.slug.startsWith("dm-") ? "dm" : "grupo"} tamanho="sm" />
                  <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                  {enviandoSlug === a.slug && <span className="text-[12px] text-accent">Enviando…</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
