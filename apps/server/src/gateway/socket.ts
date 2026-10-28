import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import { authorizePoc, type GatewayService } from './http';
import { TASK_EVENTS } from './runtime';
import { taskView } from './repository';

export async function attachTaskSocket(server: HttpServer, service: GatewayService) {
  if (!service.runtime) return async () => undefined;
  const io = new Server(server, {
    path: '/poc/gateway/socket.io',
    serveClient: false,
    maxHttpBufferSize: 16384,
  });
  io.use((socket, next) => {
    try {
      authorizePoc(service.config, socket.handshake.headers, socket.handshake.auth.token);
      next();
    } catch {
      next(new Error('PoC access denied'));
    }
  });
  io.on('connection', (socket) => {
    void service.active.repository
      .list()
      .then((tasks) => socket.emit('tasks:snapshot', tasks.map(taskView)))
      .catch(() => socket.emit('tasks:resync-required'));
  });
  const subscriber = new Redis(service.config.REDIS_URL);
  subscriber.on('error', () => undefined);
  subscriber.on('message', (_channel, raw) => {
    void (async () => {
      const event: { id?: unknown; teamId?: unknown; tenantId?: unknown } = JSON.parse(raw);
      if (
        event.teamId !== service.config.POC_TEAM_ID ||
        (event.tenantId ?? null) !== (service.config.POC_TENANT_ID ?? null) ||
        typeof event.id !== 'string'
      )
        return;
      io.emit('task:updated', taskView(await service.active.repository.get(event.id)));
    })().catch(() => undefined);
  });
  await subscriber.subscribe(TASK_EVENTS);
  return async () => {
    subscriber.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  };
}
