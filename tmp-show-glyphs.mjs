import fs from 'node:fs';
const GLYPH = /[\p{Extended_Pictographic}✓✔✕✖✗☆★⌛⏳→←↑↓↻↺⚙⚠›«»↩↔▪●▸☰\uFE0F]/u;
const WIN = Number(process.env.WIN || 70);
for (const f of process.argv.slice(2)) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => {
    const chars = Array.from(l);
    chars.forEach((c, j) => {
      if (GLYPH.test(c)) {
        const s = Math.max(0, j - WIN), e = Math.min(chars.length, j + WIN);
        console.log(`${f}:${i + 1}[${c}]: ${chars.slice(s, e).join('')}`);
      }
    });
  });
}
