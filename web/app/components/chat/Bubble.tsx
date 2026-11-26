"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { corDoMatiz, matizDoNome } from "@/lib/aparencia";
import { type Autoria, agruparReacoes, horaCurta } from "@/lib/caixa";
import type { MessageView, PollView } from "@/lib/data";
import { instanteLongo } from "@/lib/formatar-data";
import { LiveAudio } from "../LiveAudio";
import { checarSessao, useRotas } from "../RotasPainel";
import { Avatar, Button, cn, Icone, ScanShimmer } from "../ui";
import { baseName, type Contacts, numberFromJid, renderMentions, senderLabel } from "./format";

/* Balão de mensagem e satélites (ações, recibos, enquete, mídia lightbox, mapa, vCard, transcrição). */

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🙏", "✅"];

const EDGE: Record<Autoria["id"], string> = {
  celular: "var(--color-id-celular)",
  web: "var(--color-id-celular)",
  voce: "var(--color-id-celular)",
  painel: "var(--color-id-painel)",
  equipe: "var(--color-id-equipe)",
  ia: "var(--color-id-ia)",
  meta: "var(--color-id-ia)",
};

const ICONE_AUTORIA: Partial<Record<Autoria["id"], "phone" | "monitor" | "spark">> = {
  celular: "phone",
  web: "monitor",
  painel: "monitor",
  ia: "spark",
  meta: "spark",
};

/** Barra de ações no hover do balão: reações, responder, copiar, editar, apagar e encaminhar. */
function MessageActions({
  slug,
  m,
  mine,
  onReply,
  onStartEdit,
  onAskDelete,
  onForward,
}: {
  slug: string;
  m: MessageView;
  mine: boolean;
  onReply?: (m: MessageView) => void;
  onStartEdit?: () => void;
  onAskDelete?: () => void;
  onForward?: (m: MessageView) => void;
}) {
  const rotas = useRotas();
  async function react(emoji: string) {
    try {
      const p = rotas.reagir(slug, m, emoji);
      checarSessao(
        await fetch(p.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p.body),
        }),
        rotas,
      );
    } catch {
      /* coletor offline: ignora */
    }
  }

  return (
    <div
      className={cn(
        "absolute -top-3.5 z-10 flex items-center gap-0.5 rounded-full border border-line bg-surface px-1 py-0.5 opacity-0 [box-shadow:var(--shadow-pop)] transition-opacity group-hover:opacity-100 focus-within:opacity-100",
        mine ? "left-2" : "right-2",
      )}
    >
      {!m.deleted &&
        QUICK_REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => react(e)}
            title={`Reagir com ${e}`}
            aria-label={`Reagir com ${e}`}
            className="rounded-full px-1 text-sm leading-none transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 motion-reduce:hover:scale-100"
          >
            {e}
          </button>
        ))}
      {onReply && !m.deleted && (
        <button
          type="button"
          onClick={() => onReply(m)}
          title="Responder"
          aria-label="Responder"
          className="ml-0.5 grid h-6 w-6 place-items-center rounded-full text-fg-dim transition-colors hover:bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <Icone nome="reply" tamanho={13} />
        </button>
      )}
      {m.text && !m.deleted && (
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(m.text).catch(() => {})}
          title="Copiar texto"
          aria-label="Copiar texto"
          className="grid h-6 w-6 place-items-center rounded-full text-fg-dim transition-colors hover:bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <Icone nome="copy" tamanho={13} />
        </button>
      )}
      {onForward && !m.deleted && (m.text || m.mediaPath) && (
        <button
          type="button"
          onClick={() => onForward(m)}
          title="Encaminhar"
          aria-label="Encaminhar"
          className="grid h-6 w-6 place-items-center rounded-full text-fg-dim transition-colors hover:bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <Icone nome="forward" tamanho={13} />
        </button>
      )}
      {mine && !m.deleted && m.text && onStartEdit && (
        <button
          type="button"
          onClick={onStartEdit}
          title="Editar mensagem"
          aria-label="Editar mensagem"
          className="grid h-6 w-6 place-items-center rounded-full text-fg-dim transition-colors hover:bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <Icone nome="edit" tamanho={13} />
        </button>
      )}
      {mine && !m.deleted && onAskDelete && (
        <button
          type="button"
          onClick={onAskDelete}
          title="Apagar para todos"
          aria-label="Apagar para todos"
          className="grid h-6 w-6 place-items-center rounded-full text-fg-dim transition-colors hover:bg-elevated hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <Icone nome="trash" tamanho={13} />
        </button>
      )}
    </div>
  );
}

