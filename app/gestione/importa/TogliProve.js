'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve } from '@/lib/formato';

// "Togli le prove" (query 163): quello creato a mano in RMHouse fra i dati che arrivano dai file di APP Palestre —
// persone che non ci sono in APP Palestre, abbonamenti e incassi fatti in RMHouse — già spuntato; si toglie la spunta a
// quello che è vero, si cancella, poi si reimportano i file. Solo amministratori.
const DA = { segreteria: 'creata in segreteria', app: 'registrata dall\'app', sito: 'arrivata dal sito', workshop: 'arrivata da un workshop',
  app_palestre: 'aggiunta a una famiglia di APP Palestre' };
const METODI = { contanti: 'contanti', pos: 'POS', carta: 'carta', bonifico: 'bonifico', satispay: 'Satispay', stripe: 'online', online: 'online', assegno: 'assegno', altro: 'altro' };
const plur = (n, uno, tanti) => `${n} ${n === 1 ? uno : tanti}`;

// le persone che potrebbero essere vere restano senza spunta, con il perché
function motivo(p) {
  if (p.workshop > 0) return 'iscritta a un workshop';
  if (p.eventi > 0) return 'iscritta a un evento';
  if (p.fonte === 'sito') return 'arrivata dal sito: può essere una persona vera';
  if (p.fonte === 'workshop') return 'arrivata da un workshop';
  return '';
}

