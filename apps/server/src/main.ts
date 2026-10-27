import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { readInfrastructureEnv } from '@carrot/shared';
import { AppModule } from './health';

async function main() {
  const env = readInfrastructureEnv(process.env);
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(env.SERVER_PORT, '0.0.0.0');
}
void main().catch(() => {
  console.error('Server startup failed; check infrastructure configuration.');
  process.exitCode = 1;
});
