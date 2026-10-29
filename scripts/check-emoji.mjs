#!/usr/bin/env node
// Census (default --report) dan penjaga (guard) emoji untuk seluruh basis kode.
// Jalankan tanpa argumen untuk inventaris, atau `--guard` untuk gagal bila masih ada emoji.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");

// Karakter yang secara teknis masuk Extended_Pictographic tapi bukan ikon emoji.
const PICTOGRAPHIC_BUT_TEXT = new Set(["\u00A9", "\u00AE", "\u2122", "#", "*"]);

// Simbol dekoratif (Unicode non-pictographic) yang juga harus diganti ikon SVG.
const DECORATIVE = new Set([
  "\u2713", "\u2714", "\u2715", "\u2716", "\u2717", "\u2718",
  "\u2605", "\u2606", "\u26A1", "\u2694", "\u26A0",
  "\u2192", "\u2190", "\u2191", "\u2193", "\u2794", "\u279C",
  "\u25B6", "\u25B8", "\u25C0", "\u25B6\uFE0F",
  "\u25CF", "\u25CB", "\u25AA", "\u25AB",
  "\u25A0", "\u25A1", "\u25FB", "\u25FC", "\u25FE",
  "\u203A", "\u2039", "\u00BB", "\u00AB",
  "\u2600", "\u2605", "\u2606", "\u263E", "\u263D",
  "\u2764", "\u2665", "\u25C6", "\u25C7",
]);

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const VARIATION_EMOJI = "\uFE0F";

const GUARD_ALLOWLIST = [
  "src/components/icons/emoji-map.ts",
  "supabase/migrations_v99_icon_registry.sql",
  "scripts/check-emoji.mjs",
  "scripts/icons-selftest.mjs",
];

function isAllowed(file, mode) {
  if (mode !== "guard") return false;
  return GUARD_ALLOWLIST.includes(file.split(path.sep).join("/"));
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|jsx?|mjs|cjs|css|sql|json|md|txt|html)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function findMatches(line) {
  const hits = [];
  const seen = new Set();
  const push = (token) => {
    if (!seen.has(token)) {
      seen.add(token);
      hits.push(token);
    }
  };
  for (const ch of Array.from(line)) {
    if (PICTOGRAPHIC.test(ch) && !PICTOGRAPHIC_BUT_TEXT.has(ch)) push(ch);
    else if (DECORATIVE.has(ch)) push(ch);
  }
  if (line.includes(VARIATION_EMOJI)) push(VARIATION_EMOJI);
  return hits;
}

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("/*") || t.startsWith("*");
}

function scan(targets, mode) {
  const files = [];
  for (const target of targets) {
    const abs = path.join(ROOT, target);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) files.push(...walk(abs));
    else files.push(abs);
  }
  const results = [];
  for (const abs of files.sort()) {
    const rel = path.relative(ROOT, abs);
    const isCss = /\.css$/i.test(abs);
    const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
    const rows = [];
    let inBlockComment = false;
    lines.forEach((line, index) => {
      // Lacak komentar blok CSS: baris di dalamnya tidak pernah tampil ke user.
      const insideBlock = isCss && inBlockComment;
      if (isCss) {
        let rest = line;
        for (;;) {
          if (inBlockComment) {
            const end = rest.indexOf("*/");
            if (end === -1) break;
            rest = rest.slice(end + 2);
            inBlockComment = false;
          } else {
            const start = rest.indexOf("/*");
            if (start === -1) break;
            rest = rest.slice(start + 2);
            inBlockComment = true;
          }
        }
      }
      const hits = findMatches(line);
      if (!hits.length) return;
      // Dokumentasi (README) dan komentar baris tidak pernah tampil ke user.
      if (mode === "guard" && (/\.(md|txt)$/i.test(abs) || isCommentLine(line) || insideBlock)) return;
      rows.push({ no: index + 1, hits, text: line.trim().slice(0, 90) });
    });
    if (rows.length) results.push({ rel, rows, allowed: isAllowed(rel, mode) });
  }
  return results;
}

const args = process.argv.slice(2);
const mode = args.includes("--guard") ? "guard" : "report";
const flags = new Set(args.filter((a) => a.startsWith("--")));
const targets = args.filter((a) => !a.startsWith("--"));
const dirs = targets.length ? targets : ["src", "tests", "supabase", "public", "scripts"];

if (flags.has("--json")) {
  process.stdout.write(`${JSON.stringify(scan(dirs, mode), null, 2)}\n`);
  process.exit(0);
}

const results = scan(dirs, mode);
const unique = new Map();
for (const file of results) {
  for (const row of file.rows) {
    for (const hit of row.hits) unique.set(hit, (unique.get(hit) || 0) + 1);
  }
}

let blocking = 0;
for (const file of results) {
  if (file.allowed) continue;
  blocking += file.rows.length;
  process.stdout.write(`\n${file.rel} (${file.rows.length} baris)\n`);
  for (const row of file.rows) {
    process.stdout.write(`  ${String(row.no).padStart(5)}  ${row.hits.join(" ")}  | ${row.text}\n`);
  }
}

const summary = [...unique.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([token, count]) => `${token} x${count}`);
process.stdout.write(
  `\nMode ${mode} · ${results.length} file berisi piktograf/simbol · ${summary.length} token unik\n`
);
if (mode === "report") {
  process.stdout.write(`Token: ${summary.join(" ")}\n`);
  process.exit(0);
}
if (blocking > 0) {
  process.stdout.write(`GAGAL: ${blocking} baris memakai emoji/simbol dekoratif. Gunakan <Icon name="..." />.\n`);
  process.exit(1);
}
process.stdout.write("OK: tidak ada emoji di luar file pemetaan yang diizinkan.\n");