export default function TogliProve({ palestraId, onReimporta }) {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState('');
  const [scelti, setScelti] = useState({ persone: new Set(), abbonamenti: new Set(), incassi: new Set() });
  const [invio, setInvio] = useState(false);
  const [esito, setEsito] = useState(null);

  async function leggi() {
    setErrore('');
    const { data, error } = await supabaseBrowser().rpc('prove_da_togliere', { p_palestra: palestraId });
    if (error) {
      setErrore(error.message?.includes('non_autorizzato') ? 'Solo un amministratore può togliere le prove.'
        : error.message?.includes('prove_da_togliere') ? 'Manca la query 163 in Supabase.' : 'Non riesco a leggere l\'elenco.');
      return;
    }
    setDati(data);
    setScelti({
      persone: new Set((data.persone || []).filter((p) => !motivo(p)).map((p) => p.id)),
      abbonamenti: new Set((data.abbonamenti || []).map((x) => x.id)),
      incassi: new Set((data.incassi || []).map((x) => x.id)),
    });
  }
  useEffect(() => { leggi(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const spunta = (g, id) => setScelti((s) => { const n = new Set(s[g]); if (n.has(id)) n.delete(id); else n.add(id); return { ...s, [g]: n }; });
  const tutti = (g, si) => setScelti((s) => ({ ...s, [g]: new Set(si ? (dati[g] || []).map((x) => x.id) : []) }));
  const n = { persone: scelti.persone.size, abbonamenti: scelti.abbonamenti.size, incassi: scelti.incassi.size };
  const totale = n.persone + n.abbonamenti + n.incassi;

  async function cancella() {
    const testo = [n.persone && plur(n.persone, 'persona', 'persone'), n.abbonamenti && plur(n.abbonamenti, 'abbonamento', 'abbonamenti'),
      n.incassi && plur(n.incassi, 'incasso', 'incassi')].filter(Boolean).join(', ');
    if (!confirm(`Cancellare per sempre ${testo}, con le loro ricevute?\n\nNon si torna indietro (solo dal backup). Ai clienti non arriva nessun avviso.`)) return;
    setInvio(true); setErrore('');
    const { data, error } = await supabaseBrowser().rpc('togli_prove', {
      p_palestra: palestraId, p_persone: [...scelti.persone], p_iscrizioni: [...scelti.abbonamenti], p_pagamenti: [...scelti.incassi],
    });
    setInvio(false);
    if (error) { setErrore(error.message?.includes('non_autorizzato') ? 'Solo un amministratore può togliere le prove.' : `Non riuscito: ${error.message}`); return; }
    setEsito(data);
    await leggi();
  }

  if (errore && !dati) return <div className="errore" role="alert">{errore}</div>;
  if (!dati) return <p className="muto">Carico l&apos;elenco…</p>;
  const vuoto = !dati.persone.length && !dati.abbonamenti.length && !dati.incassi.length;

  const testa = (g, titolo, sotto) => (
    <div className="tp-testa">
      <h3>{titolo} <span className="conta">{dati[g].length}</span></h3>
      {dati[g].length > 0 && (
        <span className="in-riga piccolo">
          <button type="button" className="link-btn piccolo" onClick={() => tutti(g, true)}>spunta tutti</button>
          <button type="button" className="link-btn piccolo" onClick={() => tutti(g, false)}>nessuno</button>
        </span>
      )}
      <p className="piccolo muto">{sotto}</p>
    </div>
  );
  const casella = (g, id, etichetta) => (
    <label className="spunta tp-casella"><input type="checkbox" checked={scelti[g].has(id)} onChange={() => spunta(g, id)} aria-label={etichetta} /><span /></label>
  );
  const incasso = (x) => (x.importo_cent != null
    ? <>{euro(x.importo_cent)}{x.metodo ? ` ${METODI[x.metodo] || x.metodo}` : ''}{x.stato_incasso && x.stato_incasso !== 'pagato' ? ` (${x.stato_incasso.replace('_', ' ')})` : ''}{x.ricevute ? <> · <b>ricevuta n. {x.ricevute}</b></> : ''}</>
    : <span className="muto">senza incasso</span>);

  return (
    <div className="tp">
      <div className="pannello tp-intro">
        <h2>Togli le prove</h2>
        <p className="piccolo" style={{ margin: '0 0 8px' }}>
          Cancella quello che è stato creato a mano in RMHouse fra i dati che arrivano dai file di APP Palestre (persone,
          abbonamenti, incassi e ricevute), così reimportando i file contano quelli.
        </p>
        <ol className="asi-passi">
          <li><b>Importa prima i file aggiornati</b> (scheda &quot;Da APP Palestre&quot;): così RMHouse riconosce le persone vere.
            {dati.ultimo_import && <span className="muto"> Ultimo import: {dataBreve(dati.ultimo_import)}.</span>}</li>
          <li><b>Controlla l&apos;elenco qui sotto:</b> è già spuntato, togli la spunta a quello che è vero e va tenuto. Poi <b>Cancella</b>.</li>
          <li><b>Reimporta gli stessi file</b>: tornano gli abbonamenti e gli incassi di APP Palestre che RMHouse aveva tenuto da parte
            perché c&apos;erano già quelli fatti a mano.</li>
        </ol>
        <p className="piccolo muto" style={{ margin: '8px 0 0' }}>
          Non si toccano: corsi, orari, listino, staff, sale, impostazioni, workshop ed eventi, gli abbinamenti fatti in &quot;Da
          sistemare&quot;, presenze, prenotazioni e recuperi delle persone vere, e quello che hai messo a mano su di loro (certificati,
          tessere, moduli, consensi). I corsi finti li cancelli da Corsi. Ai clienti non arriva nessun avviso.
          Se hai il backup su GitHub, prima fallo partire a mano (Run workflow).
        </p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}
      {esito && (
        <div className="avviso-ok" role="status">
          Cancellati: {plur(esito.persone, 'persona', 'persone')}, {plur(esito.abbonamenti, 'abbonamento', 'abbonamenti')},{' '}
          {plur(esito.incassi, 'incasso', 'incassi')} e {plur(esito.ricevute, 'ricevuta', 'ricevute')} ✓
          {esito.ultima_ricevuta != null && <> La prossima ricevuta sarà la n. {esito.ultima_ricevuta + 1}.</>}
          {' '}Ora <button type="button" className="link-btn" onClick={onReimporta}>reimporta i file di APP Palestre</button>.
        </div>
      )}
      {vuoto && <div className="vuoto">Niente da togliere: in RMHouse non c&apos;è niente creato a mano fra i dati che arrivano dai file.</div>}

      {dati.persone.length > 0 && (
        <section className="pannello tp-gruppo">
          {testa('persone', 'Persone create in RMHouse', 'Non ci sono in APP Palestre. Vanno via con tutto quello che hanno: abbonamenti, incassi, ricevute, certificati, presenze, tessere.')}
          <ul className="tp-lista">
            {dati.persone.map((p) => {
              const m = motivo(p);
              return (
                <li key={p.id}>
                  {casella('persone', p.id, `${p.cognome} ${p.nome}`)}
                  <div>
                    <Link prefetch={false} href={`/gestione/persone/${p.id}`} className="tp-nome">{p.cognome} {p.nome}</Link>
                    <small className="muto"> · {[DA[p.fonte] || 'creata in RMHouse', p.created_at && `il ${dataBreve(p.created_at)}`].filter(Boolean).join(' ')}
                      {!p.is_titolare && p.famiglia ? ` · famiglia ${p.famiglia}` : ''}</small>
                    <small className="tp-cosa">
                      {[p.abbonamenti && plur(p.abbonamenti, 'abbonamento', 'abbonamenti'),
                        p.incassi && `${plur(p.incassi, 'incasso', 'incassi')}${p.incassato_cent ? ` (${euro(p.incassato_cent)})` : ''}`,
                        p.ricevute && plur(p.ricevute, 'ricevuta', 'ricevute'), p.presenze && plur(p.presenze, 'presenza', 'presenze'),
                        p.workshop && plur(p.workshop, 'workshop', 'workshop'), p.eventi && plur(p.eventi, 'evento', 'eventi'),
                        p.accesso_app && 'ha l\'accesso all\'app'].filter(Boolean).join(' · ') || 'nient\'altro'}
                    </small>
                    {m && <small className="tp-motivo">non spuntata: {m}</small>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {dati.abbonamenti.length > 0 && (
        <section className="pannello tp-gruppo">
          {testa('abbonamenti', 'Abbonamenti fatti in RMHouse', 'Di persone che ci sono in APP Palestre. Vanno via con il loro incasso fatto in RMHouse, le ricevute, le rate e le prenotazioni.')}
          <ul className="tp-lista">
            {dati.abbonamenti.map((x) => (
              <li key={x.id}>
                {casella('abbonamenti', x.id, `${x.cognome} ${x.nome}: ${x.corso || x.abbonamento}`)}
                <div>
                  <Link prefetch={false} href={`/gestione/persone/${x.allievo_id}`} className="tp-nome">{x.cognome} {x.nome}</Link>
                  <small className="muto"> · fatto il {dataBreve(x.created_at)}</small>
                  <small className="tp-cosa">{[x.corso, x.abbonamento].filter(Boolean).join(' · ')} · dal {dataBreve(x.data_inizio)} al {dataBreve(x.data_fine)}
                    {x.stato !== 'attiva' ? ` · ${x.stato}` : ''}</small>
                  <small className="tp-cosa">{incasso(x)}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dati.incassi.length > 0 && (
        <section className="pannello tp-gruppo">
          {testa('incassi', 'Altri incassi fatti in RMHouse', 'Abbonamenti, quote e vendite incassati in RMHouse (non workshop, eventi o prove). Vanno via con le loro ricevute.')}
          <ul className="tp-lista">
            {dati.incassi.map((x) => (
              <li key={x.id}>
                {casella('incassi', x.id, `${x.cognome || ''} ${x.nome || ''}: ${x.descrizione || x.causale}`)}
                <div>
                  <span className="tp-nome">{`${x.cognome || ''} ${x.nome || ''}`.trim() || 'senza persona'}</span>
                  <small className="muto"> · {dataBreve(x.quando)}</small>
                  <small className="tp-cosa">{x.descrizione || x.causale}{x.per_abbonamento ? ` · per ${x.per_abbonamento}` : ''}</small>
                  <small className="tp-cosa">{incasso({ ...x, stato_incasso: x.stato })}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!vuoto && (
        <div className="tp-barra">
          <span>{totale ? <>Da cancellare: <b>{[n.persone && plur(n.persone, 'persona', 'persone'), n.abbonamenti && plur(n.abbonamenti, 'abbonamento', 'abbonamenti'),
            n.incassi && plur(n.incassi, 'incasso', 'incassi')].filter(Boolean).join(', ')}</b></> : 'Niente di spuntato'}</span>
          <button type="button" className="btn btn-pericolo" disabled={!totale || invio} onClick={cancella}>{invio ? 'Cancello…' : 'Cancella'}</button>
        </div>
      )}
    </div>
  );
}
