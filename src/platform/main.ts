import { getConfig } from './config.ts';
import { createHealthServer } from './health-server.ts';
import { initLogger } from './logger.ts';

const config = getConfig();
const log = initLogger({ level: config.LOG_LEVEL });
const server = createHealthServer();

server.listen(config.PORT, '0.0.0.0', () => {
  log.info({ port: config.PORT }, 'server.listening');
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
