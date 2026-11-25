import { gerarSenha, hashSenha } from './senha';
import { alterarUsuarios, lerUsuarios, LOGIN_RE, publico, type Usuario, type UsuarioPublico } from './usuarios';
import { apagarVisto } from './visto';
import { alterarDepartamentos, gravarNomeDono } from './departamentos';
import { liberarLogin, limparDepartamento } from './atribuicoes';

export type Comando =
  | { acao: 'criar'; login: string; nome: string; senha?: string }
  | { acao: 'editar'; login: string; nome: string }
  | { acao: 'senha'; login: string; senha?: string }
  | { acao: 'ativo'; login: string; ativo: boolean }
  | { acao: 'apagar'; login: string }
  | { acao: 'dep-criar'; nome: string; descricao?: string }
  | { acao: 'dep-editar'; id: string; nome: string; descricao?: string }
  | { acao: 'dep-apagar'; id: string }
  | { acao: 'dep-membros'; id: string; membros: string[] }
  | { acao: 'nome-dono'; nome: string };

const SENHA_MIN = 8;

function senhaOuGerada(senha: string | undefined): { senha: string; gerada?: string } {
  if (senha === undefined || senha === '') {
    const gerada = gerarSenha();
    return { senha: gerada, gerada };
  }
  if (senha.length < SENHA_MIN) throw new Error(`senha precisa de pelo menos ${SENHA_MIN} caracteres`);
  return { senha };
}

const ACOES = new Set(['criar', 'editar', 'senha', 'ativo', 'apagar', 'dep-criar', 'dep-editar', 'dep-apagar', 'dep-membros', 'nome-dono']);

/** O corpo vem da rede: confere o formato antes de tocar em qualquer campo. */
function validarComando(c: unknown): asserts c is Comando {
  const ok = (() => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
    const x = c as Record<string, unknown>;
    if (typeof x.acao !== 'string' || !ACOES.has(x.acao)) return false;
    if (!x.acao.startsWith('dep-') && x.acao !== 'nome-dono' && typeof x.login !== 'string') return false;
    const senhaOk = x.senha === undefined || typeof x.senha === 'string';
    switch (x.acao) {
      case 'criar':
        return typeof x.nome === 'string' && senhaOk;
      case 'editar':
        return typeof x.nome === 'string';
      case 'senha':
        return senhaOk;
      case 'ativo':
        return typeof x.ativo === 'boolean';
      case 'dep-criar': return typeof x.nome === 'string' && (x.descricao === undefined || typeof x.descricao === 'string');
      case 'dep-editar': return typeof x.id === 'string' && typeof x.nome === 'string' && (x.descricao === undefined || typeof x.descricao === 'string');
      case 'dep-apagar': return typeof x.id === 'string';
      case 'dep-membros': return typeof x.id === 'string' && Array.isArray(x.membros) && x.membros.every((s) => typeof s === 'string');
      case 'nome-dono': return typeof x.nome === 'string';
      default:
        return true;
    }
  })();
  if (!ok) throw new Error('comando inválido');
}

/**
 * Versão inicial de uma conta: o relógio, nunca um número fixo. Um login
 * apagado e recriado não pode repetir a versão da conta anterior, senão os
 * cookies dela voltariam a valer.
 */
let ultimaVersao = 0;
function versaoInicial(): number {
  ultimaVersao = Math.max(Date.now(), ultimaVersao + 1);
  return ultimaVersao;
}

function achar(lista: Usuario[], login: string): Usuario {
  const u = lista.find((x) => x.login === login);
  if (!u) throw new Error(`conta "${login}" não existe`);
  return u;
}

