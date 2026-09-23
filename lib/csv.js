// Lettore CSV minimo: gestisce virgolette, punto e virgola o virgola, ritorni a capo dentro i campi
export function leggiCsv(testo) {
  const pulito = testo.replace(/^\uFEFF/, '');
  const prima = pulito.split(/\r?\n/)[0] || '';
  const sep = (prima.match(/;/g) || []).length >= (prima.match(/,/g) || []).length ? ';' : ',';

  const righe = [];
  let campo = '', riga = [], dentro = false;
  for (let i = 0; i < pulito.length; i++) {
    const c = pulito[i];
    if (dentro) {
      if (c === '"') {
        if (pulito[i + 1] === '"') { campo += '"'; i++; } else dentro = false;
      } else campo += c;
    } else if (c === '"') dentro = true;
    else if (c === sep) { riga.push(campo); campo = ''; }
    else if (c === '\n') { riga.push(campo); righe.push(riga); riga = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo !== '' || riga.length) { riga.push(campo); righe.push(riga); }

  const piene = righe.filter((r) => r.some((c) => c.trim() !== ''));
  if (!piene.length) return { intestazioni: [], righe: [] };
  const intestazioni = piene[0].map((h) => h.trim());
  return {
    intestazioni,
    righe: piene.slice(1).map((r) => Object.fromEntries(intestazioni.map((h, i) => [h, (r[i] ?? '').trim()]))),
  };
}

// Riconosce le date più comuni: 2026-09-10, 10/09/2026, 10-09-2026
export function leggiData(v) {
  if (!v) return null;
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const anno = m[3].length === 2 ? (Number(m[3]) > 30 ? '19' + m[3] : '20' + m[3]) : m[3];
    return `${anno}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

// Prova a indovinare quale colonna del file corrisponde a un campo
export const indovina = (intestazioni, parole) =>
  intestazioni.find((h) => parole.some((p) => h.toLowerCase().replace(/[^a-z]/g, '').includes(p))) || '';
