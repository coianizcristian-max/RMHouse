'use client';
import { useMemo, useState } from 'react';
import { euro } from '@/lib/formato';

const GIORNI = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const durata = (t) => (t.durata_giorni ? `${t.durata_giorni} giorni` : t.durata_mesi === 1 ? '1 mese' : t.durata_mesi ? `${t.durata_mesi} mesi` : '');

export default function Acquisto({ allievi, tipi, corsi, orari, coperti, rinnovo }) {
  const [f, setF] = useState({ allievo_id: allievi[0]?.id || '', tipo: '', corso: '', orari: [], ricorrente: false });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const tipo = tipi.find((t) => t.id === f.tipo);
  const corsiDelTipo = useMemo(() => {
    if (!tipo) return [];
    const ids = coperti.filter((c) => c.tipo_abbonamento_id === tipo.id).map((c) => c.corso_id);
    return ids.length ? corsi.filter((c) => ids.includes(c.id)) : corsi;
  }, [tipo, coperti, corsi]);
  const orariCorso = orari.filter((o) => o.corso_id === f.corso).sort((a, b) => a.giorno_settimana - b.giorno_settimana || a.ora_inizio.localeCompare(b.ora_inizio));
  const max = tipo?.lezioni_settimanali || 7;
  const prezzo = tipo ? (tipo.prezzo_web_cent || tipo.prezzo_cent) : 0;

  function alternaOrario(id) {
    setF((v) => ({ ...v, orari: v.orari.includes(id) ? v.orari.filter((x) => x !== id) : v.orari.length >= max ? v.orari : [...v.orari, id] }));
  }

  async function paga() {
    setErrore('');
    if (!f.allievo_id || !tipo || !f.corso) { setErrore('Scegli per chi, l\'abbonamento e il corso.'); return; }
    if (tipo.modalita === 'orari_fissi' && f.orari.length === 0) { setErrore('Scegli i giorni in cui verrai.'); return; }
    setInvio(true);
    const r = await fetch('/api/stripe/acquisto', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allievo_id: f.allievo_id, tipo_abbonamento_id: tipo.id, corso_id: f.corso, orari: f.orari, ricorrente: f.ricorrente }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) { setInvio(false); setErrore(d.errore || 'Non riusciamo ad aprire il pagamento. Riprova.'); return; }
    window.location.href = d.url;
  }

  if (tipi.length === 0) return <><h1>Abbonamenti online</h1><p>Al momento non ci sono abbonamenti acquistabili online: passa in segreteria.</p></>;

  return (
    <div className="acquisto">
      <h1>Acquista il tuo abbonamento</h1>
      {errore && <div className="errore" role="alert">{errore}</div>}

      {allievi.length > 1 && (
        <section><h2 className="sezione">Per chi</h2>
          <div className="pastiglie">
            {allievi.map((a) => (
              <button key={a.id} type="button" className="stato-pillola" aria-current={f.allievo_id === a.id ? 'true' : undefined}
                      onClick={() => setF({ ...f, allievo_id: a.id })}>{a.nome}</button>
            ))}
          </div>
        </section>
      )}

      <section><h2 className="sezione">Quale abbonamento</h2>
        <div className="scelte">
          {tipi.map((t) => (
            <label key={t.id} className={`scelta${f.tipo === t.id ? ' scelto' : ''}`}>
              <input type="radio" name="tipo" checked={f.tipo === t.id} onChange={() => setF({ ...f, tipo: t.id, corso: '', orari: [], ricorrente: false })} />
              <span style={{ flex: 1 }}>
                <strong>{t.nome}</strong>
                <span className="piccolo muto" style={{ display: 'block' }}>
                  {[durata(t), t.lezioni_settimanali && `${t.lezioni_settimanali} volt${t.lezioni_settimanali === 1 ? 'a' : 'e'} a settimana`, t.num_ingressi && `${t.num_ingressi} ingressi`].filter(Boolean).join(' · ')}
                </span>
              </span>
              <strong>{euro(t.prezzo_web_cent || t.prezzo_cent)}</strong>
            </label>
          ))}
        </div>
      </section>

      {tipo && (
        <section><h2 className="sezione">Il corso</h2>
          <div className="pastiglie">
            {corsiDelTipo.map((c) => (
              <button key={c.id} type="button" className="stato-pillola" aria-current={f.corso === c.id ? 'true' : undefined}
                      onClick={() => setF({ ...f, corso: c.id, orari: [] })}>
                <span className="punto-colore" style={{ background: c.colore }} />{c.nome}
              </button>
            ))}
          </div>
        </section>
      )}

      {tipo && f.corso && tipo.modalita === 'orari_fissi' && (
        <section><h2 className="sezione">I giorni {max < 7 ? `(fino a ${max})` : ''}</h2>
          {orariCorso.length === 0 ? <p className="muto">Nessun orario disponibile per questo corso: chiedi in segreteria.</p> : (
            <div className="pastiglie">
              {orariCorso.map((o) => (
                <button key={o.id} type="button" className="stato-pillola" aria-current={f.orari.includes(o.id) ? 'true' : undefined}
                        onClick={() => alternaOrario(o.id)}>
                  {GIORNI[o.giorno_settimana]} {o.ora_inizio.slice(0, 5)}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {tipo && f.corso && (
        <section className="scheda" style={{ marginTop: 18 }}>
          <div className="pannello-testa" style={{ marginBottom: 6 }}>
            <strong style={{ color: 'var(--nero)' }}>Totale</strong><strong style={{ fontSize: 22, color: 'var(--nero)' }}>{euro(prezzo)}</strong>
          </div>
          <p className="piccolo muto" style={{ margin: '0 0 10px' }}>Se quest'anno non hai ancora pagato la quota annuale, viene aggiunta al pagamento.</p>
          {rinnovo && tipo.rinnovo_automatico && (
            <label className="spunta"><input type="checkbox" checked={f.ricorrente} onChange={(e) => setF({ ...f, ricorrente: e.target.checked })} />
              <span>Rinnovo automatico ogni mese con la stessa carta. Lo disdici quando vuoi dalla tua area.</span></label>
          )}
          <button className="btn btn-primario btn-pieno" disabled={invio} onClick={paga}>{invio ? 'Apro il pagamento…' : 'Paga con carta'}</button>
          <p className="piccolo muto" style={{ marginTop: 8 }}>Paghi sulla pagina sicura di Stripe: i dati della carta non passano da noi.</p>
        </section>
      )}
    </div>
  );
}
