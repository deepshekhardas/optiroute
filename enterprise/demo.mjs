// Deliberately local-only. Production server rejects this mode with NODE_ENV=production.
process.env.OPTIR_LOCAL_DEMO='1';
process.env.OPTIR_DB=process.env.OPTIR_DB||'runtime/demo.sqlite';
await import('./server.mjs');
