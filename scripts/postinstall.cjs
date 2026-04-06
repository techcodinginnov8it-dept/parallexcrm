const { execFileSync } = require('child_process');
const path = require('path');

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

function shouldInstallPlaywrightBrowsers() {
  return (
    process.env.VERCEL === '1' ||
    process.env.CI === '1' ||
    process.env.INSTALL_PLAYWRIGHT_BROWSERS === '1'
  );
}

function main() {
  runNodeScript('Generating Prisma client', 'prisma/build/index.js', ['generate']);

  if (!shouldInstallPlaywrightBrowsers()) {
    console.log('[postinstall] Skipping Playwright browser install outside CI/Vercel.');
    return;
  }

  const playwrightEnv = {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: '0',
  };
  const playwrightPackageRoot = path.dirname(require.resolve('playwright-chromium/package.json'));
  const playwrightCliPath = path.join(playwrightPackageRoot, 'cli.js');

  runNodeFile(
    'Installing Playwright Chromium headless shell',
    playwrightCliPath,
    ['install', '--only-shell', 'chromium'],
    playwrightEnv
  );
}

main();
