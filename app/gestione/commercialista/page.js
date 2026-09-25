import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { euro, oggiISO } from '@/lib/formato';
import Regole from './Regole';

export const dynamic = 'force-dynamic';

const ISO = (d) => d.toISOString().slice(0, 10);
function periodi() {
  const o = new Date(oggiISO() + 'T12:00:00Z');
  const a = o.getUTCFullYear(), m = o.getUTCMonth();
  const trim = Math.floor(m / 3);
  return [
    ['Questo mese', ISO(new Date(Date.UTC(a, m, 1))), ISO(new Date(Date.UTC(a, m + 1, 0)))],
    ['Mese scorso', ISO(new Date(Date.UTC(a, m - 1, 1))), ISO(new Date(Date.UTC(a, m, 0)))],
    ['Trimestre in corso', ISO(new Date(Date.UTC(a, trim * 3, 1))), ISO(new Date(Date.UTC(a, trim * 3 + 3, 0)))],
    ['Trimestre scorso', ISO(new Date(Date.UTC(a, trim * 3 - 3, 1))), ISO(new Date(Date.UTC(a, trim * 3, 0)))],
    ['Anno in corso', `${a}-01-01`, `${a}-12-31`],
    ['Anno scorso', `${a - 1}-01-01`, `${a - 1}-12-31`],
  ];
}

