'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, euro } from '@/lib/formato';
import AssegnaGiorni from '../../AssegnaGiorni';
import AzioniIscrizione from './AzioniIscrizione';
import CampoCerca from '../../CampoCerca';

const GIORNI = ['', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
// mese solare: scade a fine mese (non a ingressi né a giorni)
const aMese = (t) => !!t && t.scadenza_fine_mese !== false && t.modalita !== 'ingressi' && (!t.durata_giorni || t.durata_giorni >= 28);
const fineMese = (d) => { const [y, m] = d.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const centDa = (s) => Math.round(parseFloat(String(s || '').replace(',', '.')) * 100);
const ERRORI = {
  orario_non_attivo: 'Uno dei giorni scelti è stato sospeso: scegli un altro giorno.',
  iscrizione_gia_attiva: 'Questa persona è già iscritta a questo corso nel periodo indicato.',
  orario_non_del_corso: "Uno degli orari scelti non appartiene al corso.",
  allievo_non_trovato: 'Persona non trovata.',
};

export default function Iscrizioni({ allievoId, iscrizioni, corsi, tipi, orari, quotaCent, sconti = {}, famigliaIscritta = 0, apriSubito = false }) {
  const router = useRouter();
  const [apri, setApri] = useState(apriSubito);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [azione, setAzione] = useState(null);   // { id, modo }
  const [f, setF] = useState({
    corso_id: '', tipo_abbonamento_id: '', data_inizio: new Date().toISOString().slice(0, 10),
    orari: [], sconto: '', importo: '', quota: false, note: '',
  });
  const [rimaste, setRimaste] = useState(null);   // { mese, rimaste } lezioni per chi parte a metà mese

  // il pulsante "Nuova iscrizione" in cima alla scheda apre direttamente il modulo
  useEffect(() => {
    const apriDaLink = () => {
      if (window.location.hash !== '#nuova-iscrizione' && !apriSubito) return;
      setApri(true);
      setTimeout(() => document.getElementById('modulo-iscrizione')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    };
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

  // parte a metà mese: l'importo lo decide la segreteria (proposta in base alle lezioni che restano)
  const metaMese = aMese(tipo) && /^\d{4}-\d{2}-\d{2}$/.test(f.data_inizio) && !f.data_inizio.endsWith('-01');
  useEffect(() => {
    if (!metaMese) { setRimaste(null); return; }
    if (f.orari.length) {
      supabaseBrowser().rpc('lezioni_rimaste_mese', { p_orari: f.orari, p_dal: f.data_inizio }).then(({ data }) => setRimaste(data || null));
    } else {
      const fm = fineMese(f.data_inizio); const tot = Number(fm.slice(8, 10));
      setRimaste({ mese: tot, rimaste: tot - Number(f.data_inizio.slice(8, 10)) + 1, giorni: true });
    }
  }, [metaMese, f.data_inizio, f.orari.join(',')]);
  const proposto = metaMese && tipo && rimaste?.mese ? Math.round((tipo.prezzo_cent * rimaste.rimaste) / rimaste.mese / 100) * 100 : null;

  function toggleOrario(id) {
    setF((s) => ({ ...s, orari: s.orari.includes(id) ? s.orari.filter((x) => x !== id) : [...s.orari, id] }));
  }

  async function crea(e) {
    e.preventDefault();
    if (!f.corso_id || !f.tipo_abbonamento_id) { setErrore('Scegli il corso e il tipo di abbonamento.'); return; }
    if (tipo?.modalita === 'orari_fissi' && f.orari.length === 0) {
      setErrore('Scegli almeno un orario: è quello che fa comparire la persona in appello.'); return;
    }
    if (metaMese && !(centDa(f.importo) >= 0)) { setErrore('Parte a metà mese: scrivi l\'importo da far pagare fino a fine mese.'); return; }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('crea_iscrizione', {
      p_allievo: allievoId,
      p_tipo_abbonamento: f.tipo_abbonamento_id,
      p_corso: f.corso_id,
      p_data_inizio: f.data_inizio,
      p_orari: f.orari,
      p_sconto_cent: metaMese ? Math.max((tipo?.prezzo_cent || 0) - centDa(f.importo), 0) : f.sconto ? centDa(f.sconto) : 0,
      p_quota: f.quota,
      p_note: f.note || (metaMese ? 'Parte a metà mese' : null),
    });
    setInvio(false);
    if (error) {
      const k = Object.keys(ERRORI).find((x) => error.message?.includes(x));
      setErrore(ERRORI[k] || 'Iscrizione non riuscita. Riprova.');
      return;
    }
    setApri(false); setF({ ...f, corso_id: '', tipo_abbonamento_id: '', orari: [], sconto: '', importo: '', quota: false, note: '' });
    router.refresh();
  }

  function apriAzione(id, modo) {
    setAzione((a) => (a?.id === id && a.modo === modo ? null : { id, modo }));
  }

  return (
    <div>
      {errore && <div className="errore" role="alert">{errore}</div>}

      {iscrizioni.length === 0 && !apri && <div className="vuoto">Nessuna iscrizione.</div>}
      <ul className="elenco">
        {iscrizioni.map((i) => (
          <li key={i.id} className="persona" style={{ alignItems: 'start' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <span className="persona-nome">{i.corsi?.nome}</span>
              <div className="piccolo muto">
                {i.tipi_abbonamento?.nome} · dal {dataBreve(i.data_inizio)} al {dataBreve(i.data_fine)}
                {i.sconto_cent > 0 && ` · sconto ${euro(i.sconto_cent)}`}
                {i.note && <span style={{ display: 'block' }}>{i.note}</span>}
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
              <div className="azioni-riga">
                {(i.stato === 'attiva' || i.stato === 'sospesa') && <>
                  <button className="link-btn piccolo" aria-pressed={azione?.id === i.id && azione.modo === 'modifica'} onClick={() => apriAzione(i.id, 'modifica')}>Modifica</button>
                  <button className="link-btn piccolo" aria-pressed={azione?.id === i.id && azione.modo === 'sospendi'} onClick={() => apriAzione(i.id, 'sospendi')}>Sospendi</button>
                  <button className="link-btn piccolo" aria-pressed={azione?.id === i.id && azione.modo === 'annulla'} onClick={() => apriAzione(i.id, 'annulla')}>Annulla</button>
                </>}
                <button className="link-btn piccolo pericolo" aria-pressed={azione?.id === i.id && azione.modo === 'elimina'} onClick={() => apriAzione(i.id, 'elimina')}>Elimina</button>
              </div>
              {azione?.id === i.id && (
                <AzioniIscrizione key={azione.modo} iscrizione={i} tipi={tipi} modo={azione.modo} chiudi={() => setAzione(null)} />
              )}
            </div>
            <span className={`tag ${i.stato === 'attiva' ? 'tag-ok' : i.stato === 'sospesa' ? 'tag-attenzione' : 'tag-neutro'}`}>{i.stato}</span>
          </li>
        ))}
      </ul>

      {apri ? (
        <form onSubmit={crea} style={{ marginTop: 16, scrollMarginTop: 80 }} id="modulo-iscrizione">
          <div className="campo">
            <label htmlFor="corso">Corso</label>
            <CampoCerca id="corso" valore={f.corso_id} onChange={(v) => setF({ ...f, corso_id: v, orari: [] })}
                        placeholder="Scrivi il corso… (es. pole 1)"
                        opzioni={corsi.map((c) => ({ value: c.id, label: c.nome }))} />
          </div>
          <div className="campo">
            <label htmlFor="tipo">Abbonamento</label>
            {(() => {
              // prima quelli che valgono per il corso scelto, poi gli altri per famiglia
              const adatti = f.corso_id ? tipi.filter((t) => t.tipi_abbonamento_corsi?.some((x) => x.corso_id === f.corso_id)) : [];
              const altri = tipi.filter((t) => !adatti.includes(t));
              const voce = (t, gruppo) => ({ value: t.id, label: t.nome, extra: euro(t.prezzo_cent), gruppo });
              const famiglie = [...new Set(altri.map((t) => t.famiglia || 'Altri'))];
              const opzioni = [
                ...adatti.map((t) => voce(t, 'Valgono per questo corso')),
                ...famiglie.flatMap((fam) => altri.filter((t) => (t.famiglia || 'Altri') === fam).map((t) => voce(t, adatti.length ? `Altri · ${fam}` : fam))),
              ];
              return <CampoCerca id="tipo" valore={f.tipo_abbonamento_id} onChange={(v) => setF({ ...f, tipo_abbonamento_id: v })}
                                 placeholder="Scrivi l'abbonamento… (es. pole 2 trim)" opzioni={opzioni} />;
            })()}
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
              <span className="piccolo muto">{aMese(tipo) ? 'Mese solare: scade a fine mese.' : 'La scadenza si calcola da sola dalla durata dell\'abbonamento.'}</span>
            </div>
            {metaMese ? (
            <div className="campo">
              <label htmlFor="imp">Importo fino al {dataBreve(fineMese(f.data_inizio))} (€)</label>
              <input id="imp" inputMode="decimal" value={f.importo} onChange={set('importo')} placeholder={proposto != null ? (proposto / 100).toFixed(2).replace('.', ',') : ''} />
              <span className="piccolo">
                Parte a metà mese: a listino {euro(tipo.prezzo_cent)} è il mese intero.
                {rimaste && ` Restano ${rimaste.rimaste} ${rimaste.giorni ? 'giorni' : 'lezioni'} su ${rimaste.mese}.`}
                {rimaste && rimaste.rimaste === 0 && ' Questo mese non ci sono più lezioni: falla partire dal 1° del mese prossimo.'}
                {proposto != null && (
                  <> <button type="button" className="link-btn" onClick={() => setF({ ...f, importo: (proposto / 100).toFixed(2).replace('.', ',') })}>
                    usa {euro(proposto)}
                  </button></>
                )}
              </span>
            </div>
            ) : (
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
            )}
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
        <button className="btn btn-piccolo" style={{ marginTop: 10 }} onClick={() => setApri(true)}>+ Nuova iscrizione</button>
      )}
    </div>
  );
}
