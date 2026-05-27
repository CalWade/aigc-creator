export interface JwtPayload {
  sub: string;
  handle: string;
  iat?: number;
  exp?: number;
}
