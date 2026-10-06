import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import OrariCorsi from './OrariCorsi';

export const dynamic = 'force-dynamic';

// Tutti i giorni e gli orari di tutti i corsi in una tabella: per controllare il palinsesto a colpo d'occhio
export default async function PaginaOrariCorsi() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const [{ data: corsi }, { data: orari }, { data: sale }, { data: persone }] = await Promise.all([
    supabase.from('corsi').select('id, nome, colore, attivo, iscrizioni_app, discipline ( nome )').eq('palestra_id', p).eq('attivo', true).order('nome'),
    supabase.from('orari').select('id, corso_id, giorno_settimana, ora_inizio, durata_min, sala_id, insegnante_id, valido_dal, valido_al, prenotabile, attivo')
      .eq('palestra_id', p).order('ora_inizio'),
    supabase.from('sale').select('id, nome').eq('palestra_id', p).order('nome'),
    supabase.from('staff').select('id, nome, cognome, attivo, archiviato').eq('palestra_id', p).order('nome'),
  ]);
  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Struttura</div>
        <h1>Orari dei corsi</h1>
        <p>Ogni corso con i suoi giorni della settimana. Tocca un orario per cambiarlo, &quot;+&quot; per aggiungere un giorno.</p>
      </div>
      <OrariCorsi corsi={(corsi || []).map((c) => ({ id: c.id, nome: c.nome, colore: c.colore, iscrizioni_app: c.iscrizioni_app || 'aperte', disciplina: c.discipline?.nome || '' }))}
        orari={orari || []} palestraId={p} sale={sale || []}
        persone={(persone || []).map((s) => ({ id: s.id, nome: `${s.nome} ${s.cognome || ''}`.trim(), breve: s.nome, attivo: s.attivo !== false && !s.archiviato }))} />
    </>
  );
}
