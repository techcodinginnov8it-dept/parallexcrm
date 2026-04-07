const { execFileSync } = require('child_process');
const path = require('path');

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function runNodeScript(label, scriptPath, args = [], env = process.env) {
  console.log(`[postinstall] ${label}`);
  execFileSync(process.execPath, [require.resolve(scriptPath), ...args], {
    stdio: 'inherit',
    env,
  });
}

function runNodeFile(label, filePath, args = [], env = process.env) {
  console.log(`[postinstall] ${label}`);
  execFileSync(process.execPath, [filePath, ...args], {
    stdio: 'inherit',
    env,
  });
}

function getPlaywrightInstallReason() {
  if (isTruthy(process.env.SKIP_PLAYWRIGHT_BROWSERS)) {
    return null;
  }

  if (isTruthy(process.env.INSTALL_PLAYWRIGHT_BROWSERS)) {
    return 'INSTALL_PLAYWRIGHT_BROWSERS';
  }

  if (isTruthy(process.env.VERCEL)) {
    return 'VERCEL';
  }

  if (isTruthy(process.env.CI)) {
    return 'CI';
  }

  // Vercel can disable automatic system env exposure, which would make
  // VERCEL/CI unavailable during install. Production installs still need the
  // browser copied into node_modules so serverless tracing can bundle it.
  if (process.env.NODE_ENV === 'production') {
    return 'NODE_ENV=production';
  }

  return null;
}

function main() {
  runNodeScript('Generating Prisma client', 'prisma/build/index.js', ['generate']);

  const installReason = getPlaywrightInstallReason();
  if (!installReason) {
    console.log(
      '[postinstall] Skipping Playwright browser install. Set INSTALL_PLAYWRIGHT_BROWSERS=1 to bundle browsers for serverless deployments.'
    );
    return;
  }

  const playwrightEnv = {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: '0',
  };
  const playwrightPackageRoot = path.dirname(require.resolve('playwright-chromium/package.json'));
  const playwrightCliPath = path.join(playwrightPackageRoot, 'cli.js');

  runNodeFile(
    `Installing Playwright Chromium headless shell (${installReason})`,
    playwrightCliPath,
    ['install', '--only-shell', 'chromium'],
    playwrightEnv
  );
}

main();
