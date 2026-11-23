import { defineConfig } from 'vitest/config';

// The same business tests run twice: against Node's SQLite (iPhone native app engine
// equivalent) and against sql.js (the engine used by the web app installed from Safari).
export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      { extends: true, test: { name: 'native-sqlite', include: ['tests/**/*.test.ts'], env: { DB_ENGINE: 'node' } } },
      { extends: true, test: { name: 'web-app-sqljs', include: ['tests/**/*.test.ts'], env: { DB_ENGINE: 'sqljs' } } },
    ],
  },
});
