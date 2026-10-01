'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { ora, dataBreve, giornoLungo } from '@/lib/formato';
import Notifiche from './Notifiche';
import CaricaCertificato from '../CaricaCertificato';

const MOTIVI_DISDETTA = {
  troppo_tardi: 'Ormai è tardi per disdire da qui: chiama la segreteria.',
  lezione_gia_iniziata: 'La lezione è già iniziata.',
  gia_disdetta: 'Questa lezione era già disdetta.',
  credito_gia_usato: 'Il recupero di questa lezione è già stato usato: non si può tornare indietro.',
  lezione_al_completo: 'Nel frattempo il posto è stato preso: la lezione è al completo.',
};
const motivo = (e, base) => MOTIVI_DISDETTA[Object.keys(MOTIVI_DISDETTA).find((k) => e?.message?.includes(k))] || base;

export default function Riepilogo({ dati, materiali = [], inVerifica = [], aspetto = {}, chiediConsenso = false, moduliDaFirmare = 0, disdette = {} }) {
  const router = useRouter();
  const [chiedo, setChiedo] = useState(null);   // lezione su cui si sta confermando "Non vengo"
  const ore = disdette.ore_disdetta ?? 4;
  const giaDisdette = disdette.disdette || [];
  const chiave = (l) => `${l.lezione_id}-${l.allievo_id}`;
  const disdicibile = (l) => new Date(l.inizio).getTime() - ore * 3600000 > Date.now();
  const prossime = dati.prossime.filter((l) => !giaDisdette.some((d) => d.lezione_id === l.lezione_id && d.allievo_id === l.allievo_id));
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);

  const daSistemare = dati.allievi.filter((a) => !a.certificato_ok);
  const [consenso, setConsenso] = useState(chiediConsenso);

  async function rispondiConsenso(si) {
    setConsenso(false);
    await supabaseBrowser().rpc('imposta_consenso_marketing', { p_si: si });
    if (si) setAvviso('Grazie! Ti scriveremo solo per cose interessanti.');
  }

  async function esci() {
    await supabaseBrowser().auth.signOut();
    router.replace('/');
    router.refresh();
  }

  async function disdici(l) {
    if (!confirm(`Disdire il recupero di ${l.corso} del ${dataBreve(l.inizio)}? Il credito torna disponibile.`)) return;
    setInvio(true); setErrore(''); setAvviso('');
    const { error } = await supabaseBrowser().rpc('annulla_recupero', { p_prenotazione: l.prenotazione_id });
    setInvio(false);
    if (error) { setErrore(motivo(error, 'Non è stato possibile disdire. Chiama la segreteria.')); return; }
    setAvviso('Recupero disdetto: il credito è di nuovo disponibile.');
    router.refresh();
  }

  async function nonVengo(l) {
    setInvio(true); setErrore(''); setAvviso('');
    const { data, error } = await supabaseBrowser().rpc('disdici_lezione', { p_lezione: l.lezione_id, p_allievo: l.allievo_id });
    setInvio(false); setChiedo(null);
    if (error) { setErrore(motivo(error, 'Non è stato possibile disdire. Chiama la segreteria.')); router.refresh(); return; }
    setAvviso(data?.credito
      ? `Lezione disdetta: hai un recupero da usare entro il ${dataBreve(data.scadenza)}.`
      : 'Lezione disdetta. Questo abbonamento non prevede recuperi.');
    router.refresh();
  }

  async function ciVengo(d) {
    setInvio(true); setErrore(''); setAvviso('');
    const { error } = await supabaseBrowser().rpc('ripristina_lezione', { p_lezione: d.lezione_id, p_allievo: d.allievo_id });
    setInvio(false);
    if (error) { setErrore(motivo(error, 'Non è stato possibile. Chiama la segreteria.')); return; }
    setAvviso('Perfetto, ti aspettiamo a lezione.');
    router.refresh();
  }

  async function togliDaAttesa(a) {
    if (!confirm(`Toglierti dalla lista d'attesa di ${a.corso}?`)) return;
    await supabaseBrowser().from('liste_attesa').update({ stato: 'annullata' }).eq('id', a.id);
    router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">La mia area</div>
        <h1>Ciao {dati.titolare.nome}</h1>
        {aspetto.benvenuto && <p style={{ whiteSpace: 'pre-line' }}>{aspetto.benvenuto}</p>}
        <p>
          {prossime.length > 0
            ? `La prossima lezione è ${giornoLungo(prossime[0].inizio).toLowerCase()} alle ${ora(prossime[0].inizio)}.`
            : 'Non ci sono lezioni in programma nei prossimi giorni.'}
        </p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="errore" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>{avviso}</div>}

      {materiali.length > 0 && (
        <>
          <h2 className="sezione">Per la lezione di oggi</h2>
          {materiali.map((m) => (
            <div key={m.id} className="avviso-card">
              <h3>{m.titolo}</h3>
              <p>{m.corso} · {ora(m.inizio)}{m.testo ? ` — ${m.testo}` : ''}</p>
              {m.url && (
                <p style={{ marginTop: 8 }}>
                  <a className="btn" href={m.url} target="_blank" rel="noreferrer">
                    {m.tipo === 'video' ? 'Guarda il video' : 'Apri'}
                  </a>
                </p>
              )}
            </div>
          ))}
        </>
      )}


      {moduliDaFirmare > 0 && (
        <Link href="/area/moduli" className="scheda" style={{ display: 'block', borderLeft: '4px solid var(--rosso)', marginBottom: 16, textDecoration: 'none' }}>
          <strong style={{ color: 'var(--nero)' }}>
            {moduliDaFirmare === 1 ? 'Un modulo da firmare' : `${moduliDaFirmare} moduli da firmare`}
          </strong>
          <span className="piccolo muto" style={{ display: 'block' }}>Regolamento e autorizzazioni: si firmano qui col dito, in un minuto. Tocca per aprirli.</span>
        </Link>
      )}

      {consenso && (
        <div className="scheda" style={{ marginBottom: 16 }}>
          <strong style={{ color: 'var(--nero)' }}>Vuoi ricevere novità e promozioni?</strong>
          <p className="piccolo muto" style={{ margin: '6px 0 10px' }}>
            Nuovi corsi, stage, offerte per chi è già iscritto. Poche email, e puoi cambiare idea quando vuoi.
          </p>
          <div className="azioni">
            <button className="btn btn-primario btn-piccolo" onClick={() => rispondiConsenso(true)}>Sì, volentieri</button>
            <button className="btn btn-piccolo" onClick={() => rispondiConsenso(false)}>No, grazie</button>
          </div>
        </div>
      )}

      {aspetto.avviso && (
        <div className="avviso-card"><p style={{ margin: 0, whiteSpace: 'pre-line' }}>{aspetto.avviso}</p></div>
      )}

      {daSistemare.length > 0 && (
        <div className="scheda" style={{ borderLeft: '4px solid var(--rosso)', marginBottom: 20 }}>
          <strong style={{ color: 'var(--nero)' }}>Certificato medico da sistemare</strong>
          {daSistemare.map((a) => {
            const inviato = inVerifica.find((c) => c.allievo_id === a.id);
            return (
              <div key={a.id} style={{ marginTop: 12 }}>
                <div className="piccolo" style={{ marginBottom: 8 }}>
                  <strong>{a.nome}</strong>: {a.certificato_scadenza ? `scaduto il ${dataBreve(a.certificato_scadenza)}` : 'non ancora consegnato'}
                </div>
                {inviato ? (
                  <div className="piccolo" style={{ color: 'var(--ok)' }}>
                    Inviato il {dataBreve(inviato.caricato_at)}{inviato.scadenza ? `, scade il ${dataBreve(inviato.scadenza)}` : ''}: la segreteria lo sta controllando.
                  </div>
                ) : (
                  <CaricaCertificato token={a.token} nome={a.nome}
                                     onFatto={() => { setAvviso('Certificato inviato: la segreteria lo controlla e lo approva.'); router.refresh(); }} />
                )}
              </div>
            );
          })}
          <p className="piccolo muto" style={{ marginTop: 10 }}>
            Basta una foto ben leggibile. Senza certificato valido non si può entrare in sala.
          </p>
        </div>
      )}

      <h2 className="sezione">Le prossime lezioni</h2>
      {prossime.length === 0 && <div className="vuoto">Nessuna lezione nei prossimi giorni.</div>}
      {prossime.length > 0 && (
        <p className="piccolo muto" style={{ marginTop: -4 }}>
          Non puoi venire? Tocca "Non vengo" fino a {ore} {ore === 1 ? 'ora' : 'ore'} prima: il posto si libera e ti diamo un recupero.
        </p>
      )}
      {prossime.map((l) => (
        <div key={chiave(l)} className="scheda-corso" style={{ gridTemplateColumns: '6px 1fr auto' }}>
          <span className="banda" style={{ background: l.colore || 'var(--rosso)' }} />
          <span className="centro">
            <span className="ora-grande">{ora(l.inizio)}</span>
            <span className="titolo" style={{ display: 'block' }}>{l.corso}</span>
            <span className="riga" style={{ textTransform: 'capitalize' }}>
              {giornoLungo(l.inizio)} · {dati.allievi.length > 1 ? `${l.allievo} · ` : ''}
              {[l.sala, l.insegnante].filter(Boolean).join(' · ')}
            </span>
            {l.stato_lezione === 'annullata' && <span className="tag tag-rosso">Lezione annullata</span>}
          </span>
          <span className="destra">
            {l.tipo === 'recupero' && (
              <>
                <span className="tag tag-neutro">recupero</span>
                {disdicibile(l)
                  ? <button className="link-btn piccolo" style={{ display: 'block', marginTop: 6 }}
                            disabled={invio} onClick={() => disdici(l)}>disdici</button>
                  : <span className="piccolo muto" style={{ display: 'block', marginTop: 6 }}>disdetta chiusa</span>}
              </>
            )}
            {l.tipo === 'prova' && <span className="tag tag-rosso">prova</span>}
            {l.tipo === 'iscritto' && l.stato_lezione !== 'annullata' && (
              disdicibile(l)
                ? <button className="link-btn piccolo" disabled={invio} onClick={() => setChiedo(chiave(l))}>Non vengo</button>
                : <span className="piccolo muto">disdetta chiusa</span>
            )}
          </span>
          {chiedo === chiave(l) && (
            <span className="conferma-disdetta">
              <span>Disdici {l.corso} di {giornoLungo(l.inizio).toLowerCase()} alle {ora(l.inizio)}{dati.allievi.length > 1 ? ` per ${l.allievo}` : ''}?</span>
              <span className="azioni">
                <button className="btn btn-primario btn-piccolo" disabled={invio} onClick={() => nonVengo(l)}>{invio ? 'Un attimo…' : 'Sì, disdico'}</button>
                <button className="btn btn-piccolo" onClick={() => setChiedo(null)}>No</button>
              </span>
            </span>
          )}
        </div>
      ))}

      {giaDisdette.length > 0 && (
        <>
          <h2 className="sezione">Lezioni disdette</h2>
          <ul className="elenco">
            {giaDisdette.map((d) => (
              <li key={`${d.lezione_id}-${d.allievo_id}`} className="persona">
                <span>
                  {d.corso}
                  <span className="piccolo muto" style={{ display: 'block' }}>
                    {(() => { const g = giornoLungo(d.inizio); return g.charAt(0).toUpperCase() + g.slice(1); })()} alle {ora(d.inizio)}{dati.allievi.length > 1 ? ` · ${d.allievo}` : ''}
                    {d.credito ? (d.credito_usato ? ' · recupero già usato' : ' · recupero disponibile') : ''}
                  </span>
                </span>
                {!d.credito_usato && (
                  <button className="link-btn piccolo" disabled={invio} onClick={() => ciVengo(d)}>Ci vengo lo stesso</button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {dati.crediti.length > 0 && (
        <>
          <h2 className="sezione">Recuperi da usare</h2>
          <div className="da-fare">
            {dati.crediti.map((c) => (
              <Link key={c.id} href={`/area/recuperi#${c.id}`}>
                <span>
                  <strong style={{ color: 'var(--nero)' }}>{c.corso}</strong>
                  <span className="piccolo muto" style={{ display: 'block' }}>
                    {dati.allievi.length > 1 ? `${c.allievo} · ` : ''}da usare entro il {dataBreve(c.scadenza)}
                  </span>
                </span>
                <span className="conta">›</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {dati.prove.length > 0 && (
        <>
          <h2 className="sezione">Lezioni di prova</h2>
          {dati.prove.map((p, i) => (
            <div key={i} className="scheda-corso" style={{ gridTemplateColumns: '6px 1fr auto' }}>
              <span className="banda" style={{ background: 'var(--nero)' }} />
              <span className="centro">
                <span className="titolo" style={{ display: 'block' }}>{p.corso}</span>
                <span className="riga" style={{ display: 'block' }}>{dataBreve(p.inizio)} alle {ora(p.inizio)} · {p.allievo}</span>
              </span>
              <span className="destra">
                {p.stato === 'in_attesa_pagamento'
                  ? <span className="tag tag-attenzione">da pagare</span>
                  : <span className="tag tag-ok">confermata</span>}
              </span>
            </div>
          ))}
        </>
      )}

      {dati.attese.length > 0 && (
        <>
          <h2 className="sezione">In lista d'attesa</h2>
          <ul className="elenco">
            {dati.attese.map((a) => (
              <li key={a.id} className="persona">
                <span>{a.corso}<span className="piccolo muto" style={{ display: 'block' }}>{a.allievo}</span></span>
                <button className="link-btn piccolo" onClick={() => togliDaAttesa(a)}>esci dalla lista</button>
              </li>
            ))}
          </ul>
          <p className="piccolo muto">Ti avvisiamo per email appena si libera un posto.</p>
        </>
      )}

      <Notifiche />

      <h2 className="sezione">I miei abbonamenti</h2>
      {dati.allievi.map((a) => (
        <div key={a.id} className="scheda" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {a.foto
              ? <img src={a.foto} alt="" className="miniatura" />
              : <span className="miniatura segnaposto">{(a.nome[0] || '') + (a.cognome[0] || '')}</span>}
            <div>
              <strong style={{ color: 'var(--nero)' }}>{a.nome} {a.cognome}</strong>
              <div className="piccolo muto">
                {a.certificato_ok
                  ? `certificato valido fino al ${dataBreve(a.certificato_scadenza)}`
                  : 'certificato da sistemare'}
              </div>
            </div>
          </div>
          <ul className="elenco" style={{ marginTop: 10 }}>
            {(a.iscrizioni || []).map((i, k) => (
              <li key={k} className="persona">
                <span>
                  {i.corso}
                  <span className="piccolo muto" style={{ display: 'block' }}>
                    fino al {dataBreve(i.al)}{i.stato === 'sospesa' ? ' · sospeso' : ''}
                  </span>
                </span>
                {new Date(i.al) < new Date(Date.now() + 15 * 86400000) && <span className="tag tag-attenzione">in scadenza</span>}
              </li>
            ))}
            {(a.iscrizioni || []).length === 0 && <li className="persona"><span className="muto">Nessun abbonamento attivo.</span></li>}
          </ul>
        </div>
      ))}

      {dati.avvisi.length > 0 && (
        <>
          <h2 className="sezione">Dalla scuola</h2>
          {dati.avvisi.map((a, i) => (
            <div key={i} className="avviso-card">
              <h3>{a.titolo}</h3>
              <p>{a.testo}</p>
            </div>
          ))}
        </>
      )}

      {dati.eventi.length > 0 && (
        <>
          <h2 className="sezione">Prossimi eventi</h2>
          <p className="piccolo" style={{ marginTop: -4 }}><Link href="/area/eventi">Vedi tutti e iscriviti</Link></p>
          {dati.eventi.map((e, i) => (
            <div key={i} className="scheda-corso" style={{ gridTemplateColumns: '6px 1fr' }}>
              <span className="banda" style={{ background: 'var(--nero)' }} />
              <span className="centro">
                <span className="titolo">{e.titolo}</span>
                <span className="riga">{dataBreve(e.inizio)} · {ora(e.inizio)}{e.luogo ? ` · ${e.luogo}` : ''}</span>
              </span>
            </div>
          ))}
        </>
      )}

      <p style={{ marginTop: 28 }}>
        <button className="link-btn" onClick={esci}>Esci dall'area</button>
      </p>
    </>
  );
}
