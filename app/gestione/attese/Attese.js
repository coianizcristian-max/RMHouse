'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, ora } from '@/lib/formato';
import Aggiungi from './Aggiungi';

const STATI = [['in_attesa', 'In coda'], ['avvisato', 'Avvisati'], ['chiuso', 'Chiusi']];

export default function Attese({ righe, conta, corsi, stato }) {
  const router = useRouter();
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);

  const wa = (t) => `https://wa.me/39${(t || '').replace(/\D/g, '')}`;

  async function avvisa(r) {
    if (!confirm(`Avvisare ${r.nome} ${r.cognome} che si è liberato un posto in ${r.corso}?`)) return;
    setInvio(true); setErrore(''); setAvviso('');
    const { error } = await supabaseBrowser().rpc('avvisa_attesa', { p_id: r.id });
    setInvio(false);
    if (error) { setErrore('Avviso non riuscito.'); return; }
    setAvviso('Email in partenza entro cinque minuti.');
    router.refresh();
  }

  async function avvisaTutti(corso, nome) {
    if (!confirm(`Avvisare chi è in coda per ${nome}, in ordine di arrivo, in base ai posti liberi?`)) return;
    setInvio(true); setErrore(''); setAvviso('');
    const { data, error } = await supabaseBrowser().rpc('avvisa_attesa_corso', { p_corso: corso, p_quanti: null });
    setInvio(false);
    if (error) { setErrore('Operazione non riuscita.'); return; }
    setAvviso(data > 0 ? `Avvisate ${data} persone.` : 'Nessun posto libero in questo corso.');
    router.refresh();
  }

  async function chiudi(r, esito) {
    const note = esito === 'rinunciato' ? prompt('Perché ha rinunciato? (facoltativo)') : null;
    if (esito === 'rinunciato' && note === null) return;
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('chiudi_attesa', { p_id: r.id, p_esito: esito, p_note: note });
    setInvio(false);
    if (error) { setErrore('Operazione non riuscita.'); return; }
    router.refresh();
  }

  const perCorso = conta.per_corso || [];

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Ogni giorno</div>
        <h1>Liste d'attesa</h1>
        <p>Chi aspetta un posto. Quando qualcuno lascia il corso o disdice una lezione, il primo della coda viene avvisato da solo.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="errore" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>{avviso}</div>}

      <div className="griglia" style={{ marginBottom: 14 }}>
        <div className="tessera tessera-rossa">
          <div className="etichetta">In coda</div>
          <div className="cifra">{conta.in_attesa ?? 0}</div>
          <div className="sotto">{perCorso.length} corsi coinvolti</div>
        </div>
        <Link className="tessera" href="/gestione/attese?stato=avvisato">
          <div className="etichetta">Avvisati</div>
          <div className="cifra">{conta.avvisati ?? 0}</div>
          <div className="sotto">{conta.da_richiamare ?? 0} da più di 3 giorni</div>
        </Link>
      </div>

      {perCorso.length > 0 && stato === 'in_attesa' && (
        <>
          <h2 className="sezione">Code aperte</h2>
          <div className="da-fare">
            {perCorso.map((c) => {
              const corso = corsi.find((x) => x.nome === c.corso);
              const liberi = righe.find((r) => r.corso === c.corso)?.posti_corso ?? 0;
              return (
                <a key={c.corso} href="#" onClick={(e) => { e.preventDefault(); corso && avvisaTutti(corso.id, c.corso); }}>
                  <span>
                    <strong style={{ color: 'var(--nero)' }}>{c.corso}</strong>
                    <span className="piccolo muto" style={{ display: 'block' }}>
                      {c.quanti} in coda · {liberi > 0 ? `${liberi} posti liberi: tocca per avvisarli` : 'corso pieno'}
                    </span>
                  </span>
                  <span className={liberi > 0 ? 'conta' : 'conta'}>{liberi > 0 ? 'avvisa' : c.quanti}</span>
                </a>
              );
            })}
          </div>
        </>
      )}

      <h2 className="sezione">Persone</h2>
      <Aggiungi corsi={corsi} />

      <div className="filtri">
        {STATI.map(([k, l]) => (
          <Link key={k} href={`/gestione/attese?stato=${k}`} aria-current={stato === k ? 'true' : undefined}>{l}</Link>
        ))}
      </div>

      {righe.length === 0 && <div className="vuoto">Nessuno in questo elenco.</div>}

      {righe.map((r) => (
        <div key={r.id} className="scheda-corso" style={{ gridTemplateColumns: '6px 1fr', alignItems: 'start' }}>
          <span className="banda" style={{ background: r.colore || 'var(--rosso)' }} />
          <span className="centro" style={{ paddingRight: 14 }}>
            <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Link className="titolo" href={`/gestione/persone/${r.allievo_id}`} style={{ textDecoration: 'none' }}>
                {r.cognome} {r.nome}
              </Link>
              {r.stato === 'in_attesa' && <span className="tag tag-neutro">{r.posizione}ª in coda</span>}
              {r.stato === 'avvisato' && <span className="tag tag-attenzione">avvisato il {dataBreve(r.avvisato_at)}</span>}
              {r.esito && <span className="tag tag-ok">{r.esito}</span>}
              {r.gia_iscritto && <span className="tag tag-ok">già iscritto</span>}
            </span>

            <span className="riga">
              {r.corso}
              {r.lezione_inizio && ` · lezione del ${dataBreve(r.lezione_inizio)} alle ${ora(r.lezione_inizio)}`}
              {` · in coda dal ${dataBreve(r.created_at)}`}
              {r.posti_corso > 0 && ` · ${r.posti_corso} posti liberi ora`}
            </span>
            <span className="riga">{[r.telefono, r.email].filter(Boolean).join(' · ')}</span>
            {r.note && <span className="riga">“{r.note}”</span>}

            {r.stato !== 'chiuso' && (
              <span className="azioni-riga">
                <button className="link-btn piccolo" disabled={invio} onClick={() => avvisa(r)}>
                  {r.stato === 'avvisato' ? 'Riavvisa' : 'Avvisa: posto libero'}
                </button>
                {r.telefono && <a className="link-btn piccolo" href={wa(r.telefono)} target="_blank" rel="noreferrer">WhatsApp</a>}
                <Link className="link-btn piccolo" href={`/gestione/persone/${r.allievo_id}`}>Iscrivilo</Link>
                <button className="link-btn piccolo" disabled={invio} onClick={() => chiudi(r, 'iscritto')}>Si è iscritto</button>
                <button className="link-btn piccolo pericolo" disabled={invio} onClick={() => chiudi(r, 'rinunciato')}>Ha rinunciato</button>
              </span>
            )}
          </span>
        </div>
      ))}
    </>
  );
}
