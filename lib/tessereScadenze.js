// Le scadenze delle tessere già fatte, lette da un vostro file (Excel delle iscrizioni, CSV o testo incollato).
// Si cercano scritte come "A 1413763 08/10/2026": tipo, numero, data di SCADENZA (la tessera vale un anno).
// Tutto nel browser: il file non viene caricato da nessuna parte, a RMHouse arrivano solo tipo, numero e scadenza.

// tipo (A, B, C1…), numero (anche attaccato alla data, es. "A 116529319/09/2027" = 1165293 + 19/09/2027), data
const RE = /(?:^|[^A-Z0-9])(C1(?:_AUTO)?|[A-Z]{1,2}(?:_[A-Z]+)?)\s*(\d{5,9}(?=\s)|\d{5,7})\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?!\d)/g;

const iso = (g, m, a) => {
  const anno = a.length === 2 ? 2000 + Number(a) : Number(a);
  const d = new Date(Date.UTC(anno, Number(m) - 1, Number(g)));
  // date impossibili (es. 31/06) scartate
  if (anno < 2000 || anno > 2100 || d.getUTCMonth() !== Number(m) - 1 || d.getUTCDate() !== Number(g)) return null;
  return d.toISOString().slice(0, 10);
};

// [{ tipo, numero, scadenza }] — una per numero, con la scadenza più lontana
export function leggiScadenze(testo) {
  const per = new Map();
  for (const x of String(testo || '').toUpperCase().matchAll(RE)) {
    const scadenza = iso(x[3], x[4], x[5]);
    if (!scadenza) continue;
    const prima = per.get(x[2]);
    if (!prima || prima.scadenza < scadenza) per.set(x[2], { tipo: x[1], numero: x[2], scadenza });
  }
  return [...per.values()];
}

// il testo di un file: .xlsx (è uno zip: si leggono le celle), altrimenti testo semplice (csv, txt)
export async function testoDelFile(file) {
  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0x50 && u8[1] === 0x4b) return testoXlsx(buf);
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(u8);
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(u8) : utf8;
}

async function testoXlsx(buf) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  // fine dello zip: l'elenco dei file
  let fine = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { fine = i; break; }
  if (fine < 0) throw new Error('file_non_valido');
  const quanti = dv.getUint16(fine + 10, true);
  let p = dv.getUint32(fine + 16, true);
  const parti = [];
  for (let k = 0; k < quanti && dv.getUint32(p, true) === 0x02014b50; k++) {
    const metodo = dv.getUint16(p + 10, true);
    const compresso = dv.getUint32(p + 20, true);
    const ln = dv.getUint16(p + 28, true), le = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true);
    const locale = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + ln));
    p += 46 + ln + le + lc;
    if (!/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(nome)) continue;
    const inizio = locale + 30 + dv.getUint16(locale + 26, true) + dv.getUint16(locale + 28, true);
    const dati = u8.subarray(inizio, inizio + compresso);
    let out = null;
    if (metodo === 0) out = dati;
    else if (metodo === 8) out = new Uint8Array(await new Response(new Blob([dati]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    if (out) parti.push(new TextDecoder().decode(out));
  }
  // via i tag: ogni cella su una riga
  return parti.join('\n').replace(/<\/(t|v|si|c|row)>/g, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
