import { NextResponse } from "next/server";
import { slugValido } from "@/lib/api-v1";
import { readGroupRecords } from "@/lib/data";
import { fundirMensagens } from "@/lib/dm-irmaos";
import { resolverIrmaosDm } from "@/lib/dm-conversa";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AnchorBody {
  id?: unknown;
  timestampMs?: unknown;
  fromMe?: unknown;
  sender?: unknown;
}

function ancoraDoCorpo(a: AnchorBody | null | undefined): {
  id: string;
  timestampMs: number;
  fromMe: boolean;
  sender: string;
} | null {
  if (!a || typeof a !== "object") return null;
  const id = typeof a.id === "string" ? a.id.trim() : "";
  const timestampMs = typeof a.timestampMs === "number" ? a.timestampMs : Number(a.timestampMs);
  const sender = typeof a.sender === "string" ? a.sender : "";
  if (!id || !Number.isFinite(timestampMs) || !sender) return null;
  return { id, timestampMs, fromMe: Boolean(a.fromMe), sender };
}

async function ancoraMaisAntiga(irmaos: string[]): Promise<{
  anchor: { id: string; timestampMs: number; fromMe: boolean; sender: string };
  jid: string | null;
} | null> {
  const listas = await Promise.all(irmaos.map((s) => readGroupRecords(s)));
  const maisAntiga = fundirMensagens(listas)[0];
  if (!maisAntiga) return null;
  const timestampMs = Date.parse(maisAntiga.timestamp);
  if (!Number.isFinite(timestampMs)) return null;
  return {
    anchor: {
      id: maisAntiga.id,
      timestampMs,
      fromMe: Boolean(maisAntiga.fromMe),
      sender: maisAntiga.sender,
    },
    jid: maisAntiga.groupJid || null,
  };
}

function jidFallback(slug: string, jid: string | null | undefined): string | undefined {
  if (typeof jid === "string" && jid.trim()) return jid.trim();
  const dm = /^dm-(\d+)$/.exec(slug);
  return dm?.[1] ? `${dm[1]}@s.whatsapp.net` : undefined;
}

export async function POST(req: Request) {
  let body: {
    slug?: unknown;
    jid?: unknown;
    count?: unknown;
    anchor?: AnchorBody;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slugValido(slug)) {
    return NextResponse.json({ ok: false, error: "slug inválido" }, { status: 400 });
  }

  const { irmaos, canonico } = await resolverIrmaosDm(slug);
  let anchor = ancoraDoCorpo(body.anchor);
  let jid = typeof body.jid === "string" ? body.jid.trim() : "";
  if (!anchor) {
    const antiga = await ancoraMaisAntiga(irmaos);
    if (!antiga) {
      return NextResponse.json(
        { ok: false, error: "nenhuma mensagem local para ancorar o histórico" },
        { status: 400 },
      );
    }
    anchor = antiga.anchor;
    if (!jid) jid = antiga.jid ?? "";
  }

  const countRaw = typeof body.count === "number" ? body.count : Number(body.count);
  const count = Number.isFinite(countRaw) && countRaw > 0 ? Math.min(Math.floor(countRaw), 200) : undefined;
  const payload: Record<string, unknown> = {
    slug: canonico,
    anchor,
  };
  const jidFinal = jidFallback(canonico, jid || null);
  if (jidFinal) payload.jid = jidFinal;
  if (count !== undefined) payload.count = count;

  try {
    const res = await fetch(`${CONTROL_URL}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({ ok: false, error: "resposta inválida do coletor" }))) as Record<
      string,
      unknown
    >;
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: false, error: "coletor fora do ar" }, { status: 502 });
  }
}