/** ✓ enviado · ✓✓ entregue · ✓✓ em acento = lido. */
function ReceiptMark({
  r,
}: {
  r: { status: string; readBy: number; deliveredBy: number; readByNames?: string[] };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  const read = r.status === "read";
  const names: string[] = r.readByNames ?? [];
  const canOpen = read && r.readBy > 0;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const label = read
    ? `lida${r.readBy > 0 ? ` por ${r.readBy}` : ""}`
    : r.status === "delivered"
      ? `entregue${r.deliveredBy > 0 ? ` a ${r.deliveredBy}` : ""}`
      : "enviada";
  const icone = <Icone nome={r.status === "sent" ? "check" : "check2"} tamanho={13} />;

  if (!canOpen) {
    return (
      <span className={cn("inline-flex align-[-3px]", read ? "text-accent" : "text-fg-mute")} title={label} role="img" aria-label={label}>
        {icone}
      </span>
    );
  }

  return (
    <span className="relative inline-flex align-[-3px]">
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-0.5 rounded text-accent transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        {icone}
        <span className="text-[10px]">{r.readBy}</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Lida por"
          className="absolute bottom-full right-0 z-50 mb-1.5 min-w-[140px] max-w-[220px] rounded-control border border-line bg-surface px-3 py-2 text-left font-sans [box-shadow:var(--float)]"
        >
          <p className="mb-1.5 text-[12px] font-medium text-fg-faint">Lida por</p>
          <ul className="space-y-0.5">
            {names.length > 0 ? (
              names.map((name) => (
                <li key={name} className="truncate text-[12.5px] text-fg">
                  {name}
                </li>
              ))
            ) : (
              <li className="text-[12.5px] text-fg-dim">
                {r.readBy} {r.readBy === 1 ? "pessoa" : "pessoas"}
              </li>
            )}
          </ul>
        </div>
      )}
    </span>
  );
}

