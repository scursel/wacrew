import { afterEach, describe, expect, it } from "vitest";
import { atualizarPresencaInterna, limparPresencaInterna } from "./presenca-interna";

describe("presenca-interna", () => {
  afterEach(() => {
    limparPresencaInterna();
  });

  it("retorna apenas os outros agentes ativos na mesma conversa", () => {
    expect(atualizarPresencaInterna("chat-1", { login: "ana", nome: "Ana" }, "vendo", 1000)).toEqual([]);
    const paraBruno = atualizarPresencaInterna("chat-1", { login: "bruno", nome: "Bruno" }, "digitando", 2000);
    expect(paraBruno).toHaveLength(1);
    expect(paraBruno[0]?.login).toBe("ana");

    const paraAna = atualizarPresencaInterna("chat-1", { login: "ana", nome: "Ana" }, "vendo", 3000);
    expect(paraAna).toHaveLength(1);
    expect(paraAna[0]).toMatchObject({ login: "bruno", estado: "digitando" });
  });

  it("remove ao sair e expira entradas após 15s", () => {
    atualizarPresencaInterna("chat-2", { login: "ana", nome: "Ana" }, "vendo", 1000);
    atualizarPresencaInterna("chat-2", { login: "bruno", nome: "Bruno" }, "digitando", 5000);

    // Ana sai explicitamente
    const restante = atualizarPresencaInterna("chat-2", { login: "ana", nome: "Ana" }, "saindo", 6000);
    expect(restante.map((x) => x.login)).toEqual(["bruno"]);

    // 20s depois, Bruno também já expirou (> 15s)
    const depois = atualizarPresencaInterna("chat-2", { login: "carla", nome: "Carla" }, "vendo", 25_000);
    expect(depois).toEqual([]);
  });
});
