const { spawn } = require('child_process');
const path = require('path');

const next = path.join(__dirname, 'node_modules', '.bin', 'next');
const env = {
  ...process.env,
  NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3333/api',
  PORT: '3000',
};

const child = spawn(next, ['dev', '-p', '3000'], {
  cwd: __dirname,
  env,
  stdio: 'inherit',
});

child.on('error', err => console.error('Frontend start failed:', err));
child.on('exit', code => { console.log('Frontend exited:', code); process.exit(code || 0); });
process.on('SIGTERM', () => { child.kill(); process.exit(0); });
process.on('SIGINT', () => { child.kill(); process.exit(0); });