// Tutto quello che serve al commercialista: estrazioni, aliquote, numerazioni, detrazioni
export default async function PerIlCommercialista({ searchParams }) {
  const { dal, al, anno } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const scelte = periodi();
  const da = /^\d{4}-\d{2}-\d{2}$/.test(dal || '') ? dal : scelte[1][1];
  const a = /^\d{4}-\d{2}-\d{2}$/.test(al || '') ? al : scelte[1][2];
  const annoDetrazioni = parseInt(anno, 10) || new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0);

  const [{ data: r }, { data: aliquote }, { data: numerazioni }, { data: ragazzi }] = await Promise.all([
    supabase.rpc('riepilogo_fiscale', { p_palestra: p, p_dal: da, p_al: a }),
    supabase.from('aliquote_iva').select('*').eq('palestra_id', p).order('ordine').order('nome'),
    supabase.from('numerazioni').select('*').eq('palestra_id', p).order('codice'),
    supabase.rpc('versamenti_ragazzi', { p_palestra: p, p_anno: annoDetrazioni, p_storico: true }),
  ]);
  const scarica = (file) => `/api/commercialista?dal=${da}&al=${a}&file=${file}`;
  const senzaCf = (ragazzi || []).filter((x) => !x.codice_fiscale || !x.pagante_cf).length;

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Conti</div>
        <h1>Per il commercialista</h1>
        <p>Scegli il periodo, controlla i numeri e scarica tutto in un file. Qui si decidono anche aliquote e numerazioni.</p>
      </div>

      <div className="pastiglie">
        {scelte.map(([t, d1, d2]) => (
          <Link key={t} className="stato-pillola" aria-current={d1 === da && d2 === a ? 'true' : undefined}
                href={`/gestione/commercialista?dal=${d1}&al=${d2}`}>{t}</Link>
        ))}
      </div>
      <form className="barra-cerca" action="/gestione/commercialista">
        <label className="piccolo muto" htmlFor="dal">Dal</label>
        <input id="dal" type="date" name="dal" defaultValue={da} style={{ flex: '0 1 180px', minWidth: 150 }} />
        <label className="piccolo muto" htmlFor="al">al</label>
        <input id="al" type="date" name="al" defaultValue={a} style={{ flex: '0 1 180px', minWidth: 150 }} />
        <button className="btn btn-piccolo">Mostra</button>
      </form>

      <div className="kpi">
        <div className="tessera tessera-rossa"><div className="etichetta">Incassato</div><div className="cifra">{euro(r?.incassato_cent || 0)}</div>
          <div className="sotto">tutti i pagamenti del periodo</div></div>
        <div className="tessera"><div className="etichetta">Documenti emessi</div><div className="cifra">{euro(r?.documenti_cent || 0)}</div>
          <div className="sotto">{r?.ricevute || 0} ricevute · {r?.note_credito || 0} note di credito</div></div>
        <Link className={`tessera${r?.senza_ricevuta ? ' tessera-nera' : ''}`} href={`/gestione/ricevute?dal=${da}&al=${a}`}>
          <div className="etichetta">Incassi senza ricevuta</div><div className="cifra">{r?.senza_ricevuta || 0}</div>
          <div className="sotto">{r?.senza_ricevuta ? 'da emettere prima di mandare' : 'tutto in ordine'}</div></Link>
        <div className="tessera"><div className="etichetta">Acquisti</div><div className="cifra">{euro(r?.acquisti_cent || 0)}</div>
          <div className="sotto">IVA {euro(r?.iva_acquisti_cent || 0)}</div></div>
        <div className="tessera"><div className="etichetta">Compensi insegnanti</div><div className="cifra">{euro(r?.compensi_cent || 0)}</div>
          <div className="sotto">mesi del periodo</div></div>
        <a className="tessera tessera-nera" href={scarica('tutto')}>
          <div className="etichetta">Scarica tutto</div><div className="cifra">ZIP</div>
          <div className="sotto">5 file + riepilogo</div></a>
      </div>

      <div className="scheda-due">
        <div>
          <section className="pannello">
            <h2>Per aliquota</h2>
            {(r?.per_aliquota || []).length === 0 ? <div className="vuoto">Nessun documento nel periodo.</div> : (
              <div className="tabella-scorre">
                <table>
                  <thead><tr><th>Aliquota</th><th>Natura</th><th>Imponibile</th><th>IVA</th><th>Totale</th></tr></thead>
                  <tbody>
                    {r.per_aliquota.map((x) => (
                      <tr key={x.aliquota + x.natura}><td>{x.aliquota}</td><td>{x.natura || '—'}</td>
                        <td>{euro(x.imponibile_cent)}</td><td>{euro(x.iva_cent)}</td><td><strong>{euro(x.totale_cent)}</strong></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="pannello">
            <h2>I file, uno per uno</h2>
            <ul className="mini-lista">
              {[
                ['documenti', 'Registro dei documenti', 'Ricevute e note di credito con numero, sezionale, intestatario, imponibile, IVA e natura.'],
                ['corrispettivi', 'Corrispettivi giornalieri', 'Per ogni giorno e aliquota: totali, contanti ed elettronici.'],
                ['acquisti', 'Registro acquisti', 'Le fatture dei fornitori caricate in Fatture.'],
                ['incassi', 'Incassi', 'Tutti i pagamenti, anche senza ricevuta.'],
                ['compensi', 'Compensi insegnanti', 'Mese per mese, con ore, tariffa ed extra.'],
              ].map(([k, t, d]) => (
                <li key={k}>
                  <a href={scarica(k)}>
                    <span className="ml-testo"><strong>{t}</strong><span className="piccolo muto">{d}</span></span>
                    <span className="piccolo">CSV ↓</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section className="pannello">
            <div className="pannello-testa">
              <h2>Detrazione sport dei ragazzi {annoDetrazioni}</h2>
              <div className="pastiglie" style={{ margin: 0 }}>
                {[annoDetrazioni - 1, annoDetrazioni, annoDetrazioni + 1].filter((x) => x <= new Date().getFullYear()).map((x) => (
                  <Link key={x} className="stato-pillola" aria-current={x === annoDetrazioni ? 'true' : undefined}
                        href={`/gestione/commercialista?dal=${da}&al=${a}&anno=${x}`}>{x}</Link>
                ))}
              </div>
            </div>
            <p className="piccolo muto" style={{ marginTop: -4 }}>
              Ragazzi dai 5 ai 18 anni con quanto versato nell'anno, per la detrazione del 730. Comprende gli abbonamenti
              venduti con APP Palestre. Controlla con il commercialista il testo e i limiti prima di consegnarli.
            </p>
            <div className="azioni" style={{ marginBottom: 10 }}>
              <Link className="btn btn-piccolo btn-primario" href={`/gestione/commercialista/attestati?anno=${annoDetrazioni}`} target="_blank">
                Stampa tutti gli attestati ({ragazzi?.length || 0})
              </Link>
              {senzaCf > 0 && <span className="piccolo" style={{ color: 'var(--attenzione)' }}>{senzaCf} senza codice fiscale del ragazzo o di chi paga</span>}
            </div>
            <ul className="mini-lista">
              {(ragazzi || []).slice(0, 12).map((x) => (
                <li key={x.allievo_id}>
                  <Link href={`/gestione/commercialista/attestati?anno=${annoDetrazioni}&id=${x.allievo_id}`} target="_blank">
                    <span className="ml-testo">
                      <strong>{x.cognome} {x.nome}</strong>
                      <span className="piccolo muto">paga {x.pagante}{!x.codice_fiscale || !x.pagante_cf ? ' · manca un codice fiscale' : ''}</span>
                    </span>
                    <span className="piccolo">{euro(x.totale_cent)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {(ragazzi?.length || 0) > 12 && <p className="piccolo muto">…e altri {ragazzi.length - 12}: sono tutti nella stampa.</p>}
          </section>
        </div>

        <aside>
          <Regole palestraId={p} aliquote={aliquote || []} numerazioni={numerazioni || []} />
        </aside>
      </div>
    </>
  );
}
