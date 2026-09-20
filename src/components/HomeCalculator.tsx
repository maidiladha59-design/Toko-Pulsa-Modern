'use client';

import { useState } from 'react';

type Token = number | '+' | '-' | '*' | '/' | '(' | ')';

function tokenize(input: string): Token[] {
  const clean = input.replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/');
  const tokens: Token[] = [];
  let i = 0;
  while (i < clean.length) {
    const c = clean[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/\d|\./.test(c)) {
      let j = i + 1;
      while (j < clean.length && /[\d.]/.test(clean[j])) j++;
      const n = Number(clean.slice(i, j));
      if (!Number.isFinite(n)) throw new Error('Angka tidak valid');
      tokens.push(n); i = j; continue;
    }
    if ('+-*/()'.includes(c)) { tokens.push(c as Token); i++; continue; }
    throw new Error('Karakter tidak didukung');
  }
  return tokens;
}

function calculate(input: string) {
  const t = tokenize(input);
  let p = 0;
  const parsePrimary = (): number => {
    const x = t[p++];
    if (x === '(') { const v = parseAddSub(); if (t[p++] !== ')') throw new Error('Kurung tidak seimbang'); return v; }
    if (x === '+' || x === '-') { const v = parsePrimary(); return x === '-' ? -v : v; }
    if (typeof x === 'number') return x;
    throw new Error('Ekspresi tidak lengkap');
  };
  const parseMulDiv = (): number => {
    let v = parsePrimary();
    while (t[p] === '*' || t[p] === '/') {
      const op = t[p++]; const n = parsePrimary();
      if (op === '/' && n === 0) throw new Error('Tidak bisa dibagi 0');
      v = op === '*' ? v * n : v / n;
    }
    return v;
  };
  const parseAddSub = (): number => {
    let v = parseMulDiv();
    while (t[p] === '+' || t[p] === '-') { const op = t[p++]; const n = parseMulDiv(); v = op === '+' ? v + n : v - n; }
    return v;
  };
  const result = parseAddSub();
  if (p !== t.length || !Number.isFinite(result)) throw new Error('Ekspresi tidak valid');
  return result;
}

export default function HomeCalculator() {
  const [display, setDisplay] = useState('');
  const [result, setResult] = useState('');
  const keys = ['7','8','9','÷','4','5','6','×','1','2','3','-','0','.','(',')','+','%','C','='];

  function press(key: string) {
    if (key === 'C') { setDisplay(''); setResult(''); return; }
    if (key === '=') {
      try {
        const expression = display.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
        const value = calculate(expression);
        setResult(Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10))));
      } catch (e: any) { setResult(e.message || 'Tidak valid'); }
      return;
    }
    setDisplay((v) => v + key);
  }

  return <section className="brand-card p-5 sm:p-7">
    <div className="mb-4"><p className="section-kicker">Alat Praktis</p><h2 className="section-title">🧮 Kalkulator</h2><p className="mt-1 text-xs text-slate-500">Hitung nominal top up, transaksi, atau kebutuhan sehari-hari.</p></div>
    <div className="mx-auto max-w-sm overflow-hidden rounded-3xl border bg-black p-3 shadow-lg">
      <div className="min-h-24 rounded-2xl bg-zinc-950 p-4 text-right"><p className="min-h-7 break-all text-sm text-white/50">{display || '0'}</p><p className="mt-2 min-h-9 break-all text-2xl font-black text-white">{result || ''}</p></div>
      <div className="mt-3 grid grid-cols-4 gap-2">{keys.map((key) => <button key={key} onClick={() => press(key)} className={`h-12 rounded-xl font-black transition active:scale-95 ${key === '=' ? 'bg-yellow-400 text-black' : key === 'C' ? 'bg-red-100 text-red-700' : 'bg-white/10 text-white hover:bg-white/20'}`}>{key}</button>)}</div>
    </div>
  </section>;
}
