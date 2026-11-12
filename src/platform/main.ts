import { loadConfig } from './config.ts';
import { createHealthServer } from './health-server.ts';

const config = loadConfig(process.env);
const server = createHealthServer();

server.listen(config.PORT, '0.0.0.0', () => {
  console.info(JSON.stringify({ msg: 'listening', port: config.PORT }));
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
