const { execFileSync } = require('child_process');

function runNodeScript(label, scriptPath, args = [], env = process.env) {
  console.log(`[postinstall] ${label}`);
  execFileSync(process.execPath, [require.resolve(scriptPath), ...args], {
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

  runNodeScript(
    'Installing Playwright Chromium headless shell',
    'playwright-chromium/cli.js',
    ['install', '--only-shell', 'chromium'],
    playwrightEnv
  );
}

main();
