// Tutto quello che la scuola conserva su una persona (e su chi paga per lei): per la copia dei dati (GDPR art. 15 e 20)
export async function raccogliDati(supabase, id) {
  const { data: allievo } = await supabase.from('allievi').select('*').eq('id', id).maybeSingle();
  if (!allievo) return null;
  const acc = allievo.account_id;
  const [account, iscrizioni, pagamenti, ricevute, presenze, prove, certificati, quote, storico, rate, messaggi, firme] = await Promise.all([
    supabase.from('account').select('nome, cognome, email, telefono, codice_fiscale, indirizzo, cap, citta, provincia, fonte, consenso_privacy_at, consenso_marketing, created_at').eq('id', acc).maybeSingle(),
    supabase.from('iscrizioni').select('data_inizio, data_fine, stato, sconto_cent, note, corsi ( nome ), tipi_abbonamento ( nome )').eq('allievo_id', id).order('data_inizio', { ascending: false }),
    supabase.from('pagamenti').select('pagato_at, created_at, causale, descrizione, importo_cent, metodo, stato').eq('account_id', acc).order('created_at', { ascending: false }),
    supabase.from('ricevute').select('numero, anno, data, tipo_documento, descrizione, importo_cent, iva_cent, metodo, annullata').eq('account_id', acc).order('data', { ascending: false }),
    supabase.from('presenze').select('presente, lezioni ( data, corsi ( nome ) )').eq('allievo_id', id),
    supabase.from('prove').select('stato, created_at, corsi ( nome ), lezioni ( inizio )').eq('allievo_id', id),
    supabase.from('certificati').select('caricato_at, scadenza, stato, nome_file').eq('allievo_id', id),
    supabase.from('quote_iscrizione').select('stagione, importo_cent, data').eq('allievo_id', id),
    supabase.from('storico_abbonamenti').select('abbonamento, dal, al, valore_cent').eq('allievo_id', id).order('dal', { ascending: false }),
    supabase.from('rate').select('descrizione, numero, di, importo_cent, scadenza, stato').eq('allievo_id', id),
    supabase.from('messaggi_coda').select('created_at, evento, oggetto, stato').eq('allievo_id', id).order('created_at', { ascending: false }),
    supabase.from('firme').select('id, titolo, versione, firmatario, per_conto, firmato_at, dove, risposte, firma2_nome, dichiarazione').eq('allievo_id', id).order('firmato_at', { ascending: false }),
  ]);
  const { token, codice_esterno, palestra_id, ...persona } = allievo;
  return {
    allievo,
    dati: {
      estratto_il: new Date().toISOString(),
      persona, chi_paga: account.data,
      iscrizioni: iscrizioni.data, pagamenti: pagamenti.data, ricevute: ricevute.data,
      presenze: presenze.data, prove: prove.data, certificati: certificati.data, quote_annuali: quote.data,
      storico_abbonamenti: storico.data, rate: rate.data, messaggi_inviati: messaggi.data,
      moduli_firmati: (firme.data || []).map(({ id: _id, ...f }) => f),
    },
  };
}
