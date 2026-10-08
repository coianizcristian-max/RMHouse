'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro } from '@/lib/formato';

// Divide il listino in gruppi (Kids e Teen, Adulti, Ingressi…):
// si vede un gruppo alla volta, si spuntano gli abbonamenti e si spostano in blocco.
export default function GruppiListino({ palestraId, gruppi, tipi }) {
  const router = useRouter();
  const [vista, setVista] = useState(gruppi[0]?.id || 'nessuno');
  const [scelti, setScelti] = useState([]);
  const [cerca, setCerca] = useState('');
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);
  const [nuovo, setNuovo] = useState('');
  const [creo, setCreo] = useState(false);          // il riquadro "Aggiungi gruppo" è aperto
  const [appena, setAppena] = useState(null);       // { id, nome } del gruppo appena creato, finché la pagina non si ricarica
  const [rinomina, setRinomina] = useState(null);   // { id, nome }

  const di = (g) => tipi.filter((t) => (g === 'nessuno' ? !t.gruppo_id : t.gruppo_id === g));
  const testo = cerca.trim().toLowerCase();
  const righe = di(vista).filter((t) => !testo || `${t.nome} ${t.codice || ''} ${t.famiglia || ''}`.toLowerCase().includes(testo));
  const famiglie = [...new Set(righe.map((t) => t.famiglia || 'Senza famiglia'))].sort();
  const nomeVista = vista === 'nessuno' ? 'Senza gruppo' : gruppi.find((g) => g.id === vista)?.nome || (appena?.id === vista ? appena.nome : '');

  function spunta(id) { setScelti((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); }
  function spuntaFamiglia(f) {
    const ids = righe.filter((t) => (t.famiglia || 'Senza famiglia') === f).map((t) => t.id);
    const tutti = ids.every((id) => scelti.includes(id));
    setScelti((s) => (tutti ? s.filter((x) => !ids.includes(x)) : [...new Set([...s, ...ids])]));
  }

  async function sposta(verso) {
    if (!scelti.length) return;
    setInvio(true); setErrore(''); setAvviso('');
    const { data, error } = await supabaseBrowser().rpc('sposta_in_gruppo', { p_tipi: scelti, p_gruppo: verso === 'nessuno' ? null : verso });
    setInvio(false);
    if (error) { setErrore('Spostamento non riuscito.'); return; }
    const dove = verso === 'nessuno' ? 'fuori dai gruppi' : `in ${gruppi.find((g) => g.id === verso)?.nome}`;
    setAvviso(`${data} ${data === 1 ? 'abbonamento spostato' : 'abbonamenti spostati'} ${dove}.`);
    setScelti([]); router.refresh();
  }

  // il gruppo nuovo si crea dal riquadro accanto agli altri e si apre subito (vuoto)
  async function aggiungi() {
    const nome = nuovo.trim().replace(/\s+/g, ' ');
    if (!nome || invio) return;
    setInvio(true); setErrore(''); setAvviso('');
    const { data, error } = await supabaseBrowser().from('gruppi_listino')
      .insert({ palestra_id: palestraId, nome, ordine: gruppi.length + 1 }).select('id').single();
    setInvio(false);
    if (error) { setErrore(error.code === '23505' ? 'Esiste già un gruppo con questo nome.' : 'Gruppo non creato.'); return; }
    setNuovo(''); setCreo(false);
    if (data?.id) { setAppena({ id: data.id, nome }); setVista(data.id); setScelti([]); }
    setAvviso(`Gruppo «${nome}» creato. Per riempirlo apri il gruppo dove sono ora gli abbonamenti, spuntali e scegli «sposta in ${nome}».`);
    router.refresh();
  }

  async function salvaNome() {
    if (!rinomina?.nome.trim()) return;
    const { error } = await supabaseBrowser().from('gruppi_listino').update({ nome: rinomina.nome.trim() }).eq('id', rinomina.id);
    if (error) { setErrore('Nome non salvato.'); return; }
    setRinomina(null); router.refresh();
  }

  async function eliminaGruppo(g) {
    const n = di(g.id).length;
    if (!confirm(`Eliminare il gruppo "${g.nome}"?${n ? `\nI suoi ${n} abbonamenti restano, senza gruppo.` : ''}`)) return;
    const { error } = await supabaseBrowser().from('gruppi_listino').delete().eq('id', g.id);
    if (error) { setErrore('Gruppo non eliminato.'); return; }
    setVista(gruppi.find((x) => x.id !== g.id)?.id || 'nessuno'); router.refresh();
  }

  return (
    <>
      <p className="muto piccolo">
        Ogni abbonamento sta in un gruppo: così nelle liste e nei controlli ne vedi pochi alla volta.
        Scegli il gruppo, spunta gli abbonamenti (anche una famiglia intera) e spostali dove vanno.
      </p>

      <div className="gruppi-riquadri">
        {gruppi.map((g) => (
          <button key={g.id} type="button" className="gruppo-riquadro" aria-pressed={vista === g.id}
                  onClick={() => { setVista(g.id); setScelti([]); }}>
            <strong>{g.nome}</strong><span>{di(g.id).length} abbonamenti</span>
          </button>
        ))}
        {di('nessuno').length > 0 && (
          <button type="button" className="gruppo-riquadro attenzione" aria-pressed={vista === 'nessuno'}
                  onClick={() => { setVista('nessuno'); setScelti([]); }}>
            <strong>Senza gruppo</strong><span>{di('nessuno').length} da sistemare</span>
          </button>
        )}
        {creo ? (
          <div className="gruppo-aggiungi aperto">
            <input value={nuovo} onChange={(e) => setNuovo(e.target.value)} placeholder="Nome, es. Estate" aria-label="Nome del nuovo gruppo"
                   autoFocus autoComplete="off" maxLength={60}
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aggiungi(); } if (e.key === 'Escape') { setCreo(false); setNuovo(''); } }} />
            <span className="gruppo-aggiungi-azioni">
              <button type="button" className="btn btn-piccolo btn-primario" disabled={!nuovo.trim() || invio} onClick={aggiungi}>{invio ? 'Creo…' : 'Crea'}</button>
              <button type="button" className="link-btn piccolo" onClick={() => { setCreo(false); setNuovo(''); }}>annulla</button>
            </span>
          </div>
        ) : (
          <button type="button" className="gruppo-aggiungi" onClick={() => { setCreo(true); setErrore(''); }}>
            <span className="gruppo-piu" aria-hidden="true">+</span>Aggiungi gruppo
          </button>
        )}
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="avviso-ok" role="status">{avviso}</div>}

      <div className="pannello">
        <div className="pannello-testa">
          {rinomina && rinomina.id === vista ? (
            <span className="gruppo-rinomina">
              <input value={rinomina.nome} aria-label="Nome del gruppo" onChange={(e) => setRinomina({ ...rinomina, nome: e.target.value })}
                     onKeyDown={(e) => e.key === 'Enter' && salvaNome()} autoFocus />
              <button className="btn btn-piccolo btn-primario" onClick={salvaNome}>Salva</button>
              <button className="btn btn-piccolo" onClick={() => setRinomina(null)}>Annulla</button>
            </span>
          ) : (
            <h2>{nomeVista} <span className="piccolo muto">· {di(vista).length}</span></h2>
          )}
          {vista !== 'nessuno' && !rinomina && (
            <span className="azioni">
              <button className="link-btn piccolo" onClick={() => setRinomina({ id: vista, nome: nomeVista })}>Rinomina</button>
              <button className="link-btn piccolo pericolo" onClick={() => eliminaGruppo(gruppi.find((g) => g.id === vista))}>Elimina gruppo</button>
            </span>
          )}
        </div>

        <div className="filtri-persone">
          <input type="search" placeholder={`Cerca in ${nomeVista}`} value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca nel gruppo" />
        </div>

        {scelti.length > 0 && (
          <div className="barra-sposta">
            <strong>{scelti.length} {scelti.length === 1 ? 'scelto' : 'scelti'}</strong>
            <span className="piccolo muto">sposta in</span>
            {gruppi.filter((g) => g.id !== vista).map((g) => (
              <button key={g.id} className="btn btn-piccolo btn-primario" disabled={invio} onClick={() => sposta(g.id)}>{g.nome}</button>
            ))}
            {vista !== 'nessuno' && <button className="btn btn-piccolo" disabled={invio} onClick={() => sposta('nessuno')}>Nessun gruppo</button>}
            <button className="link-btn piccolo" onClick={() => setScelti([])}>deseleziona</button>
          </div>
        )}

        {righe.length === 0 && <div className="vuoto">{cerca ? 'Nessun abbonamento trovato.' : 'Nessun abbonamento in questo gruppo.'}</div>}
        {famiglie.map((f) => {
          const dellaFamiglia = righe.filter((t) => (t.famiglia || 'Senza famiglia') === f);
          const tutti = dellaFamiglia.every((t) => scelti.includes(t.id));
          return (
            <div key={f} className="gruppo-famiglia">
              <label className="spunta gruppo-famiglia-testa">
                <input type="checkbox" checked={tutti} onChange={() => spuntaFamiglia(f)} />
                <span><strong>{f}</strong> <span className="piccolo muto">· {dellaFamiglia.length}</span></span>
              </label>
              {dellaFamiglia.map((t) => (
                <label key={t.id} className="spunta gruppo-voce">
                  <input type="checkbox" checked={scelti.includes(t.id)} onChange={() => spunta(t.id)} />
                  <span>
                    {t.nome}<span className="muto">{t.codice ? ` · ${t.codice}` : ''} · {euro(t.prezzo_cent)}</span>
                  </span>
                </label>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
