import { eq } from 'drizzle-orm';
import type { Banco } from '../db/index.js';
import { sessoes, usuarios, type Usuario } from '../db/schema.js';
import { gerarToken, hashDoToken } from '../lib/token.js';

const DIA = 24 * 60 * 60 * 1000;
export const DURACAO_SESSAO = 30 * DIA;

export type UsuarioPublico = Pick<Usuario, 'id' | 'nome' | 'email' | 'papel'> & {
  emailVerificado: boolean;
};

export function publico(u: Usuario): UsuarioPublico {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    papel: u.papel,
    emailVerificado: u.emailVerificadoEm !== null,
  };
}

export async function criarSessao(db: Banco, usuarioId: string) {
  const token = gerarToken();
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO);
  await db.insert(sessoes).values({ id: hashDoToken(token), usuarioId, expiraEm });
  return { token, expiraEm };
}

// Devolve o usuário dono do token, ou null se a sessão não existe ou venceu.
// Se faltar menos da metade do prazo, a sessão é renovada: quem usa a loja
// com frequência não precisa ficar entrando de novo.
export async function validarSessao(db: Banco, token: string) {
  const id = hashDoToken(token);
  const [linha] = await db
    .select({ sessao: sessoes, usuario: usuarios })
    .from(sessoes)
    .innerJoin(usuarios, eq(sessoes.usuarioId, usuarios.id))
    .where(eq(sessoes.id, id));
  if (!linha) return null;

  const agora = Date.now();
  if (linha.sessao.expiraEm.getTime() <= agora) {
    await db.delete(sessoes).where(eq(sessoes.id, id));
    return null;
  }

  let expiraEm = linha.sessao.expiraEm;
  if (expiraEm.getTime() - agora < DURACAO_SESSAO / 2) {
    expiraEm = new Date(agora + DURACAO_SESSAO);
    await db.update(sessoes).set({ expiraEm }).where(eq(sessoes.id, id));
  }

  return { usuario: linha.usuario, expiraEm, renovada: expiraEm !== linha.sessao.expiraEm };
}

export async function encerrarSessao(db: Banco, token: string) {
  await db.delete(sessoes).where(eq(sessoes.id, hashDoToken(token)));
}

export async function encerrarTodasAsSessoes(db: Banco, usuarioId: string) {
  await db.delete(sessoes).where(eq(sessoes.usuarioId, usuarioId));
}
