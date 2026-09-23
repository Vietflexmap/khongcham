import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const manifestPath = join(root, '.generated-files.json');
if (!existsSync(join(dist, 'index.html'))) throw new Error('Chạy npm run build trước khi sync:root.');

function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? collect(file) : [relative(dist, file)];
  });
}

const files = collect(dist);
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
if (process.argv.includes('--check')) {
  const stale = files.filter((file) => !existsSync(join(root, file)) ||
    !readFileSync(join(root, file)).equals(readFileSync(join(dist, file))));
  if (stale.length || previous.some((file) => !files.includes(file))) {
    throw new Error(`Bản Pages ở gốc repo chưa khớp dist: ${stale.join(', ') || 'còn tệp cũ'}. Chạy npm run sync:root.`);
  }
  console.log('Bản Pages ở gốc repo khớp với dist.');
  process.exit(0);
}
for (const file of previous) {
  if (typeof file === 'string' && file.startsWith('assets/') && !files.includes(file)) {
    rmSync(join(root, file), { force: true });
  }
}
for (const file of files) {
  const target = join(root, file);
  mkdirSync(resolve(target, '..'), { recursive: true });
  copyFileSync(join(dist, file), target);
}
writeFileSync(manifestPath, `${JSON.stringify(files.sort(), null, 2)}\n`, 'utf8');
console.log(`Đã đồng bộ ${files.length} tệp build vào gốc repo cho GitHub Pages.`);
