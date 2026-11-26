import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assinarPayloadWebhook,
  dispararWebhook,
  lerWebhooks,
  removerWebhook,
  salvarWebhook,
} from "./webhooks";

describe("webhooks", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wac-wh-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("gera assinatura HMAC-SHA256 determinística e valida URL", async () => {
    expect(assinarPayloadWebhook('{"ok":true}', "segredo")).toMatch(/^sha256=[a-f0-9]{64}$/);
    await expect(
      salvarWebhook({ nome: "Inv", url: "ftp://exemplo.com/hook", eventos: ["message.sent"], ativo: true }, dir),
    ).rejects.toThrow();

    const wh = await salvarWebhook(
      { nome: "n8n", url: "https://n8n.local/hook", secret: "abc", eventos: ["conversation.resolved"], ativo: true },
      dir,
    );
    expect(await lerWebhooks(dir)).toHaveLength(1);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));
    const res = await dispararWebhook("conversation.resolved", { slug: "cliente-1" }, dir);
    expect(res).toEqual({ enviados: 1, ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init?.headers as Record<string, string>)["X-Wacrew-Signature-256"]).toMatch(/^sha256=/);

    expect(await removerWebhook(wh.id, dir)).toBe(true);
  });
});
