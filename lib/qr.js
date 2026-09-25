// Codice QR (modo byte, correzione M, versioni 1-10) disegnato in SVG.
// Scritto qui per non aggiungere librerie: serve per il pass d'ingresso.

const ECC_M = { // per versione: [codewords di correzione per blocco, blocchi gruppo 1, dati per blocco g1, blocchi g2, dati per blocco g2]
  1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0], 4: [18, 2, 32, 0, 0], 5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0], 7: [18, 4, 31, 0, 0], 8: [22, 2, 38, 2, 39], 9: [22, 3, 36, 2, 37], 10: [26, 4, 43, 1, 44],
};
const ALLINEAMENTO = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

// aritmetica nel campo di Galois GF(256)
const ESP = new Array(512), LOG = new Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { ESP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) ESP[i] = ESP[i - 255]; })();
const molt = (a, b) => (a === 0 || b === 0 ? 0 : ESP[LOG[a] + LOG[b]]);

function generatore(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const nuovo = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { nuovo[j] ^= g[j]; nuovo[j + 1] ^= molt(g[j], ESP[i]); }
    g = nuovo;
  }
  return g;
}
function correzione(dati, n) {
  const g = generatore(n);
  const r = [...dati, ...new Array(n).fill(0)];
  for (let i = 0; i < dati.length; i++) {
    const c = r[i];
    if (c !== 0) for (let j = 0; j < g.length; j++) r[i + j] ^= molt(g[j], c);
  }
  return r.slice(dati.length);
}

function codewords(testo, v) {
  const [ecc, b1, d1, b2, d2] = ECC_M[v];
  const capacita = b1 * d1 + b2 * d2;
  const byte = [...new TextEncoder().encode(testo)];
  const bit = [];
  const metti = (val, n) => { for (let i = n - 1; i >= 0; i--) bit.push((val >> i) & 1); };
  metti(0b0100, 4); metti(byte.length, v < 10 ? 8 : 16); byte.forEach((b) => metti(b, 8));
  metti(0, Math.min(4, capacita * 8 - bit.length));
  while (bit.length % 8) bit.push(0);
  const dati = [];
  for (let i = 0; i < bit.length; i += 8) dati.push(parseInt(bit.slice(i, i + 8).join(''), 2));
  for (let p = 0; dati.length < capacita; p++) dati.push(p % 2 ? 0x11 : 0xec);
  const blocchi = [];
  let k = 0;
  for (let i = 0; i < b1 + b2; i++) { const n = i < b1 ? d1 : d2; blocchi.push(dati.slice(k, k + n)); k += n; }
  const corr = blocchi.map((b) => correzione(b, ecc));
  const out = [];
  for (let i = 0; i < Math.max(d1, d2); i++) blocchi.forEach((b) => { if (i < b.length) out.push(b[i]); });
  for (let i = 0; i < ecc; i++) corr.forEach((c) => out.push(c[i]));
  return out;
}

function bitsFormato(mask) {
  const dati = (0b00 << 3) | mask; // livello M = 00
  let r = dati << 10;
  for (let i = 14; i >= 10; i--) if ((r >> i) & 1) r ^= 0x537 << (i - 10);
  return ((dati << 10) | r) ^ 0x5412;
}
function bitsVersione(v) {
  let r = v << 12;
  for (let i = 17; i >= 12; i--) if ((r >> i) & 1) r ^= 0x1f25 << (i - 12);
  return (v << 12) | r;
}

