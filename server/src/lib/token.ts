import { createHash, randomBytes } from 'node:crypto';

export const gerarToken = () => randomBytes(32).toString('base64url');

export const hashDoToken = (token: string) => createHash('sha256').update(token).digest('hex');
