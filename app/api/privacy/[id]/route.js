import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { creaZip } from '@/lib/zip';
import { raccogliDati } from '@/lib/datiPersona';

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
  const server = await supabaseServer();
  const staff = await staffDi(server);
  let supabase = server;
  if (!staff || staff.ruolo === 'insegnante') {
    // il cliente può scaricare i dati suoi e dei figli che segue dall'area clienti
    const { data: { user } } = await server.auth.getUser();
    if (!user) return new Response('Non autorizzato.', { status: 403 });
    const { data: mio } = await supabaseAdmin().from('allievi').select('id, account!inner ( user_id )')
      .eq('id', id).eq('account.user_id', user.id).maybeSingle();
    if (!mio) return new Response('Non autorizzato.', { status: 403 });
    supabase = supabaseAdmin();
  }

  const raccolti = await raccogliDati(supabase, id);
  if (!raccolti) return new Response('Persona non trovata.', { status: 404 });
  const { allievo, dati } = raccolti;
  const n = (k) => dati[k]?.length || 0;
  const leggimi = [
    `Dati personali di ${allievo.nome} ${allievo.cognome}, estratti il ${new Date().toLocaleDateString('it-IT')}.`,
    '',
    'Il file dati.json contiene tutto quello che la scuola conserva su questa persona e su chi paga:',
    'anagrafica, iscrizioni, pagamenti, ricevute, presenze, prove, certificati (solo i dati, non le immagini),',
    'quote annuali, storico degli abbonamenti, rate, messaggi inviati e moduli firmati (con le scelte fatte).',
    '',
    `Iscrizioni: ${n('iscrizioni')} · Pagamenti: ${n('pagamenti')} · Ricevute e fatture: ${n('ricevute')} · Presenze: ${n('presenze')} · Moduli firmati: ${n('moduli_firmati')}`,
    '',
    'Il formato JSON è quello richiesto per la "portabilità" dei dati (si apre con qualsiasi programma).',
    'Per leggerli comodamente usa "Vedi" in I miei dati, nell\'app: si possono anche salvare in PDF.',
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