export async function executar(
  c: Comando,
  donoLogin: string,
  agora = new Date(),
): Promise<{ usuario?: UsuarioPublico; senhaGerada?: string }> {
  validarComando(c);
  if (c.acao === 'nome-dono') { await gravarNomeDono(c.nome); return {}; }
  if (c.acao === 'dep-criar' || c.acao === 'dep-editar') {
    const nome = c.nome.trim();
    if (!nome) throw new Error('nome é obrigatório');
    await alterarDepartamentos((lista) => {
      if (c.acao === 'dep-editar') {
        const d = lista.find((x) => x.id === c.id);
        if (!d) throw new Error('departamento inexistente');
        d.nome = nome; d.descricao = (c.descricao ?? '').trim();
      } else {
        const base = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (!base) throw new Error('nome de departamento inválido');
        let id = base; let n = 2;
        while (lista.some((d) => d.id === id)) id = `${base}-${n++}`;
        lista.push({ id, nome, descricao: (c.descricao ?? '').trim(), membros: [] });
      }
    });
    return {};
  }
  if (c.acao === 'dep-apagar') {
    await alterarDepartamentos((lista) => { const i = lista.findIndex((d) => d.id === c.id); if (i < 0) throw new Error('departamento inexistente'); lista.splice(i, 1); });
    await limparDepartamento(c.id);
    return {};
  }
  if (c.acao === 'dep-membros') {
    const membros = [...new Set(c.membros.map((m) => m.trim().toLowerCase()))];
    const usuarios = await lerUsuarios();
    const ausente = membros.find((m) => !usuarios.some((u) => u.login === m));
    if (ausente !== undefined) throw new Error(`conta inexistente: ${ausente}`);
    await alterarDepartamentos((lista) => { const d = lista.find((x) => x.id === c.id); if (!d) throw new Error('departamento inexistente'); d.membros = membros; });
    return {};
  }
  const login = c.login.trim().toLowerCase();

  if (c.acao === 'criar') {
    if (!LOGIN_RE.test(login)) throw new Error('login: use 2 a 32 letras minúsculas, números, ponto, hífen ou _');
    if (login === donoLogin.toLowerCase()) throw new Error('esse login é o do dono');
    const nome = c.nome.trim();
    if (!nome) throw new Error('nome é obrigatório');
    const { senha, gerada } = senhaOuGerada(c.senha);
    const hash = await hashSenha(senha);
    const usuario = await alterarUsuarios((lista) => {
      if (lista.some((u) => u.login === login)) throw new Error(`login "${login}" já existe`);
      const novo: Usuario = {
        login, nome, senha: hash, ativo: true, versao: versaoInicial(), chats: [],
        criadoEm: agora.toISOString(), ultimoAcesso: null,
      };
      lista.push(novo);
      return publico(novo);
    });
    return gerada ? { usuario, senhaGerada: gerada } : { usuario };
  }

  if (c.acao === 'senha') {
    const { senha, gerada } = senhaOuGerada(c.senha);
    const hash = await hashSenha(senha);
    const usuario = await alterarUsuarios((lista) => {
      const u = achar(lista, login);
      u.senha = hash;
      u.versao += 1;
      return publico(u);
    });
    return gerada ? { usuario, senhaGerada: gerada } : { usuario };
  }

  if (c.acao === 'apagar') {
    await alterarUsuarios((lista) => {
      const i = lista.findIndex((u) => u.login === login);
      if (i < 0) throw new Error(`conta "${login}" não existe`);
      lista.splice(i, 1);
    });
    await liberarLogin(login);
    await alterarDepartamentos((lista) => { for (const d of lista) d.membros = d.membros.filter((m) => m !== login); });
    try {
      await apagarVisto(login);
    } catch (e) {
      // A conta já saiu; o visto órfão não deve virar erro de uma remoção feita.
      console.error('apagar conta: visto não removido', e);
    }
    return {};
  }

  const usuario = await alterarUsuarios((lista) => {
    const u = achar(lista, login);
    if (c.acao === 'editar') {
      const nome = c.nome.trim();
      if (!nome) throw new Error('nome é obrigatório');
      u.nome = nome;
    } else if (c.acao === 'ativo') {
      u.ativo = c.ativo;
      u.versao += 1;
    }
    return publico(u);
  });
  if (c.acao === 'ativo' && !c.ativo) await liberarLogin(login);
  return { usuario };
}
