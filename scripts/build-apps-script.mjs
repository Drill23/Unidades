import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const appsScriptDir = path.join(rootDir, 'apps-script');
const indexPath = path.join(distDir, 'index.html');
const outputPath = path.join(appsScriptDir, 'Index.html');

let html = await fs.readFile(indexPath, 'utf8');

const cssTags = [...html.matchAll(/<link rel="stylesheet" crossorigin href="([^"]+)">/g)];
for (const [, href] of cssTags) {
  const css = await fs.readFile(path.join(distDir, href.replace(/^\//, '')), 'utf8');
  html = html.replace(
    `<link rel="stylesheet" crossorigin href="${href}">`,
    `<style>\n${css}\n</style>`
  );
}

const scriptTags = [...html.matchAll(/<script type="module" crossorigin src="([^"]+)"><\/script>/g)];
for (const [, src] of scriptTags) {
  const js = await fs.readFile(path.join(distDir, src.replace(/^\//, '')), 'utf8');
  const encoded = Buffer.from(js, 'utf8').toString('base64');
  const chunks = encoded.match(/.{1,8000}/g) || [];
  html = html.replace(
    `<script type="module" crossorigin src="${src}"></script>`,
    `<script>\nconst script = document.createElement('script');\nconst binary = atob(${JSON.stringify(chunks)}.join(''));\nconst bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));\nscript.type = 'module';\nscript.textContent = new TextDecoder().decode(bytes);\ndocument.head.appendChild(script);\n</script>`
  );
}

html = html
  .replace(/<link rel="manifest" href="[^"]+"\s*\/?>/g, '')
  .replace(/<link rel="icon"[^>]+>/g, '');

await fs.writeFile(outputPath, html);
console.log(`Built ${path.relative(rootDir, outputPath)}`);
