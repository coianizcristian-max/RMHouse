'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, ora, giornoLungo } from '@/lib/formato';

const ERRORI = {
  credito_non_valido: 'Questo recupero non è più disponibile.',
  credito_scaduto: 'Il recupero è scaduto.',
  corso_non_ammesso_per_recupero: 'In questo corso non si può recuperare: controlla le regole nelle impostazioni.',
  certificato_scaduto: 'Certificato medico scaduto: prima va rinnovato.',
  lezione_al_completo: 'Quella lezione è al completo.',
  lezione_non_disponibile: 'Lezione non più disponibile.',
  non_autorizzato: 'Non hai i permessi per questa operazione.',
};

export default function Recuperi({ allievoId, crediti }) {
  const router = useRouter();
  const [apri, setApri] = useState(null);      // credito in prenotazione
  const [lezioni, setLezioni] = useState(null);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  async function cerca(credito) {
    setApri(credito.id); setLezioni(null); setErrore('');
    const db = supabaseBrowser();
    const { data: corsi, error } = await db.rpc('corsi_recupero', { p_iscrizione: credito.iscrizione_id });
    if (error) { setErrore('Impossibile leggere le regole di recupero.'); return; }
    const ids = (corsi || []).map((c) => c.corso_id);
    if (!ids.length) { setLezioni([]); return; }
    const { data } = await db.from('v_lezioni')
      .select('id, corso_nome, inizio, sala_nome, capienza, partecipanti')
      .in('corso_id', ids).eq('stato', 'programmata')
      .gt('inizio', new Date().toISOString())
      .lte('data', credito.scadenza)
      .order('inizio').limit(40);
    setLezioni((data || []).filter((l) => l.capienza == null || l.partecipanti < l.capienza));
  }

  async function prenota(creditoId, lezioneId) {
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('prenota_recupero', { p_credito: creditoId, p_lezione: lezioneId });
    setInvio(false);
    if (error) {
      const k = Object.keys(ERRORI).find((x) => error.message?.includes(x));
      setErrore(ERRORI[k] || 'Prenotazione non riuscita.');
      return;
    }
    setApri(null); router.refresh();
  }

  if (!crediti.length) return <div className="vuoto">Nessun recupero maturato.</div>;

  return (
    <div>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <ul className="elenco">
        {crediti.map((c) => (
          <li key={c.id} className="persona" style={{ alignItems: 'start' }}>
            <div style={{ width: '100%' }}>
              <span className="persona-nome">{c.corso_nome}</span>
              <div className="piccolo muto">
                Assenza del {dataBreve(c.data_persa)} · valido fino al {dataBreve(c.scadenza)}
                {c.data_recupero && ` · recuperato il ${dataBreve(c.data_recupero)} in ${c.corso_recupero}`}
              </div>

              {c.stato === 'disponibile' && apri !== c.id && (
                <button className="link-btn piccolo" style={{ marginTop: 6 }} onClick={() => cerca(c)}>Prenota il recupero</button>
              )}

              {apri === c.id && (
                <div style={{ marginTop: 10 }}>
                  {lezioni === null && <p className="piccolo muto">Cerco le lezioni ammesse…</p>}
                  {lezioni?.length === 0 && <p className="piccolo muto">Nessuna lezione disponibile entro la scadenza.</p>}
                  {lezioni?.map((l) => (
                    <button key={l.id} type="button" className="slot" disabled={invio} onClick={() => prenota(c.id, l.id)}>
                      <span className="slot-ora">{ora(l.inizio)}</span>
                      <span className="slot-info"><strong>{l.corso_nome}</strong>{giornoLungo(l.inizio)}{l.sala_nome ? `, ${l.sala_nome}` : ''}</span>
                      <span className="tag tag-tenue">scegli</span>
                    </button>
                  ))}
                  <button className="link-btn piccolo" onClick={() => setApri(null)}>Annulla</button>
                </div>
              )}
            </div>
            <span className={`tag ${c.stato === 'disponibile' ? 'tag-ok' : 'tag-neutro'}`}>{c.stato}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
