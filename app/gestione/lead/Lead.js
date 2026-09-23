'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, ora, euro, etaAl, STATI_LEAD } from '@/lib/formato';

const VISTE = [
  ['da_seguire', 'Da seguire', 'da_seguire'],
  ['da_richiamare', 'Da richiamare', 'da_richiamare'],
  ['prova_prenotata', 'Prova prenotata', 'prova_prenotata'],
  ['iscritti', 'Iscritti', 'iscritti'],
  ['persi', 'Non convertiti', 'persi'],
];
const CANALI = [['whatsapp', 'WhatsApp'], ['telefono', 'Telefono'], ['email', 'Email'], ['di_persona', 'Di persona']];
const ESITI = [
  ['sentito', 'Sentito'],
  ['non_risponde', 'Non risponde'],
  ['richiamare', 'Da richiamare'],
  ['non_interessato', 'Non interessato'],
];

export default function Lead({ righe, conta, vista }) {
  const router = useRouter();
  const [apri, setApri] = useState(null);
  const [f, setF] = useState({ canale: 'whatsapp', esito: 'sentito', testo: '', prossimo: '' });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const wa = (t) => `https://wa.me/39${(t || '').replace(/\D/g, '')}`;

  function apriContatto(r, canale) {
    setF({ canale, esito: 'sentito', testo: '', prossimo: '' });
    setApri(r.id); setErrore('');
  }

  async function salvaContatto(e, r) {
    e.preventDefault();
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('segna_contatto', {
      p_allievo: r.id, p_canale: f.canale, p_esito: f.esito,
      p_testo: f.testo || null, p_prossimo: f.prossimo || null,
    });
    setInvio(false);
    if (error) { setErrore('Non è stato possibile salvare il contatto.'); return; }
    setApri(null); router.refresh();
  }

  async function stato(r, nuovo) {
    let motivo = null;
    if (nuovo === 'perso') {
      motivo = prompt('Perché non si è iscritto? (resta nelle statistiche)');
      if (motivo === null) return;
    } else if (!confirm(`Segnare ${r.nome} ${r.cognome} come ${STATI_LEAD[nuovo] || nuovo}?`)) return;

    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('cambia_stato_lead', {
      p_allievo: r.id, p_stato: nuovo, p_motivo: motivo,
    });
    setInvio(false);
    if (error) { setErrore('Operazione non riuscita.'); return; }
    router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Ogni giorno</div>
        <h1>Lead</h1>
        <p>Chi ha chiesto informazioni o provato: chiamali, segna com'è andata, decidi il prossimo passo.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="griglia" style={{ marginBottom: 14 }}>
        <Link className="tessera tessera-rossa" href="/gestione/lead?vista=da_richiamare">
          <div className="etichetta">Da richiamare oggi</div>
          <div className="cifra">{conta.da_richiamare ?? 0}</div>
          <div className="sotto">promemoria scaduti</div>
        </Link>
        <Link className="tessera" href="/gestione/lead?vista=da_seguire">
          <div className="etichetta">Da seguire</div>
          <div className="cifra">{conta.da_seguire ?? 0}</div>
          <div className="sotto">{conta.mai_contattati ?? 0} mai contattati</div>
        </Link>
        <Link className="tessera" href="/gestione/lead?vista=prova_prenotata">
          <div className="etichetta">Prova prenotata</div>
          <div className="cifra">{conta.prova_prenotata ?? 0}</div>
          <div className="sotto">in arrivo</div>
        </Link>
        <div className="tessera tessera-nera">
          <div className="etichetta">Convertiti</div>
          <div className="cifra">{conta.iscritti ?? 0}</div>
          <div className="sotto">{conta.persi ?? 0} non convertiti</div>
        </div>
      </div>

      <div className="filtri">
        {VISTE.map(([k, l]) => (
          <Link key={k} href={`/gestione/lead?vista=${k}`} aria-current={vista === k ? 'true' : undefined}>{l}</Link>
        ))}
      </div>

      {righe.length === 0 && <div className="vuoto">Nessuno in questo elenco.</div>}

      {righe.map((r) => {
        const scaduto = r.prossimo_contatto && r.prossimo_contatto <= new Date().toLocaleDateString('sv-SE');
        return (
          <div key={r.id} className="scheda-corso" style={{ gridTemplateColumns: '6px 1fr', alignItems: 'start' }}>
            <span className="banda" style={{ background: scaduto ? 'var(--rosso)' : 'var(--nero)' }} />
            <span className="centro" style={{ paddingRight: 14 }}>
              <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <Link className="titolo" href={`/gestione/persone/${r.id}`} style={{ textDecoration: 'none' }}>
                  {r.cognome} {r.nome}
                </Link>
                {r.data_nascita && <span className="piccolo muto">{etaAl(r.data_nascita)} anni</span>}
                <span className={`tag ${r.stato_lead === 'iscritto' ? 'tag-ok' : r.stato_lead === 'perso' ? 'tag-neutro' : 'tag-tenue'}`}>
                  {STATI_LEAD[r.stato_lead]}
                </span>
                {r.prova?.da_pagare_cent > 0 && <span className="tag tag-attenzione">{euro(r.prova.da_pagare_cent)} da incassare</span>}
                {scaduto && <span className="tag tag-rosso">da richiamare</span>}
              </span>

              <span className="riga">
                {!r.is_titolare && r.titolare_nome && `Genitore: ${r.titolare_nome} ${r.titolare_cognome} · `}
                {r.telefono} · {r.email}
                {r.fonte && ` · arrivato da ${r.fonte}`}
              </span>

              {r.prova && (
                <span className="riga">
                  Prova: {r.prova.corso}, {dataBreve(r.prova.inizio)} alle {ora(r.prova.inizio)} ({r.prova.stato})
                </span>
              )}

              {r.ultimo_contatto && (
                <span className="riga">
                  Ultimo contatto {dataBreve(r.ultimo_contatto)}
                  {r.contatti > 1 && ` (${r.contatti} in tutto)`}
                  {r.ultima_nota && ` · “${r.ultima_nota}”`}
                </span>
              )}
              {r.prossimo_contatto && (
                <span className="riga" style={{ color: scaduto ? 'var(--rosso)' : undefined }}>
                  Da richiamare il {dataBreve(r.prossimo_contatto)}
                </span>
              )}

              <span className="azioni-riga">
                {r.telefono && <a className="link-btn piccolo" href={wa(r.telefono)} target="_blank" rel="noreferrer">WhatsApp</a>}
                {r.telefono && <a className="link-btn piccolo" href={`tel:${r.telefono}`}>Chiama</a>}
                {r.email && <a className="link-btn piccolo" href={`mailto:${r.email}`}>Email</a>}
                <button className="link-btn piccolo" onClick={() => apriContatto(r, 'whatsapp')}>Segna contatto</button>
                {r.stato_lead !== 'iscritto' && (
                  <button className="link-btn piccolo" onClick={() => stato(r, 'iscritto')}>Si è iscritto</button>
                )}
                {r.stato_lead !== 'perso' && (
                  <button className="link-btn piccolo pericolo" onClick={() => stato(r, 'perso')}>Non convertito</button>
                )}
                {r.stato_lead === 'perso' && (
                  <button className="link-btn piccolo" onClick={() => stato(r, 'nuovo')}>Riprova</button>
                )}
              </span>

              {apri === r.id && (
                <form onSubmit={(e) => salvaContatto(e, r)} className="scheda" style={{ marginTop: 12 }}>
                  <div className="riga-2">
                    <div className="campo">
                      <label htmlFor={`c-${r.id}`}>Come</label>
                      <select id={`c-${r.id}`} value={f.canale} onChange={set('canale')}>
                        {CANALI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div className="campo">
                      <label htmlFor={`e-${r.id}`}>Com'è andata</label>
                      <select id={`e-${r.id}`} value={f.esito} onChange={set('esito')}>
                        {ESITI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="campo">
                    <label htmlFor={`t-${r.id}`}>Nota</label>
                    <input id={`t-${r.id}`} value={f.testo} onChange={set('testo')}
                           placeholder="Es. chiede il mercoledì, richiamare dopo le 18" />
                  </div>
                  <div className="campo">
                    <label htmlFor={`p-${r.id}`}>Richiamare il</label>
                    <input id={`p-${r.id}`} type="date" value={f.prossimo} onChange={set('prossimo')} />
                    <span className="piccolo muto">Lascia vuoto se non serve richiamarlo.</span>
                  </div>
                  <div className="azioni">
                    <button className="btn btn-primario" disabled={invio}>Salva il contatto</button>
                    <button type="button" className="btn" onClick={() => setApri(null)}>Annulla</button>
                  </div>
                </form>
              )}
            </span>
          </div>
        );
      })}
    </>
  );
}
