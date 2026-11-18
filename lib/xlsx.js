// Lettore minimo di file Excel (.xlsx) nel browser, senza librerie: il primo foglio come righe di celle (testo).
// Le date di Excel arrivano come numero (es. 42137): si convertono con dataDaExcel.
async function fileDelloZip(buf, voluti) {
  const dv = new DataView(buf); const u8 = new Uint8Array(buf);
  let fine = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { fine = i; break; }
  if (fine < 0) throw new Error('file_non_valido');
  const quanti = dv.getUint16(fine + 10, true);
  let p = dv.getUint32(fine + 16, true);
  const out = {};
  for (let k = 0; k < quanti && dv.getUint32(p, true) === 0x02014b50; k++) {
    const metodo = dv.getUint16(p + 10, true), compresso = dv.getUint32(p + 20, true);
    const ln = dv.getUint16(p + 28, true), le = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true);
    const locale = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + ln));
    p += 46 + ln + le + lc;
    if (!voluti.test(nome)) continue;
    const inizio = locale + 30 + dv.getUint16(locale + 26, true) + dv.getUint16(locale + 28, true);
    const dati = u8.subarray(inizio, inizio + compresso);
    const piatto = metodo === 0 ? dati
      : metodo === 8 ? new Uint8Array(await new Response(new Blob([dati]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : null;
    if (piatto) out[nome] = new TextDecoder().decode(piatto);
  }
  return out;
}

const entita = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const testoDi = (xml) => entita([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
const colonna = (rif) => [...rif.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

export async function righeXlsx(file) {
  const parti = await fileDelloZip(await file.arrayBuffer(), /^xl\/(sharedStrings\.xml|worksheets\/sheet1\.xml)$/);
  const foglio = parti['xl/worksheets/sheet1.xml'];
  if (!foglio) throw new Error('foglio_mancante');
  const condivisi = [...(parti['xl/sharedStrings.xml'] || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => testoDi(m[1]));
  const righe = [];
  for (const r of foglio.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const riga = [];
    for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attr = c[1]; const dentro = c[2] || '';
      const rif = attr.match(/r="([A-Z]+\d+)"/)?.[1]; const tipo = attr.match(/t="(\w+)"/)?.[1];
      const v = dentro.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const valore = tipo === 's' ? condivisi[Number(v)] ?? '' : tipo === 'inlineStr' ? testoDi(dentro) : entita(v ?? '');
      riga[rif ? colonna(rif) : riga.length] = String(valore).trim();
    }
    righe.push(Array.from(riga, (x) => x ?? ''));
  }
  return righe.filter((r) => r.some((x) => x));
}

// 42137 → '2015-05-12' (Excel conta i giorni dal 30/12/1899)
export function dataDaExcel(n) {
  const g = Number(n);
  if (!Number.isFinite(g) || g < 1000 || g > 80000) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(g) * 86400000).toISOString().slice(0, 10);
}
