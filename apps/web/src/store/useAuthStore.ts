import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { loginRequest, registerRequest } from '../api/auth';
import { ApiError } from '../api/client';
import type { PublicUser } from '../api/types';

interface AuthState {
  token: string | null;
  user: PublicUser | null;
  status: 'idle' | 'loading' | 'error';
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, name?: string) => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      status: 'idle',
      error: null,

      login: async (email, password) => {
        set({ status: 'loading', error: null });
        try {
          const result = await loginRequest(email, password);
          set({ token: result.accessToken, user: result.user, status: 'idle', error: null });
          return true;
        } catch (err) {
          set({ status: 'error', error: err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.' });
          return false;
        }
      },

      register: async (email, password, name) => {
        set({ status: 'loading', error: null });
        try {
          const result = await registerRequest(email, password, name);
          set({ token: result.accessToken, user: result.user, status: 'idle', error: null });
          return true;
        } catch (err) {
          set({ status: 'error', error: err instanceof ApiError ? err.message : 'No se pudo crear la cuenta.' });
          return false;
        }
      },

      logout: () => set({ token: null, user: null, status: 'idle', error: null }),
    }),
    {
      name: 'sharegrams-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
