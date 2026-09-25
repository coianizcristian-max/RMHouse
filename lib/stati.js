// Stati del cliente calcolati dal database (v_stato_clienti)
export const STATI_CLIENTE = {
  in_scadenza: { testo: 'In scadenza', tono: 'attenzione', ordine: 1 },
  in_esaurimento: { testo: 'In esaurimento', tono: 'attenzione', ordine: 2 },
  no_rinnovo: { testo: 'Non ha rinnovato', tono: 'rosso', ordine: 3 },
  inattivo: { testo: 'Inattivo', tono: 'attenzione', ordine: 4 },
  rientro: { testo: 'Rientrato', tono: 'ok', ordine: 5 },
  iscritto: { testo: 'Iscritto', tono: 'ok', ordine: 6 },
  fedele: { testo: 'Iscritto da mesi', tono: 'ok', ordine: 7 },
  prova: { testo: 'In prova', tono: 'tenue', ordine: 8 },
  lead: { testo: 'Lead', tono: 'tenue', ordine: 9 },
  perso: { testo: 'Perso', tono: 'neutro', ordine: 10 },
};

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
