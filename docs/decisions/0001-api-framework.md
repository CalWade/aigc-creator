# ADR-0001: API 框架——NestJS

- Status: Accepted
- Date: 2026-05-24

## Decision

`apps/api` 使用 NestJS（v11）。不选 Koa。

## Reason

- NestJS 是 Node 后端 TS-first 的事实主流，文档/中文资料/SO 答案密度高，单人 3 周交付遇坑可搜
- 自带 DI / 模块化 / DTO 校验 / OpenAPI / Pipe-Guard-Interceptor，与 PRD §4 五阶段审核切面契合，省掉自拼 7~8 个库
- 与 `apps/web` 选 Next.js 的"框架给约定"心智一致，避免前后端哲学分裂
