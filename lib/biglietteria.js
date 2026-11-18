// Biglietteria del saggio (query 170): testi e conti comuni a pagina pubblica, biglietti e gestione.
export const ERRORI_BIGLIETTERIA = {
  spettacolo_non_trovato: 'Questo spettacolo non c\'è più: aggiorna la pagina.',
  prenotazioni_chiuse: 'Le prenotazioni per questo spettacolo sono chiuse.',
  posti_non_validi: 'Controlla il numero di posti.',
  pizze_non_valide: 'Controlla il numero di pizze.',
  pizza_chiusa: 'Le prenotazioni della pizza sono chiuse.',
  offerta_non_valida: 'Controlla l\'importo del contributo.',
  email_non_valida: 'L\'indirizzo email non sembra corretto: serve per mandarti i biglietti.',
  dati_mancanti: 'Scrivi nome e cognome.',
  allievo_non_trovato: 'Allievo non trovato: cercalo di nuovo.',
  scegli_allievo: 'Cerca e scegli l\'allievo che viene a vedere.',
  posti_allievo_finiti: 'Per questo allievo non ci sono più posti',
  posti_esauriti: 'Non ci sono abbastanza posti liberi',
  nascita_errata: 'La data di nascita non corrisponde a quella dell\'allievo/a. Controlla e riprova.',
  troppi_tentativi: 'Troppe date sbagliate per questo allievo/a: riprova domani o scrivi alla segreteria.',
};

// "posti_allievo_finiti:1" → testo con quanti ne restano
export function erroreBiglietteria(messaggio = '') {
  const k = Object.keys(ERRORI_BIGLIETTERIA).find((x) => messaggio.includes(x));
  if (!k) return null;
  const n = messaggio.match(new RegExp(`${k}:(\\d+)`))?.[1];
  if (n != null && (k === 'posti_allievo_finiti' || k === 'posti_esauriti')) {
    const r = Number(n);
    return `${ERRORI_BIGLIETTERIA[k]}: ${r === 0 ? 'nessuno rimasto' : r === 1 ? 'ne resta 1' : `ne restano ${r}`}.`;
  }
  return ERRORI_BIGLIETTERIA[k];
}

// totale come lo calcola il database
export function totaleBiglietti(s, { posti = 0, pizze = 0, offerta = 0 }) {
  if (!s) return 0;
  const contributo = (s.contributo_cent || 0) * (s.contributo_per_posto ? posti : 1);
  return contributo + (s.pizza_aperta ? pizze * (s.pizza_cent || 0) : 0) + (s.offerta_libera ? offerta : 0);
}

export const quandoSpettacolo = (iso) => new Date(iso).toLocaleString('it-IT', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
});
export const oraSpettacolo = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
