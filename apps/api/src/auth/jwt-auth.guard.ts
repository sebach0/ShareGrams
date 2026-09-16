import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { JwtPayload } from './auth.service';

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

function extractToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' ? token : undefined;
}

/**
 * Guard de autenticación implementado a mano (sin @nestjs/passport) porque
 * solo necesitamos verificar un JWT firmado por nosotros mismos: sumar todo
 * el ecosistema de passport para eso sería complejidad sin beneficio real
 * en el alcance de este proyecto.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Falta el token de autenticación.');
    }

    try {
      request.user = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    return true;
  }
}
