import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';

export const dynamic = 'force-dynamic';

// "Chi è iscritto a danza aerea?" — elenco corsi con i numeri che servono alla segreteria
export default async function Corsi() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');

  const { data: corsi, error } = await supabase
    .from('v_riepilogo_corsi')
    .select('*')
    .eq('palestra_id', staff.palestra_id)
    .eq('attivo', true)
    .order('categoria')
    .order('corso_nome');

  const categorie = [...new Set((corsi || []).map((c) => c.categoria || 'Senza categoria'))];

  return (
    <>
      <h1>Corsi</h1>
      <p><Link className="btn" href="/gestione/corsi/nuovo">Nuovo corso</Link></p>
      {error && <div className="errore">Impossibile caricare i corsi.</div>}
      {corsi?.length === 0 && <div className="vuoto">Nessun corso attivo.</div>}

      {categorie.map((cat) => (
        <section key={cat}>
          <h2 style={{ marginTop: 24 }}>{cat}</h2>
          <ul className="elenco">
            {corsi.filter((c) => (c.categoria || 'Senza categoria') === cat).map((c) => (
              <li key={c.corso_id}>
                <Link className="voce" href={`/gestione/corsi/${c.corso_id}`}>
                  <span />
                  <span>
                    <strong style={{ color: 'var(--nero)' }}>{c.corso_nome}</strong>
                    <span className="piccolo muto" style={{ display: 'block' }}>
                      {[c.fascia, c.livello].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                    <span className="tag tag-neutro">{c.iscritti_attivi} iscritti</span>
                    {c.prove_in_arrivo > 0 && <span className="tag tag-rosso">{c.prove_in_arrivo} prove</span>}
                    {c.certificati_da_sistemare > 0 && <span className="tag tag-attenzione">{c.certificati_da_sistemare} certificati</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
