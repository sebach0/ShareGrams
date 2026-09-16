import { apiFetch } from './client';
import type { AuthResult } from './types';

export function registerRequest(email: string, password: string, name?: string): Promise<AuthResult> {
  return apiFetch<AuthResult>('/auth/register', { method: 'POST', body: { email, password, name } });
}

export function loginRequest(email: string, password: string): Promise<AuthResult> {
  return apiFetch<AuthResult>('/auth/login', { method: 'POST', body: { email, password } });
}
