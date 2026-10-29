#!/usr/bin/env node
// Uji mandiri set ikon: validasi sintaks path, area aman 24x24, kelengkapan
// pemetaan emoji, lalu tulis kontak-sheet HTML untuk dicek visual (dua tema).
import fs from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const ROOT = path.resolve(import.meta.dirname, "..");
const registry = await import(pathToFileURL(path.join(ROOT, "src/components/icons/registry.ts")).href);
const emojiMap = await import(pathToFileURL(path.join(ROOT, "src/components/icons/emoji-map.ts")).href);

const failures = [];
const ICONS = registry.ICON_REGISTRY;
const NAMES = registry.ICON_NAMES;

const COMMAND_ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
const NUMBER_RE = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g;

function validatePath(data) {
  const problems = [];
  const tokens = data.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/g);
  if (!tokens) return ["tidak ada perintah"];
  if (tokens[0][0].toLowerCase() !== "m") problems.push("path tidak dimulai dengan M/m");
  for (const token of tokens) {
    const command = token[0];
    const numbers = token.slice(1).match(NUMBER_RE)?.map(Number) ?? [];
    if (numbers.some((value) => !Number.isFinite(value))) {
      problems.push(`${command}: angka rusak -> ${token}`);
      continue;
    }
    const expected = COMMAND_ARGS[command.toLowerCase()];
    if (expected === 0) {
      if (numbers.length > 0) problems.push(`${command}: tidak boleh punya argumen`);
    } else if (numbers.length % expected !== 0) {
      problems.push(`${command}: jumlah argumen ${numbers.length} bukan kelipatan ${expected}`);
    } else if (
      token.slice(1).replace(new RegExp(NUMBER_RE.source, "g"), "").replace(/[\s,]+/g, "").length > 0
    ) {
      problems.push(`${command}: ada teks tersisa setelah angka -> ${token}`);
    }
    if (command === "a" || command === "A") {
      for (let i = 0; i < numbers.length; i += 7) {
        if (!(numbers[i] > 0) || !(numbers[i + 1] > 0)) problems.push("A: radius nol");
        if (![0, 1].includes(numbers[i + 2]) || ![0, 1].includes(numbers[i + 3])) problems.push("A: flag bukan 0/1");
      }
    } else if (command === "H" || command === "V") {
      for (const value of numbers) if (value < 0 || value > 24) problems.push(`${command}: nilai ${value} keluar kanvas 24`);
    } else if (command === command.toUpperCase()) {
      for (let i = 0; i < numbers.length; i += expected) {
        if (expected < 2) continue;
        const pairs = [];
        for (let j = 0; j < expected; j += 2) if (j + 1 < expected) pairs.push([numbers[i + j], numbers[i + j + 1]]);
        for (const [x, y] of pairs) {
          if (x < 0 || x > 24 || y < 0 || y > 24) problems.push(`${command}: titik ${x},${y} keluar kanvas 24`);
        }
      }
    }
  }
  return problems;
}

function checkGeometry() {
  for (const name of NAMES) {
    const nodes = ICONS[name];
    if (!Array.isArray(nodes) || nodes.length === 0) failures.push(`${name}: registry kosong`);
    for (const node of nodes) {
      if ("d" in node || "fill" in node) {
        const data = "d" in node ? node.d : node.fill;
        for (const problem of validatePath(data)) failures.push(`${name}: ${problem} -> ${data}`);
      }
      if ("circle" in node) {
        const [cx, cy, r] = node.circle;
        if (!(r > 0)) failures.push(`${name}: radius lingkaran <= 0`);
        if (cx - r < 1.5 || cy - r < 1.5 || cx + r > 22.5 || cy + r > 22.5) {
          failures.push(`${name}: lingkaran keluar kanvas -> ${node.circle.join(",")}`);
        }
      }
      if ("rect" in node) {
        const [x, y, w, h] = node.rect;
        if (!(w > 0 && h > 0)) failures.push(`${name}: ukuran rect <= 0`);
        if (x < 1.5 || y < 1.5 || x + w > 22.5 || y + h > 22.5) {
          failures.push(`${name}: rect keluar kanvas -> ${node.rect.join(",")}`);
        }
      }
    }
  }
}