const MASCHERE = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (_, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function matrice(testo) {
  const lung = new TextEncoder().encode(testo).length;
  let v = 1;
  while (v <= 10) { const [, b1, d1, b2, d2] = ECC_M[v]; if (lung + (v < 10 ? 2 : 3) <= b1 * d1 + b2 * d2) break; v++; }
  if (v > 10) throw new Error('Testo troppo lungo per il QR');
  const n = 17 + 4 * v;
  const m = Array.from({ length: n }, () => new Array(n).fill(null));
  const fisso = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (r, c, val) => { m[r][c] = val; fisso[r][c] = true; };

  const cercatore = (r0, c0) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const dentro = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      set(rr, cc, dentro && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)));
    }
  };
  cercatore(0, 0); cercatore(0, n - 7); cercatore(n - 7, 0);
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const pos = ALLINEAMENTO[v];
  const ultimo = pos.length - 1;
  pos.forEach((r, i) => pos.forEach((c, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === ultimo) || (i === ultimo && j === 0)) return; // sotto i cercatori
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }));
  set(n - 8, 8, true); // modulo scuro
  // riservo le zone di formato e versione
  for (let i = 0; i < 9; i++) { if (!fisso[8][i]) set(8, i, false); if (!fisso[i][8]) set(i, 8, false); }
  for (let i = 0; i < 8; i++) { set(8, n - 1 - i, false); set(n - 1 - i, 8, false); }
  if (v >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { set(i, n - 11 + j, false); set(n - 11 + j, i, false); }

  // dati a zig-zag
  const cw = codewords(testo, v);
  const bit = [];
  cw.forEach((b) => { for (let i = 7; i >= 0; i--) bit.push((b >> i) & 1); });
  let k = 0, su = true;
  for (let c = n - 1; c > 0; c -= 2) {
    if (c === 6) c--;
    for (let i = 0; i < n; i++) {
      const r = su ? n - 1 - i : i;
      for (let d = 0; d < 2; d++) {
        const cc = c - d;
        if (!fisso[r][cc]) { m[r][cc] = k < bit.length ? bit[k] === 1 : false; k++; }
      }
    }
    su = !su;
  }

  const scrivi = (mat, mask) => {
    const f = bitsFormato(mask);
    const b = (i) => ((f >> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) mat[8][i] = b(14 - i);
    mat[8][7] = b(8); mat[8][8] = b(7); mat[7][8] = b(6);
    for (let i = 9; i < 15; i++) mat[14 - i][8] = b(14 - i);
    for (let i = 0; i < 8; i++) mat[n - 1 - i][8] = b(14 - i);
    for (let i = 8; i < 15; i++) mat[8][n - 15 + i] = b(14 - i);
    if (v >= 7) {
      const vb = bitsVersione(v);
      for (let i = 0; i < 18; i++) { const x = ((vb >> i) & 1) === 1; const a = Math.floor(i / 3), bb = n - 11 + (i % 3); mat[a][bb] = x; mat[bb][a] = x; }
    }
  };
  const penalita = (mat) => {
    let p = 0;
    for (let r = 0; r < n; r++) for (const riga of [true, false]) {
      let conta = 1;
      for (let c = 1; c < n; c++) {
        const a = riga ? mat[r][c] : mat[c][r], b = riga ? mat[r][c - 1] : mat[c - 1][r];
        if (a === b) { conta++; if (conta === 5) p += 3; else if (conta > 5) p++; } else conta = 1;
      }
    }
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
      const x = mat[r][c]; if (x === mat[r][c + 1] && x === mat[r + 1][c] && x === mat[r + 1][c + 1]) p += 3;
    }
    let scuri = 0; mat.forEach((riga) => riga.forEach((x) => { if (x) scuri++; }));
    p += Math.floor(Math.abs((scuri * 100) / (n * n) - 50) / 5) * 10;
    return p;
  };

  let migliore = null, minimo = Infinity;
  MASCHERE.forEach((f, mask) => {
    const mat = m.map((riga, r) => riga.map((x, c) => (fisso[r][c] ? x : x !== f(r, c))));
    scrivi(mat, mask);
    const p = penalita(mat);
    if (p < minimo) { minimo = p; migliore = mat; }
  });
  return migliore;
}

// SVG con margine di 4 moduli, scalabile
export function qrSvg(testo, { colore = '#000', sfondo = '#fff' } = {}) {
  const mat = matrice(testo);
  const n = mat.length, t = n + 8;
  let d = '';
  mat.forEach((riga, r) => riga.forEach((x, c) => { if (x) d += `M${c + 4} ${r + 4}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges"><rect width="${t}" height="${t}" fill="${sfondo}"/><path d="${d}" fill="${colore}"/></svg>`;
}
