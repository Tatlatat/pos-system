#!/usr/bin/env node
/**
 * run-all.js — CLI entry point for POS system stress testing
 * 
 * Usage:
 *   node run-all.js                    # Run all tests
 *   node run-all.js --headed           # Run with browser visible
 *   node run-all.js --only=pos-stress  # Run only POS stress test
 *   node run-all.js --cashiers=20      # Custom cashier count
 *   node run-all.js --quick            # Quick smoke test only
 */
const { execSync, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ─── CLI Arguments ────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {
  headed: args.includes('--headed'),
  quick:  args.includes('--quick'),
  only:   args.find(a => a.startsWith('--only='))?.split('=')[1] || null,
  cashiers: parseInt(args.find(a => a.startsWith('--cashiers='))?.split('=')[1] || '10', 10),
  workers: parseInt(args.find(a => a.startsWith('--workers='))?.split('=')[1] || '1', 10),
};

// ─── Pre-flight check ─────────────────────────────────────
console.log('┌──────────────────────────────────────────────┐');
console.log('│  POS System Automated Test Suite            │');
console.log('│  Enterprise POS & Inventory Management      │');
console.log('└──────────────────────────────────────────────┘');
console.log('');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Check backend is running
try {
  const http = require('http');
  const req = http.get('http://127.0.0.1:3333/health', res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      const body = JSON.parse(d);
      if (body.status === 'ok') {
        console.log('✅ Backend: http://127.0.0.1:3333 (UP)');
        runTests();
      } else {
        fail('Backend health check returned unexpected status: ' + d);
      }
    });
  });
  req.on('error', () => fail('Cannot connect to backend at http://127.0.0.1:3333'));
  req.setTimeout(5000, () => fail('Backend connection timeout'));
} catch (e) {
  fail('Backend connectivity error: ' + e.message);
}

function fail(msg) {
  console.error('❌ Backend: NOT AVAILABLE');
  console.error(`   ${msg}`);
  console.error('\n👉 Please start the backend first:');
  console.error('   cd backend/ && node start.js\n');
  process.exit(1);
}

// ─── Run tests ────────────────────────────────────────────
async function runTests() {
  const startTime = Date.now();
  const results = { passed: 0, failed: 0, skipped: 0, details: [] };

  // Choose test files
  let testFiles;
  if (flags.quick) {
    testFiles = ['scenarios/auth.spec.ts'];
  } else if (flags.only) {
    testFiles = [`scenarios/${flags.only}.spec.ts`];
  } else {
    testFiles = [
      'scenarios/auth.spec.ts',
      'scenarios/pos-stress.spec.ts',
      'scenarios/inventory.spec.ts',
      'scenarios/audit.spec.ts',
    ];
  }

  // Check files exist
  const testsDir = path.join(__dirname);
  for (const f of testFiles) {
    const full = path.join(testsDir, f);
    if (!fs.existsSync(full)) {
      console.error(`❌ Test file not found: ${f}`);
      process.exit(1);
    }
  }

  console.log(`📋 Running ${testFiles.length} test file(s)...\n`);
  console.log('─'.repeat(50));

  // Run each test file via Playwright
  for (const tf of testFiles) {
    const testPath = path.join(testsDir, tf);
    console.log(`\n🔍 ${tf.replace('scenarios/', '')}`);

    try {
      const pwArgs = [
        'test',
        testPath,
        '--reporter=list',
        '--timeout=120000',
        '--config=' + path.join(testsDir, 'playwright.config.ts'),
      ];

      // Using playwright test runner
      const result = execSync(
        `npx playwright ${pwArgs.join(' ')}`,
        {
          cwd: path.join(PROJECT_ROOT),
          timeout: 180000,
          env: { ...process.env, PATH: process.env.PATH },
          stdio: 'pipe',
        }
      );
      console.log(result.toString().split('\n').filter(l => l.includes('✓') || l.includes('✗') || l.includes('passed')).join('\n'));
    } catch (e) {
      // Playwright exits non-zero on failures
      const output = (e.stdout || e.stderr || '').toString();
      const lines = output.split('\n');
      
      // Count passed/failed
      for (const line of lines) {
        if (line.includes('✓')) results.passed++;
        if (line.includes('✗')) {
          results.failed++;
          results.details.push({ file: tf, error: line.trim() });
        }
      }

      // Print relevant output
      const relevant = lines.filter(l =>
        l.includes('✓') || l.includes('✗') || l.includes('passed') || l.includes('failed') || l.includes('Error')
      );
      console.log(relevant.join('\n'));
      continue;
    }
  }

  // ─── Summary ─────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '─'.repeat(50));
  console.log('📊 RESULTS SUMMARY');
  console.log('─'.repeat(50));

  if (results.failed > 0) {
    console.log(`   ❌ ${results.failed} TEST(S) FAILED`);
    for (const d of results.details) {
      console.log(`      ${d.file}: ${d.error}`);
    }
  } else {
    console.log('   ✅ All tests passed!');
  }

  console.log(`   🕐 Duration: ${elapsed}s`);
  console.log('');

  if (results.failed > 0) {
    process.exit(1);
  }
}
