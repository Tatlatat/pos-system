/**
 * start.js — Start the backend server via NestJS CLI
 */
const { spawn } = require('child_process');
const path = require('path');

const nestPath = path.join(__dirname, 'node_modules', '.bin', 'nest');
const env = {
  ...process.env,
  DATABASE_URL: 'postgresql://pos_user:pos_password@localhost:5432/pos_db',
  PORT: '3333',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-jwt-secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
};

const child = spawn(nestPath, ['start'], { cwd: __dirname, env, stdio: 'inherit' });
child.on('error', (err) => console.error('Failed to start:', err));
child.on('exit', (code) => {
  console.log('Server exited with code:', code);
  process.exit(code || 0);
});

process.on('SIGTERM', () => { child.kill(); process.exit(0); });
process.on('SIGINT', () => { child.kill(); process.exit(0); });
