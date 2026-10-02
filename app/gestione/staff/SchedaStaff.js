'use client';
import { useState } from 'react';
import Link from 'next/link';
import DisponibilitaPrivate from './DisponibilitaPrivate';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Immagine from '../Immagine';
import SceltaColore from '../SceltaColore';

export const RUOLI = { insegnante: 'Insegnante', segreteria: 'Segreteria', admin: 'Amministratore' };

// Pagina dedicata: scheda di una persona dello staff (nuova o da modificare)
export default function SchedaStaff({ palestraId, persona = null, corsi = [], usata = true, sonoIo = false }) {
  const router = useRouter();
  const nuova = !persona;
  const [f, setF] = useState({
    nome: persona?.nome || '', cognome: persona?.cognome || '', specialita: persona?.specialita || '',
    ruolo: persona?.ruolo || 'insegnante', email: persona?.email || '', telefono: persona?.telefono || '',
    bio: persona?.bio || '', foto_url: persona?.foto_url || null, colore: persona?.colore || '#f40000',
    visibilita: persona?.visibilita || 'pubblico',
    compenso: persona?.compenso_ora_cent ? (persona.compenso_ora_cent / 100).toFixed(2).replace('.', ',') : '',
    collaboratore: persona?.collaboratore ?? false, attivo: persona?.attivo ?? true,
  });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  // Archivia / Riporta in forza / Elimina, dalla scheda
  async function archivia(valore) {
    if (valore && !confirm(`Archiviare ${persona.nome}? Non compare più nello staff in forza; lezioni, presenze e compensi restano. Si può riportare in forza quando vuoi.`)) return;
    setInvio(true); setErrore('');
    const { data, error } = await supabaseBrowser().from('staff').update({ archiviato: valore }).eq('id', persona.id).select('id');
    setInvio(false);
    if (error || !data?.length) { setErrore('Operazione non riuscita. Ricarica la pagina e riprova.'); return; }
    router.push(valore ? '/gestione/staff' : `/gestione/staff?salvato=${persona.id}`); router.refresh();
  }
  async function elimina() {
    if (!confirm(`Eliminare per sempre la scheda di ${persona.nome}? Non si può annullare.`)) return;
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().from('staff').delete().eq('id', persona.id);
    setInvio(false);
    if (error) { setErrore('Non si può eliminare: è collegata ad altri dati (lezioni, compensi…). Archiviala.'); return; }
    router.push('/gestione/staff'); router.refresh();
  }

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const indietro = persona?.archiviato ? '/gestione/staff?archiviati=1' : '/gestione/staff';

  async function salva(e) {
    e.preventDefault();
    if (!f.nome.trim()) { setErrore('Serve almeno il nome.'); return; }
    const compenso = f.compenso.trim() ? Math.round(parseFloat(f.compenso.replace(/[€\s.]/g, '').replace(',', '.')) * 100) : null;
    if (f.compenso.trim() && !Number.isFinite(compenso)) { setErrore('Compenso orario: scrivi un importo, per esempio 25 oppure 22,50.'); return; }
    setInvio(true); setErrore('');
    const dati = {
      nome: f.nome.trim(), cognome: f.cognome.trim() || null, specialita: f.specialita.trim() || null, ruolo: f.ruolo,
      email: f.email.trim() || null, telefono: f.telefono.trim() || null, bio: f.bio.trim() || null,
      foto_url: f.foto_url, colore: f.colore, visibilita: f.visibilita, compenso_ora_cent: compenso,
      collaboratore: f.collaboratore, attivo: f.attivo,
    };
    const db = supabaseBrowser();
    const { data, error } = nuova
      ? await db.from('staff').insert({ ...dati, palestra_id: palestraId }).select('id')
      : await db.from('staff').update(dati).eq('id', persona.id).select('id');
    setInvio(false);
    if (error) { setErrore(error.message?.includes('duplicate') ? 'Esiste già una persona con questi dati.' : 'Salvataggio non riuscito. Riprova.'); return; }
    if (!data?.length) { setErrore('Non salvato: l\'accesso è scaduto. Ricarica la pagina (o esci e rientra) e riprova.'); return; }
    router.push(`${indietro}${indietro.includes('?') ? '&' : '?'}salvato=${data[0].id}`);
    router.refresh();
  }

  return (
    <>
      <p><Link prefetch={false} href={indietro}>‹ Torna allo staff</Link></p>
      <div className="intestazione">
        <div className="occhiello">Struttura · Staff</div>
        <h1>{nuova ? 'Nuova persona' : [persona.nome, persona.cognome].filter(Boolean).join(' ')}</h1>
        {!nuova && (
          <p>
            {[RUOLI[persona.ruolo], persona.specialita].filter(Boolean).join(' · ')}
            {corsi.length > 0 && <><br /><span className="piccolo">Insegna: {corsi.join(', ')}</span></>}
          </p>
        )}
      </div>

      {!nuova && (
        <div className="segni-staff" style={{ marginBottom: 10 }}>
          {persona.user_id
            ? <span className="tag tag-ok">entra nell'app</span>
            : <span className="tag tag-attenzione">senza accesso</span>}
          {persona.archiviato && <span className="tag tag-neutro">archiviato</span>}
          {!persona.attivo && <span className="tag tag-neutro">non attivo</span>}
          <span className="ss-gestione">
            {!sonoIo && (persona.archiviato
              ? <button type="button" className="link-btn piccolo" disabled={invio} onClick={() => archivia(false)}>Riporta in forza</button>
              : <button type="button" className="link-btn piccolo" disabled={invio} onClick={() => archivia(true)}>Archivia</button>)}
            {!sonoIo && !usata && <button type="button" className="link-btn piccolo pericolo" disabled={invio} onClick={elimina}>Elimina</button>}
          </span>
        </div>
      )}

      {/* tutto in una videata: a sinistra foto, colore e stato; a destra i dati */}
      <form onSubmit={salva} className="scheda scheda-staff">
        <div className="ss-griglia">
          <div className="ss-lato">
            <Immagine url={f.foto_url} cartella="staff" etichetta="Foto" tondo onChange={(url) => setF({ ...f, foto_url: url })} />
            <div className="campo">
              <label>Colore in calendario</label>
              <SceltaColore valore={f.colore} onChange={(c) => setF((x) => ({ ...x, colore: c }))} />
            </div>
            <label className="spunta"><input type="checkbox" checked={f.attivo} onChange={set('attivo')} />
          <span>Attivo<span className="piccolo muto" style={{ display: 'block' }}>se tolto, non entra nel gestionale</span></span></label>
            <label className="spunta"><input type="checkbox" checked={f.collaboratore} onChange={set('collaboratore')} /><span>Collaboratore esterno</span></label>
          </div>

          <div className="ss-dati">
            <div className="campo ss-2"><label htmlFor="n">Nome</label><input id="n" value={f.nome} onChange={set('nome')} autoFocus={nuova} /></div>
            <div className="campo ss-2"><label htmlFor="c">Cognome</label><input id="c" value={f.cognome} onChange={set('cognome')} /></div>
            <div className="campo ss-2">
              <label htmlFor="r">Ruolo</label>
              <select id="r" value={f.ruolo} onChange={set('ruolo')}>
                {Object.entries(RUOLI).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="campo ss-4">
              <label htmlFor="sp">Specialità</label>
              <input id="sp" value={f.specialita} onChange={set('specialita')} placeholder="Es. Aerea e acrobatica, Segreteria" />
            </div>
            <div className="campo ss-2">
              <label htmlFor="co">Compenso orario (€)</label>
              <input id="co" inputMode="decimal" value={f.compenso} onChange={set('compenso')} placeholder="es. 22,50" />
            </div>
            <div className="campo ss-3"><label htmlFor="e">Email</label><input id="e" type="email" value={f.email} onChange={set('email')} /></div>
            <div className="campo ss-3"><label htmlFor="t">Telefono</label><input id="t" type="tel" value={f.telefono} onChange={set('telefono')} /></div>
            <div className="campo ss-4">
              <label htmlFor="b">Presentazione</label>
              <textarea id="b" rows={3} value={f.bio} onChange={set('bio')} placeholder="Due righe per il sito e per i clienti" />
            </div>
            <div className="campo ss-2">
              <label htmlFor="v">Visibilità sul sito</label>
              <select id="v" value={f.visibilita} onChange={set('visibilita')}>
                <option value="pubblico">Pubblico</option>
                <option value="privato">Solo per gli iscritti</option>
                <option value="nascosto">Nascosto</option>
              </select>
            </div>
          </div>
        </div>
        {errore && <div className="errore" role="alert">{errore}</div>}
        <div className="azioni">
          <button className="btn btn-primario" disabled={invio}>{invio ? 'Salvo…' : nuova ? 'Aggiungi' : 'Salva'}</button>
          <Link prefetch={false} href={indietro} className="btn">Annulla</Link>
        </div>
      </form>

      {!nuova && (persona.ruolo === 'insegnante' || persona.collaboratore) && (
        <DisponibilitaPrivate staffId={persona.id} palestraId={palestraId} nome={persona.nome} />
      )}

      {!nuova && !persona.user_id && (
        <p className="piccolo muto" style={{ marginTop: 16 }}>
          Per farla entrare nell'app serve creare il suo utente in Supabase (Authentication → Users) con la stessa
          email di questa scheda, e collegarlo.
        </p>
      )}
    </>
  );
}
