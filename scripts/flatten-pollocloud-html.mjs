import { rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(projectRoot, 'dist', 'pollocloud');
const nestedHtml = path.join(outputRoot, 'pollocloud', 'index.html');
const rootHtml = path.join(outputRoot, 'index.html');

await rename(nestedHtml, rootHtml);
await rm(path.dirname(nestedHtml), { recursive: true, force: true });
