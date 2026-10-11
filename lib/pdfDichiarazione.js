import 'server-only';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { testiDichiarazione } from '@/lib/dichiarazione730';

// PDF delle dichiarazioni per il 730: una pagina A4 per ragazzo (o per ricevuta), impaginata come il modello Word:
// logo in alto, titolo, intestazione della società, i dati al centro, data, "Legale Rappresentante" e timbro con firma.
const A4 = [595.28, 841.89];
const M = 70;
const NERO = rgb(0.05, 0.05, 0.05);

function pulisci(font, testo) {
  const sostituti = { '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-', ' ': ' ' };
  let out = '';
  for (const ch of String(testo ?? '')) {
    const c = sostituti[ch] ?? ch;
    try { font.encodeText(c); out += c; } catch { /* carattere non disponibile */ }
  }
  return out;
}
function righe(font, size, testo, larghezza) {
  const out = [];
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
async function immagine(doc, bytes) {
  if (!bytes?.length) return null;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await doc.embedJpg(bytes);
  } catch { /* senza */ }
  return null;
}

// righe: dalla query dichiarazioni_730; logo e timbro: byte (Uint8Array) o null
export async function pdfDichiarazioni({ righe: elenco, imp = {}, pal = {}, logo = null, timbro = null, oggi }) {
  const doc = await PDFDocument.create();
  doc.setTitle(elenco.length === 1 ? `Dichiarazione ${elenco[0].nome || ''} ${elenco[0].cognome || ''}`.trim() : 'Dichiarazioni per il 730');
  doc.setAuthor(pal.fatturazione?.denominazione || pal.nome || '');
  const f = await doc.embedFont(StandardFonts.TimesRoman);
  const fb = await doc.embedFont(StandardFonts.TimesRomanBold);
  const imgLogo = await immagine(doc, logo);
  const imgTimbro = await immagine(doc, timbro);
  const [W, H] = A4;
  const L = W - 2 * M;

  for (const d of elenco) {
    const t = testiDichiarazione(d, imp, pal, oggi);
    const p = doc.addPage(A4);
    const scrivi = (testo, x, y, size = 12, font = f) => p.drawText(pulisci(font, testo), { x, y, size, font, color: NERO });
    const centro = (testo, y, size = 12, font = f) => scrivi(testo, (W - font.widthOfTextAtSize(pulisci(font, testo), size)) / 2, y, size, font);
    let y = H - 48;
    if (imgLogo) {
      const w = Math.min(130, (imgLogo.width / imgLogo.height) * 74); const h = w / (imgLogo.width / imgLogo.height);
      p.drawImage(imgLogo, { x: M - 14, y: y - h, width: w, height: h });
      y -= h - 6;
    }
    // titolo
    y -= 26;
    centro(t.titolo[0], y, 16, fb); y -= 26;
    centro(t.titolo[1], y, 16, fb); y -= 28;
    // intestazione della società
    for (const r of righe(f, 12, t.intestazione, L)) { scrivi(r, M, y); y -= 16; }
    y -= 14;
    // i dati, centrati
    for (const r of t.centro) {
      if (r === '') { y -= 14; continue; }
      const bold = r === t.centro[1];
      for (const x of righe(bold ? fb : f, 12, r, L)) { centro(x, y, 12, bold ? fb : f); y -= 22; }
    }
    y -= 34;
    centro(t.data, y); y -= 44;
    // firma e timbro
    scrivi(t.firma, M, y);
    if (imgTimbro) {
      const w = 250; const h = w / (imgTimbro.width / imgTimbro.height);
      p.drawImage(imgTimbro, { x: W - M - w, y: y - h + 22, width: w, height: h });
    } else {
      p.drawLine({ start: { x: W - M - 220, y: y - 30 }, end: { x: W - M, y: y - 30 }, thickness: 0.6, color: NERO });
      scrivi('(timbro e firma)', W - M - 150, y - 44, 9);
    }
  }
  return doc.save();
}
