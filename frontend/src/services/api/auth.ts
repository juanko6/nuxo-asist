import { api, tokenStorage } from './client';
import type { User, LoginCredentials } from '@/types';

interface LoginResponse {
  token: string;
  user: User;
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<User> {
    const { token, user } = await api.post<LoginResponse>('/auth/login', credentials);
    tokenStorage.set(token);
    return user;
  },

  async me(): Promise<User> {
    return api.get<User>('/auth/me');
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.post('/me/password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  logout(): void {
    tokenStorage.clear();
  },

  hasSession(): boolean {
    return tokenStorage.get() !== null;
  },
};