/** Enquete: pergunta, uma barra por opção com a contagem e o total embaixo. */
function PollCard({ poll }: { poll: PollView }) {
  const max = Math.max(1, ...poll.options.map((o) => o.votes));
  const leadIdx = poll.options.reduce((best, o, i) => (o.votes > (poll.options[best]?.votes ?? -1) ? i : best), 0);
  return (
    <div className="w-[clamp(240px,60vw,360px)] max-w-full">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-fg-faint">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent" aria-hidden>
          <path d="M18 20V10M12 20V4M6 20v-6" />
        </svg>
        Enquete{poll.multiSelect ? ", várias respostas" : ""}
      </div>
      <p className="mb-2.5 font-medium leading-snug text-fg">{poll.question}</p>
      <ul className="space-y-1.5">
        {poll.options.map((o, i) => {
          const pct = poll.totalVotes > 0 ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
          const lead = o.votes > 0 && i === leadIdx;
          return (
            <li
              key={o.text}
              title={o.voters.length ? `Votos: ${o.voters.join(", ")}` : undefined}
              className="relative overflow-hidden rounded-control border border-line bg-surface-2"
            >
              <span
                aria-hidden
                className={cn("absolute inset-y-0 left-0 transition-[width] duration-500 motion-reduce:transition-none", lead ? "bg-accent-soft" : "bg-elevated")}
                style={{ width: `${(o.votes / max) * 100}%` }}
              />
              <div className="relative flex items-center justify-between gap-2 px-2.5 py-1.5">
                <span className="truncate text-[13px] text-fg">{o.text}</span>
                <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-fg-dim">
                  {o.votes}
                  {poll.totalVotes > 0 && <span className="ml-1 text-fg-faint">{pct}%</span>}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex items-center gap-2 text-[12px] text-fg-faint">
        <span>
          <span className="font-mono tabular-nums">{poll.totalVotes}</span> {poll.totalVotes === 1 ? "voto" : "votos"}
        </span>
        {poll.youVoted && <span className="rounded-tag bg-accent-soft px-1.5 text-accent">você votou</span>}
      </div>
    </div>
  );
}

function LocationCard({ loc }: { loc: NonNullable<MessageView["location"]> }) {
  const href = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="mb-1.5 flex max-w-[320px] items-start gap-2.5 rounded-control border border-line bg-surface-2 p-2.5 transition-colors hover:border-line-2"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-accent-soft text-accent">
        <Icone nome="map-pin" tamanho={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-fg">{loc.name || "Localização compartilhada"}</span>
        {loc.address && <span className="block truncate text-[12px] text-fg-dim">{loc.address}</span>}
        <span className="mt-0.5 block font-mono text-[11px] text-accent">
          {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)} · Abrir no Google Maps
        </span>
      </span>
    </a>
  );
}

function parseVcard(vcard: string, fallbackName?: string | null) {
  const fn = vcard.match(/^FN[^:]*:(.+)$/im)?.[1]?.trim() || fallbackName || "Contato";
  const tel = vcard.match(/^TEL[^:]*:([+0-9()\s-]{4,})$/im)?.[1]?.trim() || null;
  const digits = tel ? tel.replace(/\D/g, "") : "";
  return { name: fn, phone: tel, digits };
}

function ContactCard({ vcard, contactName }: { vcard: string; contactName?: string | null }) {
  const rotas = useRotas();
  const info = parseVcard(vcard, contactName);

  function baixarVcf() {
    const blob = new Blob([vcard], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${info.name.replace(/[^a-zA-Z0-9_-]+/g, "_") || "contato"}.vcf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="mb-1.5 w-[min(280px,100%)] rounded-control border border-line bg-surface-2 p-3">
      <div className="flex items-center gap-2.5">
        <Avatar nome={info.name} tipo="dm" tamanho="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-fg">{info.name}</div>
          {info.phone && <div className="truncate font-mono text-[12px] text-fg-dim">{info.phone}</div>}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2 border-t border-line pt-2">
        {info.digits.length >= 8 && rotas.modo === "dono" && (
          <Link
            href={`/g/dm-${info.digits}`}
            className="text-[12px] font-medium text-accent hover:underline"
          >
            Iniciar conversa
          </Link>
        )}
        <button
          type="button"
          onClick={baixarVcf}
          className="ml-auto text-[12px] font-medium text-fg-dim hover:text-fg hover:underline"
        >
          Baixar .vcf
        </button>
      </div>
    </div>
  );
}

/** Linha de quem escreveu, acima do balão. */
function QuemEscreveu({
  m,
  mine,
  autoria,
  entrega,
  contacts,
}: {
  m: MessageView;
  mine: boolean;
  autoria: Autoria | null;
  entrega?: { texto: string; ticket: string };
  contacts: Contacts;
}) {
  if (mine && autoria) {
    const icone = ICONE_AUTORIA[autoria.id];
    const via = entrega && autoria.id === "ia" ? entrega.texto : autoria.via;
    return (
      <div className="mx-0.5 mb-1.5 flex items-center gap-1.5 text-[12.5px] text-fg-faint">
        <span className="inline-flex items-center gap-[5px] font-semibold" style={{ color: EDGE[autoria.id] }}>
          {autoria.id === "equipe" ? (
            <Avatar nome={autoria.quem} tipo="dm" tamanho="xs" />
          ) : (
            icone && <Icone nome={icone} tamanho={13} />
          )}
          {autoria.quem}
        </span>
        {via && <span title={entrega ? `Entrega ${entrega.ticket}` : undefined}>{via}</span>}
      </div>
    );
  }
  const time = contacts.team.has(numberFromJid(m.sender));
  return (
    <div className="mx-0.5 mb-1.5 flex items-center gap-1.5 text-[12.5px] text-fg-faint">
      <b
        className="font-semibold"
        style={{ color: `color-mix(in srgb, ${corDoMatiz(matizDoNome(m.senderName))} var(--ink-mix), var(--color-fg))` }}
      >
        {m.senderName}
      </b>
      {time && <span>do time</span>}
    </div>
  );
}

export function Bubble({
  slug,
  m,
  contacts,
  autoria,
  entrega,
  continua = false,
  direta = false,
  fresh = false,
  onReply,
  onForward,
  onEdited,
  onDeleted,
  onJumpToMessage,
}: {
  slug: string;
  m: MessageView;
  contacts: Contacts;
  autoria: Autoria | null;
  entrega?: { texto: string; ticket: string };
  continua?: boolean;
  direta?: boolean;
  fresh?: boolean;
  onReply?: (m: MessageView) => void;
  onForward?: (m: MessageView) => void;
  onEdited?: (id: string, novoTexto: string) => void;
  onDeleted?: (id: string) => void;
  onJumpToMessage?: (id: string) => void;
}) {
  const rotas = useRotas();
  const mine = m.fromMe === true;
  const edge = autoria ? EDGE[autoria.id] : undefined;
  const reacoes = agruparReacoes(m.reactions);
  const celular = autoria?.id === "celular" || autoria?.id === "web" || autoria?.id === "voce";
  const origemWhatsApp = autoria?.id === "celular" || autoria?.id === "web" ? `Enviada ${autoria.via}` : null;

  const [editando, setEditando] = useState(false);
  const [textoEdit, setTextoEdit] = useState(m.text);
  const [salvandoEdit, setSalvandoEdit] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [confirmandoDelete, setConfirmandoDelete] = useState(false);
  const [deletando, setDeletando] = useState(false);

  async function salvarEdicao() {
    const limpo = textoEdit.trim();
    if (!limpo || salvandoEdit) return;
    setSalvandoEdit(true);
    setErroAcao(null);
    try {
      const p = rotas.editar(slug, m, limpo);
      const res = checarSessao(
        await fetch(p.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p.body),
        }),
        rotas,
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "falha ao editar");
      setEditando(false);
      onEdited?.(m.id, limpo);
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : "erro ao editar");
    } finally {
      setSalvandoEdit(false);
    }
  }

  async function confirmarApagar() {
    if (deletando) return;
    setDeletando(true);
    setErroAcao(null);
    try {
      const p = rotas.apagar(slug, m);
      const res = checarSessao(
        await fetch(p.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p.body),
        }),
        rotas,
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "falha ao apagar");
      setConfirmandoDelete(false);
      onDeleted?.(m.id);
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : "erro ao apagar");
    } finally {
      setDeletando(false);
    }
  }

  const citacaoConteudo = m.quotedText && (
    <>
      {senderLabel(m.quotedSender, contacts) && (
        <b className="block text-[12px] font-semibold text-fg">{senderLabel(m.quotedSender, contacts)}</b>
      )}
      {renderMentions(m.quotedText, contacts)}
    </>
  );

  const corpo = (
    <div
      style={edge ? ({ "--edge": edge } as CSSProperties) : undefined}
      className={cn(
        "group relative min-w-0 max-w-full rounded-[12px] border px-3.5 py-2.5 text-[14px] leading-[1.55] text-fg",
        mine
          ? cn(
              "border-[color-mix(in_srgb,var(--edge)_26%,var(--color-surface))]",
              celular
                ? "bg-[color-mix(in_srgb,var(--edge)_9%,var(--color-surface))]"
                : "bg-[color-mix(in_srgb,var(--edge)_13%,var(--color-surface))]",
              !continua && "rounded-tr-[4px]",
            )
          : cn("border-line bg-bubble-their", !continua && "rounded-tl-[4px]"),
      )}
    >
      <MessageActions
        slug={slug}
        m={m}
        mine={mine}
        onReply={onReply}
        onForward={onForward}
        onStartEdit={() => {
          setTextoEdit(m.text);
          setEditando(true);
          setErroAcao(null);
        }}
        onAskDelete={() => {
          setConfirmandoDelete(true);
          setErroAcao(null);
        }}
      />
      {m.deleted ? (
        <p className="italic text-fg-faint">Mensagem apagada</p>
      ) : (
        <>
          {m.quotedText &&
            (m.quotedId && onJumpToMessage ? (
              <button
                type="button"
                onClick={() => onJumpToMessage(m.quotedId!)}
                className="mb-2 block w-full line-clamp-4 break-words rounded-[6px] bg-[color-mix(in_srgb,var(--color-fg)_4%,transparent)] px-2.5 py-1.5 text-left text-[13px] text-fg-dim shadow-[inset_2px_0_0_var(--color-line-2)] hover:bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)]"
              >
                {citacaoConteudo}
              </button>
            ) : (
              <div className="mb-2 line-clamp-4 break-words rounded-[6px] bg-[color-mix(in_srgb,var(--color-fg)_4%,transparent)] px-2.5 py-1.5 text-[13px] text-fg-dim shadow-[inset_2px_0_0_var(--color-line-2)]">
                {citacaoConteudo}
              </div>
            ))}
          <Media slug={slug} m={m} />
          {m.type === "location" && m.location ? (
            <LocationCard loc={m.location} />
          ) : m.type === "contact" && m.vcard ? (
            <ContactCard vcard={m.vcard} contactName={m.contactName} />
          ) : m.type === "poll" && m.poll ? (
            <PollCard poll={m.poll} />
          ) : editando ? (
            <div className="mt-1 space-y-2">
              <textarea
                value={textoEdit}
                onChange={(e) => setTextoEdit(e.target.value)}
                rows={3}
                className="w-full min-w-[220px] rounded-[8px] border border-line-2 bg-surface px-2.5 py-1.5 text-[13.5px] text-fg focus:border-accent focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" onClick={() => void salvarEdicao()} loading={salvandoEdit}>
                  Salvar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={salvandoEdit}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            m.text && <span className="whitespace-pre-wrap break-words">{renderMentions(m.text, contacts)}</span>
          )}
        </>
      )}
      {confirmandoDelete && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[8px] border border-danger/30 bg-danger-bg px-2.5 py-1.5 text-[12px]">
          <span className="text-danger">Apagar para todos?</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => void confirmarApagar()} loading={deletando}>
            Confirmar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmandoDelete(false)} disabled={deletando}>
            Cancelar
          </Button>
        </div>
      )}
      {erroAcao && <p className="mt-1.5 text-[12px] text-danger">{erroAcao}</p>}
      <span
        className="float-right ml-3 mt-2 inline-flex items-center gap-1 font-mono text-[11px] leading-none tabular-nums text-fg-faint"
        title={instanteLongo(m.timestamp)}
      >
        {m.edited && !m.deleted && <span className="font-sans">editada</span>}
        {origemWhatsApp && (
          <span className="font-sans" role="img" aria-label={origemWhatsApp} title={origemWhatsApp}>
            ☁️
          </span>
        )}
        {horaCurta(m.timestamp)}
        {mine && m.receipt && !m.deleted && <ReceiptMark r={m.receipt} />}
      </span>
    </div>
  );

  const rodape = reacoes.length > 0 && (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {reacoes.map((r) => (
        <span
          key={r.emoji}
          title={r.quem.join(", ")}
          className="inline-flex h-[22px] items-center gap-1 rounded-full border border-line bg-surface px-2 text-[12px]"
        >
          {r.emoji}
          {r.n > 1 && <span className="font-mono text-[11px] tabular-nums text-fg-dim">{r.n}</span>}
        </span>
      ))}
    </div>
  );

  if (mine) {
    return (
      <div className={cn("flex max-w-[76%] flex-col items-end self-end max-[860px]:max-w-[92%]", continua ? "mt-1" : "mt-4", fresh && "msg-in")}>
        {!continua && <QuemEscreveu m={m} mine autoria={autoria} entrega={entrega} contacts={contacts} />}
        {corpo}
        {rodape}
      </div>
    );
  }
  if (direta) {
    return (
      <div className={cn("flex max-w-[76%] flex-col items-start self-start max-[860px]:max-w-[92%]", continua ? "mt-1" : "mt-4", fresh && "msg-in")}>
        {corpo}
        {rodape}
      </div>
    );
  }
  return (
    <div className={cn("flex max-w-[76%] items-start gap-2.5 self-start max-[860px]:max-w-[92%]", continua ? "mt-1" : "mt-4", fresh && "msg-in")}>
      {continua ? <span className="w-7 shrink-0" aria-hidden /> : <Avatar nome={m.senderName} tipo="dm" tamanho="sm" className="mt-px" />}
      <div className="flex min-w-0 flex-col items-start">
        {!continua && <QuemEscreveu m={m} mine={false} autoria={null} contacts={contacts} />}
        {corpo}
        {rodape}
      </div>
    </div>
  );
}

