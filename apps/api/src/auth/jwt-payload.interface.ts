export interface JwtPayload {
  sub: string;
  handle: string;
  role: "AUTHOR" | "ADMIN";
  iat?: number;
  exp?: number;
}
