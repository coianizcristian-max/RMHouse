'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, euro } from '@/lib/formato';
import AssegnaGiorni from '../../AssegnaGiorni';

const GIORNI = ['', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const ERRORI = {
  iscrizione_gia_attiva: 'Questa persona è già iscritta a questo corso nel periodo indicato.',
  orario_non_del_corso: "Uno degli orari scelti non appartiene al corso.",
  allievo_non_trovato: 'Allievo non trovato.',
};

export default function Iscrizioni({ allievoId, iscrizioni, corsi, tipi, orari, quotaCent, sconti = {}, famigliaIscritta = 0 }) {
  const router = useRouter();
  const [apri, setApri] = useState(false);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [f, setF] = useState({
    corso_id: '', tipo_abbonamento_id: '', data_inizio: new Date().toISOString().slice(0, 10),
    orari: [], sconto: '', quota: false, note: '',
  });

  // il pulsante "Nuova iscrizione" in cima alla scheda apre direttamente il modulo
  useEffect(() => {
    const apriDaLink = () => { if (window.location.hash === '#nuova-iscrizione') setApri(true); };
    apriDaLink();
    window.addEventListener('hashchange', apriDaLink);
    return () => window.removeEventListener('hashchange', apriDaLink);
  }, []);

  // Sconto da proporre secondo le regole della scuola: più corsi della stessa persona o più persone della famiglia
  const corsiAttivi = iscrizioni.filter((i) => i.stato === 'attiva').length;
  const proposta = (() => {
    const regole = [
      [corsiAttivi >= 2 && sconti.piu_corsi_3, 'dal terzo corso'],
      [corsiAttivi === 1 && sconti.piu_corsi_2, 'secondo corso'],
      [famigliaIscritta >= 2 && sconti.famiglia_3, 'dal terzo della famiglia'],
      [famigliaIscritta === 1 && sconti.famiglia_2, 'secondo della famiglia'],
    ].filter(([pct]) => pct > 0);
    return regole.length ? { pct: regole[0][0], perche: regole[0][1] } : null;
  })();

  const orariCorso = orari.filter((o) => o.corso_id === f.corso_id);
  const tipo = tipi.find((t) => t.id === f.tipo_abbonamento_id);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  function toggleOrario(id) {
    setF((s) => ({ ...s, orari: s.orari.includes(id) ? s.orari.filter((x) => x !== id) : [...s.orari, id] }));
  }

  async function crea(e) {
    e.preventDefault();
    if (!f.corso_id || !f.tipo_abbonamento_id) { setErrore('Scegli il corso e il tipo di abbonamento.'); return; }
    if (tipo?.modalita === 'orari_fissi' && f.orari.length === 0) {
      setErrore('Scegli almeno un orario: è quello che fa comparire la persona in appello.'); return;
    }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('crea_iscrizione', {
      p_allievo: allievoId,
      p_tipo_abbonamento: f.tipo_abbonamento_id,
      p_corso: f.corso_id,
      p_data_inizio: f.data_inizio,
      p_orari: f.orari,
      p_sconto_cent: f.sconto ? Math.round(parseFloat(f.sconto.replace(',', '.')) * 100) : 0,
      p_quota: f.quota,
      p_note: f.note || null,
    });
    setInvio(false);
    if (error) {
      const k = Object.keys(ERRORI).find((x) => error.message?.includes(x));
      setErrore(ERRORI[k] || 'Iscrizione non riuscita. Riprova.');
      return;
    }
    setApri(false); setF({ ...f, corso_id: '', tipo_abbonamento_id: '', orari: [], sconto: '', quota: false, note: '' });
    router.refresh();
  }

  async function sospendi(iscrizione) {
    const dal = prompt('Sospensione dal (AAAA-MM-GG):', new Date().toISOString().slice(0, 10));
    if (!dal) return;
    const al = prompt('Fino al (AAAA-MM-GG):');
    if (!al) return;
    const motivo = prompt('Motivo (infortunio, gravidanza…):') || null;
    const { error } = await supabaseBrowser().from('sospensioni').insert({
      palestra_id: iscrizione.palestra_id, iscrizione_id: iscrizione.id, dal, al, motivo,
    });
    if (error) { setErrore('Sospensione non registrata. Controlla le date.'); return; }
    router.refresh();
  }

  async function cambiaStato(id, stato) {
    const { error } = await supabaseBrowser().from('iscrizioni').update({ stato }).eq('id', id);
    if (error) { setErrore('Modifica non riuscita.'); return; }
    router.refresh();
  }

  return (
    <div>
      {errore && <div className="errore" role="alert">{errore}</div>}

      {iscrizioni.length === 0 && !apri && <div className="vuoto">Nessuna iscrizione.</div>}
      <ul className="elenco">
        {iscrizioni.map((i) => (
          <li key={i.id} className="persona" style={{ alignItems: 'start' }}>
            <div>
              <span className="persona-nome">{i.corsi?.nome}</span>
              <div className="piccolo muto">
                {i.tipi_abbonamento?.nome} · dal {dataBreve(i.data_inizio)} al {dataBreve(i.data_fine)}
                {i.sconto_cent > 0 && ` · sconto ${euro(i.sconto_cent)}`}
              </div>
              {i.stato === 'attiva' && i.tipi_abbonamento?.modalita === 'orari_fissi' && (
                <div style={{ marginTop: 6 }}>
                  {(i.iscrizioni_orari || []).length === 0 && <span className="tag tag-attenzione">giorni da assegnare</span>}
                  <AssegnaGiorni
                    iscrizioneId={i.id}
                    orari={orari.filter((o) => o.corso_id === i.corsi?.id)}
                    scelti={(i.iscrizioni_orari || []).map((x) => x.orario_id)}
                    quanti={i.tipi_abbonamento?.lezioni_settimanali}
                    compatto={(i.iscrizioni_orari || []).length > 0}
                  />
                </div>
              )}
              {i.stato === 'attiva' && (
                <div className="azioni-riga">
                  <button className="link-btn piccolo" onClick={() => sospendi(i)}>Sospendi</button>
                  <button className="link-btn piccolo" onClick={() => cambiaStato(i.id, 'annullata')}>Annulla</button>
                </div>
              )}
            </div>
            <span className={`tag ${i.stato === 'attiva' ? 'tag-ok' : 'tag-neutro'}`}>{i.stato}</span>
          </li>
        ))}
      </ul>

      {apri ? (
        <form onSubmit={crea} style={{ marginTop: 16 }}>
          <div className="campo">
            <label htmlFor="corso">Corso</label>
            <select id="corso" value={f.corso_id} onChange={(e) => setF({ ...f, corso_id: e.target.value, orari: [] })}>
              <option value="">— scegli —</option>
              {corsi.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="tipo">Abbonamento</label>
            <select id="tipo" value={f.tipo_abbonamento_id} onChange={set('tipo_abbonamento_id')}>
              <option value="">— scegli —</option>
              {(() => {
                const adatti = f.corso_id
                  ? tipi.filter((t) => t.tipi_abbonamento_corsi?.some((x) => x.corso_id === f.corso_id)) : [];
                const altri = tipi.filter((t) => !adatti.includes(t));
                const voce = (t) => <option key={t.id} value={t.id}>{t.nome} — {euro(t.prezzo_cent)}</option>;
                const famiglie = [...new Set(altri.map((t) => t.famiglia || 'Altri'))];
                return (
                  <>
                    {adatti.length > 0 && <optgroup label="Valgono per questo corso">{adatti.map(voce)}</optgroup>}
                    {famiglie.map((fam) => (
                      <optgroup key={fam} label={adatti.length ? `Altri · ${fam}` : fam}>
                        {altri.filter((t) => (t.famiglia || 'Altri') === fam).map(voce)}
                      </optgroup>
                    ))}
                  </>
                );
              })()}
            </select>
          </div>
          {f.corso_id && tipo?.modalita === 'orari_fissi' && (
            <fieldset style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
              <legend style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Giorni e orari</legend>
              {orariCorso.length === 0 && <p className="piccolo muto">Questo corso non ha ancora orari.</p>}
              {orariCorso.map((o) => (
                <label className="spunta" key={o.id}>
                  <input type="checkbox" checked={f.orari.includes(o.id)} onChange={() => toggleOrario(o.id)} />
                  <span>{GIORNI[o.giorno_settimana]} {String(o.ora_inizio).slice(0, 5)}</span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="riga-2">
            <div className="campo">
              <label htmlFor="di">Inizio</label>
              <input id="di" type="date" value={f.data_inizio} onChange={set('data_inizio')} />
              <span className="piccolo muto">La scadenza si calcola da sola dalla durata dell'abbonamento.</span>
            </div>
            <div className="campo">
              <label htmlFor="sc">Sconto (€)</label>
              <input id="sc" inputMode="decimal" value={f.sconto} onChange={set('sconto')} />
              {proposta && tipo && (
                <span className="piccolo">
                  Proposto {proposta.pct}% ({proposta.perche}):{' '}
                  <button type="button" className="link-btn"
                          onClick={() => setF({ ...f, sconto: ((tipo.prezzo_cent * proposta.pct) / 10000).toFixed(2).replace('.', ',') })}>
                    applica {((tipo.prezzo_cent * proposta.pct) / 10000).toFixed(2).replace('.', ',')} €
                  </button>
                </span>
              )}
            </div>
          </div>
          <label className="spunta">
            <input type="checkbox" checked={f.quota} onChange={set('quota')} />
            <span>Incassa anche la quota annuale{quotaCent > 0 && ` (${euro(quotaCent)})`}</span>
          </label>
          <div className="campo"><label htmlFor="nt">Note</label><input id="nt" value={f.note} onChange={set('note')} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primario" disabled={invio}>{invio ? 'Iscrivo…' : 'Crea iscrizione'}</button>
            <button type="button" className="btn" onClick={() => setApri(false)}>Annulla</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-primario" style={{ marginTop: 16 }} onClick={() => setApri(true)}>Nuova iscrizione</button>
      )}
    </div>
  );
}
