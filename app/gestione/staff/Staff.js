'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { RUOLI } from './SchedaStaff';

export default function Staff({ persone, orari, archiviati, salvato = null }) {
  const router = useRouter();
  const [errore, setErrore] = useState('');
  const [copiato, setCopiato] = useState(null);
  const [cerca, setCerca] = useState('');
  const [ruolo, setRuolo] = useState('');
  const [accesso, setAccesso] = useState('');
  const [vista, setVista] = useState('schede');

  // la vista scelta (schede o elenco) resta per la prossima volta
  useEffect(() => { try { const v = localStorage.getItem('staff-vista'); if (v) setVista(v); } catch {} }, []);
  function cambiaVista(v) { setVista(v); try { localStorage.setItem('staff-vista', v); } catch {} }

  // Indirizzo personale da abbonare su Google Calendar o iPhone
  async function copiaCalendario(p) {
    const url = `${window.location.origin}/api/calendario/${p.token}`;
    try { await navigator.clipboard.writeText(url); } catch { prompt('Copia questo indirizzo:', url); }
    setCopiato(p.id);
    setTimeout(() => setCopiato(null), 2500);
  }

  const corsiDi = (id) => [...new Set(orari.filter((o) => o.insegnante_id === id).map((o) => o.corsi?.nome).filter(Boolean))];

  const testo = cerca.trim().toLowerCase();
  const visibili = persone.filter((p) =>
    (!ruolo || p.ruolo === ruolo) &&
    (!accesso || (accesso === 'con' ? !!p.user_id : !p.user_id)) &&
    (!testo || [p.nome, p.cognome, p.specialita, p.email, ...corsiDi(p.id)].filter(Boolean).join(' ').toLowerCase().includes(testo)));
  const quanti = (r) => persone.filter((p) => p.ruolo === r).length;
  const filtrato = testo || ruolo || accesso;

  async function archivia(p, valore) {
    const { error } = await supabaseBrowser().from('staff').update({ archiviato: valore }).eq('id', p.id);
    if (error) { setErrore('Operazione non riuscita.'); return; }
    router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Struttura</div>
        <h1>Staff</h1>
        <p>Insegnanti e segreteria: foto, specialità e colore con cui appaiono in calendario.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="filtri">
        <Link prefetch={false} href="/gestione/staff" aria-current={!archiviati ? 'true' : undefined}>In forza</Link>
        <Link prefetch={false} href="/gestione/staff?archiviati=1" aria-current={archiviati ? 'true' : undefined}>Archiviati</Link>
      </div>

      <Link prefetch={false} className="btn btn-primario" href="/gestione/staff/nuovo">Aggiungi persona</Link>
      {salvato && persone.some((p) => p.id === salvato) && (
        <div className="avviso-ok" role="status" style={{ marginTop: 14 }}>
          Scheda di {persone.find((p) => p.id === salvato).nome} salvata ✓
        </div>
      )}

      {persone.length > 0 && (
        <div className="filtri-persone filtri-staff">
          <input type="search" placeholder="Cerca nome, specialità o corso" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca nello staff" />
          <select value={ruolo} onChange={(e) => setRuolo(e.target.value)} aria-label="Ruolo" className={ruolo ? 'scelto' : ''}>
            <option value="">Tutti i ruoli ({persone.length})</option>
            {Object.entries(RUOLI).filter(([v]) => quanti(v) > 0).map(([v, l]) => <option key={v} value={v}>{l} ({quanti(v)})</option>)}
          </select>
          <select value={accesso} onChange={(e) => setAccesso(e.target.value)} aria-label="Accesso all'app" className={accesso ? 'scelto' : ''}>
            <option value="">Accesso: tutti</option>
            <option value="con">Entrano nell'app ({persone.filter((p) => p.user_id).length})</option>
            <option value="senza">Senza accesso ({persone.filter((p) => !p.user_id).length})</option>
          </select>
          <div className="segmenti segmenti-piccoli" role="group" aria-label="Vista">
            <button type="button" aria-pressed={vista === 'schede'} onClick={() => cambiaVista('schede')}>Schede</button>
            <button type="button" aria-pressed={vista === 'elenco'} onClick={() => cambiaVista('elenco')}>Elenco</button>
          </div>
          <span className="piccolo muto">
            {filtrato ? `${visibili.length} di ${persone.length}` : `${persone.length} persone`}
            {filtrato && <> · <button type="button" className="link-btn piccolo" onClick={() => { setCerca(''); setRuolo(''); setAccesso(''); }}>togli i filtri</button></>}
          </span>
        </div>
      )}

      {persone.length === 0 && (
        <div className="vuoto" style={{ marginTop: 16 }}>{archiviati ? 'Nessuno in archivio.' : 'Ancora nessuno.'}</div>
      )}
      {persone.length > 0 && visibili.length === 0 && <div className="vuoto">Nessuno con questi filtri.</div>}

      {vista === 'elenco' && visibili.length > 0 && (
        <ul className="elenco elenco-staff">
          {visibili.map((p) => (
            <li key={p.id} className={salvato === p.id ? 'appena-salvata' : ''}>
              <span className="pallino-staff" style={{ background: p.colore || 'var(--rosso)' }} aria-hidden="true" />
              <Link prefetch={false} href={`/gestione/staff/${p.id}`} className="es-nome">{p.nome} {p.cognome}</Link>
              <span className="es-ruolo piccolo muto">{[RUOLI[p.ruolo], p.specialita].filter(Boolean).join(' · ')}</span>
              <span className="es-corsi piccolo muto">{corsiDi(p.id).join(', ')}</span>
              <span className="es-segni">
                {!p.attivo && <span className="tag tag-neutro">non attivo</span>}
                {!p.user_id && <span className="tag tag-attenzione">senza accesso</span>}
              </span>
              <Link prefetch={false} href={`/gestione/staff/${p.id}`} className="link-btn piccolo">Modifica</Link>
            </li>
          ))}
        </ul>
      )}

      <div className="griglia-schede" style={{ marginTop: 16, display: vista === 'elenco' ? 'none' : undefined }}>
        {visibili.map((p) => (
          <div key={p.id} className={`scheda-corso${salvato === p.id ? ' appena-salvata' : ''}`}>
            <span className="banda" style={{ background: p.colore || 'var(--rosso)' }} />
            <span className="centro" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {p.foto_url
                ? <img src={p.foto_url} alt="" className="miniatura" />
                : <span className="miniatura segnaposto">{(p.nome[0] || '') + (p.cognome?.[0] || '')}</span>}
              <span style={{ minWidth: 0 }}>
                <Link prefetch={false} className="titolo" href={`/gestione/staff/${p.id}`} style={{ display: 'block' }}>{p.nome} {p.cognome}</Link>
                <span className="riga" style={{ display: 'block' }}>
                  {[RUOLI[p.ruolo], p.specialita, p.collaboratore && 'collaboratore'].filter(Boolean).join(' · ')}
                </span>
                {corsiDi(p.id).length > 0 && (
                  <span className="riga" style={{ display: 'block' }}>{corsiDi(p.id).slice(0, 3).join(', ')}{corsiDi(p.id).length > 3 ? '…' : ''}</span>
                )}
                {(!p.attivo || p.visibilita !== 'pubblico' || !p.user_id) && (
                  <span className="segni-staff">
                    {!p.attivo && <span className="tag tag-neutro">non attivo</span>}
                    {p.visibilita !== 'pubblico' && <span className="tag tag-neutro">{p.visibilita}</span>}
                    {!p.user_id && <span className="tag tag-attenzione">senza accesso</span>}
                  </span>
                )}
                <span className="azioni-riga">
                  <Link prefetch={false} className="link-btn piccolo" href={`/gestione/staff/${p.id}`}>Modifica</Link>
                  <button className="link-btn piccolo" onClick={() => copiaCalendario(p)}>
                    {copiato === p.id ? 'Link copiato' : 'Calendario'}
                  </button>
                  <button className="link-btn piccolo" onClick={() => archivia(p, !archiviati)}>
                    {archiviati ? 'Riporta in forza' : 'Archivia'}
                  </button>
                </span>
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="scheda" style={{ marginTop: 22 }}>
        <strong style={{ color: 'var(--nero)' }}>Calendario sul telefono</strong>
        <p className="piccolo muto" style={{ marginTop: 4, marginBottom: 0 }}>
          Il pulsante "Calendario" copia l'indirizzo personale dell'insegnante. Lui lo incolla una volta sola in
          Google Calendar (Altri calendari → Da URL) oppure su iPhone (Impostazioni → Calendario → Account →
          Aggiungi account → Altro → Aggiungi calendario con abbonamento): da quel momento le sue lezioni
          compaiono e si aggiornano da sole, anche quando sposti un orario.
        </p>
      </div>

      <p className="piccolo muto" style={{ marginTop: 18 }}>
        Per far accedere una persona all'app serve anche creare il suo utente in Supabase
        (Authentication → Users) e collegarlo a questa scheda.
      </p>
    </>
  );
}
