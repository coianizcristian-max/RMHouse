import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { STATI_CLIENTE } from '@/lib/stati';
import { genere } from '@/lib/genere';
import { CAMPANELLI, CONSENSI, applicaFiltri } from '@/lib/filtriPersone';
import { filtroPrioritari, livelloRicerca } from '@/lib/ricerca';
import ElencoPersone from './ElencoPersone';
import FiltriPersone from './FiltriPersone';

export const dynamic = 'force-dynamic';

const PER_PAGINA = 60;

// Anagrafiche: ricerca, filtri per stato e campanelli, selezione multipla ed export
export default async function Persone({ searchParams }) {
  const filtri = await searchParams;
  const { q = '', stato = '', campanello = '', etichetta = '', consenso = '', pagina = '1' } = filtri;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const n = Math.max(1, parseInt(pagina, 10) || 1);

  const COLONNE = 'id, nome, cognome, data_nascita, foto_url, is_titolare, titolare_nome, titolare_cognome, email, telefono, attivo, fine_prossima, ultima_fine, certificato_scadenza, stato, certificato_scaduto, quota_mancante, senza_orari, etichette, etichette_id, giorni_al_compleanno, consenso_whatsapp, consenso_immagini, consenso_marketing';
  const query = applicaFiltri(
    supabase.from('v_stato_clienti').select(COLONNE, { count: 'exact' }).eq('palestra_id', p),
    { q, stato, campanello, etichetta, consenso },
  );
  // in prima pagina, sopra a tutti, chi ha quelle iniziali o nome/cognome che comincia così ("cc" → Cristian Coianiz)
  const pr = n === 1 && q.trim() ? filtroPrioritari(q) : null;

  const [{ data: elenco, count }, { data: conti }, { data: etichette }, { data: primi }] = await Promise.all([
    query.order('cognome').order('nome').range((n - 1) * PER_PAGINA, n * PER_PAGINA - 1),
    supabase.rpc('conteggi_persone', { p_palestra: p }),
    supabase.from('etichette').select('id, nome, colore').eq('palestra_id', p).order('nome'),
    pr ? applicaFiltri(supabase.from('v_stato_clienti').select(COLONNE).eq('palestra_id', p), { q: '', stato, campanello, etichetta, consenso })
      .or(pr).order('cognome').order('nome').limit(PER_PAGINA) : Promise.resolve({ data: [] }),
  ]);
  const visti = new Set();
  const persone = [...(primi || []).sort((x, y) => livelloRicerca(x, q) - livelloRicerca(y, q)), ...(elenco || [])]
    .filter((x) => (visti.has(x.id) ? false : visti.add(x.id)));

  // maschile o femminile per lo stato di ogni riga ("Persa", "Iscritta"…): sesso o codice fiscale
  const ids = (persone || []).map((x) => x.id);
  const { data: generi } = ids.length
    ? await supabase.from('allievi').select('id, sesso, codice_fiscale').in('id', ids)
    : { data: [] };
  const gDi = Object.fromEntries((generi || []).map((x) => [x.id, genere(x)]));
  const personeG = (persone || []).map((x) => ({ ...x, genere: gDi[x.id] || null }));

  const link = (cambi) => {
    const u = new URLSearchParams(Object.entries({ q, stato, campanello, etichetta, consenso, ...cambi }).filter(([, v]) => v));
    return `/gestione/persone${u.toString() ? `?${u}` : ''}`;
  };
  const statiVisibili = Object.entries(STATI_CLIENTE).filter(([s]) => conti?.stati?.[s] > 0)
    .sort((a, b) => a[1].ordine - b[1].ordine);
  const esporta = `/api/esporta/persone?${new URLSearchParams(Object.entries({ q, stato, campanello, etichetta, consenso }).filter(([, v]) => v))}`;

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Anagrafiche</h1>
        <p>Cerca, filtra per stato, seleziona più persone per etichettarle, scrivere o esportare.</p>
      </div>

      <FiltriPersone
        valori={{ q, stato, campanello, etichetta, consenso }}
        stati={[['', 'Tutti', conti?.tutti], ['attivi', 'Iscritti attivi', conti?.attivi], ['nuovi', 'Nuovi nel mese', conti?.nuovi],
                ...statiVisibili.map(([s, v]) => [s, v.testo, conti.stati[s]])]}
        campanelli={Object.entries(CAMPANELLI).filter(([c]) => conti?.[c] > 0).map(([c, testo]) => [c, testo, conti[c]])}
        etichette={(etichette || []).map((e) => [e.id, e.nome, conti?.etichette?.[e.id] ?? 0])}
        consensi={Object.entries(CONSENSI).map(([k, [, , testo]]) => [k, testo])}
      />

      <div className="pastiglie scorciatoie">
        {[['attivi', 'Iscritti attivi', conti?.attivi, 'ok'], ['in_scadenza', 'In scadenza', conti?.stati?.in_scadenza, 'attenzione'],
          ['no_rinnovo', 'Non hanno rinnovato', conti?.stati?.no_rinnovo, 'rosso'], ['nuovi', 'Nuovi nel mese', conti?.nuovi, '']]
          .filter(([, , n]) => n > 0).map(([k, testo, n, tono]) => (
            <Link prefetch={false} key={k} className={`stato-pillola ${tono}`} aria-current={stato === k ? 'true' : undefined} href={link({ stato: stato === k ? '' : k, pagina: '' })}>
              {testo} <strong>{n}</strong>
            </Link>
          ))}
      </div>

      <ElencoPersone palestraId={p} persone={personeG} etichette={etichette || []} totale={count || 0} esporta={esporta} consensi={!!consenso} />

      {count > PER_PAGINA && (
        <div className="azioni" style={{ marginTop: 16, alignItems: 'center' }}>
          {n > 1 && <Link prefetch={false} className="btn" href={link({ pagina: String(n - 1) })}>‹ Precedenti</Link>}
          <span className="piccolo muto">
            {(n - 1) * PER_PAGINA + 1}–{Math.min(n * PER_PAGINA, count)} di {count}
          </span>
          {n * PER_PAGINA < count && <Link prefetch={false} className="btn" href={link({ pagina: String(n + 1) })}>Successive ›</Link>}
        </div>
      )}
    </>
  );
}
