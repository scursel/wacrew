import { NextResponse } from "next/server";
import { readTriage, setAlert, setAutonomo, setCopilot, setLastSeen, setMarkedUnread, setMuted, setNote, setSnooze, setStatus, setTypos, setEtiquetas, setAgente, setExecutor, setLatenciaMaxima, setSinalIgnorado, type StatusConversa } from "@/lib/triage";
import { resolverConversa } from "@/lib/equipe/resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readTriage());
}

interface BulkValue {
  slugs?: string[];
  op?: "resolver" | "silenciar" | "etiquetar" | "naoLida";
  muted?: boolean;
  etiqueta?: string;
}

interface TriagePost {
  action?: "resolved" | "status" | "snooze" | "markedUnread" | "bulk" | "muted" | "note" | "lastSeen" | "copilot" | "alertar" | "autonomo" | "typos" | "etiquetas" | "agente" | "executor" | "latenciaMaxima" | "ignorarSinal";
  slug?: string;
  value?: string | boolean | number | null | BulkValue | string[];
}

export async function POST(req: Request) {
  let body: TriagePost;
  try {
    body = (await req.json()) as TriagePost;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { action, slug, value } = body;

  if (action === "bulk") {
    const bulk = (value && typeof value === "object" && !Array.isArray(value) ? value : null) as BulkValue | null;
    const slugs = Array.isArray(bulk?.slugs) ? bulk.slugs.filter((s): s is string => typeof s === "string" && Boolean(s)) : [];
    if (slugs.length === 0 || !bulk?.op) {
      return NextResponse.json({ error: "bulk inválido" }, { status: 400 });
    }
    const agora = new Date().toISOString();
    const t = await readTriage();
    for (const s of slugs) {
      switch (bulk.op) {
        case "resolver":
          await resolverConversa(s, agora);
          break;
        case "silenciar":
          await setMuted(s, bulk.muted ?? true);
          break;
        case "naoLida":
          await setMarkedUnread(s, true);
          break;
        case "etiquetar": {
          const tag = typeof bulk.etiqueta === "string" ? bulk.etiqueta.trim() : "";
          if (tag) await setEtiquetas(s, [...(t.etiquetas[s] ?? []), tag]);
          break;
        }
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (typeof slug !== "string" || !slug) {
    return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  }

  switch (action) {
    case "resolved":
      if (typeof value !== "string") {
        return NextResponse.json({ error: "value deve ser string" }, { status: 400 });
      }
      await resolverConversa(slug, value);
      break;
    case "status":
      if (value !== null && value !== "aberta" && value !== "pendente" && value !== "adiada" && value !== "resolvida") {
        return NextResponse.json({ error: "status inválido" }, { status: 400 });
      }
      await setStatus(slug, value as StatusConversa | null);
      break;
    case "snooze":
      if (value !== null && typeof value !== "string") {
        return NextResponse.json({ error: "value deve ser string ISO ou null" }, { status: 400 });
      }
      await setSnooze(slug, value || null);
      break;
    case "markedUnread":
      if (typeof value !== "boolean") {
        return NextResponse.json({ error: "value deve ser boolean" }, { status: 400 });
      }
      await setMarkedUnread(slug, value);
      break;
    case "muted":
      if (typeof value !== "boolean") {
        return NextResponse.json({ error: "value deve ser boolean" }, { status: 400 });
      }
      await setMuted(slug, value);
      break;
    case "copilot":
      if (typeof value !== "boolean") {
        return NextResponse.json({ error: "value deve ser boolean" }, { status: 400 });
      }
      await setCopilot(slug, value);
      break;
    case "alertar":
      if (typeof value !== "boolean") {
        return NextResponse.json({ error: "value deve ser boolean" }, { status: 400 });
      }
      await setAlert(slug, value);
      break;
    case "note":
      if (typeof value !== "string") {
        return NextResponse.json({ error: "value deve ser string" }, { status: 400 });
      }
      await setNote(slug, value);
      break;
    case "lastSeen":
      if (typeof value !== "string") {
        return NextResponse.json({ error: "value deve ser string" }, { status: 400 });
      }
      await setLastSeen(slug, value);
      break;
    case "autonomo":
      if (typeof value !== "boolean") {
        return NextResponse.json({ error: "value deve ser boolean" }, { status: 400 });
      }
      await setAutonomo(slug, value);
      break;
    case "latenciaMaxima":
      if (value !== null && (typeof value !== "number" || !(value > 0))) {
        return NextResponse.json({ error: "value deve ser número > 0 ou null" }, { status: 400 });
      }
      await setLatenciaMaxima(slug, value);
      break;
    case "typos":
      if (typeof value !== "boolean") {
        return NextResponse.json({ error: "value deve ser boolean" }, { status: 400 });
      }
      await setTypos(slug, value === true);
      break;
    case "etiquetas":
      if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
        return NextResponse.json({ error: "value deve ser string[]" }, { status: 400 });
      }
      await setEtiquetas(slug, value);
      break;
    case "agente":
      if (value !== "off" && value !== "issue" && value !== "pr") {
        return NextResponse.json({ error: 'value deve ser "off", "issue" ou "pr"' }, { status: 400 });
      }
      await setAgente(slug, value);
      break;
    case "executor":
      if (value !== "claude" && value !== "copilot") {
        return NextResponse.json({ error: 'value deve ser "claude" ou "copilot"' }, { status: 400 });
      }
      await setExecutor(slug, value);
      break;
    case "ignorarSinal":
      if (typeof value !== "boolean") {
        return NextResponse.json({ error: "value deve ser boolean" }, { status: 400 });
      }
      await setSinalIgnorado(slug, value);
      break;
    default:
      return NextResponse.json({ error: "action inválida" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
