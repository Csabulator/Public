// Build: concatenates src/*.js into one closure inside src/template.html -> index.html
// Usage: node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const ORDER = ['data', 'i18n', 'state', 'security', 'geometry', 'setup', 'art', 'audio', 'race', 'career', 'ui', 'rally', 'rallyui', 'rx', 'main'];
const js = ORDER.map(f => `/* ---- ${f}.js ---- */\n` + readFileSync(`src/${f}.js`, 'utf8')).join('\n');
const css = readFileSync('src/style.css', 'utf8');
const html = readFileSync('src/template.html', 'utf8').replace('/*CSS*/', () => css).replace('/*JS*/', () => js);
writeFileSync('index.html', html);
console.log('index.html', (html.length / 1024).toFixed(1) + ' KB');
