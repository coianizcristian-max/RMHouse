'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, ora } from '@/lib/formato';

const ERRORI = {
  non_tua: 'Puoi farti sostituire solo nelle tue lezioni.',
  lezione_passata: 'La lezione è già iniziata: avvisa la segreteria.',
  scegli_chi: 'Scegli chi ti sostituisce.',
  lezione_annullata: 'La lezione è annullata.',
  data_non_valida: 'La data di fine deve essere uguale o dopo questa lezione.',
};

// Chi tiene la lezione e come cambiarlo.
// Segreteria e amministrazione: "cambia" (solo questa o anche le future dello stesso orario).
// Insegnante titolare: "Fatti sostituire" su una sua lezione futura (solo quella data).
export default function Sostituzione({ lezioneId, gestione, onFatto }) {
  const router = useRouter();
  const [l, setL] = useState(null);
  const [staff, setStaff] = useState([]);
  const [io, setIo] = useState(null);
  const [aperto, setAperto] = useState(false);
  const [chi, setChi] = useState('');
  const [quali, setQuali] = useState('una');        // una | prossime | fino
  const [fino, setFino] = useState('');
  const [ambito, setAmbito] = useState('orario');    // orario | corso
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [conflitti, setConflitti] = useState(null);   // la persona scelta è già occupata a quell'ora?

  useEffect(() => {
    const db = supabaseBrowser();
    (async () => {
      const { data: lez } = await db.from('lezioni')
        .select('id, palestra_id, inizio, stato, orario_id, insegnante_id, insegnante_titolare, sostituzione_da, sostituzione_at')
        .eq('id', lezioneId).maybeSingle();
      if (!lez) return;
      const [{ data: s }, { data: me }] = await Promise.all([
        db.from('staff').select('id, nome, cognome, ruolo').eq('palestra_id', lez.palestra_id).eq('attivo', true).not('archiviato', 'is', true).order('nome'),
        db.rpc('mio_staff', { p_palestra: lez.palestra_id }),
      ]);
      setL(lez); setStaff(s || []); setIo(me || null);
    })();
  }, [lezioneId]);

  // appena si sceglie chi e quali lezioni: controllo che non sia già occupata alla stessa ora
  useEffect(() => {
    if (!l || !chi) { setConflitti(null); return; }
    const blocco = gestione && quali !== 'una';
    supabaseBrowser().rpc('verifica_sostituzione', {
      p_lezione: l.id, p_staff: chi, p_da_oggi: blocco && quali === 'prossime',
      p_fino: blocco && quali === 'fino' && fino ? fino : null, p_tutto_corso: blocco && (ambito === 'corso' || !l.orario_id),
    }).then(({ data }) => setConflitti(data?.insegnante?.length ? data.insegnante : null));
  }, [l, chi, quali, fino, ambito, gestione]);

  if (!l || l.stato === 'annullata') return null;
  const nome = (id) => { const s = staff.find((x) => x.id === id); return s ? `${s.nome} ${s.cognome || ''}`.trim() : ''; };
  const futura = new Date(l.inizio) > new Date();
  const mia = io?.id && l.insegnante_id === io.id;
  const puoCambiare = gestione || (mia && futura);

  async function conferma() {
    if (!gestione && !chi) { setErrore('Scegli chi ti sostituisce.'); return; }
    if (gestione && quali === 'fino' && !fino) { setErrore('Scegli fino a che giorno.'); return; }
    setInvio(true); setErrore('');
    const blocco = gestione && quali !== 'una';
    const { error } = await supabaseBrowser().rpc('sostituisci_lezione', {
      p_lezione: l.id, p_staff: chi || null, p_da_oggi: blocco && quali === 'prossime',
      p_fino: blocco && quali === 'fino' ? fino : null, p_tutto_corso: blocco && (ambito === 'corso' || !l.orario_id),
    });
    setInvio(false);
    if (error) { setErrore(ERRORI[Object.keys(ERRORI).find((k) => error.message?.includes(k))] || 'Cambio non riuscito.'); return; }
    setAperto(false);
    if (onFatto) onFatto(); else router.refresh();
  }

  return (
    <div className="sost">
      <div className="sost-riga">
        <span>
          <span className="piccolo muto">Insegnante</span>{' '}
          <strong>{nome(l.insegnante_id) || 'nessuno'}</strong>
          {l.insegnante_titolare && (
            <span className="piccolo muto"> · sostituisce {nome(l.insegnante_titolare)}{l.sostituzione_da ? ` (cambio di ${nome(l.sostituzione_da)} il ${dataBreve(l.sostituzione_at)} alle ${ora(l.sostituzione_at)})` : ''}</span>
          )}
        </span>
        {puoCambiare && !aperto && (
          <button type="button" className={gestione ? 'link-btn piccolo' : 'btn btn-piccolo'} onClick={() => { setAperto(true); setChi(''); }}>
            {gestione ? 'cambia' : 'Fatti sostituire'}
          </button>
        )}
      </div>
      {aperto && (
        <div className="sost-scelta">
          <select value={chi} onChange={(e) => setChi(e.target.value)} aria-label="Chi tiene la lezione">
            <option value="">{gestione ? 'Nessun insegnante' : 'Chi ti sostituisce?'}</option>
            {staff.filter((s) => s.id !== l.insegnante_id).map((s) => <option key={s.id} value={s.id}>{s.nome} {s.cognome || ''}</option>)}
          </select>
          {gestione && (
            <fieldset className="sost-opzioni">
              <legend>Quali lezioni</legend>
              <label><input type="radio" name="quali" checked={quali === 'una'} onChange={() => setQuali('una')} /> Solo questa</label>
              <label><input type="radio" name="quali" checked={quali === 'prossime'} onChange={() => setQuali('prossime')} /> Tutte le prossime <span className="piccolo muto">(cambio stabile)</span></label>
              <label><input type="radio" name="quali" checked={quali === 'fino'} onChange={() => setQuali('fino')} /> Fino al
                <input type="date" value={fino} min={(l.inizio || '').slice(0, 10)} onChange={(e) => { setFino(e.target.value); setQuali('fino'); }} aria-label="Fino al" />
              </label>
              {quali !== 'una' && (
                <div className="sost-ambito">
                  {l.orario_id && <label><input type="radio" name="ambito" checked={ambito === 'orario'} onChange={() => setAmbito('orario')} /> Solo questo orario <span className="piccolo muto">(stesso giorno e ora)</span></label>}
                  <label><input type="radio" name="ambito" checked={ambito === 'corso' || !l.orario_id} onChange={() => setAmbito('corso')} /> Tutto il corso <span className="piccolo muto">(tutti i giorni, le lezioni di {nome(l.insegnante_titolare || l.insegnante_id) || 'chi non ha insegnante'})</span></label>
                </div>
              )}
              {quali === 'fino' && <p className="piccolo muto" style={{ margin: 0 }}>Dopo quella data le lezioni tornano alla titolare.</p>}
            </fieldset>
          )}
          {conflitti && (
            <p className="errore" role="alert" style={{ margin: 0 }}>
              Attenzione: {nome(chi)} ha già {conflitti.slice(0, 3).map((c) => `${c.corso} (${c.quando}${c.volte > 1 ? `, ${c.volte} volte` : ''})`).join(', ')} alla stessa ora.
            </p>
          )}
          {!gestione && <p className="piccolo muto" style={{ margin: 0 }}>Vale solo per questa lezione. Chi scegli riceve la notifica e la trova nella sua app; la segreteria viene avvisata.</p>}
          <span className="sost-azioni">
            <button type="button" className="btn btn-piccolo btn-primario" disabled={invio} onClick={conferma}>{invio ? 'Un attimo…' : 'Conferma'}</button>
            <button type="button" className="link-btn piccolo" onClick={() => setAperto(false)}>annulla</button>
          </span>
        </div>
      )}
      {errore && <div className="errore" role="alert" style={{ margin: '6px 0 0' }}>{errore}</div>}
    </div>
  );
}
