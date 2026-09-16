import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'ana@example.com',
    passwordHash: 'hash',
    name: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let authService: AuthService;

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    jwtService = {
      sign: jest.fn().mockReturnValue('signed-token'),
    } as unknown as jest.Mocked<JwtService>;

    authService = new AuthService(usersService, jwtService);
  });

  describe('register', () => {
    it('rechaza el registro si el email ya existe', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());

      await expect(authService.register({ email: 'ana@example.com', password: 'password123' })).rejects.toThrow(
        ConflictException,
      );
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('nunca guarda la contraseña en texto plano', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockImplementation(async (input) =>
        makeUser({ email: input.email, passwordHash: input.passwordHash, name: input.name ?? null }),
      );

      await authService.register({ email: 'ana@example.com', password: 'password123' });

      const [[createInput]] = usersService.create.mock.calls;
      expect(createInput.passwordHash).not.toBe('password123');
      await expect(bcrypt.compare('password123', createInput.passwordHash)).resolves.toBe(true);
    });

    it('devuelve accessToken y datos públicos del usuario, sin el hash', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(makeUser({ name: 'Ana' }));

      const result = await authService.register({ email: 'ana@example.com', password: 'password123', name: 'Ana' });

      expect(result.accessToken).toBe('signed-token');
      expect(result.user).toEqual({ id: 'u1', email: 'ana@example.com', name: 'Ana' });
      expect((result.user as Partial<User>).passwordHash).toBeUndefined();
    });
  });

  describe('login', () => {
    it('rechaza si el usuario no existe', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(authService.login({ email: 'nadie@example.com', password: 'x' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rechaza si la contraseña no coincide', async () => {
      const passwordHash = await bcrypt.hash('correcta123', 10);
      usersService.findByEmail.mockResolvedValue(makeUser({ passwordHash }));

      await expect(authService.login({ email: 'ana@example.com', password: 'incorrecta' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('acepta credenciales correctas y devuelve un token', async () => {
      const passwordHash = await bcrypt.hash('correcta123', 10);
      usersService.findByEmail.mockResolvedValue(makeUser({ passwordHash }));

      const result = await authService.login({ email: 'ana@example.com', password: 'correcta123' });

      expect(result.accessToken).toBe('signed-token');
    });
  });
});
