import type { NextResponse } from "next/server";
import { assinarSessao, cookieSeguro, SESSION_COOKIE, type Sessao, VALIDADE_S } from "@/lib/equipe/sessao";

export { cookieSeguro };

/** Grava o cookie de sessão com as mesmas opções em todo jeito de entrar (senha, Google, código). */
export function comCookieDeSessao<T extends NextResponse>(
  res: T,
  sessao: Sessao,
  chave: string,
  req?: { url: string; headers: Headers },
): T {
  res.cookies.set(SESSION_COOKIE, assinarSessao(sessao, chave), {
    httpOnly: true,
    secure: cookieSeguro(req),
    sameSite: "lax",
    path: "/",
    maxAge: VALIDADE_S[sessao.p],
  });
  return res;
}

/** Pausa em falha: desanima força bruta e iguala o tempo de quem tem e quem não tem acesso. */
export function pausa(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
