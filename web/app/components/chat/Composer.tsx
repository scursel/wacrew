"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { casaBusca } from "@/lib/busca";
import type { NotaInterna } from "@/lib/notas-internas";
import { interpolarResposta, type RespostaPronta } from "@/lib/respostas-prontas-interp";
import { checarSessao, useRotas } from "../RotasPainel";
import { Button, IconButton, Icone } from "../ui";

/* Compositor da conversa: rascunho da IA, bandeja de anexos múltiplos + drag-and-drop,
   áudio PTT, rascunho em localStorage, emoji picker, @participante, /respostas e reply. */

function kindOf(file: File): "image" | "video" | "audio" | "document" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

const ALTURA_MAX = 160;

const EMOJIS = [
  "😀", "😂", "🥹", "😊", "😍", "🥰", "😘", "😎",
  "🤩", "🥳", "🤔", "😅", "😭", "🤯", "😤", "🫡",
  "👍", "👎", "👏", "🙌", "🤝", "💪", "👌", "🙏",
  "❤️", "🔥", "💯", "✅", "❌", "⚠️", "🎉", "🚀",
  "⚡", "🚗", "🔧", "🛠️", "🛞", "⛽", "📅", "⏰",
  "📞", "📍", "💬", "📎", "📸", "🎥", "📄", "👋",
];

interface PendingAttachment {
  id: string;
  file: File;
  url: string | null;
  kind: "image" | "video" | "audio" | "document";
  caption: string;
}

export interface ReplyTarget {
  id: string;
  senderName: string;
  text: string;
}

export interface ParticipanteGrupo {
  id: string;
  nome: string;
}

function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface MembroEquipeInterna {
  login: string;
  nome: string;
}

