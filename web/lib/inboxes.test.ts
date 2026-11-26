import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lerInboxes, removerInbox, resolverInbox, salvarInbox } from "./inboxes";

describe("inboxes multi-chip", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wac-inbox-"));
  });

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("garante canal principal, cria secundários e impede remover o principal", async () => {
    const iniciais = await lerInboxes(dir);
    expect(iniciais.some((i) => i.id === "principal" && i.padrao)).toBe(true);

    const sec = await salvarInbox(
      {
        nome: "Chip Vendas",
        numero: "5511999998888",
        controlUrl: "http://127.0.0.1:4201/",
        departamentoPadrao: "comercial",
        ativo: true,
      },
      dir,
    );
    expect(sec.controlUrl).toBe("http://127.0.0.1:4201");
    expect((await resolverInbox(sec.id, dir)).nome).toBe("Chip Vendas");
    expect((await resolverInbox(undefined, dir)).id).toBe("principal");

    await expect(removerInbox("principal", dir)).rejects.toThrow();
    expect(await removerInbox(sec.id, dir)).toBe(true);
  });
});
