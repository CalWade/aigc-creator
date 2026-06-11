import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { App } from "supertest/types";

interface LoginResponse {
  accessToken: string;
  user: { id: string; handle: string; role: "AUTHOR" | "ADMIN" };
}

async function loginByHandle(app: INestApplication<App>, handle: string): Promise<string> {
  const res = await request(app.getHttpServer()).post("/auth/login").send({ handle }).expect(200);
  return (res.body as LoginResponse).accessToken;
}

export function loginAsDemo(app: INestApplication<App>): Promise<string> {
  return loginByHandle(app, "demo-author");
}

/** RBAC mini — 走 admin 用户登录(fixture role=ADMIN);AdminGuard 据此放行 /admin/*。 */
export function loginAsAdmin(app: INestApplication<App>): Promise<string> {
  return loginByHandle(app, "admin");
}

/** 任意 handle(供 e2e 用 tech-author / life-author 等)。 */
export function loginAs(app: INestApplication<App>, handle: string): Promise<string> {
  return loginByHandle(app, handle);
}