/** Lightbox <dialog> para ampliar imagens (com zoom) e vídeos, com botão de download. */
function MediaLightbox({
  open,
  onClose,
  src,
  kind,
}: {
  open: boolean;
  onClose: () => void;
  src: string;
  kind: "image" | "video";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      setZoom(false);
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={ref}
      aria-label="Visualizar mídia"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto max-h-none max-w-none overflow-visible bg-transparent p-0 backdrop:bg-black/80 backdrop:backdrop-blur-sm"
    >
      <div className="relative flex flex-col items-center gap-3">
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="Imagem ampliada"
            onClick={() => setZoom((z) => !z)}
            className={cn(
              "block rounded-card object-contain transition-transform [box-shadow:var(--float)]",
              zoom ? "max-h-[92vh] max-w-[95vw] scale-125 cursor-zoom-out" : "max-h-[82vh] max-w-[90vw] cursor-zoom-in",
            )}
          />
        ) : (
          // biome-ignore lint/a11y/useMediaCaption: vídeo de cliente sem legenda
          <video controls autoPlay src={src} className="max-h-[82vh] max-w-[90vw] rounded-card [box-shadow:var(--float)]" />
        )}
        <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 [box-shadow:var(--float)]">
          {kind === "image" && (
            <button
              type="button"
              onClick={() => setZoom((z) => !z)}
              className="text-[12.5px] font-medium text-fg-dim hover:text-fg"
            >
              {zoom ? "Zoom 1x" : "Zoom 2x"}
            </button>
          )}
          <a
            href={src}
            download
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline"
          >
            <Icone nome="download" tamanho={13} />
            Baixar
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="ml-1 grid h-6 w-6 place-items-center rounded-full text-fg-faint hover:bg-elevated hover:text-fg"
          >
            <Icone nome="x" tamanho={13} />
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Imagem que não chegou a este painel vira um aviso no lugar do quadro quebrado. */
function Imagem({
  src,
  className,
  ampliavel = false,
}: {
  src: string;
  className: string;
  ampliavel?: boolean;
}) {
  const [falhou, setFalhou] = useState(false);
  const [aberta, setAberta] = useState(false);
  if (falhou) {
    return (
      <div className="mb-2 flex aspect-video w-[320px] max-w-full items-end rounded-[8px] border border-line bg-elevated px-2 py-1.5 font-mono text-[11px] text-fg-faint">
        imagem indisponível neste painel
      </div>
    );
  }
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      ref={(el) => {
        if (el?.complete && el.naturalWidth === 0 && el.currentSrc) setFalhou(true);
      }}
      onError={() => setFalhou(true)}
      className={className}
    />
  );
  if (!ampliavel) return img;
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        className="block cursor-zoom-in text-left"
        title="Ampliar imagem"
      >
        {img}
      </button>
      <MediaLightbox open={aberta} onClose={() => setAberta(false)} src={src} kind="image" />
    </>
  );
}

