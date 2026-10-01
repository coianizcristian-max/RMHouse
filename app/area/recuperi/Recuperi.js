'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { ora, dataBreve, giornoLungo } from '@/lib/formato';

const MOTIVI = {
  credito_scaduto: 'Questo credito è scaduto.',
  lezione_al_completo: 'Quella lezione si è riempita un attimo fa.',
  lezione_non_disponibile: 'Quella lezione non è più prenotabile.',
  certificato_scaduto: 'Prima serve il certificato medico valido.',
  corso_non_ammesso_per_recupero: 'Su quel corso non si può recuperare.',
  credito_non_valido: 'Questo credito è già stato usato.',
  lezione_disdetta: 'È la lezione che è stata disdetta: scegline un\'altra.',
  limite_recuperi_mese: 'Hai già fatto tutti i recuperi di quel mese: scegli una lezione del mese dopo, se il recupero vale ancora.',
};

export default function Recuperi({ crediti, piuAllievi, massimo = null, usati = {}, fineAbbonamento = false }) {
  const router = useRouter();
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);

  const [giorno, setGiorno] = useState('');        // '' = tutti i giorni
  const [quante, setQuante] = useState(10);
  const [chiedo, setChiedo] = useState(null);      // lezione da confermare

  async function prenota(credito, lezione) {
    setInvio(true); setErrore(''); setAvviso(''); setChiedo(null);
    const { error } = await supabaseBrowser().rpc('prenota_recupero', {
      p_credito: credito.id, p_lezione: lezione.lezione_id,
    });
    setInvio(false);
    if (error) {
      const chiave = Object.keys(MOTIVI).find((k) => error.message?.includes(k));
      setErrore(chiave ? MOTIVI[chiave] : 'Prenotazione non riuscita. Riprova.');
      router.refresh();
      return;
    }
    setAvviso(`Fatto: ${lezione.corso} ${giornoCorto(lezione.inizio)} alle ${ora(lezione.inizio)}. La trovi fra le tue lezioni.`);
    router.refresh();
  }

  // una lista sola per persona: ogni lezione usa il recupero che scade prima fra quelli validi
  const persone = [...new Map(crediti.map((c) => [c.allievo_id, c.allievo])).entries()].map(([id, nome]) => {
    const suoi = crediti.filter((c) => c.allievo_id === id).sort((x, y) => String(x.scadenza).localeCompare(String(y.scadenza)));
    const lezioni = new Map();
    suoi.forEach((c) => c.lezioni.forEach((l) => { if (!lezioni.has(l.lezione_id)) lezioni.set(l.lezione_id, { ...l, credito: c }); }));
    return { id, nome, suoi, lezioni: [...lezioni.values()].sort((x, y) => x.inizio.localeCompare(y.inizio)) };
  });
  const giorniSettimana = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const giornoDi = (iso) => giorniSettimana[(new Date(iso).getDay() + 6) % 7];

  return (
    <div className="area-recuperi">
      <div className="ac-testa">
        <h1>Recuperi</h1>
        <p className="ac-nota" style={{ margin: '2px 0 0' }}>
          {fineAbbonamento ? 'Valgono fino alla scadenza dell\'abbonamento (se rinnovi, passano al nuovo)' : 'Scegli la lezione e tocca Prenota'}
          {massimo != null ? ` · massimo ${massimo} al mese` : ''}.
        </p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="avviso-ok" role="status">{avviso}</div>}

      {crediti.length === 0 && <div className="vuoto">Non hai recuperi da usare. Nascono quando tocchi "Non vengo" su una lezione.</div>}

      {persone.map((pe) => {
        const giorni = [...new Set(pe.lezioni.map((l) => giornoDi(l.inizio)))];
        const filtrate = pe.lezioni.filter((l) => !giorno || giornoDi(l.inizio) === giorno);
        return (
          <section key={pe.id} className="ac-sezione">
            <h2>{piuAllievi ? `${pe.nome} · ` : ''}{pe.suoi.length} {pe.suoi.length === 1 ? 'recupero' : 'recuperi'}</h2>
            <p className="ac-nota">
              entro il {dataBreve(pe.suoi[0].scadenza)}
              {massimo != null && ` · questo mese ${usati[pe.id] || 0} di ${massimo}`}
            </p>

            {pe.lezioni.length === 0 ? (
              <div className="vuoto">
                Ora non ci sono lezioni libere per recuperare.
                <div className="piccolo" style={{ marginTop: 4 }}>Si liberano posti quando qualcuno disdice: riprova nei prossimi giorni.</div>
              </div>
            ) : (
              <>
                {giorni.length > 1 && (
                  <div className="ac-giorni" role="group" aria-label="Giorno">
                    <button type="button" aria-pressed={!giorno} onClick={() => { setGiorno(''); setQuante(10); }}>Tutti</button>
                    {giorniSettimana.filter((g) => giorni.includes(g)).map((g) => (
                      <button key={g} type="button" aria-pressed={giorno === g} onClick={() => { setGiorno(g); setQuante(10); }}>{g}</button>
                    ))}
                  </div>
                )}
                <ul className="ac-lezioni">
                  {filtrate.slice(0, quante).map((l) => {
                    const k = `${pe.id}-${l.lezione_id}`;
                    return (
                      <li key={k}>
                        <span className="ac-banda" style={{ background: 'var(--rosso)' }} />
                        <span className="ac-quando"><strong>{ora(l.inizio)}</strong><span>{giornoCorto(l.inizio)}</span></span>
                        <span className="ac-cosa">
                          <strong>{l.corso}</strong>
                          <span>{[l.sala, l.liberi > 0 ? `${l.liberi} posti` : 'al completo'].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="ac-azione">
                          <button className="btn btn-piccolo btn-primario" disabled={invio || l.liberi === 0} onClick={() => setChiedo(k)}>Prenota</button>
                        </span>
                        {chiedo === k && (
                          <span className="conferma-disdetta conferma-ok">
                            <span>Recuperi {l.corso} di {giornoLungo(l.inizio).toLowerCase()} alle {ora(l.inizio)}{piuAllievi ? ` per ${pe.nome}` : ''}?</span>
                            <span className="azioni">
                              <button className="btn btn-primario btn-piccolo" disabled={invio} onClick={() => prenota(l.credito, l)}>{invio ? 'Un attimo…' : 'Sì, prenoto'}</button>
                              <button className="btn btn-piccolo" onClick={() => setChiedo(null)}>No</button>
                            </span>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {filtrate.length > quante && (
                  <button className="link-btn piccolo ac-altre" onClick={() => setQuante(quante + 10)}>Mostra altre ({filtrate.length - quante})</button>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

function giornoCorto(iso) {
  const d = new Date(iso);
  const g = d.toLocaleDateString('it-IT', { weekday: 'short', timeZone: 'Europe/Rome' }).replace('.', '');
  return `${g.charAt(0).toUpperCase()}${g.slice(1)} ${d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' })}`;
}
