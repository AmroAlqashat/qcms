import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secretOrKey = process.env.JWT_SECRET_KEY;
    if (!secretOrKey) {
      throw new Error('JWT_SECRET_KEY is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) =>
          typeof request.cookies?.['access_token'] === 'string'
            ? request.cookies['access_token']
            : null,
      ]),
      ignoreExpiration: false,
      secretOrKey,
    });
  }

  validate(payload: { sub: string; tokenUse: string }) {
    if (payload.tokenUse !== 'access') {
      throw new UnauthorizedException();
    }

    return { staffId: payload.sub };
  }
}
