'use client';
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { oraSpettacolo } from '@/lib/biglietteria';

const CHIAVE = 'rm-ingresso-spettacolo';
const ESITI = {
  ok: ['bg-esito ok', 'ENTRA ✓'],
  gia_entrato: ['bg-esito no', 'GIÀ ENTRATO'],
  altro_spettacolo: ['bg-esito attenzione', 'ALTRO SPETTACOLO'],
  non_valido: ['bg-esito no', 'NON VALIDO'],
  non_trovato: ['bg-esito no', 'CODICE NON TROVATO'],
};

// Inquadrato il QR con la fotocamera del telefono si apre questa pagina: il biglietto si segna da solo.
// Si può anche scrivere il codice a mano. Lo spettacolo scelto resta salvato sul telefono.
export default function Ingresso({ codice, titolo, spettacoli }) {
  const [spettacolo, setSpettacolo] = useState('');
  const [testo, setTesto] = useState('');
  const [esito, setEsito] = useState(null);
  const [invio, setInvio] = useState(false);
  const fatto = useRef(false);

  async function controlla(c, sp) {
    if (!c.trim()) return;
    setInvio(true);
    const { data, error } = await supabaseBrowser().rpc('biglietteria_ingresso', { p_codice: c.trim(), p_spettacolo: sp || null });
    setInvio(false);
    setEsito(error ? { esito: 'errore', messaggio: error.message?.includes('non_autorizzato') ? 'Non hai i permessi per l\'ingresso.' : 'Controllo non riuscito: riprova.' } : data);
    setTesto('');
  }

  useEffect(() => {
    let sp = '';
    try { sp = localStorage.getItem(CHIAVE) || ''; } catch { /* niente */ }
    if (sp && !spettacoli.some((s) => s.id === sp)) sp = '';
    setSpettacolo(sp);
    if (codice && !fatto.current) { fatto.current = true; controlla(codice, sp); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scegli = (v) => { setSpettacolo(v); try { localStorage.setItem(CHIAVE, v); } catch { /* niente */ } };
  const [classe, scritta] = ESITI[esito?.esito] || ['bg-esito no', 'ERRORE'];

  return (
    <main className="pagina bg-ingresso">
      <div className="intestazione"><div className="occhiello">{titolo}</div><h1>Ingresso</h1></div>
      <div className="campo">
        <label htmlFor="bi-sp">Spettacolo che sta entrando</label>
        <select id="bi-sp" value={spettacolo} onChange={(e) => scegli(e.target.value)}>
          <option value="">Tutti (non controllare lo spettacolo)</option>
          {spettacoli.map((s) => <option key={s.id} value={s.id}>{oraSpettacolo(s.inizio)} · {s.titolo}</option>)}
        </select>
      </div>

      {invio && <p className="muto">Controllo…</p>}
      {esito && !invio && (
        <section className={classe} role="status" aria-live="assertive">
          <strong className="bg-esito-scritta">{esito.esito === 'errore' ? esito.messaggio : scritta}</strong>
          {esito.nome && (
            <>
              <span className="bg-esito-nome">{esito.nome}{esito.allievo ? ` · per ${esito.allievo}` : ''}</span>
              <span>{esito.spettacolo} · {oraSpettacolo(esito.inizio)} · biglietto {esito.numero} di {esito.di}</span>
              {esito.pizze > 0 && <span><strong>{esito.pizze} {esito.pizze === 1 ? 'pizza' : 'pizze'}</strong></span>}
              {esito.esito === 'gia_entrato' && esito.entrato_prima && (
                <span>Entrato alle {new Date(esito.entrato_prima).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}</span>
              )}
              {esito.esito === 'non_valido' && <span>{esito.stato === 'annullata' ? 'Prenotazione annullata.' : 'Pagamento non ancora confermato: verifica in Biglietteria.'}</span>}
              <span className="piccolo">Entrati {esito.entrati} su {esito.attesi}</span>
            </>
          )}
        </section>
      )}

      <form className="bg-codice-form" onSubmit={(e) => { e.preventDefault(); controlla(testo, spettacolo); }}>
        <div className="campo"><label htmlFor="bi-cod">Codice del biglietto (se il QR non si legge)</label>
          <input id="bi-cod" value={testo} onChange={(e) => setTesto(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" placeholder="es. HTWTA8YDWP" /></div>
        <button type="submit" className="btn btn-primario" disabled={invio || !testo.trim()}>Controlla</button>
      </form>
      <p className="piccolo muto">Per il prossimo: inquadra il QR con la fotocamera del telefono e tocca il link che compare.</p>
    </main>
  );
}
