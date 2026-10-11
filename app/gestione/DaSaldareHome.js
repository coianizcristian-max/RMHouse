'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { euro, ora, dataBreve } from '@/lib/formato';
import DaSaldare from './DaSaldare';

const giorniTesto = (g) => (g <= 0 ? 'da oggi' : g === 1 ? 'da ieri' : `da ${g} giorni`);

// Home: chi frequenta ma non ha ancora pagato (query 152). Si filtra per nome o corso, "solo chi viene oggi",
// e si incassa direttamente da qui (metodo + ricevuta).
export default function DaSaldareHome({ palestraId, righe }) {
  const router = useRouter();
  const [cerca, setCerca] = useState('');
  const [soloOggi, setSoloOggi] = useState(false);
  const [aperto, setAperto] = useState(null);
  const [saldati, setSaldati] = useState([]);
  const [ultimo, setUltimo] = useState('');   // incassati adesso: spariscono subito, senza aspettare la pagina
  const conOggi = righe.filter((r) => r.oggi?.length).length;
  const totale = righe.reduce((t, r) => t + (r.totale_cent || 0), 0);
  const elenco = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return righe.filter((r) => !saldati.includes(r.allievo_id) && (!soloOggi || r.oggi?.length)
      && (!q || `${r.nome} ${r.cognome} ${r.cognome} ${r.nome} ${r.chi_paga || ''} ${r.corsi || ''} ${(r.voci || []).map((v) => v.descrizione).join(' ')}`.toLowerCase().includes(q)));
  }, [righe, cerca, soloOggi, saldati]);

  return (
    <section className="pannello da-saldare" id="da-saldare">
      <div className="pannello-testa">
        <h2>Da saldare {righe.length > 0 && <span className="conta-rossa">{righe.length}</span>}
          {righe.length > 0 && <span className="piccolo muto" style={{ fontWeight: 500 }}> · {euro(totale)}</span>}</h2>
        {righe.length > 0 && (
          <div className="ds-filtri">
            <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca nome o corso" aria-label="Cerca fra chi deve pagare" />
            <button type="button" className={`stato-pillola${soloOggi ? ' attiva' : ''}`} aria-pressed={soloOggi} onClick={() => setSoloOggi((x) => !x)}>
              Vengono oggi ({conOggi})</button>
          </div>
        )}
      </div>
      {ultimo && <p className="avviso-ok" role="status" style={{ margin: '0 0 8px' }}>{ultimo}</p>}
      {righe.length === 0 ? <p className="piccolo muto" style={{ margin: 0 }}>Tutti in regola: nessun abbonamento o rata da incassare.</p> : (
        <ul className="ds-elenco">
          {elenco.map((r) => (
            <li key={r.allievo_id} className={r.oggi?.length ? 'oggi' : ''}>
              <div className="ds-riga">
                <div className="ds-chi">
                  <Link prefetch={false} href={`/gestione/sportello?persona=${r.allievo_id}`} className="ds-nome">{r.cognome} {r.nome}</Link>
                  <span className="piccolo muto">
                    {[r.chi_paga && `paga ${r.chi_paga}`, r.voci?.[0]?.descrizione + (r.voci.length > 1 ? ` + altr${r.voci.length === 2 ? 'o' : 'i'} ${r.voci.length - 1}` : ''), giorniTesto(r.giorni)].filter(Boolean).join(' · ')}
                  </span>
                  <span className="piccolo">
                    {r.oggi?.length ? <b className="ds-oggi">oggi {r.oggi.map((l) => `${ora(l.inizio)} ${l.corso}`).join(', ')}</b>
                      : r.prossima ? <span className="muto">prossima lezione {dataBreve(r.prossima.inizio)} {ora(r.prossima.inizio)}</span> : <span className="muto">nessuna lezione in vista</span>}
                  </span>
                </div>
                <div className="ds-quanto">
                  <strong>{euro(r.totale_cent)}</strong>
                  <button type="button" className="link-btn piccolo" aria-expanded={aperto === r.allievo_id}
                          onClick={() => setAperto((x) => (x === r.allievo_id ? null : r.allievo_id))}>{aperto === r.allievo_id ? 'chiudi' : 'incassa'}</button>
                </div>
              </div>
              {aperto === r.allievo_id && <DaSaldare d={r} palestraId={palestraId} compatto
                                                          onFatto={(x) => { if (x?.tutte) { setSaldati((v) => [...v, r.allievo_id]); setAperto(null); setUltimo(`${r.nome} ${r.cognome}: incassato${x.ricevute?.length ? ', ricevuta fatta' : ''} ✓`); } router.refresh(); }} />}
            </li>
          ))}
          {elenco.length === 0 && <li className="piccolo muto">Nessuno con questo filtro.</li>}
        </ul>
      )}
    </section>
  );
}
