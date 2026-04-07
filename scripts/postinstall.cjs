const { execFileSync } = require('child_process');

function runNodeScript(label, scriptPath, args = [], env = process.env) {
  console.log(`[postinstall] ${label}`);
  execFileSync(process.execPath, [require.resolve(scriptPath), ...args], {
    stdio: 'inherit',
    env,
  });
}

function main() {
  runNodeScript('Generating Prisma client', 'prisma/build/index.js', ['generate']);
}

main();
