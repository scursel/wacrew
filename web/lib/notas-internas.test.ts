import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adicionarNotaInterna, extrairMencoesInternas, lerNotasInternas } from "./notas-internas";

describe("notas-internas", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wac-notas-"));
  });

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("extrai menções @login únicas e normalizadas", () => {
    expect(extrairMencoesInternas("Oi @Ana, veja com @bruno.silva e @ana por favor")).toEqual([
      "ana",
      "bruno.silva",
    ]);
    expect(extrairMencoesInternas("Sem mencoes e email teste@empresa.com")).toEqual([]);
  });

  it("grava e lê notas privadas em ordem cronológica", async () => {
    const n1 = await adicionarNotaInterna(
      "cliente-a",
      { autor: "ana", autorNome: "Ana", texto: "Cliente aguardando retorno @bruno" },
      dir,
    );
    expect(n1.mencoes).toEqual(["bruno"]);

    const n2 = await adicionarNotaInterna(
      "cliente-a",
      { autor: "bruno", autorNome: "Bruno", texto: "Já assumindo aqui" },
      dir,
    );
    expect(n2.id).toMatch(/^nota-/);

    const lidas = await lerNotasInternas("cliente-a", dir);
    expect(lidas).toHaveLength(2);
    expect(lidas[0]?.texto).toBe("Cliente aguardando retorno @bruno");
    expect(lidas[1]?.autor).toBe("bruno");
  });

  it("recusa texto vazio", async () => {
    await expect(
      adicionarNotaInterna("cliente-a", { autor: "ana", autorNome: "Ana", texto: "   " }, dir),
    ).rejects.toThrow("texto obrigatório");
  });
});
