import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { readInfrastructureEnv } from '@carrot/shared';
import { ServerAppModule } from './app';
import { GatewayService } from './gateway/http';
import { attachTaskSocket } from './gateway/socket';

async function main() {
  const env = readInfrastructureEnv(process.env);
  const app = await NestFactory.create(ServerAppModule);
  app.enableShutdownHooks();
  await app.init();
  const closeSocket = await attachTaskSocket(app.getHttpServer(), app.get(GatewayService));
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => void closeSocket());
  await app.listen(env.SERVER_PORT, '0.0.0.0');
}
void main().catch(() => {
  console.error('Server startup failed; check infrastructure configuration.');
  process.exitCode = 1;
});
