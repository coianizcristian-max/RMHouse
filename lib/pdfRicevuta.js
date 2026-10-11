import 'server-only';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { euro, dataBreve } from '@/lib/formato';

// PDF della ricevuta / fattura (copia di cortesia) / nota di credito: lo stesso contenuto del foglio a video
// (FoglioRicevuta), scritto con pdf-lib. `r` è la riga di ricevute con numerazioni, aliquote_iva e rif (oppure il JSON
// di ricevuta_pubblica), `pal` i dati della scuola, `logo` un URL (png o jpg) o null.

const A4 = [595.28, 841.89];
const M = 50;                        // margine
const NERO = rgb(0.07, 0.07, 0.07);
const GRIGIO = rgb(0.42, 0.42, 0.42);
const ROSSO = rgb(0.75, 0, 0);
const LINEA = rgb(0.86, 0.86, 0.86);

async function immagine(doc, url, base) {
  if (!url) return null;
  try {
    const assoluto = url.startsWith('http') ? url : `${base}${url}`;
    const res = await fetch(assoluto, { cache: 'no-store' });
    if (!res.ok) return null;
    const byte = new Uint8Array(await res.arrayBuffer());
    if (byte[0] === 0x89 && byte[1] === 0x50) return await doc.embedPng(byte);
    if (byte[0] === 0xff && byte[1] === 0xd8) return await doc.embedJpg(byte);
  } catch { /* senza logo */ }
  return null;
}

// solo i caratteri che il font standard sa scrivere (WinAnsi): gli altri diventano simili o spariscono
function pulisci(font, testo) {
  const sostituti = { '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-', '→': '->', ' ': ' ' };
  let out = '';
  for (const ch of String(testo ?? '')) {
    const c = sostituti[ch] ?? ch;
    try { font.encodeText(c); out += c; } catch { /* carattere non disponibile */ }
  }
  return out;
}

// testo a capo dentro una larghezza
function righe(font, size, testo, larghezza) {
  const out = [];
  // prima si va a capo, poi si pulisce: il carattere di a capo non è scrivibile e verrebbe tolto
  for (const paragrafo of String(testo ?? '').split(/\r?\n/)) {
    let riga = '';
    for (const parola of pulisci(font, paragrafo).split(/\s+/)) {
      const prova = riga ? `${riga} ${parola}` : parola;
      if (font.widthOfTextAtSize(prova, size) <= larghezza || !riga) riga = prova;
      else { out.push(riga); riga = parola; }
    }
    out.push(riga);
  }
  return out;
}

