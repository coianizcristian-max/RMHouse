import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { STATI_CLIENTE } from '@/lib/stati';
import { CAMPANELLI, applicaFiltri } from '@/lib/filtriPersone';
import ElencoPersone from './ElencoPersone';

export const dynamic = 'force-dynamic';

const PER_PAGINA = 60;

// Anagrafiche: ricerca, filtri per stato e campanelli, selezione multipla ed export
export default async function Persone({ searchParams }) {
  const filtri = await searchParams;
  const { q = '', stato = '', campanello = '', etichetta = '', pagina = '1' } = filtri;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const n = Math.max(1, parseInt(pagina, 10) || 1);

  const query = applicaFiltri(
    supabase.from('v_stato_clienti')
      .select('id, nome, cognome, data_nascita, foto_url, is_titolare, titolare_nome, titolare_cognome, email, telefono, attivo, fine_prossima, ultima_fine, certificato_scadenza, stato, certificato_scaduto, quota_mancante, senza_orari, etichette, etichette_id, giorni_al_compleanno', { count: 'exact' })
      .eq('palestra_id', p),
    { q, stato, campanello, etichetta },
  );

  const [{ data: persone, count }, { data: conti }, { data: etichette }] = await Promise.all([
    query.order('cognome').order('nome').range((n - 1) * PER_PAGINA, n * PER_PAGINA - 1),
    supabase.rpc('conteggi_persone', { p_palestra: p }),
    supabase.from('etichette').select('id, nome, colore').eq('palestra_id', p).order('nome'),
  ]);

  const link = (cambi) => {
    const u = new URLSearchParams(Object.entries({ q, stato, campanello, etichetta, ...cambi }).filter(([, v]) => v));
    return `/gestione/persone${u.toString() ? `?${u}` : ''}`;
  };
  const statiVisibili = Object.entries(STATI_CLIENTE).filter(([s]) => conti?.stati?.[s] > 0)
    .sort((a, b) => a[1].ordine - b[1].ordine);
  const esporta = `/api/esporta/persone?${new URLSearchParams(Object.entries({ q, stato, campanello, etichetta }).filter(([, v]) => v))}`;

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Anagrafiche</h1>
        <p>Cerca, filtra per stato, seleziona più persone per etichettarle, scrivere o esportare.</p>
      </div>

      <form className="barra-cerca" action="/gestione/persone">
        {stato && <input type="hidden" name="stato" value={stato} />}
        {campanello && <input type="hidden" name="campanello" value={campanello} />}
        {etichetta && <input type="hidden" name="etichetta" value={etichetta} />}
        <input type="search" name="q" defaultValue={q} placeholder="Nome, cognome, email, telefono o codice fiscale" />
        <button className="btn">Cerca</button>
      </form>

      <div className="pastiglie">
        <Link className="stato-pillola" aria-current={!stato ? 'true' : undefined} href={link({ stato: '', pagina: '' })}>
          Tutti <strong>{conti?.tutti ?? ''}</strong>
        </Link>
        <Link className="stato-pillola ok" aria-current={stato === 'attivi' ? 'true' : undefined} href={link({ stato: 'attivi', pagina: '' })}>
          Iscritti attivi <strong>{conti?.attivi ?? ''}</strong>
        </Link>
        <Link className="stato-pillola" aria-current={stato === 'nuovi' ? 'true' : undefined} href={link({ stato: 'nuovi', pagina: '' })}>
          Nuovi nel mese <strong>{conti?.nuovi ?? ''}</strong>
        </Link>
        {statiVisibili.map(([s, v]) => (
          <Link key={s} className={`stato-pillola ${v.tono}`} aria-current={stato === s ? 'true' : undefined} href={link({ stato: s, pagina: '' })}>
            {v.testo} <strong>{conti.stati[s]}</strong>
          </Link>
        ))}
      </div>

      <div className="pastiglie">
        {Object.entries(CAMPANELLI).filter(([c]) => conti?.[c] > 0).map(([c, testo]) => (
          <Link key={c} className="stato-pillola attenzione" aria-current={campanello === c ? 'true' : undefined}
                href={link({ campanello: campanello === c ? '' : c, pagina: '' })}>
            {testo} <strong>{conti[c]}</strong>
          </Link>
        ))}
        {etichette?.map((e) => (
          <Link key={e.id} className="stato-pillola eti" aria-current={etichetta === e.id ? 'true' : undefined}
                href={link({ etichetta: etichetta === e.id ? '' : e.id, pagina: '' })}>
            # {e.nome} <strong>{conti?.etichette?.[e.id] ?? 0}</strong>
          </Link>
        ))}
      </div>

      <ElencoPersone palestraId={p} persone={persone || []} etichette={etichette || []} totale={count || 0} esporta={esporta} />

      {count > PER_PAGINA && (
        <div className="azioni" style={{ marginTop: 16, alignItems: 'center' }}>
          {n > 1 && <Link className="btn" href={link({ pagina: String(n - 1) })}>‹ Precedenti</Link>}
          <span className="piccolo muto">
            {(n - 1) * PER_PAGINA + 1}–{Math.min(n * PER_PAGINA, count)} di {count}
          </span>
          {n * PER_PAGINA < count && <Link className="btn" href={link({ pagina: String(n + 1) })}>Successive ›</Link>}
        </div>
      )}
    </>
  );
}
