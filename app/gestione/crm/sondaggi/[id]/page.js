import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { dataBreve } from '@/lib/formato';

export const dynamic = 'force-dynamic';

function Barre({ distribuzione, ordine, totale }) {
  return (
    <div className="barre-orizz">
      {ordine.map((k) => {
        const n = distribuzione?.[k] || 0;
        return (
          <div key={k} className="bo-riga">
            <span className="bo-etichetta">{k}</span>
            <span className="bo-barra"><span style={{ width: `${totale ? (n / totale) * 100 : 0}%` }} /></span>
            <span className="bo-num">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

export default async function Risultati({ params }) {
  const { id } = await params;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const [{ data: s }, { data: r }] = await Promise.all([
    supabase.from('sondaggi').select('titolo, intro, anonimo, created_at').eq('id', id).maybeSingle(),
    supabase.rpc('risultati_sondaggio', { p_sondaggio: id }),
  ]);
  if (!s || !r) notFound();
  const perc = r.inviti ? Math.round((r.risposte / r.inviti) * 100) : 0;

  return (
    <>
      <div className="intestazione">
        <div className="occhiello"><Link href="/gestione/crm/sondaggi">Sondaggi</Link></div>
        <h1>{s.titolo}</h1>
        <p>{r.risposte} risposte su {r.inviti} inviti ({perc}%) · creato il {dataBreve(s.created_at)}{s.anonimo ? ' · anonimo' : ''}</p>
      </div>
      <div className="risultati">
        {r.domande.map((d) => {
          const x = d.risultato || {};
          return (
            <section key={d.id} className="pannello">
              <h2>{d.testo}</h2>
              {!x.risposte ? <div className="vuoto">Nessuna risposta ancora.</div> : d.tipo === 'stelle' ? (
                <>
                  <div className="cifra-grande">{String(x.media).replace('.', ',')} <span className="piccolo muto">su 5 · {x.risposte} risposte</span></div>
                  <Barre distribuzione={x.distribuzione} ordine={['5', '4', '3', '2', '1']} totale={x.risposte} />
                </>
              ) : d.tipo === 'nps' ? (
                <>
                  <div className="cifra-grande">{x.nps > 0 ? `+${x.nps}` : x.nps} <span className="piccolo muto">NPS · media {String(x.media).replace('.', ',')} · {x.risposte} risposte</span></div>
                  <p className="piccolo muto">Chi dà 9-10 vi consiglia, chi dà 0-6 no: l'NPS è la differenza in percentuale. Sopra zero è buono, sopra +50 ottimo.</p>
                  <Barre distribuzione={x.distribuzione} ordine={['10', '9', '8', '7', '6', '5', '4', '3', '2', '1', '0']} totale={x.risposte} />
                </>
              ) : d.tipo === 'scelta' ? (
                <Barre distribuzione={x.distribuzione} ordine={d.opzioni} totale={x.risposte} />
              ) : (
                <ul className="mini-lista">
                  {(x.testi || []).map((t, i) => (
                    <li key={i}><span className="ml-riga"><span className="ml-testo">
                      <span style={{ whiteSpace: 'pre-line' }}>{t.testo}</span>
                      <span className="piccolo muto">{[t.chi, dataBreve(t.quando)].filter(Boolean).join(' · ')}</span>
                    </span></span></li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
