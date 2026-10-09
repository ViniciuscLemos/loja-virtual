import bcrypt from 'bcryptjs';
import { config } from '../config.js';

// low cost in tests, otherwise each sign up takes around 200ms
const cost = config.NODE_ENV === 'test' ? 4 : 12;

export const hashPassword = (password: string) => bcrypt.hash(password, cost);

export const checkPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

// Used when the email doesn't exist: compares against some hash so the response
// takes the same time and doesn't give away which emails have an account.
const fakeHash = bcrypt.hashSync('a-password-nobody-uses', cost);
export const wasteTime = (password: string) => bcrypt.compare(password, fakeHash);
