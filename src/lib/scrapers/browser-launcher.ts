import { existsSync } from 'fs';
import type { Browser } from 'playwright-core';

const LOCAL_BROWSER_ARGS = ['--disable-setuid-sandbox', '--no-sandbox'];
const COMMON_LOCAL_CHROME_PATHS = [
  process.env.CHROMIUM_EXECUTABLE_PATH,
  process.env.GOOGLE_CHROME_BIN,
  process.env.CHROME_BIN,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((value): value is string => Boolean(value));

let playwrightCorePromise: Promise<typeof import('playwright-core')> | null = null;
let serverlessChromiumPromise: Promise<typeof import('@sparticuz/chromium').default> | null = null;

function isServerlessLinuxRuntime(): boolean {
  return (
    process.platform === 'linux' &&
    (process.env.VERCEL === '1' ||
      Boolean(process.env.AWS_EXECUTION_ENV) ||
      Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME))
  );
}

function mergeLaunchArgs(...collections: Array<string[] | undefined>): string[] {
  const args = new Set<string>();
  for (const collection of collections) {
    for (const arg of collection || []) {
      if (arg) args.add(arg);
    }
  }
  return Array.from(args);
}

function resolveLocalExecutablePath(): string | null {
  for (const candidate of COMMON_LOCAL_CHROME_PATHS) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function getPlaywrightCore() {
  if (!playwrightCorePromise) {
    playwrightCorePromise = import('playwright-core');
  }
  return playwrightCorePromise;
}

async function getServerlessChromium() {
  if (!serverlessChromiumPromise) {
    serverlessChromiumPromise = import('@sparticuz/chromium').then((mod) => mod.default);
  }
  return serverlessChromiumPromise;
}

export async function launchChromiumBrowser(): Promise<Browser> {
  const { chromium } = await getPlaywrightCore();

  if (isServerlessLinuxRuntime()) {
    const serverlessChromium = await getServerlessChromium();
    return chromium.launch({
      headless: true,
      args: mergeLaunchArgs(serverlessChromium.args, LOCAL_BROWSER_ARGS),
      executablePath: await serverlessChromium.executablePath(),
    });
  }

  const localExecutablePath = resolveLocalExecutablePath();
  if (localExecutablePath) {
    return chromium.launch({
      headless: true,
      args: LOCAL_BROWSER_ARGS,
      executablePath: localExecutablePath,
    });
  }

  try {
    return await chromium.launch({
      headless: true,
      args: LOCAL_BROWSER_ARGS,
      channel: 'chrome',
    });
  } catch (error) {
    const details = (error as Error)?.message || String(error);
    throw new Error(
      `Chromium launch failed. On Vercel, install @sparticuz/chromium. Locally, install Google Chrome or set CHROMIUM_EXECUTABLE_PATH. ${details}`
    );
  }
}
