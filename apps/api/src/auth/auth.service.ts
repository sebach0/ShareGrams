import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import { UsersService } from '../users/users.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';

const SALT_ROUNDS = 10;

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthResult {
  accessToken: string;
  user: PublicUser;
}

function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, name: user.name };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese email.');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.usersService.create({ email: dto.email, passwordHash, name: dto.name });

    return this.issueTokenFor(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Email o contraseña incorrectos.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Email o contraseña incorrectos.');
    }

    return this.issueTokenFor(user);
  }

  private issueTokenFor(user: User): AuthResult {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return { accessToken: this.jwtService.sign(payload), user: toPublicUser(user) };
  }
}
