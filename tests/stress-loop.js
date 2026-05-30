#!/usr/bin/env node
/**
 * stress-loop.js — Chạy Playwright stress test 6 lần, mỗi lần gọi AGY review
 */
const { execSync, execFileSync } = require('child_process');
const path = require('path');
const http = require('http');

const TESTS_DIR = __dirname;
const BACKEND_DIR = path.resolve(TESTS_DIR, '..', 'backend');
const AGY_BIN = '/opt/homebrew/bin/agy';
const ITERATIONS = 6;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function runCmd(cmd, opts = {}) {
  try {
    const r = execSync(cmd, { timeout: 120000, maxBuffer: 10 * 1024 * 1024, cwd: TESTS_DIR, ...opts });
    return { ok: true, stdout: r.toString() };
  } catch (e) {
    return { ok: false, stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || '', error: e.message };
  }
}

function healthCheck() {
  return new Promise(resolve => {
    const req = http.get('http://localhost:3333/health', res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).status === 'ok'); } catch { resolve(false); } });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
  });
}

function agyReview(text) {
  try {
    const prompt = `Tôi vừa chạy Playwright stress test cho POS system. Dưới đây là kết quả. Hãy phân tích nhanh: có bug gì không? Cần fix gì không?

${text.slice(0, 3000)}

Trả lời ngắn gọn: (1) Bug? (2) Cần fix?`;
    const r = execFileSync(AGY_BIN, ['--print', prompt], { timeout: 60000, maxBuffer: 5 * 1024 * 1024 });
    return r.toString();
  } catch (e) {
    return `[AGY error: ${e.message}]`;
  }
}

async function main() {
  console.log('┌────────────────────────────────────────────────┐');
  console.log('│  STRESS TEST LOOP — 6 iterations              │');
  console.log('│  Playwright → AGY review → next               │');
  console.log('└────────────────────────────────────────────────┘\n');

  const results = [];

  for (let i = 1; i <= ITERATIONS; i++) {
    console.log(`══════════════════════════════════════════════════`);
    console.log(`  🔁 Iteration ${i}/${ITERATIONS}`);
    console.log(`══════════════════════════════════════════════════\n`);

    // 1. Check backend health
    const alive = await healthCheck();
    if (!alive) {
      console.log('  ⚠️  Backend DOWN! Restarting via start.js...');
      // Kill old + restart
      try { execSync('kill -9 ' + execSync('lsof -ti:3333').toString().trim()); } catch {}
      execFileSync('node', ['start.js'], { cwd: BACKEND_DIR, timeout: 15000 });
      await sleep(6000);
    }
    console.log('  ✅ Backend OK\n');

    // 2. Run playwright stress test
    console.log('  ▶️  Running Playwright...');
    const testResult = runCmd(
      `npx playwright test --config="${path.join(TESTS_DIR, 'playwright.config.ts')}" --reporter=list`
    );

    const stdout = testResult.stdout || testResult.stderr || '';
    const lines = stdout.split('\n');
    const passedTests = lines.filter(l => l.includes('✓')).length;
    const failedTests = lines.filter(l => l.includes('✘') || l.includes('✗')).length;

    const successLine = lines.find(l => l.includes('✅ Success:'));
    const stockLine = lines.find(l => l.includes('📦 Final stock:'));
    const errorLine = lines.find(l => l.includes('Errors:'));
    const stockAssert = lines.find(l => l.includes('📉 Stock decrease:'));

    const summary = {
      iteration: i,
      passed: passedTests,
      failed: failedTests,
      success: successLine?.match(/\d+/)?.[0] || '?',
      stock: stockLine?.trim() || 'N/A',
      stockAssert: stockAssert?.trim() || 'N/A',
      errors: errorLine?.trim() || 'N/A',
    };

    console.log(`  📊 ${passedTests} passed, ${failedTests} failed`);
    if (successLine) console.log(`  ${successLine.trim()}`);
    if (stockLine) console.log(`  ${stockLine.trim()}`);
    if (stockAssert) console.log(`  ${stockAssert.trim()}`);
    if (errorLine) console.log(`  ${errorLine.trim()}`);

    results.push(summary);

    // 3. AGY review
    console.log('\n  🤖 AGY review...');
    const review = agyReview(stdout.slice(-2500));
    console.log('  ─── AGY ───');
    // Show only relevant lines
    review.split('\n').filter(l => l.includes('Bug') || l.includes('Cần fix') || l.includes('Lỗi') || l.includes('✅') || l.includes('❌')).slice(0, 10).forEach(l => console.log(`  ${l}`));
    console.log('  ───────────\n');

    await sleep(500);
  }

  // Final summary
  console.log('══════════════════════════════════════════════════');
  console.log('  📊 FINAL — 6 iterations');
  console.log('══════════════════════════════════════════════════\n');

  for (const r of results) {
    console.log(`  #${r.iteration}: ${r.passed}/${r.failed} tests | stress ${r.success} success | ${r.stock} | ${r.errors}`);
  }

  // AGY tổng kết
  console.log('\n  🤖 AGY tổng kết...');
  const report = results.map(r => `Iter ${r.iteration}: ${r.success} checkouts | ${r.stock} | ${r.errors}`).join('\n');
  const finalReview = agyReview(`Kết quả 6 lần stress test POS system. Pattern bug lặp lại?\n\n${report}`);
  console.log('  ─── AGY tổng kết ───');
  finalReview.split('\n').filter(l => l.length > 10).slice(0, 15).forEach(l => console.log(`  ${l.trim()}`));
  console.log('  ────────────────────\n');

  console.log('✅ DONE!');
}

main().catch(e => console.error('FATAL:', e.message));
