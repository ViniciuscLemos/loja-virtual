import bcrypt from 'bcryptjs';
import { config } from '../config.js';

// custo baixo nos testes senão cada cadastro leva uns 200ms
const custo = config.NODE_ENV === 'test' ? 4 : 12;

export const gerarHash = (senha: string) => bcrypt.hash(senha, custo);

export const conferirSenha = (senha: string, hash: string) => bcrypt.compare(senha, hash);

// Usado quando o e-mail não existe: compara com um hash qualquer pra resposta
// demorar o mesmo tempo e não entregar quais e-mails têm conta.
const hashFalso = bcrypt.hashSync('senha-que-ninguem-usa', custo);
export const gastarTempo = (senha: string) => bcrypt.compare(senha, hashFalso);
