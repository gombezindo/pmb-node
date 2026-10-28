import { createApp } from './app.js';
const { app, close } = createApp({ dbPath: process.env.DB_PATH || 'data/pmb.sqlite' });
const server = app.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`PMB siap di http://localhost:${process.env.PORT || 3000}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { close(); process.exit(0); }));
