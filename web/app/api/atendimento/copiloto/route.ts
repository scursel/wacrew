import { NextResponse } from "next/server";
import { buildContext, buildPrompt, type ChatMessage, COPILOT_MAX_TOKENS, type CopilotAction, isCopilotEnabled } from "@/lib/copilot";
import { atendenteDoPedido, ErroHttp, exigirChat, respostaDeErro } from "@/lib/equipe/acesso";
import { resolveProvider, streamCopilot, temDestino } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function frame(data: string): Uint8Array {
  return new TextEncoder().encode(`data: ${data}\n\n`);
}

export async function GET() {
  try {
    const a = await atendenteDoPedido();
    if (!a.usuario.copilotoLiberado) {
      return NextResponse.json({ ready: false, allowed: false });
    }
    const p = await resolveProvider();
    if (!p) return NextResponse.json({ ready: false, allowed: true });
    return NextResponse.json({
      ready: true,
      allowed: true,
      label: p.label,
      model: p.modelFor(),
      draftModel: p.modelFor("rascunhar"),
    });
  } catch (e) {
    return respostaDeErro(e);
  }
}

export async function POST(req: Request) {
  try {
    const a = await atendenteDoPedido();
    if (!a.usuario.copilotoLiberado) {
      throw new ErroHttp(403, "Copiloto não liberado para este usuário.");
    }
    const body = (await req.json().catch(() => null)) as {
      slug?: unknown;
      action?: unknown;
      messages?: unknown;
    } | null;

    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    if (!slug) throw new ErroHttp(400, "slug inválido");
    exigirChat(a, slug);

    const action = body?.action === "resumir" || body?.action === "rascunhar" ? (body.action as CopilotAction) : undefined;
    const chat: ChatMessage[] = Array.isArray(body?.messages)
      ? body.messages.filter(
          (m): m is ChatMessage =>
            Boolean(m) &&
            typeof m === "object" &&
            ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
            typeof (m as ChatMessage).content === "string",
        )
      : [];

    if (!(await isCopilotEnabled(slug))) {
      return NextResponse.json({ error: "copilot_disabled" }, { status: 403 });
    }

    const provider = await resolveProvider();
    if (!provider) {
      return NextResponse.json({ error: "no_provider" }, { status: 503 });
    }
    if (!temDestino(provider, action)) return NextResponse.json({ error: "no_provider" }, { status: 503 });

    const { groupMemory, sharedMemory, messages } = await buildContext(slug);
    const prompt = buildPrompt({ groupMemory, sharedMemory, messages, action, chat });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const text of streamCopilot(provider, {
            prompt,
            action,
            maxTokens: COPILOT_MAX_TOKENS,
            signal: req.signal,
          })) {
            controller.enqueue(frame(JSON.stringify({ text })));
          }
          controller.enqueue(frame("[DONE]"));
        } catch (err) {
          if ((err as Error)?.name === "AbortError") {
            controller.close();
            return;
          }
          const message = err instanceof Error ? err.message : "falha no copiloto";
          controller.enqueue(frame(JSON.stringify({ error: message })));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return respostaDeErro(e);
  }
}
