import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { creaZip } from '@/lib/zip';

export const dynamic = 'force-dynamic';

async function staffDi(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('staff').select('palestra_id, ruolo').eq('user_id', user.id).eq('attivo', true).maybeSingle();
  return data;
}

// Tutti i dati di una persona, per una richiesta di accesso (GDPR art. 15)
export async function GET(_request, { params }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const staff = await staffDi(supabase);
  if (!staff || staff.ruolo === 'insegnante') return new Response('Non autorizzato.', { status: 403 });

  const { data: allievo } = await supabase.from('allievi').select('*').eq('id', id).maybeSingle();
  if (!allievo) return new Response('Persona non trovata.', { status: 404 });
  const acc = allievo.account_id;
  const [account, iscrizioni, pagamenti, ricevute, presenze, prove, certificati, quote, storico, rate, messaggi] = await Promise.all([
    supabase.from('account').select('nome, cognome, email, telefono, codice_fiscale, indirizzo, cap, citta, provincia, fonte, consenso_privacy_at, consenso_marketing, created_at').eq('id', acc).maybeSingle(),
    supabase.from('iscrizioni').select('data_inizio, data_fine, stato, sconto_cent, note, corsi ( nome ), tipi_abbonamento ( nome )').eq('allievo_id', id),
    supabase.from('pagamenti').select('pagato_at, created_at, causale, descrizione, importo_cent, metodo, stato').eq('account_id', acc),
    supabase.from('ricevute').select('numero, anno, data, tipo_documento, descrizione, importo_cent, iva_cent, metodo, annullata').eq('account_id', acc),
    supabase.from('presenze').select('presente, lezioni ( data, corsi ( nome ) )').eq('allievo_id', id),
    supabase.from('prove').select('stato, created_at, corsi ( nome ), lezioni ( inizio )').eq('allievo_id', id),
    supabase.from('certificati').select('caricato_at, scadenza, stato, nome_file').eq('allievo_id', id),
    supabase.from('quote_iscrizione').select('stagione, importo_cent, data').eq('allievo_id', id),
    supabase.from('storico_abbonamenti').select('abbonamento, dal, al, valore_cent').eq('allievo_id', id),
    supabase.from('rate').select('descrizione, numero, di, importo_cent, scadenza, stato').eq('allievo_id', id),
    supabase.from('messaggi_coda').select('created_at, evento, oggetto, stato').eq('allievo_id', id),
  ]);

  const { token, codice_esterno, palestra_id, ...persona } = allievo;
  const dati = {
    estratto_il: new Date().toISOString(),
    persona, chi_paga: account.data,
    iscrizioni: iscrizioni.data, pagamenti: pagamenti.data, ricevute: ricevute.data,
    presenze: presenze.data, prove: prove.data, certificati: certificati.data, quote_annuali: quote.data,
    storico_abbonamenti: storico.data, rate: rate.data, messaggi_inviati: messaggi.data,
  };
  const leggimi = [
    `Dati personali di ${allievo.nome} ${allievo.cognome}, estratti il ${new Date().toLocaleDateString('it-IT')}.`,
    '',
    'Il file dati.json contiene tutto quello che la scuola conserva su questa persona e su chi paga:',
    'anagrafica, iscrizioni, pagamenti, ricevute, presenze, prove, certificati (solo i dati, non le immagini),',
    'quote annuali, storico degli abbonamenti, rate e messaggi inviati.',
    '',
    `Iscrizioni: ${iscrizioni.data?.length || 0} · Pagamenti: ${pagamenti.data?.length || 0} · Ricevute: ${ricevute.data?.length || 0} · Presenze: ${presenze.data?.length || 0}`,
  ].join('\r\n');
  const zip = creaZip([
    { nome: 'LEGGIMI.txt', contenuto: '\uFEFF' + leggimi },
    { nome: 'dati.json', contenuto: JSON.stringify(dati, null, 2) },
  ]);
  const nome = `${allievo.cognome}-${allievo.nome}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return new Response(zip, {
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="dati-${nome}.zip"`, 'Cache-Control': 'no-store' },
  });
}

// Cancellazione su richiesta (GDPR art. 17): anonimizza e toglie i file dei certificati
export async function POST(_request, { params }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const staff = await staffDi(supabase);
  if (!staff || staff.ruolo !== 'admin') {
    return Response.json({ errore: "Solo l'amministrazione può cancellare i dati di una persona." }, { status: 403 });
  }
  const { data, error } = await supabase.rpc('anonimizza_persona', { p_allievo: id });
  if (error) return Response.json({ errore: 'Cancellazione non riuscita.' }, { status: 500 });
  const file = data?.file_da_cancellare || [];
  if (file.length) await supabaseAdmin().storage.from('certificati').remove(file);
  return Response.json({ ok: true, file_tolti: file.length, account_anonimizzato: data?.account_anonimizzato });
}