export function Composer({
  slug,
  groupJid,
  nome,
  onSent,
  draft,
  rascunho,
  onPedirRascunho,
  replyTo,
  onCancelReply,
  participantes,
  equipeInterna,
  onNotaCriada,
  onTypingChange,
  atendente,
  departamento,
  droppedFiles,
  onSendFailed,
  acoesBarra,
}: {
  slug: string;
  groupJid: string | null;
  nome: string;
  onSent: () => void;
  draft?: { text: string; nonce: number } | null;
  rascunho?: (usar: (texto: string) => void) => ReactNode;
  onPedirRascunho?: () => void;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  participantes?: ParticipanteGrupo[];
  equipeInterna?: MembroEquipeInterna[];
  onNotaCriada?: (nota: NotaInterna) => void;
  onTypingChange?: (typing: boolean) => void;
  atendente?: string | null;
  departamento?: string | null;
  droppedFiles?: { files: File[]; nonce: number } | null;
  onSendFailed?: (item: { text: string; quotedId?: string; mentions?: string[]; error: string }) => void;
  /** Ações rápidas da conversa (ex.: Assumir atendimento / Resolver) na barra superior do compositor. */
  acoesBarra?: ReactNode;
}) {
  const rotas = useRotas();
  const [modoNota, setModoNota] = useState(false);
  const draftKey = modoNota ? `wac-nota:${slug}` : `wac-draft:${slug}`;
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [respostas, setRespostas] = useState<RespostaPronta[]>([]);
  const [cursorPos, setCursorPos] = useState(0);
  const [pickerIndex, setPickerIndex] = useState(0);

  // Gravação PTT
  const [hasMic, setHasMic] = useState(false);
  const [recState, setRecState] = useState<"idle" | "recording" | "preview">("idle");
  const [recSeconds, setRecSeconds] = useState(0);
  const [recBlob, setRecBlob] = useState<Blob | null>(null);
  const [recUrl, setRecUrl] = useState<string | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mentionsRef = useRef<Map<string, string>>(new Map()); // nome -> jid
  const pendingRef = useRef<PendingAttachment[]>([]);
  pendingRef.current = pending;

  const semDestino = !rotas.enviarTexto(slug, groupJid, "x");

  useEffect(() => {
    setHasMic(typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  // Restaura rascunho de localStorage ao abrir/trocar de conversa.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey);
      setText(saved ?? "");
    } catch {
      setText("");
    }
    mentionsRef.current.clear();
    setError(null);
  }, [draftKey]);

  // Persiste rascunho em localStorage.
  useEffect(() => {
    try {
      if (text) window.localStorage.setItem(draftKey, text);
      else window.localStorage.removeItem(draftKey);
    } catch {
      /* storage indisponível */
    }
  }, [draftKey, text]);

  // Notifica digitação apenas quando respondendo ao cliente.
  useEffect(() => {
    if (!onTypingChange) return;
    if (modoNota || !text.trim()) {
      onTypingChange(false);
      return;
    }
    onTypingChange(true);
    const t = setTimeout(() => onTypingChange(false), 3000);
    return () => clearTimeout(t);
  }, [text, modoNota, onTypingChange]);

  useEffect(() => {
    return () => {
      onTypingChange?.(false);
    };
  }, [onTypingChange]);

  // Carrega respostas prontas.
  useEffect(() => {
    let alive = true;
    fetch(rotas.respostasProntas, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: RespostaPronta[]) => {
        if (alive && Array.isArray(data)) setRespostas(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [rotas.respostasProntas]);

  // Cresce o textarea até ALTURA_MAX.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mede de novo a cada texto
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ALTURA_MAX, ta.scrollHeight)}px`;
  }, [text]);

  function usar(texto: string) {
    setText(texto);
    requestAnimationFrame(() => taRef.current?.focus());
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: reaplica só quando o nonce muda
  useEffect(() => {
    if (draft?.text) usar(draft.text);
  }, [draft?.nonce]);

  // Foca textarea ao clicar em Responder.
  useEffect(() => {
    if (replyTo) requestAnimationFrame(() => taRef.current?.focus());
  }, [replyTo]);

  function enqueueFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.size > 0);
    if (arr.length === 0) return;
    setPending((prev) => [
      ...prev,
      ...arr.map((file) => {
        const kind = kindOf(file);
        const url = kind === "image" || kind === "video" ? URL.createObjectURL(file) : null;
        return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, url, kind, caption: "" };
      }),
    ]);
  }

  // Arquivos soltos na área do chat.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dispara somente no nonce de drop
  useEffect(() => {
    if (droppedFiles?.files?.length) enqueueFiles(droppedFiles.files);
  }, [droppedFiles?.nonce]);

  function removePending(id: string) {
    setPending((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.url) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  function updatePendingCaption(id: string, caption: string) {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)));
  }

  // Cleanup de ObjectURLs e gravação ao desmontar.
  useEffect(() => {
    return () => {
      for (const item of pendingRef.current) {
        if (item.url) URL.revokeObjectURL(item.url);
      }
      if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
        mediaRecRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recUrl) URL.revokeObjectURL(recUrl);
    };
  }, [recUrl]);

  useEffect(() => {
    if (recState !== "recording") return;
    const id = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recState]);

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.items)
      .filter((it) => it.kind === "file")
      .map((it) => it.getAsFile())
      .filter((f): f is File => Boolean(f));
    if (files.length === 0) return;
    e.preventDefault();
    enqueueFiles(files);
  }

  // Detecção de /atalho ou @participante / @equipe antes do cursor.
  const activeTrigger = useMemo(() => {
    const before = text.slice(0, cursorPos);
    if (!modoNota) {
      const slash = /(?:^|\s)\/([^\s/]*)$/.exec(before);
      if (slash) {
        return { type: "slash" as const, query: slash[1] ?? "", start: before.length - (slash[1]?.length ?? 0) - 1, end: cursorPos };
      }
      if (participantes && participantes.length > 0) {
        const at = /(?:^|\s)@([^\s@]*)$/.exec(before);
        if (at) {
          return { type: "mention" as const, query: at[1] ?? "", start: before.length - (at[1]?.length ?? 0) - 1, end: cursorPos };
        }
      }
    } else if (equipeInterna && equipeInterna.length > 0) {
      const at = /(?:^|\s)@([^\s@]*)$/.exec(before);
      if (at) {
        return { type: "team_mention" as const, query: at[1] ?? "", start: before.length - (at[1]?.length ?? 0) - 1, end: cursorPos };
      }
    }
    return null;
  }, [text, cursorPos, participantes, equipeInterna, modoNota]);

  const slashMatches = useMemo(() => {
    if (activeTrigger?.type !== "slash") return [];
    const q = activeTrigger.query;
    return respostas.filter((r) => casaBusca([r.atalho, r.titulo, r.texto], q)).slice(0, 8);
  }, [activeTrigger, respostas]);

  const mentionMatches = useMemo(() => {
    if (activeTrigger?.type !== "mention" || !participantes) return [];
    const q = activeTrigger.query;
    return participantes.filter((p) => casaBusca(p.nome, q)).slice(0, 8);
  }, [activeTrigger, participantes]);

  const teamMentionMatches = useMemo(() => {
    if (activeTrigger?.type !== "team_mention" || !equipeInterna) return [];
    const q = activeTrigger.query;
    return equipeInterna.filter((m) => casaBusca([m.nome, m.login], q)).slice(0, 8);
  }, [activeTrigger, equipeInterna]);

  const dropdownItemsCount =
    activeTrigger?.type === "slash"
      ? slashMatches.length
      : activeTrigger?.type === "mention"
        ? mentionMatches.length
        : activeTrigger?.type === "team_mention"
          ? teamMentionMatches.length
          : 0;

  useEffect(() => {
    setPickerIndex(0);
  }, [activeTrigger?.type, activeTrigger?.query]);

  function applySlash(item: RespostaPronta) {
    if (!activeTrigger) return;
    const interpolated = interpolarResposta(item.texto, {
      nome,
      atendente: atendente ?? "",
      departamento: departamento ?? "",
    });
    const next = text.slice(0, activeTrigger.start) + interpolated + text.slice(activeTrigger.end);
    setText(next);
    const nextPos = activeTrigger.start + interpolated.length;
    requestAnimationFrame(() => {
      taRef.current?.focus();
      taRef.current?.setSelectionRange(nextPos, nextPos);
      setCursorPos(nextPos);
    });
  }

  function applyMention(p: ParticipanteGrupo) {
    if (!activeTrigger) return;
    const jid = p.id.includes("@") ? p.id : `${p.id}@s.whatsapp.net`;
    mentionsRef.current.set(p.nome, jid);
    const inserted = `@${p.nome} `;
    const next = text.slice(0, activeTrigger.start) + inserted + text.slice(activeTrigger.end);
    setText(next);
    const nextPos = activeTrigger.start + inserted.length;
    requestAnimationFrame(() => {
      taRef.current?.focus();
      taRef.current?.setSelectionRange(nextPos, nextPos);
      setCursorPos(nextPos);
    });
  }

  function applyTeamMention(m: MembroEquipeInterna) {
    if (!activeTrigger) return;
    const inserted = `@${m.login} `;
    const next = text.slice(0, activeTrigger.start) + inserted + text.slice(activeTrigger.end);
    setText(next);
    const nextPos = activeTrigger.start + inserted.length;
    requestAnimationFrame(() => {
      taRef.current?.focus();
      taRef.current?.setSelectionRange(nextPos, nextPos);
      setCursorPos(nextPos);
    });
  }

  function insertEmoji(emoji: string) {
    const ta = taRef.current;
    const start = ta?.selectionStart ?? text.length;
    const end = ta?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    setEmojiOpen(false);
    const pos = start + emoji.length;
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(pos, pos);
      setCursorPos(pos);
    });
  }

  function activeMentions(body: string): string[] | undefined {
    const jids: string[] = [];
    for (const [mentionName, jid] of mentionsRef.current.entries()) {
      if (body.includes(`@${mentionName}`)) jids.push(jid);
    }
    return jids.length > 0 ? jids : undefined;
  }

  async function startRecording() {
    if (!hasMic || recState !== "idle" || semDestino || sending) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecRef.current = mr;
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const mime = mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size > 0) {
          setRecBlob(blob);
          setRecUrl(URL.createObjectURL(blob));
          setRecState("preview");
        } else {
          setRecState("idle");
        }
      };
      mr.start();
      setRecSeconds(0);
      setRecState("recording");
    } catch {
      setError("Não foi possível acessar o microfone.");
    }
  }

  function stopRecording() {
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stop();
    }
  }

  function cancelRecording() {
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.onstop = null;
      mediaRecRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    chunksRef.current = [];
    setRecBlob(null);
    setRecUrl(null);
    setRecState("idle");
    setRecSeconds(0);
  }

  async function sendAudio() {
    if (!recBlob || sending) return;
    const ext = recBlob.type.includes("ogg") ? "ogg" : "webm";
    const file = new File([recBlob], `audio-${Date.now()}.${ext}`, { type: recBlob.type || "audio/webm" });
    const ok = await sendSingleFile(file, "", replyTo?.id);
    if (ok) {
      cancelRecording();
      onCancelReply?.();
    }
  }

  async function sendSingleFile(file: File, caption: string, quotedId?: string): Promise<boolean> {
    const alvo = rotas.enviarMidia(slug, groupJid);
    if (!alvo) return false;
    setSending(true);
    setError(null);
    try {
      const form = new FormData();
      for (const [k, v] of Object.entries(alvo.campos)) form.set(k, v);
      form.set("kind", kindOf(file));
      form.set("file", file);
      if (caption.trim()) form.set("caption", caption.trim());
      if (quotedId) form.set("quotedId", quotedId);
      const res = checarSessao(await fetch(alvo.url, { method: "POST", body: form }), rotas);
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "falha no envio");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
      return false;
    } finally {
      setSending(false);
    }
  }

  async function sendNota() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = checarSessao(
        await fetch("/api/atendimento/notas-internas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, texto: body }),
        }),
        rotas,
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; nota?: NotaInterna; error?: string };
      if (!res.ok || !data.ok || !data.nota) throw new Error(data.error ?? "falha ao salvar nota");
      setText("");
      onNotaCriada?.(data.nota);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro ao salvar nota");
    } finally {
      setSending(false);
    }
  }

  async function submit() {
    if (sending) return;
    if (modoNota) {
      await sendNota();
      return;
    }
    if (semDestino) return;
    if (pending.length > 0) {
      const items = [...pending];
      const fallbackCaption = text.trim();
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const cap = item.caption.trim() || (i === 0 ? fallbackCaption : "");
        const ok = await sendSingleFile(item.file, cap, i === 0 ? replyTo?.id : undefined);
        if (!ok) return;
        removePending(item.id);
      }
      setText("");
      onCancelReply?.();
      setTimeout(onSent, 1200);
      return;
    }
    await sendText();
  }

  async function sendText() {
    const body = text.trim();
    const mentions = body ? activeMentions(body) : undefined;
    const pedido = body ? rotas.enviarTexto(slug, groupJid, body, { mentions, quotedId: replyTo?.id }) : null;
    if (!pedido || sending) return;
    setSending(true);
    setError(null);
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
      setText("");
      mentionsRef.current.clear();
      onCancelReply?.();
      setTimeout(onSent, 1000);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "erro";
      if (onSendFailed) {
        onSendFailed({ text: body, quotedId: replyTo?.id, mentions, error: errMsg });
        setText("");
        mentionsRef.current.clear();
        onCancelReply?.();
      } else {
        setError(errMsg);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="shrink-0 bg-bg px-7 pb-5 max-[860px]:px-3 max-[860px]:pb-3"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files?.length) {
          e.preventDefault();
          enqueueFiles(e.dataTransfer.files);
        }
      }}
    >
      <div
        className={`relative mx-auto max-w-[720px] rounded-[12px] border transition-[border-color,box-shadow,background-color] ${
          modoNota
            ? "border-warn/60 bg-warn-bg/35 focus-within:border-warn focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-warn)_20%,transparent)]"
            : "border-line-2 bg-surface focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-accent-soft)]"
        }`}
      >
        <div className="flex flex-wrap items-center gap-1 border-b border-line/70 px-2.5 py-1.5 text-[12px]">
          <button
            type="button"
            onClick={() => {
              setModoNota(false);
              setError(null);
            }}
            className={`rounded-[6px] px-2.5 py-1 font-medium transition-colors ${
              !modoNota ? "bg-surface-2 text-fg" : "text-fg-faint hover:text-fg"
            }`}
          >
            Responder ao cliente
          </button>
          <button
            type="button"
            onClick={() => {
              setModoNota(true);
              setError(null);
              setEmojiOpen(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 font-medium transition-colors ${
              modoNota ? "bg-warn-bg text-warn ring-1 ring-warn/35" : "text-fg-faint hover:text-fg"
            }`}
          >
            <Icone nome="lock" tamanho={12} />
            Nota privada
          </button>
          {modoNota && (
            <span className="truncate text-[11.5px] text-warn max-[640px]:hidden">
              Só a equipe vê · nunca vai pro WhatsApp
            </span>
          )}
          {acoesBarra && <div className="ml-auto flex shrink-0 items-center gap-1.5">{acoesBarra}</div>}
        </div>
        {/* Dropdown de /respostas ou @participantes */}
        {dropdownItemsCount > 0 && (
          <div
            role="listbox"
            className="absolute bottom-full left-0 right-0 z-30 mb-1.5 max-h-60 overflow-y-auto rounded-[10px] border border-line bg-surface p-1 [box-shadow:var(--float)]"
          >
            {activeTrigger?.type === "slash" &&
              slashMatches.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySlash(item);
                  }}
                  className={`flex w-full items-start gap-2.5 rounded-[7px] px-2.5 py-2 text-left text-[13px] ${
                    idx === pickerIndex ? "bg-accent-soft text-fg" : "hover:bg-surface-2"
                  }`}
                >
                  <code className="shrink-0 rounded-tag bg-elevated px-1.5 py-0.5 font-mono text-[11.5px] text-accent">
                    /{item.atalho}
                  </code>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-fg">{item.titulo}</span>
                    <span className="block truncate text-[12px] text-fg-faint">{item.texto}</span>
                  </span>
                </button>
              ))}
            {activeTrigger?.type === "mention" &&
              mentionMatches.map((p, idx) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyMention(p);
                  }}
                  className={`flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-[13px] ${
                    idx === pickerIndex ? "bg-accent-soft text-fg" : "hover:bg-surface-2"
                  }`}
                >
                  <span className="font-medium text-fg">@{p.nome}</span>
                  <span className="ml-auto font-mono text-[11px] text-fg-faint">{p.id}</span>
                </button>
              ))}
            {activeTrigger?.type === "team_mention" &&
              teamMentionMatches.map((m, idx) => (
                <button
                  key={m.login}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyTeamMention(m);
                  }}
                  className={`flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-[13px] ${
                    idx === pickerIndex ? "bg-warn-bg text-fg" : "hover:bg-surface-2"
                  }`}
                >
                  <span className="font-medium text-fg">{m.nome}</span>
                  <span className="ml-auto font-mono text-[11px] text-fg-faint">@{m.login}</span>
                </button>
              ))}
          </div>
        )}

        {rascunho?.(usar)}

        {/* Barra de Reply */}
        {replyTo && (
          <div className="mx-2.5 mt-2.5 flex items-center justify-between gap-2 rounded-control border border-line bg-surface-2 px-3 py-2 text-[12.5px]">
            <div className="min-w-0 flex-1 border-l-2 border-accent pl-2.5">
              <span className="block font-semibold text-fg">Respondendo a {replyTo.senderName}</span>
              <span className="block truncate text-fg-dim">{replyTo.text || "[mídia]"}</span>
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              aria-label="Cancelar resposta"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-fg-faint hover:bg-elevated hover:text-fg"
            >
              <Icone nome="x" tamanho={13} />
            </button>
          </div>
        )}

        {/* Bandeja de anexos pendentes */}
        {pending.length > 0 && (
          <div className="mx-2.5 mt-2.5 flex flex-col gap-2">
            {pending.map((item, idx) => (
              <div
                key={item.id}
                className="pop-in flex items-center gap-2.5 rounded-control border border-line bg-surface-2 p-2"
              >
                {item.kind === "image" && item.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt="" className="h-11 w-11 shrink-0 rounded object-cover" />
                ) : item.kind === "video" && item.url ? (
                  <video src={item.url} className="h-11 w-11 shrink-0 rounded object-cover" muted />
                ) : (
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded bg-elevated text-fg-dim">
                    <Icone nome="doc" tamanho={18} />
                  </span>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="truncate text-[12px] font-medium text-fg">{item.file.name}</div>
                  <input
                    type="text"
                    value={item.caption}
                    onChange={(e) => updatePendingCaption(item.id, e.target.value)}
                    placeholder={idx === 0 && pending.length === 1 ? "Legenda opcional (ou use o campo abaixo)…" : "Legenda opcional…"}
                    className="w-full rounded-[6px] border border-line bg-surface px-2 py-1 text-[12px] text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removePending(item.id)}
                  aria-label={`Remover ${item.file.name}`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-fg-faint hover:bg-elevated hover:text-danger"
                >
                  <Icone nome="x" tamanho={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Barra de gravação/preview de áudio */}
        {recState !== "idle" && (
          <div className="mx-2.5 mt-2.5 flex flex-wrap items-center gap-2 rounded-control border border-line bg-surface-2 px-3 py-2">
            {recState === "recording" ? (
              <>
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
                <span className="font-mono text-[13px] font-medium text-fg">Gravando {formatTimer(recSeconds)}</span>
                <span className="flex-1" />
                <Button type="button" variant="ghost" size="sm" onClick={cancelRecording}>
                  Cancelar
                </Button>
                <Button type="button" size="sm" onClick={stopRecording}>
                  Parar
                </Button>
              </>
            ) : (
              <>
                {recUrl && (
                  // biome-ignore lint/a11y/useMediaCaption: áudio gravado pelo operador
                  <audio controls src={recUrl} className="h-8 max-w-full flex-1" />
                )}
                <Button type="button" variant="ghost" size="sm" onClick={cancelRecording} disabled={sending}>
                  Descartar
                </Button>
                <Button type="button" size="sm" onClick={() => void sendAudio()} loading={sending}>
                  Enviar áudio
                </Button>
              </>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mx-3.5 mt-2.5 text-[12.5px] text-danger">
            Não saiu: {error}
          </p>
        )}

        <label className="sr-only" htmlFor={`resposta-${slug}`}>
          Mensagem para {nome}
        </label>
        <textarea
          id={`resposta-${slug}`}
          ref={taRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCursorPos(e.target.selectionStart ?? e.target.value.length);
          }}
          onSelect={(e) => setCursorPos(e.currentTarget.selectionStart ?? text.length)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (dropdownItemsCount > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setPickerIndex((i) => (i + 1) % dropdownItemsCount);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setPickerIndex((i) => (i - 1 + dropdownItemsCount) % dropdownItemsCount);
                return;
              }
              if ((e.key === "Enter" || e.key === "Tab") && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (activeTrigger?.type === "slash" && slashMatches[pickerIndex]) {
                  applySlash(slashMatches[pickerIndex]!);
                } else if (activeTrigger?.type === "mention" && mentionMatches[pickerIndex]) {
                  applyMention(mentionMatches[pickerIndex]!);
                } else if (activeTrigger?.type === "team_mention" && teamMentionMatches[pickerIndex]) {
                  applyTeamMention(teamMentionMatches[pickerIndex]!);
                }
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          placeholder={
            modoNota
              ? "Escrever nota privada para a equipe… (use @ para mencionar um colega)"
              : semDestino
                ? "Ainda não há mensagem nesta conversa para responder"
                : "Responder… (digite / para respostas prontas)"
          }
          disabled={(!modoNota && semDestino) || sending}
          className="block max-h-40 min-h-[46px] w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-[14px] leading-[1.5] text-fg outline-none placeholder:text-fg-mute disabled:opacity-60 max-[860px]:text-[16px]"
        />

        <div className="relative flex items-center gap-0.5 px-2 pb-2 pt-1">
          {!modoNota && (
            <>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) enqueueFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <IconButton
                size="sm"
                title="Anexar arquivos"
                aria-label="Anexar arquivos"
                onClick={() => fileRef.current?.click()}
                disabled={semDestino || sending}
                className="max-[860px]:h-10 max-[860px]:w-10"
              >
                <Icone nome="clip" />
              </IconButton>

              <IconButton
                size="sm"
                title="Inserir emoji"
                aria-label="Inserir emoji"
                aria-expanded={emojiOpen}
                onClick={() => setEmojiOpen((v) => !v)}
                disabled={semDestino || sending}
                className="max-[860px]:h-10 max-[860px]:w-10"
              >
                <Icone nome="smile" />
              </IconButton>

              {hasMic && recState === "idle" && (
                <IconButton
                  size="sm"
                  title="Gravar áudio"
                  aria-label="Gravar áudio"
                  onClick={() => void startRecording()}
                  disabled={semDestino || sending}
                  className="max-[860px]:h-10 max-[860px]:w-10"
                >
                  <Icone nome="mic" />
                </IconButton>
              )}

              {onPedirRascunho && (
                <IconButton
                  size="sm"
                  title="Pedir um rascunho à IA"
                  aria-label="Pedir um rascunho à IA"
                  onClick={onPedirRascunho}
                  className="max-[860px]:h-10 max-[860px]:w-10"
                >
                  <Icone nome="spark" />
                </IconButton>
              )}
            </>
          )}

          {emojiOpen && !modoNota && (
            <div
              role="dialog"
              aria-label="Selecionar emoji"
              className="absolute bottom-full left-2 z-30 mb-1.5 grid w-[272px] grid-cols-8 gap-1 rounded-[10px] border border-line bg-surface p-2 [box-shadow:var(--float)]"
            >
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => insertEmoji(em)}
                  className="grid h-8 w-8 place-items-center rounded-[6px] text-[17px] hover:bg-elevated"
                >
                  {em}
                </button>
              ))}
            </div>
          )}

          <span className="flex-1" />
          <span className="mr-2.5 text-[12px] text-fg-faint max-[860px]:hidden">Enter envia · ⇧ Enter quebra linha</span>
          <Button
            size="sm"
            variant={modoNota ? "atencao" : "primary"}
            onClick={() => void submit()}
            loading={sending}
            disabled={(!modoNota && semDestino) || (!text.trim() && (modoNota || pending.length === 0))}
            className="max-[860px]:h-10"
          >
            {!sending && <Icone nome={modoNota ? "lock" : "send"} tamanho={15} />}
            {sending
              ? modoNota
                ? "Salvando…"
                : "Enviando…"
              : modoNota
                ? "Salvar nota"
                : pending.length > 1
                  ? `Enviar (${pending.length})`
                  : "Enviar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
