import { afterEach, describe, expect, it, vi } from "vitest";
import { avaliarPostura, type LinhaHistorico, lerVeredito, precisaAvaliar } from "./postura";

// Escolha da tela de modelos de IA; null = padrão (OpenRouter + env).
const escolha = vi.hoisted(() => ({ destino: null as unknown }));
vi.mock("@/lib/ia/provedor", () => ({
  resolverIA: async (_funcao: string, padrao: object) => escolha.destino ?? { via: "padrao", ...padrao },
}));

afterEach(() => {
  escolha.destino = null;
});

const l = (quem: LinhaHistorico["quem"], texto: string): LinhaHistorico => ({ quem, nome: quem === "cliente" ? "Fulano" : quem, hora: "15/10 15:00", texto });

const respostaOpenRouter = (conteudo: unknown) =>
  (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(conteudo) } }] }), { status: 200 })) as unknown as typeof fetch;

/** Mock de fetch com a assinatura inteira, pra inspecionar URL/headers/body. */
const fetchMockado = (impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => vi.fn(impl);

describe("precisaAvaliar", () => {
  it("avalia quando o cliente falou depois da minha última", () => {
    expect(precisaAvaliar([l("eu", "subiu"), l("cliente", "ENTENDEU sobre os planos ?")])).toBe(true);
  });
  it("pula follow-up meu sem concessão nem conserto", () => {
    expect(precisaAvaliar([l("cliente", "ok"), l("eu", "fechado")], ["te mando a prévia amanhã cedo"])).toBe(false);
  });
  it("avalia rascunho que concede ou se desculpa mesmo sem fala nova do cliente", () => {
    expect(precisaAvaliar([l("cliente", "nada funciona"), l("eu", "vi aqui")], ["verdade, desculpa"])).toBe(true);
    expect(precisaAvaliar([l("cliente", "te passei ontem"), l("eu", "vi aqui")], ["passou sim, já faço"])).toBe(true);
  });
  it("avalia rascunho que anuncia conserto mesmo sem fala nova do cliente", () => {
    expect(precisaAvaliar([l("cliente", "erro no relatório"), l("eu", "vi aqui")], ["relatório arrumado, já tá no ar"])).toBe(true);
  });
});

describe("lerVeredito", () => {
  it("com rascunho, falha vira hit grave com a sugestão do modelo", () => {
    const r = lerVeredito(
      { entendimento: { falhou: true, trecho: "Esses são os NOSSOS planos", sugestao: "planos só da sua equipe, certo?" }, concordancia: { falhou: false }, conserto: { falhou: false } },
      true,
    );
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]).toMatchObject({ regra: "entendimento", peso: 4, sugestao: "planos só da sua equipe, certo?" });
    expect(r.alertas).toEqual([]);
  });
  it("sem rascunho, risco vira alerta e nunca hit", () => {
    const r = lerVeredito({ conserto: { risco: true, trecho: "relatório, 4ª vez", sugestao: "mostra o relatório refeito" } }, false);
    expect(r.hits).toEqual([]);
    expect(r.alertas[0]).toContain("conserto: mostra o relatório refeito");
  });
  it("cobrança vira hit com a frase de posição", () => {
    const r = lerVeredito({ cobranca: { falhou: true, trecho: "te passei o arquivo ontem", sugestao: "o arquivo não chegou não" } }, true);
    expect(r.hits[0]).toMatchObject({ regra: "cobranca", peso: 4, sugestao: "o arquivo não chegou não" });
  });
  it("sugestão vazia cai no texto padrão e lixo não quebra", () => {
    expect(lerVeredito({ concordancia: { falhou: true, sugestao: "" } }, true).hits[0]?.sugestao).toMatch(/custo ou o impacto/);
    expect(lerVeredito("lixo", true)).toEqual({ hits: [], alertas: [] });
  });
});

describe("avaliarPostura", () => {
  const historico = [l("eu", "subi os 3 no painel"), l("cliente", "ENTENDEU sobre os planos ?")];

  it("devolve os hits do modelo", async () => {
    const r = await avaliarPostura({
      historico,
      baloes: ["entendi sim, já tirei"],
      chave: "x",
      fetchFn: respostaOpenRouter({ entendimento: { falhou: true, trecho: "ENTENDEU", sugestao: "diz o que entendeu" } }),
    });
    expect(r.avaliado).toBe(true);
    expect(r.hits.map((h) => h.regra)).toEqual(["entendimento"]);
  });
  it("falha da OpenRouter não segura o envio", async () => {
    const r = await avaliarPostura({ historico, baloes: ["entendi sim"], chave: "x", fetchFn: (async () => new Response("sem saldo", { status: 402 })) as unknown as typeof fetch });
    expect(r).toMatchObject({ hits: [], avaliado: false });
    expect(r.erro).toContain("402");
  });
  it("sem chave não chama nada", async () => {
    const antes = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const r = await avaliarPostura({ historico, baloes: ["entendi sim"], chave: "" });
    if (antes !== undefined) process.env.OPENROUTER_API_KEY = antes;
    expect(r.avaliado).toBe(false);
  });

  it("destino 9router: chama o 9router com a chave salva e o combo escolhido", async () => {
    escolha.destino = { via: "9router", baseUrl: "http://9r.test/v1", chave: "chave-9r", modelo: "leve" };
    const fetchMock = fetchMockado(async () => new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 }));

    const r = await avaliarPostura({ historico, baloes: ["entendi sim"], fetchFn: fetchMock });

    expect(r.avaliado).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("http://9r.test/v1/chat/completions");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer chave-9r" });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe("leve");
  });

  it("erro do 9router diz 9router, não OpenRouter", async () => {
    escolha.destino = { via: "9router", baseUrl: "http://9r.test/v1", chave: "chave-9r", modelo: "leve" };
    const r = await avaliarPostura({
      historico,
      baloes: ["entendi sim"],
      fetchFn: (async () => new Response("sem saldo", { status: 402 })) as unknown as typeof fetch,
    });
    expect(r.erro).toMatch(/9router/);
    expect(r.erro).not.toMatch(/OpenRouter/);
  });

  it("opções explícitas (chave/modelo) continuam valendo acima do 9router", async () => {
    escolha.destino = { via: "9router", baseUrl: "http://9r.test/v1", chave: "chave-9r", modelo: "leve" };
    const fetchMock = fetchMockado(async () => new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 }));

    await avaliarPostura({ historico, baloes: ["entendi sim"], chave: "chave-explicita", modelo: "modelo-x", fetchFn: fetchMock });

    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer chave-explicita" });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe("modelo-x");
  });
});
