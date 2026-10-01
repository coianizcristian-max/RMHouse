'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { RUOLI } from './SchedaStaff';

export default function Staff({ persone, orari, archiviati, salvato = null }) {
  const router = useRouter();
  const [errore, setErrore] = useState('');
  const [copiato, setCopiato] = useState(null);

  // Indirizzo personale da abbonare su Google Calendar o iPhone
  async function copiaCalendario(p) {
    const url = `${window.location.origin}/api/calendario/${p.token}`;
    try { await navigator.clipboard.writeText(url); } catch { prompt('Copia questo indirizzo:', url); }
    setCopiato(p.id);
    setTimeout(() => setCopiato(null), 2500);
  }

  const corsiDi = (id) => [...new Set(orari.filter((o) => o.insegnante_id === id).map((o) => o.corsi?.nome).filter(Boolean))];

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
        <Link href="/gestione/staff" aria-current={!archiviati ? 'true' : undefined}>In forza</Link>
        <Link href="/gestione/staff?archiviati=1" aria-current={archiviati ? 'true' : undefined}>Archiviati</Link>
      </div>

      <Link className="btn btn-primario" href="/gestione/staff/nuovo">Aggiungi persona</Link>
      {salvato && persone.some((p) => p.id === salvato) && (
        <div className="avviso-ok" role="status" style={{ marginTop: 14 }}>
          Scheda di {persone.find((p) => p.id === salvato).nome} salvata ✓
        </div>
      )}

      {persone.length === 0 && (
        <div className="vuoto" style={{ marginTop: 16 }}>{archiviati ? 'Nessuno in archivio.' : 'Ancora nessuno.'}</div>
      )}

      <div className="griglia-schede" style={{ marginTop: 16 }}>
        {persone.map((p) => (
          <div key={p.id} className={`scheda-corso${salvato === p.id ? ' appena-salvata' : ''}`}>
            <span className="banda" style={{ background: p.colore || 'var(--rosso)' }} />
            <span className="centro" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {p.foto_url
                ? <img src={p.foto_url} alt="" className="miniatura" />
                : <span className="miniatura segnaposto">{(p.nome[0] || '') + (p.cognome?.[0] || '')}</span>}
              <span style={{ minWidth: 0 }}>
                <Link className="titolo" href={`/gestione/staff/${p.id}`} style={{ display: 'block' }}>{p.nome} {p.cognome}</Link>
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
                  <Link className="link-btn piccolo" href={`/gestione/staff/${p.id}`}>Modifica</Link>
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
