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
      <div className="intestazione">
        <div className="occhiello">Palinsesto</div>
        <h1>Corsi</h1>
        <p>Ogni corso con i suoi orari, gli iscritti e le prove in arrivo.</p>
      </div>
      <p><Link className="btn btn-primario" href="/gestione/corsi/nuovo">Nuovo corso</Link></p>
      {error && <div className="errore">Impossibile caricare i corsi.</div>}
      {corsi?.length === 0 && <div className="vuoto">Nessun corso attivo.</div>}

      {categorie.map((cat) => (
        <section key={cat}>
          <h2 style={{ marginTop: 24 }}>{cat}</h2>
          {corsi.filter((c) => (c.categoria || 'Senza categoria') === cat).map((c) => (
            <Link key={c.corso_id} className="scheda-corso" href={`/gestione/corsi/${c.corso_id}`}>
              <span className="banda" style={{ background: c.colore || 'var(--rosso)' }} />
              <span className="centro" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {c.foto_url
                  ? <img src={c.foto_url} alt="" className="miniatura" />
                  : <span className="miniatura segnaposto">{c.corso_nome.slice(0, 2).toUpperCase()}</span>}
                <span style={{ minWidth: 0 }}>
                  <span className="titolo" style={{ display: 'block' }}>{c.corso_nome}</span>
                  <span className="riga">{[c.fascia, c.livello].filter(Boolean).join(' · ')}</span>
                </span>
              </span>
              <span className="destra" style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                <span className="tag tag-neutro">{c.iscritti_attivi} iscritti</span>
                {c.prove_in_arrivo > 0 && <span className="tag tag-rosso">{c.prove_in_arrivo} prove</span>}
                {c.certificati_da_sistemare > 0 && <span className="tag tag-attenzione">{c.certificati_da_sistemare} cert.</span>}
              </span>
            </Link>
          ))}
        </section>
      ))}
    </>
  );
}
