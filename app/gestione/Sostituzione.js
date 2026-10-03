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
  const [future, setFuture] = useState(false);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

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

  if (!l || l.stato === 'annullata') return null;
  const nome = (id) => { const s = staff.find((x) => x.id === id); return s ? `${s.nome} ${s.cognome || ''}`.trim() : ''; };
  const futura = new Date(l.inizio) > new Date();
  const mia = io?.id && l.insegnante_id === io.id;
  const puoCambiare = gestione || (mia && futura);

  async function conferma() {
    if (!gestione && !chi) { setErrore('Scegli chi ti sostituisce.'); return; }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('sostituisci_lezione', { p_lezione: l.id, p_staff: chi || null, p_da_oggi: gestione && future });
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
          {gestione && l.orario_id && (
            <label className="spunta" style={{ margin: 0 }}>
              <input type="checkbox" checked={future} onChange={(e) => setFuture(e.target.checked)} />
              <span className="piccolo">anche tutte le prossime lezioni di questo orario</span>
            </label>
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
