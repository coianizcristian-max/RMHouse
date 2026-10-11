// IVA: i prezzi di RMHouse sono sempre IVA COMPRESA. Sulla ricevuta l'IVA si scorpora dal prezzo, non si aggiunge:
// 15 € con IVA 22% = 12,30 di imponibile + 2,70 di IVA (come fa emetti_ricevuta nel database).
export function scorporo(totaleCent, percentuale) {
  const tot = Math.round(Number(totaleCent) || 0);
  const pct = Number(percentuale) || 0;
  const imponibile = Math.round(tot / (1 + pct / 100));
  return { imponibile, iva: tot - imponibile, percentuale: pct };
}

// "IVA 22%" · "Esente IVA · 0% N4"
export function testoAliquota(a) {
  if (!a) return '';
  const perc = `${Number(a.percentuale || 0)}%${a.natura ? ` ${a.natura}` : ''}`;
  return a.nome?.includes('%') ? a.nome : `${a.nome} · ${perc}`;
}
