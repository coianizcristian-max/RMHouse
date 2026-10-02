'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { ora, dataBreve } from '@/lib/formato';

const ERRORI = {
  troppo_presto: 'Si conferma da mezz\'ora prima dell\'inizio.',
  gia_confermata: 'L\'ha già confermata un\'altra insegnante: se è sbagliato avvisa la segreteria.',
  lezione_annullata: 'La lezione è annullata.',
};

// "Ho tenuto io la lezione": vale come firma per i compensi del mese.
// Se la conferma un'altra insegnante è una sostituzione; la segreteria può correggere.
export default function ConfermaLezione({ lezioneId, io, titolare, svolta, insegnanti = [], gestione = false }) {
  const router = useRouter();
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [cambia, setCambia] = useState(false);

  async function conferma(staff = null, togli = false) {
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('conferma_lezione', { p_lezione: lezioneId, p_staff: staff, p_togli: togli });
    setInvio(false);
    if (error) { setErrore(ERRORI[Object.keys(ERRORI).find((k) => error.message?.includes(k))] || 'Conferma non riuscita.'); return; }
    setCambia(false); router.refresh();
  }

  const sostituisco = titolare?.id && io?.id && titolare.id !== io.id;
  // la segreteria che guarda la lezione di un'insegnante non la "sostituisce": può solo indicare chi l'ha tenuta
  const guarda = gestione && sostituisco;
  return (
    <div className={`conferma-lezione${svolta ? ' fatta' : ''}`}>
      {svolta ? (
        <span className="cl-stato">
          <strong>✓ Tenuta da {svolta.nome}</strong>
          <span className="piccolo">
            {titolare?.id && svolta.id !== titolare.id ? `in sostituzione di ${titolare.nome} · ` : ''}
            confermata {svolta.come === 'segreteria' ? 'dalla segreteria' : 'con l\'appello'} il {dataBreve(svolta.at)} alle {ora(svolta.at)}
          </span>
        </span>
      ) : (
        <span className="cl-stato">
          <strong>{guarda ? 'Lezione non ancora confermata' : sostituisco ? `Stai sostituendo ${titolare.nome}?` : 'Conferma la lezione'}</strong>
          <span className="piccolo">{guarda ? `La conferma ${titolare.nome} dall'appello; se serve, indicalo tu.` : sostituisco ? 'Conferma che la tieni tu: le ore vanno a te.' : 'Tocca a inizio lezione: vale per il conteggio delle ore del mese.'}</span>
        </span>
      )}
      <span className="cl-azioni">
        {!svolta && io?.id && !guarda && (
          <button type="button" className="btn btn-primario" disabled={invio} onClick={() => conferma()}>
            {sostituisco ? 'Sì, la tengo io' : 'Ho tenuto io la lezione'}
          </button>
        )}
        {gestione && !cambia && <button type="button" className="link-btn piccolo" onClick={() => setCambia(true)}>{svolta ? 'correggi' : 'indica chi l\'ha tenuta'}</button>}
      </span>
      {gestione && cambia && (
        <span className="cl-cambia">
          <select defaultValue="" onChange={(e) => e.target.value && conferma(e.target.value)} disabled={invio} aria-label="Chi ha tenuto la lezione">
            <option value="">Chi l&apos;ha tenuta?</option>
            {insegnanti.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          {svolta && <button type="button" className="link-btn piccolo pericolo" disabled={invio} onClick={() => conferma(null, true)}>togli la conferma</button>}
          <button type="button" className="link-btn piccolo" onClick={() => setCambia(false)}>chiudi</button>
        </span>
      )}
      {errore && <span className="errore" role="alert" style={{ gridColumn: '1 / -1', margin: 0 }}>{errore}</span>}
    </div>
  );
}
