import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPrompt } from "./copilot";

describe("buildPrompt com histórico de resumos", () => {
  it("injeta resumos datados em ordem cronológica com prioridade às mensagens recentes", () => {
    const p = buildPrompt({
      groupMemory: "",
      sharedMemory: "",
      resumos: [
        { texto: "Revisão de 60 mil km agendada.", em: "2026-11-27T13:52:00.000Z" },
        { texto: "Pediu orçamento de pastilha de freio.", em: "2026-10-12T17:20:00.000Z" },
      ],
      messages: [{ id: "m1", timestamp: "2026-11-27T14:00:00.000Z", hora_brt: "11:00", de: "Carlos", papel: "client", tipo: "text", texto: "Ficou pronto?" }],
      action: "sugerir",
      chat: [],
    });

    const ctx = p.messages[0]?.content ?? "";
    expect(ctx).toContain("HISTÓRICO DE RESUMOS ANTERIORES DESTA CONVERSA");
    expect(ctx).toContain("mensagens recentes SEMPRE prevalecem");
    expect(ctx).toContain("[12/10/2026 14:20] Pediu orçamento de pastilha de freio.");
    expect(ctx).toContain("[27/11/2026 10:52] Revisão de 60 mil km agendada.");
    expect(ctx.indexOf("12/10/2026")).toBeLessThan(ctx.indexOf("27/11/2026"));
  });

  it("omite o bloco de resumos quando não há histórico salvo", () => {
    const p = buildPrompt({
      groupMemory: "",
      sharedMemory: "",
      messages: [],
      action: "sugerir",
      chat: [],
    });
    expect(p.messages[0]?.content ?? "").not.toContain("HISTÓRICO DE RESUMOS ANTERIORES");
  });
});

describe("buildContext", () => {
  let dir = "";

  beforeEach(async () => {
    vi.resetModules();
    dir = await mkdtemp(join(tmpdir(), "copilot-ctx-"));
    vi.stubEnv("WAC_DATA_DIR", dir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  it("não corta contexto pelo lastSeen e carrega até 5 resumos salvos da conversa", async () => {
    await mkdir(join(dir, "dm-554799999999"), { recursive: true });
    await writeFile(
      join(dir, "dm-554799999999", "messages.jsonl"),
      [
        JSON.stringify({ id: "m1", timestamp: "2026-11-26T10:00:00.000Z", group: "Carlos", groupJid: "554799999999@s.whatsapp.net", sender: "554799999999@s.whatsapp.net", senderName: "Carlos", fromMe: false, type: "text", text: "Troca de óleo Civic", quotedText: null, mediaPath: null }),
        JSON.stringify({ id: "m2", timestamp: "2026-11-27T11:00:00.000Z", group: "Carlos", groupJid: "554799999999@s.whatsapp.net", sender: "554799999999@s.whatsapp.net", senderName: "Carlos", fromMe: false, type: "text", text: "Ficou pronto?", quotedText: null, mediaPath: null }),
      ].join("\n") + "\n",
    );
    await writeFile(
      join(dir, ".triage.json"),
      JSON.stringify({ lastSeen: { "dm-554799999999": "2026-11-27T09:00:00.000Z" } }),
    );
    const historico = Array.from({ length: 7 }, (_, i) => ({
      texto: `Resumo ${i + 1}`,
      em: `2026-11-2${i}T12:00:00.000Z`,
    }));
    await writeFile(
      join(dir, ".resumos-conversa.json"),
      JSON.stringify({ "dm-554799999999": { ...historico[6], historico } }),
    );

    const { buildContext } = await import("./copilot");
    const ctx = await buildContext("dm-554799999999");

    // Mantém m1 mesmo sendo anterior ao lastSeen
    expect(ctx.messages.map((m) => m.texto)).toEqual(["Troca de óleo Civic", "Ficou pronto?"]);
    // Limita aos 5 resumos mais recentes
    expect(ctx.resumos).toHaveLength(5);
    expect(ctx.resumos[0]?.texto).toBe("Resumo 7");
  });
});
