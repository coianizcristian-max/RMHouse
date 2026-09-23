'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { EVENTI, rendi } from '@/lib/messaggi';
import { dataBreve, ora } from '@/lib/formato';

export default function Messaggi({ palestraId, template, coda, emailStaff }) {
  const router = useRouter();
  const [apri, setApri] = useState(null);
  const [bozza, setBozza] = useState({});
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);

  function modifica(t) {
    setBozza({ oggetto: t.oggetto || '', corpo: t.corpo, giorni: t.giorni, attivo: t.attivo });
    setErrore(''); setAvviso(''); setApri(t.id);
  }
  function nuovo(evento) {
    setBozza({ oggetto: '', corpo: '', giorni: 0, attivo: true, evento });
    setErrore(''); setAvviso(''); setApri(`nuovo:${evento}`);
  }

  async function salva(e) {
    e.preventDefault();
    if (!bozza.corpo?.trim()) { setErrore('Il testo del messaggio non può essere vuoto.'); return; }
    setInvio(true); setErrore('');
    const db = supabaseBrowser();
    const dati = {
      oggetto: bozza.oggetto || null, corpo: bozza.corpo,
      giorni: parseInt(bozza.giorni, 10) || 0, attivo: !!bozza.attivo,
    };
    const { error } = String(apri).startsWith('nuovo:')
      ? await db.from('messaggi_template').insert({ ...dati, palestra_id: palestraId, evento: bozza.evento, canale: 'email' })
      : await db.from('messaggi_template').update(dati).eq('id', apri);
    setInvio(false);
    if (error) {
      setErrore(error.message?.includes('duplicate')
        ? 'Esiste già un messaggio per questo evento con lo stesso anticipo.'
        : 'Salvataggio non riuscito.');
      return;
    }
    setApri(null); router.refresh();
  }

  async function elimina(t) {
    if (!confirm('Eliminare questo messaggio? Non verrà più inviato.')) return;
    const { error } = await supabaseBrowser().from('messaggi_template').delete().eq('id', t.id);
    if (error) { setErrore('Eliminazione non riuscita.'); return; }
    router.refresh();
  }

  async function provaInvio(t) {
    setInvio(true); setErrore(''); setAvviso('');
    const r = await fetch('/api/messaggi/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template_id: t.id }),
    });
    const d = await r.json();
    setInvio(false);
    if (!r.ok) { setErrore(d.errore); return; }
    setAvviso(`Inviato a ${emailStaff}: controlla la posta.`);
  }

  const perEvento = Object.keys(EVENTI).map((ev) => [ev, template.filter((t) => t.evento === ev)]);

  return (
    <>
      <h1>Messaggi automatici</h1>
      <p className="muto piccolo">
        Il testo tra doppie graffe viene sostituito al momento dell'invio. L'anteprima usa dati di esempio.
      </p>
      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="errore" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>{avviso}</div>}

      {perEvento.map(([ev, righe]) => {
        const info = EVENTI[ev];
        return (
          <section key={ev} style={{ marginTop: 26 }}>
            <h2 style={{ marginBottom: 2 }}>{info.titolo}</h2>
            <p className="piccolo muto">{info.quando}</p>

            {righe.length === 0 && apri !== `nuovo:${ev}` && (
              <div className="vuoto" style={{ padding: 16 }}>
                Nessun messaggio: per questo evento non parte nulla.{' '}
                <button className="link-btn" onClick={() => nuovo(ev)}>Scrivilo ora</button>
              </div>
            )}

            {righe.map((t) => (
              <div key={t.id} style={{ borderTop: '1px solid var(--linea)', padding: '12px 0' }}>
                {apri === t.id ? (
                  <Modulo info={info} bozza={bozza} setBozza={setBozza} salva={salva} annulla={() => setApri(null)} invio={invio} />
                ) : (
                  <>
                    <div className="persona" style={{ alignItems: 'start', padding: 0 }}>
                      <div>
                        <span className="persona-nome">{t.oggetto || '(senza oggetto)'}</span>
                        {info.giorniEtichetta && <div className="piccolo muto">{t.giorni === 0 ? 'Il giorno stesso' : `${t.giorni} giorni`}</div>}
                      </div>
                      {!t.attivo && <span className="tag tag-neutro">spento</span>}
                    </div>
                    <p className="piccolo" style={{ whiteSpace: 'pre-wrap', color: 'var(--testo-2)', margin: '8px 0' }}>
                      {rendi(t.corpo).slice(0, 220)}{t.corpo.length > 220 ? '…' : ''}
                    </p>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <button className="link-btn piccolo" onClick={() => modifica(t)}>Modifica</button>
                      <button className="link-btn piccolo" disabled={invio} onClick={() => provaInvio(t)}>Invia una prova a me</button>
                      <button className="link-btn piccolo" onClick={() => elimina(t)}>Elimina</button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {apri === `nuovo:${ev}` && (
              <div style={{ borderTop: '1px solid var(--linea)', paddingTop: 12 }}>
                <Modulo info={info} bozza={bozza} setBozza={setBozza} salva={salva} annulla={() => setApri(null)} invio={invio} />
              </div>
            )}
            {info.multiplo && righe.length > 0 && apri !== `nuovo:${ev}` && (
              <button className="link-btn piccolo" onClick={() => nuovo(ev)}>Aggiungi un altro promemoria</button>
            )}
          </section>
        );
      })}

      <h2 style={{ marginTop: 34 }}>In partenza</h2>
      {coda.length === 0 ? (
        <div className="vuoto">Nessun messaggio in coda.</div>
      ) : (
        <ul className="elenco">
          {coda.map((m) => (
            <li key={m.id} className="persona" style={{ alignItems: 'start' }}>
              <div>
                <span className="piccolo" style={{ fontWeight: 600 }}>{m.oggetto}</span>
                <div className="piccolo muto">
                  {m.destinatario} · {dataBreve(m.programmato_per)} alle {ora(m.programmato_per)}
                </div>
              </div>
              <span className={`tag ${m.stato === 'errore' ? 'tag-rosso' : 'tag-neutro'}`}>{m.stato}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Modulo({ info, bozza, setBozza, salva, annulla, invio }) {
  const set = (k) => (e) => setBozza({ ...bozza, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  function inserisci(seg) {
    setBozza((b) => ({ ...b, corpo: `${b.corpo || ''}{{${seg}}}` }));
  }
  return (
    <form onSubmit={salva}>
      <div className="campo">
        <label htmlFor="ogg">Oggetto</label>
        <input id="ogg" value={bozza.oggetto} onChange={set('oggetto')} />
      </div>
      <div className="campo">
        <label htmlFor="corpo">Testo</label>
        <textarea id="corpo" style={{ minHeight: 220 }} value={bozza.corpo} onChange={set('corpo')} />
      </div>
      <div className="campo">
        <label>Segnaposto disponibili</label>
        <div className="filtri" style={{ marginBottom: 0 }}>
          {info.segnaposto.map((s) => (
            <a key={s} href="#" onClick={(e) => { e.preventDefault(); inserisci(s); }}>{`{{${s}}}`}</a>
          ))}
        </div>
        <span className="piccolo muto">Tocca un segnaposto per aggiungerlo in fondo al testo.</span>
      </div>
      {info.giorniEtichetta && (
        <div className="campo">
          <label htmlFor="gg">{info.giorniEtichetta}</label>
          <input id="gg" type="number" min="0" value={bozza.giorni} onChange={set('giorni')} />
        </div>
      )}
      <label className="spunta">
        <input type="checkbox" checked={!!bozza.attivo} onChange={set('attivo')} />
        <span>Attivo</span>
      </label>

      <div className="scheda" style={{ marginBottom: 16 }}>
        <div className="piccolo muto" style={{ marginBottom: 6 }}>Anteprima con dati di esempio</div>
        <div style={{ fontWeight: 600 }}>{rendi(bozza.oggetto) || '(senza oggetto)'}</div>
        <div className="piccolo" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{rendi(bozza.corpo)}</div>
      </div>

      <div className="azioni">
        <button className="btn btn-primario" disabled={invio}>{invio ? 'Salvo…' : 'Salva'}</button>
        <button type="button" className="btn" onClick={annulla}>Annulla</button>
      </div>
    </form>
  );
}