const MIDIA_SEM_ARQUIVO: Record<string, string> = {
  audio: "áudio",
  image: "imagem",
  video: "vídeo",
  gif: "GIF",
  sticker: "figurinha",
  document: "documento",
};

function Media({ slug, m }: { slug: string; m: MessageView }) {
  const rotas = useRotas();
  const [videoAberto, setVideoAberto] = useState(false);
  if (!m.mediaPath) {
    const tipo = MIDIA_SEM_ARQUIVO[m.type];
    return tipo && !m.text ? <span className="italic text-fg-faint">{tipo} indisponível</span> : null;
  }
  const src = rotas.midia(m.mediaPath);

  switch (m.type) {
    case "audio":
      return (
        <div className="mb-1">
          <LiveAudio src={src} />
          <Transcribe slug={slug} mediaPath={m.mediaPath} initial={m.transcript} />
        </div>
      );
    case "video":
      return (
        <div className="mb-2">
          <div className="relative w-[320px] max-w-full">
            {/* biome-ignore lint/a11y/useMediaCaption: vídeo de cliente não tem legenda */}
            <video controls preload="none" src={src} className="w-full rounded-[8px] border border-line" />
            <button
              type="button"
              onClick={() => setVideoAberto(true)}
              className="mt-1 text-[11.5px] font-medium text-accent hover:underline"
            >
              Ampliar / Baixar vídeo
            </button>
          </div>
          <MediaLightbox open={videoAberto} onClose={() => setVideoAberto(false)} src={src} kind="video" />
          <Transcribe slug={slug} mediaPath={m.mediaPath} initial={m.transcript} />
        </div>
      );
    case "gif":
      return (
        // biome-ignore lint/a11y/useMediaCaption: GIF não tem legenda nem áudio
        <video src={src} autoPlay loop muted playsInline className="mb-2 w-[280px] max-w-full rounded-[8px] border border-line" />
      );
    case "image":
      return <Imagem src={src} ampliavel className="mb-2 w-[320px] max-w-full rounded-[8px] border border-line" />;
    case "sticker":
      return <Imagem src={src} className="h-28 w-28 object-contain" />;
    case "document":
      return (
        <div className="mb-2 space-y-1.5">
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="flex max-w-[320px] items-center gap-2 rounded-control border border-line bg-surface px-2.5 py-2 text-[13px] transition-colors hover:border-line-2"
          >
            <Icone nome="doc" className="shrink-0 text-fg-faint" />
            <span className="truncate text-info">{baseName(m.mediaPath)}</span>
          </a>
          <ReadDoc slug={slug} mediaPath={m.mediaPath} />
        </div>
      );
    default:
      return null;
  }
}

