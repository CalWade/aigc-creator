import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // PORT 由 env schema 校验为必填的整数,getOrThrow 在配置缺失时抛错而非静默兜底。
  const port = app.get(ConfigService).getOrThrow<number>("PORT");
  await app.listen(port);
}
bootstrap().catch((err) => {
  console.error("bootstrap failed", err);
  process.exit(1);
});
