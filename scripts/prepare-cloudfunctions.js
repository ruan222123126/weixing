'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const cloudRoot = path.join(projectRoot, 'cloudfunctions');
const sharedDir = path.join(cloudRoot, '_shared');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function ensureFunctionPackageJson(fnDir, fnName) {
  const pkgPath = path.join(fnDir, 'package.json');
  let pkg = {};
  if (fs.existsSync(pkgPath)) {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  }

  const nextPkg = {
    ...pkg,
    name: pkg.name || `weixing-${fnName}`,
    version: pkg.version || '1.0.0',
    private: true,
    main: 'index.js',
    dependencies: {
      ...(pkg.dependencies || {}),
      xlsx: '^0.18.5'
    }
  };

  fs.writeFileSync(pkgPath, `${JSON.stringify(nextPkg, null, 2)}\n`, 'utf8');
}

function main() {
  if (!fs.existsSync(cloudRoot)) {
    throw new Error(`cloudfunctions 目录不存在: ${cloudRoot}`);
  }
  if (!fs.existsSync(sharedDir)) {
    throw new Error(`共享目录不存在: ${sharedDir}`);
  }

  const dirs = fs.readdirSync(cloudRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_shared' && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();

  let prepared = 0;
  for (const fnName of dirs) {
    const fnDir = path.join(cloudRoot, fnName);
    const entry = path.join(fnDir, 'index.js');
    if (!fs.existsSync(entry)) {
      continue;
    }

    const targetShared = path.join(fnDir, '_shared');
    fs.rmSync(targetShared, { recursive: true, force: true });
    copyDir(sharedDir, targetShared);
    ensureFunctionPackageJson(fnDir, fnName);
    prepared += 1;
  }

  console.log(`Prepared ${prepared} cloud functions.`);
}

main();
