import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { dataBreve, ora } from '@/lib/formato';
import Attese from './Attese';

export const dynamic = 'force-dynamic';

export default async function PaginaAttese({ searchParams }) {
  const { stato = 'in_attesa' } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');

  const { data: righe } = await supabase
    .from('liste_attesa')
    .select('id, tipo, stato, created_at, avvisato_at, corsi ( nome ), lezioni ( inizio ), allievi ( id, nome, cognome ), account ( email, telefono )')
    .eq('palestra_id', staff.palestra_id)
    .eq('stato', stato)
    .order('created_at')
    .limit(200);

  const filtri = [['in_attesa', 'In attesa'], ['avvisato', 'Avvisati'], ['chiuso', 'Chiusi']];

  return (
    <>
      <h1>Liste d'attesa</h1>
      <p className="muto piccolo">
        Quando si libera un posto in una lezione, il primo della coda riceve l'email in automatico.
      </p>
      <div className="filtri">
        {filtri.map(([k, l]) => (
          <Link key={k} href={`/gestione/attese?stato=${k}`} aria-current={k === stato ? 'true' : undefined}>{l}</Link>
        ))}
      </div>
      {righe?.length === 0 && <div className="vuoto">Nessuno in questo elenco.</div>}
      <ul className="elenco">
        {righe?.map((r) => (
          <li key={r.id} className="persona" style={{ alignItems: 'start' }}>
            <div>
              <Link className="persona-nome" href={`/gestione/persone/${r.allievi?.id}`}>
                {r.allievi?.cognome} {r.allievi?.nome}
              </Link>
              <div className="piccolo muto">
                {r.corsi?.nome}
                {r.lezioni && ` · lezione del ${dataBreve(r.lezioni.inizio)} alle ${ora(r.lezioni.inizio)}`}
                {' · '}in coda dal {dataBreve(r.created_at)}
              </div>
              <div className="piccolo muto">{r.account?.telefono} · {r.account?.email}</div>
            </div>
            <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
              <span className="tag tag-neutro">{r.tipo}</span>
              <Attese id={r.id} stato={r.stato} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
