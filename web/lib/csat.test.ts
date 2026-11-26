import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lerCsat, registrarCsat, resumoCsat } from "./csat";

describe("csat", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wac-csat-"));
  });

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("registra notas de 1 a 5 e agrega média e distribuição", async () => {
    await registrarCsat({ slug: "c1", nota: 5, agente: "ana", comentario: "Ótimo" }, dir);
    await registrarCsat({ slug: "c2", nota: 4, agente: "ana" }, dir);
    await registrarCsat({ slug: "c3", nota: 3, agente: "bruno" }, dir);

    const lista = await lerCsat(dir);
    expect(lista).toHaveLength(3);

    const res = resumoCsat(lista);
    expect(res.total).toBe(3);
    expect(res.media).toBe(4);
    expect(res.distribuicao).toEqual({ 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 });
    expect(res.porAgente.ana).toEqual({ total: 2, soma: 9, media: 4.5 });
  });

  it("rejeita notas fora do intervalo 1..5", async () => {
    await expect(registrarCsat({ slug: "c1", nota: 6 }, dir)).rejects.toThrow();
  });
});
