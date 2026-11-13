import { defineConfig } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const isWin = process.platform === 'win32';
const venvPy = isWin
  ? path.resolve('..', 'backend', '.venv', 'Scripts', 'python.exe')
  : path.resolve('..', 'backend', '.venv', 'bin', 'python');

const pythonBin = fs.existsSync(venvPy) ? `"${venvPy}"` : (isWin ? 'python' : 'python3');

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: process.env.CI ? undefined : 'chrome',
    headless: true,
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `${pythonBin} -m uvicorn app.main:app --app-dir ../backend --host 127.0.0.1 --port 8000`,
      url: 'http://127.0.0.1:8000/api/v1/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
