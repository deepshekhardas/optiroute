import { readFileSync } from 'node:fs';

export function validateWebConfig(config, projectId) {
  for (const field of ['projectId', 'appId', 'apiKey', 'authDomain']) {
    if (typeof config[field] !== 'string' || !config[field].trim() || /YOUR_|REPLACE_/i.test(config[field])) {
      throw new Error(`Configure Firebase web field: ${field}`);
    }
  }
  if (!projectId || config.projectId !== projectId) throw new Error('Frontend and server Firebase project must match');
  if (!/^[a-zA-Z0-9.-]+$/.test(config.authDomain)) throw new Error('Firebase authDomain must be a hostname');
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/check-web-config.mjs')) {
  validateWebConfig(JSON.parse(readFileSync('firebase-applet-config.json', 'utf8')), process.env.FIREBASE_PROJECT_ID);
  console.log('Firebase web configuration shape and project match checked; real sign-in still requires acceptance.');
}
