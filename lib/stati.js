// Stati del cliente calcolati dal database (v_stato_clienti)
export const STATI_CLIENTE = {
  in_scadenza: { testo: 'In scadenza', tono: 'attenzione', ordine: 1 },
  in_esaurimento: { testo: 'In esaurimento', tono: 'attenzione', ordine: 2 },
  no_rinnovo: { testo: 'Non ha rinnovato', tono: 'rosso', ordine: 3 },
  inattivo: { testo: 'Inattivo/a', m: 'Inattivo', f: 'Inattiva', tono: 'attenzione', ordine: 4 },
  rientro: { testo: 'Rientrato/a', m: 'Rientrato', f: 'Rientrata', tono: 'ok', ordine: 5 },
  iscritto: { testo: 'Iscritto/a', m: 'Iscritto', f: 'Iscritta', tono: 'ok', ordine: 6 },
  fedele: { testo: 'Iscritto/a da mesi', m: 'Iscritto da mesi', f: 'Iscritta da mesi', tono: 'ok', ordine: 7 },
  prova: { testo: 'In prova', tono: 'tenue', ordine: 8 },
  lead: { testo: 'Lead', tono: 'tenue', ordine: 9 },
  perso: { testo: 'Perso/a', m: 'Perso', f: 'Persa', tono: 'neutro', ordine: 10 },
};

// Lo stato scritto per una persona precisa: "Persa" per lei, "Perso" per lui, "Perso/a" se non si sa.
// g = 'F' | 'M' | null (vedi genere() in lib/genere.js). Gli elenchi e i filtri usano .testo (le due forme).
export function statoTesto(stato, g) {
  const s = STATI_CLIENTE[stato];
  if (!s) return stato || '';
  return (g === 'F' ? s.f : g === 'M' ? s.m : null) || s.testo;
}

export const TIPI_SCADENZA = {
  abbonamento: 'Abbonamento',
  ingressi: 'Ingressi',
  certificato: 'Certificato',
  quota: 'Quota annuale',
  rata: 'Rata',
};

// CSV con punto e virgola e BOM: si apre bene in Excel italiano
export function comeCsv(intestazioni, righe) {
  const cella = (v) => {
    const t = v == null ? '' : String(v);
    return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '\uFEFF' + [intestazioni, ...righe].map((r) => r.map(cella).join(';')).join('\r\n');
}

export function scaricaCsv(nomeFile, intestazioni, righe) {
  const blob = new Blob([comeCsv(intestazioni, righe)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeFile; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
