// main.ts — Solmaris "High Noon" submission entrypoint.
//
// Written from scratch for this entry (not the kit starter): it validates the
// whole submission before handing anything in, builds a build manifest, and
// only then writes the dossier the scorer reads.
//
// What it does, in order:
//   1. Resolves the repo root (this file's directory) and the output directory
//      (MAKEFUN_OUTPUT_DIR, or /output inside the grader's container).
//   2. Validates game/: the directory exists, index.html is present and
//      under 1 MiB, and every source file is a regular file.
//   3. Validates screenshots/: exactly 3 or 4 JPEG/PNG images, each at most
//      256 KiB, and the first by name is the cover.
//   4. Copies game/ and screenshots/ into the output directory.
//   5. Writes manifest.json into the output: build time, git HEAD (when the
//      repo is available), and a sorted per-file table (path + bytes).
//   6. Writes dossier.json with the vendored make.fun library, using the
//      scorer's own caps, so a dossier that would be refused never ships.
//
// Run locally:  MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { basename, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// --- the scorer's caps (mirror of the competition gate) ---
const CAPS = {
  textMaxBytes: 163840,
  screenshotsMax: 4,
  screenshotMaxBytes: 262144,
  indexMaxBytes: 1024 * 1024,
  gameMaxFiles: 993,
  gameMaxBytes: 50331648,
  gamePathMaxBytes: 1000,
};

class SubmissionError extends Error {
  check: string;
  constructor(check: string, message: string) {
    super(`${check}: ${message}`);
    this.name = 'SubmissionError';
    this.check = check;
  }
}

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(check: string, message: string): never {
  throw new SubmissionError(check, message);
}

// Walk a directory tree and return every file under it, sorted by path,
// each with its size in bytes. Symlinks and special files are refused:
// the dossier builder refuses them too, and failing here names the culprit.
function listFiles(root: string, base = root): Array<{ path: string; bytes: number }> {
  const found: Array<{ path: string; bytes: number }> = [];
  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      fail('read', `cannot read directory ${relative(repoRoot, dir)}`);
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) fail('symlink', `${relative(repoRoot, full)} is a symbolic link`);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        found.push({ path: relative(base, full).split(sep).join('/'), bytes: statSync(full).size });
      } else fail('special-file', `${relative(repoRoot, full)} is not a regular file`);
    }
  };
  walk(root);
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

function checkGame(): Array<{ path: string; bytes: number }> {
  const gameDir = join(repoRoot, 'game');
  if (!existsSync(gameDir) || !lstatSync(gameDir).isDirectory()) {
    fail('game-missing', 'game/ directory is not present next to main.ts');
  }
  const files = listFiles(gameDir);
  if (files.length === 0) fail('game-empty', 'game/ holds no files');
  if (files.length > CAPS.gameMaxFiles) {
    fail('game-too-many-files', `${files.length} files, cap is ${CAPS.gameMaxFiles}`);
  }
  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  if (totalBytes > CAPS.gameMaxBytes) {
    fail('game-too-large', `${totalBytes} bytes, cap is ${CAPS.gameMaxBytes}`);
  }
  for (const f of files) {
    if (Buffer.byteLength(f.path, 'utf8') > CAPS.gamePathMaxBytes) {
      fail('game-path-too-long', f.path);
    }
  }
  const index = files.find((f) => f.path === 'index.html');
  if (!index) fail('index-missing', 'game/index.html is required and was not found');
  if (index.bytes > CAPS.indexMaxBytes) {
    fail('index-too-large', `game/index.html is ${index.bytes} bytes, cap is ${CAPS.indexMaxBytes}`);
  }
  const html = readFileSync(join(gameDir, 'index.html'), 'utf8');
  if (!/<script/i.test(html)) fail('index-no-script', 'game/index.html loads no script');
  if (/rockstar|grand theft auto|\bgta\b/i.test(html)) {
    fail('index-ip', 'game/index.html mentions Rockstar / GTA — the entry must be original');
  }
  return files;
}

function checkScreenshots(): Array<{ path: string; bytes: number }> {
  const shotsDir = join(repoRoot, 'screenshots');
  if (!existsSync(shotsDir) || !lstatSync(shotsDir).isDirectory()) {
    fail('screenshots-missing', 'screenshots/ directory is not present next to main.ts');
  }
  const files = listFiles(shotsDir).filter((f) => /\.(png|jpe?g)$/i.test(f.path));
  if (files.length < 3) {
    fail('screenshots-too-few', `only ${files.length} screenshots, need 3 or 4`);
  }
  if (files.length > CAPS.screenshotsMax) {
    fail('screenshots-too-many', `${files.length} screenshots, cap is ${CAPS.screenshotsMax}`);
  }
  for (const f of files) {
    if (f.bytes > CAPS.screenshotMaxBytes) {
      fail('screenshot-too-large', `${f.path} is ${f.bytes} bytes, cap is ${CAPS.screenshotMaxBytes}`);
    }
    if (f.bytes === 0) fail('screenshot-empty', `${f.path} is empty`);
  }
  return files;
}

function gitHead(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown (not a git checkout)';
  }
}

function main(): void {
  const startedAt = new Date();
  console.log(`[solmaris] validating submission in ${repoRoot}`);

  const gameFiles = checkGame();
  const shotFiles = checkScreenshots();
  console.log(`[solmaris] game/: ${gameFiles.length} files, ` +
    `${gameFiles.reduce((s, f) => s + f.bytes, 0)} bytes; ` +
    `screenshots/: ${shotFiles.map((f) => basename(f.path)).join(', ')} (cover: ${basename(shotFiles[0].path)})`);

  mkdirSync(outDir, { recursive: true });
  cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

  const manifest = {
    schema: 'solmaris/manifest/v1',
    title: 'Solmaris — High Noon',
    builtAt: startedAt.toISOString(),
    gitHead: gitHead(),
    game: gameFiles,
    gameTotalBytes: gameFiles.reduce((s, f) => s + f.bytes, 0),
    screenshots: shotFiles,
    cover: basename(shotFiles[0].path),
  };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[solmaris] manifest.json written (HEAD ${manifest.gitHead.slice(0, 12)})`);

  const dossier = buildDossier(outDir, {
    text_max_bytes: CAPS.textMaxBytes,
    screenshots: { max: CAPS.screenshotsMax, max_bytes: CAPS.screenshotMaxBytes },
    game_max_files: CAPS.gameMaxFiles,
    game_max_bytes: CAPS.gameMaxBytes,
    game_path_max_bytes: CAPS.gamePathMaxBytes,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  console.log(`[solmaris] dossier.json written (${dossier.length} bytes) — all gates pass`);
}

main();
