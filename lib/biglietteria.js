// Biglietteria del saggio (query 170): testi e conti comuni a pagina pubblica, biglietti e gestione.
export const ERRORI_BIGLIETTERIA = {
  spettacolo_non_trovato: 'Questo spettacolo non c\'è più: aggiorna la pagina.',
  prenotazioni_chiuse: 'Le prenotazioni per questo spettacolo sono chiuse.',
  posti_non_validi: 'Controlla il numero di posti.',
  pizze_non_valide: 'Controlla il numero di pizze.',
  pizza_chiusa: 'Le prenotazioni della pizza sono chiuse.',
  extra_non_valido: 'Controlla le opzioni scelte (es. pizza): aggiorna la pagina e riprova.',
  extra_chiuso: 'Questa opzione non si può più ordinare',
  offerta_non_valida: 'Controlla l\'importo del contributo.',
  email_non_valida: 'L\'indirizzo email non sembra corretto: serve per mandarti i biglietti.',
  dati_mancanti: 'Scrivi nome e cognome.',
  allievo_non_trovato: 'Allievo non trovato: cercalo di nuovo.',
  scegli_allievo: 'Scegli gruppo e allievo/a (e conferma con la data di nascita, se richiesta).',
  posti_allievo_finiti: 'Per questo allievo non ci sono più posti',
  posti_esauriti: 'Non ci sono abbastanza posti liberi',
  nessun_evento: 'Scegli almeno un evento.',
  evento_ripetuto: 'Lo stesso evento è scelto due volte.',
  troppi_eventi: 'Troppi eventi insieme.',
  nominativi_mancanti: 'Scrivi nome e cognome di ogni persona (uno per posto).',
  nominativo_ripetuto: 'Hai scritto due volte la stessa persona',
  nominativo_doppio: 'Questa persona è già prenotata per questo spettacolo',
  nascita_errata: 'La data di nascita non corrisponde a quella dell\'allievo/a. Controlla e riprova.',
  posti_dopo_pagamento: 'Dopo il pagamento non si possono aggiungere persone (si possono solo togliere o correggere i nomi): per aggiungerne fai una nuova prenotazione.',
  togli_e_correggi: 'Togli le persone senza cambiare i nomi degli altri: salva, poi correggi i nomi con una seconda modifica.',
  prenotazione_annullata: 'La prenotazione è annullata.',
  prenotazione_non_trovata: 'Prenotazione non trovata.',
  non_autorizzato: 'Non hai i permessi.',
  troppi_tentativi: 'Troppe date sbagliate per questo allievo/a: riprova domani o scrivi alla segreteria.',
};

// "posti_allievo_finiti:1" → testo con quanti ne restano
export function erroreBiglietteria(messaggio = '') {
  // con più eventi l'errore arriva come "Titolo dell'evento|codice": si dice su quale evento
  const bar = messaggio.indexOf('|');
  if (bar > 0 && Object.keys(ERRORI_BIGLIETTERIA).some((k) => messaggio.slice(bar + 1).includes(k))) {
    const t = erroreBiglietteria(messaggio.slice(bar + 1));
    return t ? `${messaggio.slice(0, bar).replace(/^.*?ERROR:\s*/, '')}: ${t}` : null;
  }
  const k = Object.keys(ERRORI_BIGLIETTERIA).find((x) => messaggio.includes(x));
  if (!k) return null;
  const n = messaggio.match(new RegExp(`${k}:(\\d+)`))?.[1];
  const chi = messaggio.match(new RegExp(`${k}:([^\\n]+)`))?.[1]?.trim();
  if (chi && (k === 'nominativo_ripetuto' || k === 'nominativo_doppio' || k === 'extra_chiuso')) return `${ERRORI_BIGLIETTERIA[k]}: ${chi}.`;
  if (n != null && (k === 'posti_allievo_finiti' || k === 'posti_esauriti')) {
    const r = Number(n);
    return `${ERRORI_BIGLIETTERIA[k]}: ${r === 0 ? 'nessuno rimasto' : r === 1 ? 'ne resta 1' : `ne restano ${r}`}.`;
  }
  return ERRORI_BIGLIETTERIA[k];
}

// totale come lo calcola il database
export function totaleBiglietti(s, { posti = 0, extra = {}, offerta = 0, senzaContributo = false }) {
  if (!s) return 0;
  // senzaContributo: contributo "a prenotazione" già conteggiato in una prenotazione precedente per lo stesso allievo
  const contributo = senzaContributo && !s.contributo_per_posto ? 0 : (s.contributo_cent || 0) * (s.contributo_per_posto ? posti : 1);
  const ext = (s.extra || []).filter((o) => o.aperta !== false).reduce((n, o) => n + (extra[o.id] || 0) * (o.prezzo_cent || 0), 0);
  return contributo + ext + (s.offerta_libera ? offerta : 0);
}

// "2 × Pizza margherita, 1 × Bibita" (lista [{nome, quantita}]); per le prenotazioni vecchie solo il numero di pizze
export function testoExtra(lista, pizze = 0) {
  const t = (lista || []).filter((o) => o.quantita > 0).map((o) => `${o.quantita} × ${o.nome}`).join(', ');
  return t || (pizze > 0 ? `${pizze} ${pizze === 1 ? 'pizza' : 'pizze'}` : '');
}

export const quandoSpettacolo = (iso) => new Date(iso).toLocaleString('it-IT', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
});
export const oraSpettacolo = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

// "mercoledì 9 dicembre alle 23:59" (scadenza del pagamento)
export const quandoScade = (iso) => {
  const d = new Date(iso);
  const giorno = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Rome' });
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
  return `${giorno} alle ${ora}`;
};

export const MODIFICHE_SEGRETERIA = 'Per eventuali modifiche alla prenotazione rivolgiti alla segreteria.';