function checkNames() {
  if (NAMES.length !== new Set(NAMES).size) failures.push("ada nama ikon ganda");
  if (!Object.prototype.hasOwnProperty.call(ICONS, "default")) {
    failures.push("registry tidak punya ikon default");
  }
}

function checkMapping() {
  const names = new Set(NAMES);
  const codeEmoji = new Map();
  for (const token of emojiMap.EMOJI_TOKENS) {
    const resolved = emojiMap.mapEmojiToIcon(token);
    if (resolved === "default" && token !== "\u{1F44B}") codeEmoji.set(token, "belum dipetakan");
    else if (!names.has(resolved)) failures.push(`${token} -> ${resolved} tidak ada di registry`);
  }
  const probes = ["\u{1F4F1}", "\u{1F4E6}", "\u26A1", "\u{1F9FE}", "\u2B50", "\u2713", "\u2715", "\u2605"];
  for (const probe of probes) {
    const got = emojiMap.mapEmojiToIcon(probe);
    if (got === "default") failures.push(`emoji umum ${JSON.stringify(probe)} jatuh ke default`);
  }
  for (const legacy of ["wallet", "pulsa", "no-ada", "", null]) {
    const got = emojiMap.mapEmojiToIcon(legacy);
    if (!names.has(got)) failures.push(`mapEmojiToIcon(${JSON.stringify(legacy)}) -> ${got}`);
  }
  return codeEmoji;
}

checkGeometry();
checkNames();
const unmapped = checkMapping();

const sheet = path.join(ROOT, "scripts", "icons-preview.html");
const cells = NAMES.map((name) => {
  const svg = (theme) =>
    `<span class="cell ${theme}"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]
      .map((node) => {
        if ("fill" in node) return `<path d="${node.fill}" fill="currentColor" stroke="none"/>`;
        if ("circle" in node) return `<circle cx="${node.circle[0]}" cy="${node.circle[1]}" r="${node.circle[2]}"/>`;
        if ("rect" in node) return `<rect x="${node.rect[0]}" y="${node.rect[1]}" width="${node.rect[2]}" height="${node.rect[3]}" rx="${node.rect[4]}"/>`;
        return `<path d="${node.d}"/>`;
      })
      .join("")}</svg><em>${name}</em></span>`;
  return `<div class="row">${svg("light")}${svg("dark")}</div>`;
}).join("\n");

fs.writeFileSync(
  sheet,
  `<!doctype html><html><head><meta charset="utf-8"><title>Ikon AIDIL STORE</title><style>
body{margin:0;font:12px system-ui;background:#fff;color:#18181b}
.row{display:flex;gap:8px;padding:6px 10px;border-bottom:1px solid #eee}
.cell{display:flex;flex-direction:column;align-items:center;gap:3px;width:78px;padding:6px;border-radius:14px;border:1px solid #e4e4e7;background:linear-gradient(135deg,#eff8ff,#fff);color:#1158b8}
.cell.dark{background:#0f0f12;border-color:#27272a;color:#7cc9fc}
.cell em{font-style:normal;font-size:9px;font-weight:700}
</style></head><body>${cells}</body></html>`
);

for (const [token, note] of unmapped) console.log(`UNMAPPED ${JSON.stringify(token)} ${note}`);
if (failures.length) {
  console.error(`GAGAL uji ikon (${failures.length}):`);
  for (const line of failures) console.error(` - ${line}`);
  process.exit(1);
}
console.log(`OK ${NAMES.length} ikon tervalidasi · kontak-sheet: ${path.relative(ROOT, sheet)}`);
