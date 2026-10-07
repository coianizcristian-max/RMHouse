'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Le famiglie degli abbonamenti (Street e Danza adulti, Aerea Kids e Teen…): servono solo a raggruppare gli abbonamenti
// negli elenchi (filtri, Sportello, scheda persona, Corsi coperti, Recuperi). Qui si rinominano o si uniscono in un colpo.
// Quelle che sembrano la stessa scritta in modo diverso ("Kids/Teen" e "Kids e Teen") sono segnalate.
const chiaveSimile = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[/,&+.-]/g, ' ').replace(/\b(e|ed|and)\b/g, ' ').replace(/\s+/g, ' ').trim();

export default function Famiglie({ palestraId, tipi }) {
  const router = useRouter();
  const [apri, setApri] = useState(null);      // famiglia in modifica
  const [nome, setNome] = useState('');
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);

  const conta = {};
  for (const t of tipi) { const f = t.famiglia || ''; conta[f] = (conta[f] || 0) + 1; }
  const famiglie = Object.keys(conta).filter(Boolean).sort((a, b) => a.localeCompare(b, 'it'));
  const simili = (f) => famiglie.filter((x) => x !== f && chiaveSimile(x) === chiaveSimile(f));

  async function rinomina(da, a) {
    if (!String(a || '').trim()) { setErrore('Scrivi il nuovo nome.'); return; }
    setInvio(true); setErrore(''); setAvviso('');
    const { data, error } = await supabaseBrowser().rpc('rinomina_famiglia', { p_palestra: palestraId, p_da: da || null, p_a: a });
    setInvio(false);
    if (error) { setErrore('Non riuscito. Riprova.'); return; }
    const unita = famiglie.some((x) => x !== da && x.toLowerCase() === String(a).trim().toLowerCase());
    setAvviso(`${data} ${data === 1 ? 'abbonamento' : 'abbonamenti'} ${unita ? `uniti in «${a.trim()}»` : `ora in «${a.trim()}»`}.`);
    setApri(null); router.refresh();
  }

  return (
    <div className="famiglie">
      <p className="muto piccolo" style={{ margin: '0 0 10px' }}>
        La famiglia raggruppa gli abbonamenti simili negli elenchi (filtri, Sportello, scheda persona, corsi coperti, recuperi):
        non cambia prezzi, corsi né regole. Nella scheda dell&apos;abbonamento si sceglie dall&apos;elenco; una nuova si crea con
        «+ Nuova famiglia». Qui si rinominano o si uniscono: cambiano su tutti i loro abbonamenti.
      </p>
      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="avviso-ok" role="status">{avviso}</div>}
      <ul className="elenco">
        {famiglie.map((f) => (
          <li key={f} className="persona fam-riga">
            <div style={{ minWidth: 0 }}>
              <span className="persona-nome">{f}</span> <span className="piccolo muto">· {conta[f]} {conta[f] === 1 ? 'abbonamento' : 'abbonamenti'}</span>
              {simili(f).length > 0 && (
                <div className="fam-simili">
                  Sembra la stessa di {simili(f).map((x, i) => (
                    <span key={x}>{i > 0 && ', '}<b>«{x}»</b> <button type="button" className="link-btn piccolo" disabled={invio}
                      onClick={() => { if (confirm(`Unire «${f}» in «${x}»? I ${conta[f]} abbonamenti di «${f}» passano a «${x}».`)) rinomina(f, x); }}>unisci qui</button></span>
                  ))}
                </div>
              )}
              {apri === f && (
                <form className="fam-modifica" onSubmit={(e) => { e.preventDefault(); rinomina(f, nome); }}>
                  <input value={nome} onChange={(e) => setNome(e.target.value)} list="fam-elenco" autoFocus aria-label="Nuovo nome della famiglia" />
                  <datalist id="fam-elenco">{famiglie.filter((x) => x !== f).map((x) => <option key={x} value={x} />)}</datalist>
                  <button className="btn btn-primario btn-piccolo" disabled={invio}>{invio ? 'Salvo…' : 'Salva'}</button>
                  <button type="button" className="btn btn-piccolo" onClick={() => setApri(null)}>Annulla</button>
                  <span className="piccolo muto">Scrivendo il nome di un&apos;altra famiglia le unisci.</span>
                </form>
              )}
            </div>
            {apri !== f && (
              <div className="gestore-azioni">
                <button type="button" className="link-btn" onClick={() => { setApri(f); setNome(f); setErrore(''); }}>Rinomina o unisci</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {conta[''] > 0 && <p className="piccolo muto">{conta['']} {conta[''] === 1 ? 'abbonamento è' : 'abbonamenti sono'} senza famiglia.</p>}
    </div>
  );
}
