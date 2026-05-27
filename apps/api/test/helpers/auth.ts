import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { App } from "supertest/types";

interface LoginResponse {
  accessToken: string;
  user: { id: string; handle: string };
}

export async function loginAsDemo(app: INestApplication<App>): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/auth/login")
    .send({ handle: "demo-author" })
    .expect(200);
  return (res.body as LoginResponse).accessToken;
}