function ReadDoc({ slug, mediaPath }: { slug: string; mediaPath: string }) {
  const rotas = useRotas();
  const [doc, setDoc] = useState<{ text: string; pages?: number; note?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const p = rotas.documento(slug, mediaPath);
      const res = checarSessao(
        await fetch(p.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p.body),
        }),
        rotas,
      );
      const data = (await res.json()) as { text?: string; pages?: number; note?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "falha ao ler documento");
      setDoc({ text: data.text ?? "", pages: data.pages, note: data.note });
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
    } finally {
      setLoading(false);
    }
  }

  if (doc) {
    return (
      <div className="reveal mt-2 border-t border-dashed border-line-2 pt-2.5 text-[13px] text-fg-dim">
        <div className="mb-1 text-[12px] font-medium text-fg-faint">
          Conteúdo do documento{doc.pages ? `, ${doc.pages} pág.` : ""}
        </div>
        {doc.note && <p className="mb-1 text-[12px] text-accent">{doc.note}</p>}
        {doc.text && <p className="max-h-72 overflow-y-auto whitespace-pre-wrap">{doc.text}</p>}
      </div>
    );
  }
  if (loading) return <ScanShimmer lines={2} className="w-full max-w-sm" />;
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={run}>
        Ler conteúdo
      </Button>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </div>
  );
}

