import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { avaliarAutomacoes, lerAutomacoes, removerAutomacao, salvarAutomacao } from "./automacoes";

describe("automacoes", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wac-auto-"));
  });

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("salva, avalia condições e remove regras", async () => {
    const r1 = await salvarAutomacao(
      {
        nome: "Orçamento DM",
        ativo: true,
        gatilho: "mensagem_recebida",
        condicoes: { contemTexto: "orçamento", apenasDm: true },
        acoes: { adicionarEtiqueta: "Orçamento" },
      },
      dir,
    );
    await salvarAutomacao(
      {
        nome: "Fora do horário",
        ativo: false,
        gatilho: "fora_do_expediente",
        condicoes: {},
        acoes: { criarNotaInterna: "Fora do expediente" },
      },
      dir,
    );

    const regras = await lerAutomacoes(dir);
    expect(regras).toHaveLength(2);

    const match = avaliarAutomacoes(regras, {
      gatilho: "mensagem_recebida",
      texto: "Quero um ORÇAMENTO de troca de óleo",
      ehDm: true,
    });
    expect(match.map((r) => r.id)).toEqual([r1.id]);

    const semMatchGrupo = avaliarAutomacoes(regras, {
      gatilho: "mensagem_recebida",
      texto: "orçamento",
      ehDm: false,
    });
    expect(semMatchGrupo).toEqual([]);

    expect(await removerAutomacao(r1.id, dir)).toBe(true);
    expect(await lerAutomacoes(dir)).toHaveLength(1);
  });
});
