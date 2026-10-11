// (fuori da Giornata.js, che gira nel browser: le pagine la chiamano sul server)
// il momento di un workshop come blocco della giornata: nero (bozza: bianco tratteggiato), porta all'appello
export function bloccoWorkshop(w, colonna, sotto = []) {
  const bozza = w.stato === 'bozza';
  return {
    id: `w${w.momento_id}`, colonna, inizio: w.inizio, fine: w.fine, tipo: bozza ? 'workshop-bozza' : 'workshop',
    titolo: `${bozza ? 'Bozza · ' : ''}Workshop · ${w.titolo}${w.momenti > 1 ? ` · ${w.momento}` : ''}`,
    sotto: sotto.filter(Boolean).join(' · '),
    href: `/gestione/workshop/${w.workshop_id}?scheda=${bozza ? 'modifica' : 'appello'}&momento=${w.momento_id}`,
  };
}