const TRANSCRICAO_CURTA = 220;

function Transcribe({
  slug,
  mediaPath,
  initial,
}: {
  slug: string;
  mediaPath: string;
  initial: string | null;
}) {
  const rotas = useRotas();
  const [transcript, setTranscript] = useState<string | null>(initial);
  const [inteira, setInteira] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const p = rotas.transcrever(slug, mediaPath);
      const res = checarSessao(
        await fetch(p.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p.body),
        }),
        rotas,
      );
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "falha na transcrição");
      setTranscript(data.text ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
    } finally {
      setLoading(false);
    }
  }

  const base = "mt-2.5 border-t border-dashed border-line-2 pt-2.5 text-[13px] leading-relaxed text-fg-dim";
  if (transcript) {
    const longa = transcript.length > TRANSCRICAO_CURTA;
    return (
      <div className={cn(base, "reveal")}>
        <p className="whitespace-pre-wrap">
          {longa && !inteira ? `${transcript.slice(0, TRANSCRICAO_CURTA).trimEnd()}… ` : `${transcript} `}
          {longa && (
            <button type="button" onClick={() => setInteira((v) => !v)} className="text-[12.5px] font-medium text-accent hover:underline">
              {inteira ? "ver menos" : "ver tudo"}
            </button>
          )}
        </p>
      </div>
    );
  }
  if (loading) return <ScanShimmer lines={2} className="mt-2.5 w-full max-w-sm" />;
  return (
    <div className={base}>
      <button type="button" onClick={run} className="text-[12.5px] font-medium text-accent hover:underline">
        Transcrever
      </button>
      {error && <span className="ml-2 text-[12px] text-danger">{error}</span>}
    </div>
  );
}
