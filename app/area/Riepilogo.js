'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import InstallaApp from './InstallaApp';
import { ora, dataBreve, giornoLungo } from '@/lib/formato';
import Notifiche from './Notifiche';
import CaricaCertificato from '../CaricaCertificato';

const MOTIVI_DISDETTA = {
  troppo_tardi: 'Ormai è tardi: si può disdire solo fino a qualche ora prima della lezione.',
  lezione_gia_iniziata: 'La lezione è già iniziata.',
  gia_disdetta: 'Questa lezione era già disdetta.',
  credito_gia_usato: 'Il recupero di questa lezione è già stato usato: non si può tornare indietro.',
  lezione_al_completo: 'Nel frattempo il posto è stato preso: la lezione è al completo.',
  lezione_sovrapposta: 'A quell\'ora hai già un\'altra lezione: disdici quella prima, se vuoi cambiare.',
};
const motivo = (e, base) => MOTIVI_DISDETTA[Object.keys(MOTIVI_DISDETTA).find((k) => e?.message?.includes(k))] || base;

export default function Riepilogo({ dati, materiali = [], inVerifica = [], aspetto = {}, chiediConsenso = false, moduliDaFirmare = 0, disdette = {} }) {
  const router = useRouter();
  const [chiedo, setChiedo] = useState(null);   // lezione su cui si sta confermando "Cancella prenotazione"
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

  // "Cancella prenotazione" su un recupero o su una lezione prenotata con gli ingressi
  async function cancellaPrenotata(l) {
    setInvio(true); setErrore(''); setAvviso(''); setChiedo(null);
    const { data, error } = await supabaseBrowser().rpc('cancella_prenotazione', { p_prenotazione: l.prenotazione_id });
    setInvio(false);
    if (error) { setErrore(motivo(error, 'Non è stato possibile cancellare. Riprova tra poco.')); router.refresh(); return; }
    setAvviso(data === 'recupero' ? 'Prenotazione cancellata! Il recupero è di nuovo disponibile.' : 'Prenotazione cancellata!');
    router.refresh();
  }

  async function nonVengo(l) {
    setInvio(true); setErrore(''); setAvviso('');
    const { data, error } = await supabaseBrowser().rpc('disdici_lezione', { p_lezione: l.lezione_id, p_allievo: l.allievo_id });
    setInvio(false); setChiedo(null);
    if (error) { setErrore(motivo(error, 'Non è stato possibile disdire. Riprova tra poco.')); router.refresh(); return; }
    setAvviso(data?.credito
      ? `Prenotazione cancellata! Hai un recupero da usare entro il ${dataBreve(data.scadenza)}.`
      : 'Prenotazione cancellata!');
    router.refresh();
  }

  async function ciVengo(d) {
    setInvio(true); setErrore(''); setAvviso('');
    const { error } = await supabaseBrowser().rpc('ripristina_lezione', { p_lezione: d.lezione_id, p_allievo: d.allievo_id });
    setInvio(false);
    if (error) { setErrore(motivo(error, 'Non è stato possibile. Riprova tra poco.')); return; }
    setAvviso('Prenotazione confermata! Ti aspettiamo a lezione.');
    router.refresh();
  }

  async function togliDaAttesa(a) {
    if (!confirm(`Toglierti dalla lista d'attesa di ${a.corso}?`)) return;
    const { error } = await supabaseBrowser().rpc('esci_dalla_coda', { p_id: a.id });
    if (error) { alert('Non riuscito. Riprova.'); return; }
    router.refresh();
  }

  // date brevi per il telefono: "Gio 15/10"
  const giornoCorto = (iso) => {
    const d = new Date(iso);
    const g = d.toLocaleDateString('it-IT', { weekday: 'short', timeZone: 'Europe/Rome' }).replace('.', '');
    return `${g.charAt(0).toUpperCase()}${g.slice(1)} ${d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' })}`;
  };
  const [tutte, setTutte] = useState(false);
  const [vediDisdette, setVediDisdette] = useState(false);
  const [leggiTutto, setLeggiTutto] = useState(false);
  const senzaAbbonamento = dati.allievi.every((a) => !(a.iscrizioni || []).length);
  const piu = dati.allievi.length > 1;
  const daMostrare = tutte ? prossime : prossime.slice(0, 5);
  // recuperi raggruppati per persona: un riquadro e un pulsante solo
  const recuperiPer = dati.allievi.map((a) => {
    const c = dati.crediti.filter((x) => x.allievo_id === a.id);
    return { allievo: a, n: c.length, scade: c.map((x) => x.scadenza).sort()[0] };
  }).filter((x) => x.n > 0);

  return (
    <div className="area-casa">
      <div className="ac-testa">
        <h1>Ciao {dati.titolare.nome}</h1>
      </div>

      {senzaAbbonamento && (
        <Link prefetch={false} href="/area/acquista" className="ac-avviso rosso ac-compra">
          <span><strong>Non hai un abbonamento attivo</strong> · scegli il tuo e prenota le lezioni</span>
          <span className="btn btn-piccolo btn-primario">Acquista</span>
        </Link>
      )}

      {/* benvenuto e informazioni della scuola: chiuso, si apre quando serve */}
      {aspetto.benvenuto && (
        <section className={`ac-benvenuto${leggiTutto ? ' aperto' : ''}`}>
          <strong>Benvenuto e informazioni</strong>
          <p>{aspetto.benvenuto}</p>
          <button type="button" className="link-btn piccolo" onClick={() => setLeggiTutto(!leggiTutto)}>{leggiTutto ? 'Chiudi' : 'Leggi tutto'}</button>
        </section>
      )}

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="avviso-ok" role="status">{avviso}</div>}

      {/* cose da fare: una riga ciascuna, si toccano */}
      {(moduliDaFirmare > 0 || daSistemare.length > 0 || consenso || aspetto.avviso) && (
        <div className="ac-avvisi">
          {moduliDaFirmare > 0 && (
            <Link prefetch={false} href="/area/moduli" className="ac-avviso rosso">
              <span><strong>{moduliDaFirmare === 1 ? 'Un modulo da firmare' : `${moduliDaFirmare} moduli da firmare`}</strong> · si firmano col dito</span>
              <span aria-hidden="true">›</span>
            </Link>
          )}
          {daSistemare.length > 0 && (
            <div className="ac-avviso rosso ac-certificato">
              <strong>Certificato medico da sistemare</strong>
              {daSistemare.map((a) => {
                const inviato = inVerifica.find((c) => c.allievo_id === a.id);
                return (
                  <div key={a.id} className="piccolo">
                    {a.nome}: {inviato
                      ? <span style={{ color: 'var(--ok)' }}>inviato, la segreteria lo sta controllando</span>
                      : <>{a.certificato_scadenza ? `scaduto il ${dataBreve(a.certificato_scadenza)}` : 'da consegnare'}
                          <CaricaCertificato token={a.token} nome={a.nome}
                            onFatto={() => { setAvviso('Certificato inviato: la segreteria lo controlla.'); router.refresh(); }} /></>}
                  </div>
                );
              })}
            </div>
          )}
          {consenso && (
            <div className="ac-avviso">
              <span className="piccolo"><strong>Novità e promozioni?</strong> Poche email, cambi idea quando vuoi.</span>
              <span className="ac-si-no">
                <button className="btn btn-piccolo btn-primario" onClick={() => rispondiConsenso(true)}>Sì</button>
                <button className="btn btn-piccolo" onClick={() => rispondiConsenso(false)}>No</button>
              </span>
            </div>
          )}
          {aspetto.avviso && <div className="ac-avviso piccolo" style={{ whiteSpace: 'pre-line' }}>{aspetto.avviso}</div>}
        </div>
      )}

      <InstallaApp compatto />

      {materiali.length > 0 && (
        <section className="ac-sezione">
          <h2>Per la lezione di oggi</h2>
          {materiali.map((m) => (
            <div key={m.id} className="ac-avviso">
              <span className="piccolo"><strong>{m.titolo}</strong> · {m.corso} {ora(m.inizio)}{m.testo ? ` — ${m.testo}` : ''}</span>
              {m.url && <a className="btn btn-piccolo" href={m.url} target="_blank" rel="noreferrer">{m.tipo === 'video' ? 'Video' : 'Apri'}</a>}
            </div>
          ))}
        </section>
      )}

      <section className="ac-sezione">
        <h2>Prossime lezioni</h2>
        {prossime.length === 0
          ? <div className="vuoto">Nessuna lezione nei prossimi giorni.</div>
          : <p className="ac-nota">Non puoi venire? "Cancella prenotazione" fino a {ore} {ore === 1 ? 'ora' : 'ore'} prima: ti diamo un recupero.</p>}
        <ul className="ac-lezioni">
          {daMostrare.map((l) => (
            <li key={chiave(l)} className={l.stato_lezione === 'annullata' ? 'annullata' : ''}>
              <span className="ac-banda" style={{ background: l.colore || 'var(--rosso)' }} />
              <span className="ac-quando"><strong>{ora(l.inizio)}</strong><span>{giornoCorto(l.inizio)}</span></span>
              <span className="ac-cosa">
                <strong>{l.corso}</strong>
                <span>{[piu && l.allievo, l.sala].filter(Boolean).join(' · ')}</span>
                {l.stato_lezione === 'annullata' && <span className="tag tag-rosso">annullata</span>}
                {l.tipo === 'prova' && <span className="tag tag-rosso">prova</span>}
                {l.tipo === 'recupero' && <span className="tag tag-neutro">recupero</span>}
              </span>
              <span className="ac-azione">
                {l.stato_lezione !== 'annullata' && l.tipo !== 'prova' && (l.tipo === 'iscritto' || l.prenotazione_id) && (disdicibile(l)
                  ? <button className="link-btn piccolo ac-cancella" disabled={invio} onClick={() => setChiedo(chiave(l))}><span>Cancella</span> <span>prenotazione</span></button>
                  : <span className="piccolo muto">non più cancellabile</span>)}
              </span>
              {chiedo === chiave(l) && (
                <span className="conferma-disdetta">
                  <span>Cancellare la prenotazione di {l.corso}, {giornoLungo(l.inizio).toLowerCase()} alle {ora(l.inizio)}{piu ? ` per ${l.allievo}` : ''}?</span>
                  <span className="azioni">
                    <button className="btn btn-primario btn-piccolo" disabled={invio}
                            onClick={() => (l.tipo === 'iscritto' ? nonVengo(l) : cancellaPrenotata(l))}>{invio ? 'Un attimo…' : 'Sì, cancella'}</button>
                    <button className="btn btn-piccolo" onClick={() => setChiedo(null)}>No</button>
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
        <Link prefetch={false} href="/area/recuperi" className="btn btn-primario ac-prenota">+ Prenota una lezione</Link>
        {prossime.length > 5 && (
          <button className="link-btn piccolo ac-altre" onClick={() => setTutte(!tutte)}>
            {tutte ? 'Mostra meno' : `Mostra tutte (${prossime.length})`}
          </button>
        )}
      </section>

      {recuperiPer.length > 0 && (
        <section className="ac-sezione">
          <h2>Recuperi da usare</h2>
          {recuperiPer.map((r) => (
            <Link prefetch={false} key={r.allievo.id} href="/area/recuperi" className="ac-recupero">
              <span>
                <strong>{r.n} {r.n === 1 ? 'recupero' : 'recuperi'}{piu ? ` · ${r.allievo.nome}` : ''}</strong>
                <span className="piccolo">entro il {dataBreve(r.scade)}</span>
              </span>
              <span className="btn btn-piccolo btn-primario">Prenota</span>
            </Link>
          ))}
        </section>
      )}

      {giaDisdette.length > 0 && (
        <section className="ac-sezione">
          <button type="button" className="ac-apri" aria-expanded={vediDisdette} onClick={() => setVediDisdette(!vediDisdette)}>
            Prenotazioni cancellate <span className="muto">({giaDisdette.length})</span> <span aria-hidden="true">{vediDisdette ? '▴' : '▾'}</span>
          </button>
          {vediDisdette && (
            <ul className="ac-lezioni ac-disdette">
              {giaDisdette.map((d) => (
                <li key={`${d.lezione_id}-${d.allievo_id}`}>
                  <span className="ac-banda" style={{ background: 'var(--linea)' }} />
                  <span className="ac-quando"><strong>{ora(d.inizio)}</strong><span>{giornoCorto(d.inizio)}</span></span>
                  <span className="ac-cosa">
                    <strong>{d.corso}</strong>
                    <span>{[piu && d.allievo, d.credito ? (d.credito_usato ? 'recupero già usato' : 'recupero disponibile') : null].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="ac-azione">
                    {!d.credito_usato && <button className="link-btn piccolo" disabled={invio} onClick={() => ciVengo(d)}>Riprenota</button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {dati.prove.length > 0 && (
        <section className="ac-sezione">
          <h2>Lezioni di prova</h2>
          <ul className="ac-lezioni">
            {dati.prove.map((p, i) => (
              <li key={i}>
                <span className="ac-banda" style={{ background: 'var(--nero)' }} />
                <span className="ac-quando"><strong>{ora(p.inizio)}</strong><span>{giornoCorto(p.inizio)}</span></span>
                <span className="ac-cosa"><strong>{p.corso}</strong><span>{p.allievo}</span></span>
                <span className="ac-azione">
                  {p.stato === 'in_attesa_pagamento' ? <span className="tag tag-attenzione">da pagare</span> : <span className="tag tag-ok">confermata</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dati.attese.length > 0 && (
        <section className="ac-sezione">
          <h2>In lista d'attesa</h2>
          <ul className="elenco">
            {dati.attese.map((a) => (
              <li key={a.id} className="persona">
                <span>{a.corso}{a.lezione ? ` · ${giornoCorto(a.lezione)} alle ${new Date(a.lezione).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}` : ''}
                  <span className="piccolo muto" style={{ display: 'block' }}>{a.allievo} · {a.stato === 'avvisato' ? 'si è liberato un posto: prenotalo prima che lo prenda un altro' : 'ti avvisiamo appena si libera un posto'}</span></span>
                <button className="link-btn piccolo" onClick={() => togliDaAttesa(a)}>esci</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Notifiche />

      <section className="ac-sezione">
        <h2>{piu ? 'Abbonamenti' : 'Il mio abbonamento'}</h2>
        <ul className="ac-abbonamenti">
          {dati.allievi.map((a) => (
            <li key={a.id}>
              {piu && <strong className="ac-chi">{a.nome}</strong>}
              {(a.iscrizioni || []).map((i, k) => {
                const presto = new Date(i.al) < new Date(Date.now() + 15 * 86400000);
                return (
                  <span key={k} className="ac-abb">
                    <span>{i.corso}</span>
                    <span className={presto ? 'ac-scade' : 'muto'}>{i.stato === 'sospesa' ? 'sospeso · ' : ''}fino al {dataBreve(i.al)}</span>
                  </span>
                );
              })}
              {(a.iscrizioni || []).length === 0 && <span className="ac-abb"><span className="muto">Nessun abbonamento attivo</span></span>}
              <span className={`ac-cert piccolo${a.certificato_ok ? '' : ' rosso'}`}>
                {a.certificato_ok ? `Certificato fino al ${dataBreve(a.certificato_scadenza)}` : 'Certificato da sistemare'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {dati.avvisi.length > 0 && (
        <section className="ac-sezione">
          <h2>Dalla scuola</h2>
          {dati.avvisi.map((a, i) => (
            <div key={i} className="ac-avviso"><span className="piccolo"><strong>{a.titolo}</strong> — {a.testo}</span></div>
          ))}
        </section>
      )}

      {dati.eventi.length > 0 && (
        <section className="ac-sezione">
          <h2>Prossimi eventi</h2>
          {dati.eventi.slice(0, 3).map((e, i) => (
            <Link prefetch={false} key={i} href="/area/eventi" className="ac-recupero">
              <span><strong>{e.titolo}</strong><span className="piccolo">{giornoCorto(e.inizio)} · {ora(e.inizio)}{e.luogo ? ` · ${e.luogo}` : ''}</span></span>
              <span aria-hidden="true">›</span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