export async function pdfRicevuta({ r, pal, logo, base = '' }) {
  const doc = await PDFDocument.create();
  const pagina = doc.addPage(A4);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = A4;
  let y = H - M;
  const scrivi = (t, x, yy, { size = 10, font = f, colore = NERO } = {}) => pagina.drawText(pulisci(font, t), { x, y: yy, size, font, color: colore });
  const aDestra = (t, xDestra, yy, opz = {}) => {
    const font = opz.font || f; const size = opz.size || 10;
    scrivi(t, xDestra - font.widthOfTextAtSize(pulisci(font, t), size), yy, opz);
  };

  const codice = r.numerazioni?.codice ?? r.codice;
  const fattura = r.tipo_documento === 'fattura' || (r.tipo_documento === 'nota_credito' && r.rif?.tipo_documento === 'fattura');
  const fz = pal?.fatturazione || {};
  const tipo = r.tipo_documento === 'nota_credito' ? 'Nota di credito' : fattura ? 'Fattura' : 'Ricevuta';
  doc.setTitle(`${tipo} ${codice ? `${codice} ` : ''}${r.numero}/${r.anno}`);
  doc.setAuthor(pal?.nome || '');

  // intestazione: logo e dati della scuola a sinistra, documento a destra
  const img = await immagine(doc, logo, base);
  let xTesto = M;
  if (img) {
    const rapporto = img.width / img.height;
    const w = Math.min(120, rapporto * 54); const h = w / rapporto;
    pagina.drawImage(img, { x: M, y: y - h + 6, width: w, height: h });
    xTesto = M + w + 12;
  }
  const nome = fattura && fz.denominazione ? fz.denominazione : pal?.nome || '';
  const dati = fattura && fz.piva
    ? [`${fz.indirizzo || ''}, ${fz.cap || ''} ${fz.comune || ''}${fz.provincia ? ` (${fz.provincia})` : ''}`, `P.IVA ${fz.piva}${fz.cf && fz.cf !== fz.piva ? ` - C.F. ${fz.cf}` : ''}`, pal?.email].filter(Boolean).join('\n')
    : pal?.dati_fiscali || [pal?.indirizzo, pal?.telefono, pal?.email].filter(Boolean).join('\n');
  scrivi(nome, xTesto, y - 4, { size: 12, font: fb });
  let yd = y - 18;
  for (const l of righe(f, 8.5, dati, W - M - 190 - xTesto)) { scrivi(l, xTesto, yd, { size: 8.5, colore: GRIGIO }); yd -= 11; }
  aDestra(tipo, W - M, y - 4, { size: 9, colore: GRIGIO });
  aDestra(`${codice ? `${codice} ` : ''}n. ${r.numero}/${r.anno}`, W - M, y - 24, { size: 18, font: fb });
  aDestra(dataBreve(r.data), W - M, y - 38, { size: 9, colore: GRIGIO });
  y = Math.min(yd, y - 58) - 10;
  pagina.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINEA });
  y -= 22;

  if (r.annullata) {
    pagina.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 22, color: rgb(1, 0.93, 0.93) });
    scrivi(`ANNULLATA - ${r.motivo_annullo || ''}`, M + 8, y, { size: 10, font: fb, colore: ROSSO });
    y -= 28;
  }
  if (r.tipo_documento === 'nota_credito' && r.rif) {
    scrivi(`A rettifica ${r.rif.tipo_documento === 'fattura' ? `della fattura n. ${r.rif.numerazioni?.codice || ''} ${r.rif.numero}/${r.rif.anno}` : `della ricevuta n. ${r.rif.numero}/${r.rif.anno}`} del ${dataBreve(r.rif.data)}.`, M, y, { size: 9.5 });
    y -= 20;
  }

  // a chi
  const c = r.cliente || {};
  scrivi(fattura ? 'Cliente' : r.tipo_documento === 'nota_credito' ? 'Rimborso a' : 'Ricevuta da', M, y, { size: 9, colore: GRIGIO });
  y -= 16;
  scrivi(r.intestatario || '', M, y, { size: 13, font: fb });
  y -= 14;
  const sotto = fattura
    ? [r.indirizzo, c.piva && `P.IVA ${c.piva}`, c.cf && `C.F. ${c.cf}`, c.codice_destinatario && c.codice_destinatario !== '0000000' ? `Codice destinatario ${c.codice_destinatario}` : c.pec ? `PEC ${c.pec}` : null].filter(Boolean).join(' - ')
    : [r.indirizzo, r.codice_fiscale && `C.F. ${r.codice_fiscale}`].filter(Boolean).join(' - ');
  for (const l of righe(f, 9, sotto, W - 2 * M)) { if (l) { scrivi(l, M, y, { size: 9, colore: GRIGIO }); y -= 12; } }
  y -= 18;

  // tabella
  const xImp = W - M;
  scrivi('Descrizione', M, y, { size: 9, font: fb, colore: GRIGIO });
  aDestra('Importo', xImp, y, { size: 9, font: fb, colore: GRIGIO });
  y -= 8;
  pagina.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINEA });
  y -= 16;
  const dl = righe(f, 10.5, `${r.descrizione || ''}${fattura ? ' (imponibile)' : ''}`, W - 2 * M - 110);
  dl.forEach((l, i) => { scrivi(l, M, y - i * 13, { size: 10.5 }); });
  aDestra(euro(r.importo_cent), xImp, y, { size: 10.5 });
  y -= dl.length * 13 + 6;
  const pctIva = r.aliquote_iva?.percentuale ?? r.percentuale_iva;
  const rifIva = r.aliquote_iva?.riferimento ?? r.riferimento_iva;
  const rigaIva = r.iva_cent ? (pctIva != null ? `IVA ${Number(pctIva)}%` : `IVA (${r.aliquota})`)
    : [r.aliquota, r.natura, rifIva].filter(Boolean).join(' - ');
  const il = righe(f, 9.5, rigaIva, W - 2 * M - 110);
  il.forEach((l, i) => scrivi(l, M, y - i * 12, { size: 9.5, colore: GRIGIO }));
  aDestra(euro(r.iva_cent), xImp, y, { size: 9.5, colore: GRIGIO });
  y -= il.length * 12 + 8;
  pagina.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINEA });
  y -= 20;
  scrivi('Totale', M, y, { size: 12, font: fb });
  aDestra(`${r.tipo_documento === 'nota_credito' ? '-' : ''}${euro(r.importo_cent + r.iva_cent)}`, xImp, y, { size: 16, font: fb });
  y -= 30;
  scrivi(`Pagato con ${r.metodo || 'metodo non indicato'}${r.note ? ` - ${r.note}` : ''}`, M, y, { size: 9.5, colore: GRIGIO });
  y -= 26;

  if (fattura && r.bollo_cent > 0) { scrivi(`Imposta di bollo di ${euro(r.bollo_cent)} assolta in modo virtuale.`, M, y, { size: 9.5 }); y -= 18; }
  const piede = fattura
    ? 'Copia di cortesia. Il documento valido e\' quello elettronico (file XML) trasmesso al Sistema di Interscambio e disponibile nella tua area riservata del sito dell\'Agenzia delle Entrate.'
    : pal?.dicitura_ricevuta || '';
  if (piede) {
    y -= 6;
    pagina.drawLine({ start: { x: M, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 0.6, color: LINEA });
    for (const l of righe(f, 8.5, piede, W - 2 * M)) { scrivi(l, M, y, { size: 8.5, colore: GRIGIO }); y -= 11; }
  }
  return doc.save();
}

export const nomeFilePdf = (r) => {
  const tipo = r.tipo_documento === 'nota_credito' ? 'nota-di-credito' : r.tipo_documento === 'fattura' ? 'fattura' : 'ricevuta';
  const cod = r.numerazioni?.codice ?? r.codice;
  return `${tipo}-${cod ? `${cod}-` : ''}${r.numero}-${r.anno}.pdf`.replace(/[^\w.-]+/g, '-');
};
