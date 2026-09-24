import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { STATI_LEAD, etaAl } from '@/lib/formato';

export const dynamic = 'force-dynamic';

// Ricerca di allievi e famiglie per nome, email o telefono
export default async function Persone({ searchParams }) {
  const { q = '', stato = '' } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');

  let query = supabase.from('v_persone').select('*').eq('palestra_id', staff.palestra_id);
  if (q.trim()) query = query.ilike('ricerca', `%${q.trim().toLowerCase()}%`);
  if (stato) query = query.eq('stato_lead', stato);
  const { data: persone } = await query.order('cognome').limit(100);

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Anagrafiche</h1>
        <p>Cerca per nome, email o telefono. Nella scheda: iscrizioni, recuperi, certificati.</p>
      </div>
      <form className="filtri" style={{ alignItems: 'end' }}>
        <div className="campo" style={{ margin: 0, flex: 1, minWidth: 200 }}>
          <label htmlFor="q">Cerca</label>
          <input id="q" name="q" defaultValue={q} placeholder="Nome, cognome, email o telefono" />
        </div>
        <button className="btn">Cerca</button>
      </form>
      <div className="filtri">
        <Link href="/gestione/persone" aria-current={!stato ? 'true' : undefined}>Tutti</Link>
        <Link href="/gestione/persone?stato=iscritto" aria-current={stato === 'iscritto' ? 'true' : undefined}>Iscritti</Link>
        <Link href="/gestione/persone?stato=prova_effettuata" aria-current={stato === 'prova_effettuata' ? 'true' : undefined}>Prova fatta</Link>
      </div>

      {persone?.length === 0 && <div className="vuoto">Nessuna persona trovata.</div>}
      <ul className="elenco">
        {persone?.map((p) => (
          <li key={p.id} className="persona" style={{ alignItems: 'start' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {p.foto_url
                ? <img src={p.foto_url} alt="" className="miniatura" />
                : <span className="miniatura segnaposto">{(p.nome[0] || '') + (p.cognome[0] || '')}</span>}
              <div style={{ minWidth: 0 }}>
              <Link className="persona-nome" href={`/gestione/persone/${p.id}`}>{p.cognome} {p.nome}</Link>
              <span className="piccolo muto"> · {etaAl(p.data_nascita)} anni</span>
              <div className="piccolo muto">
                {!p.is_titolare && <>{p.titolare_nome} {p.titolare_cognome} · </>}
                {p.telefono} · {p.email}
              </div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
              <span className={`tag ${p.stato_lead === 'iscritto' ? 'tag-ok' : 'tag-tenue'}`}>{STATI_LEAD[p.stato_lead]}</span>
              {p.certificato_da_sistemare && p.iscrizioni_attive > 0 && <span className="tag tag-rosso">Certificato</span>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
