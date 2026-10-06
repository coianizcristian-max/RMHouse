import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import DaSistemare from './DaSistemare';

export const dynamic = 'force-dynamic';

// tutte le righe di una tabella (PostgREST ne dà al massimo 1000 per volta)
async function tutte(crea) {
  let righe = [];
  for (let da = 0; ; da += 1000) {
    const { data, error } = await crea().range(da, da + 999);
    if (error || !data) break;
    righe = righe.concat(data);
    if (data.length < 1000) break;
  }
  return righe;
}

// "Da sistemare": quello che non torna dopo l'import da APP Palestre, con cosa fare
export default async function PaginaDaSistemare() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

  const [anomalie, { data: ultima }, senzaTipo, { data: tipi }, { data: alias }] = await Promise.all([
    tutte(() => supabase.from('anomalie_import')
      .select('id, categoria, gravita, titolo, dettaglio, link, risolta, risolta_at, nota, chiusa_sola, allievo_id, aggiornata_at, allievi ( nome, cognome )')
      .eq('palestra_id', p).order('categoria').order('titolo').order('id')),
    supabase.from('importazioni').select('id, iniziata_at, finita_at, ricalcolata_at, riepilogo')
      .eq('palestra_id', p).order('iniziata_at', { ascending: false }).limit(1),
    tutte(() => supabase.from('storico_abbonamenti').select('abbonamento, allievo_id')
      .eq('palestra_id', p).eq('fonte', 'app_palestre').is('tipo_abbonamento_id', null).eq('stato', 'attivo').gte('al', oggi).order('id')),
    supabase.from('tipi_abbonamento').select('id, nome').eq('palestra_id', p).eq('archiviato', false).order('nome'),
    supabase.from('abbonamenti_alias').select('nome, origine, tipo_abbonamento_id, tipi_abbonamento ( nome )').eq('palestra_id', p).order('nome'),
  ]);

  // abbonamenti di APP Palestre in corso che non corrispondono a niente del listino
  const perNome = new Map();
  for (const r of senzaTipo) {
    const k = r.abbonamento.trim();
    if (!perNome.has(k)) perNome.set(k, new Set());
    perNome.get(k).add(r.allievo_id);
  }
  // un suggerimento: a cosa era abbinato lo stesso nome negli abbonamenti più vecchi (anche se ora è archiviato)
  const nomi = [...perNome.keys()];
  const { data: prima } = nomi.length
    ? await supabase.from('storico_abbonamenti').select('abbonamento, tipi_abbonamento ( nome, archiviato )')
        .eq('palestra_id', p).in('abbonamento', nomi).not('tipo_abbonamento_id', 'is', null).limit(500)
    : { data: [] };
  const daAbbinare = nomi.map((nome) => {
    const t = (prima || []).find((x) => x.abbonamento.trim() === nome)?.tipi_abbonamento;
    return { nome, persone: perNome.get(nome).size, prima: t ? `${t.nome}${t.archiviato ? ' (archiviato)' : ''}` : null };
  }).sort((a, b) => b.persone - a.persone || a.nome.localeCompare(b.nome));

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Da sistemare</h1>
        <p>Quello che non torna dopo l'import da APP Palestre: per ogni cosa c'è scritto cosa manca o è sbagliato e come sistemarlo.</p>
      </div>
      <DaSistemare palestraId={p} anomalie={anomalie} ultima={ultima?.[0] || null}
                   daAbbinare={daAbbinare} tipi={tipi || []} alias={alias || []} />
    </>
  );
}
