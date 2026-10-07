'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Impostazioni → Velocità: misure vere dal browser della segreteria e dal server, con il giudizio accanto.
// Serve a capire se il lento è il server (avvio a freddo), il database (macchina piccola) o la rete.
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
async function cronometra(n, fn) {
  const t = [];
  for (let i = 0; i < n; i++) { const a = performance.now(); await fn(); t.push(Math.round(performance.now() - a)); }
  return { mediana: mediana(t), tempi: t };
}
// soglie: verde / giallo / rosso
const acceso = (sec) => (sec == null ? '—' : sec < 90 ? `${sec} s (appena svegliato)` : `${Math.round(sec / 60)} min`);
const giudizio = (ms, [ok, forse]) => (ms == null ? ['', '—'] : ms <= ok ? ['ok', 'bene'] : ms <= forse ? ['forse', 'migliorabile'] : ['no', 'lento']);

export default function Velocita({ supabaseUrl, pagine }) {
  const [stato, setStato] = useState('pronto');   // pronto | misuro | fatto | errore
  const [b, setB] = useState(null);                // misure dal browser
  const [s, setS] = useState(null);                // misure dal server
  const [giri, setGiri] = useState(0);

  async function misura() {
    setStato('misuro');
    try {
      const db = supabaseBrowser();
      // 1) rete browser → Vercel (risposta vuota: è solo il viaggio + il risveglio del server)
      const vercel = await cronometra(4, () => fetch('/api/salute', { cache: 'no-store' }));
      // 2) rete browser → Supabase (una lettura minima: viaggio + coda del database)
      const supa = await cronometra(4, () => db.from('palestre').select('id').limit(1));
      // 3) una pagina intera dal server (la home) come la chiede il browser quando si naviga
      const pagina = await cronometra(3, () => fetch('/gestione?_v=' + Math.random(), { headers: { RSC: '1' }, cache: 'no-store' }).then((r) => r.text()));
      setB({ vercel, supa, pagina, connessione: navigator.connection?.effectiveType || '', quando: new Date().toLocaleTimeString('it-IT') });
      // 4) dal server verso il database
      const r = await fetch('/api/velocita', { cache: 'no-store' });
      setS(r.ok ? await r.json() : { errore: `HTTP ${r.status}` });
      setStato('fatto'); setGiri((g) => g + 1);
    } catch (e) { setStato('errore'); setS({ errore: String(e?.message || e) }); }
  }
  useEffect(() => { misura(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const m = s?.misure;
  const righe = [
    ['Browser → server (Vercel), risposta vuota', b?.vercel?.mediana, [150, 400], 'Solo il viaggio di andata e ritorno e il risveglio del server. Sopra 400 ms il server era "freddo" o la rete è lenta.'],
    ['Browser → database (Supabase), una lettura', b?.supa?.mediana, [150, 350], 'Viaggio + coda del database. Se è molto più alto della riga sopra, il database è il collo di bottiglia.'],
    ['Browser → home intera (dati dal server)', b?.pagina?.mediana, [500, 1200], `Quanto aspetta la segreteria aprendo il Riepilogo: comprende tutto.${b?.pagina ? ` Le tre misure: ${b.pagina.tempi.join(' · ')} ms (la prima può pagare l'avvio del server).` : ''}`],
    ['Server → database, una lettura semplice', m?.semplice?.mediana, [40, 120], 'Il costo di OGNI richiesta al database dal server. Su una macchina piccola (Nano) sta sui 100–250 ms: la leva è il piano Supabase.'],
    ['Server → database, 8 letture insieme', m?.parallele8?.mediana, [80, 250], 'Se è molto più della singola, le richieste si mettono in coda: per questo le pagine chiedono tutto con una funzione sola.'],
    ['Server → riconoscere chi è collegato', m?.staff_ms, [5, 80], 'Lettura del token e scheda staff (in memoria un minuto).'],
    ['Funzione della home (home_dati)', m?.home?.mediana, [150, 400], 'Tutto il Riepilogo in una chiamata.'],
    ['Funzione dello Sportello (sportello_dati)', m?.sportello?.mediana, [120, 300], 'Corsi, abbonamenti, orari, impostazioni in una chiamata.'],
    ['Funzione della scheda persona (scheda_persona)', m?.scheda?.mediana, [150, 400], 'Tutta la scheda in una chiamata (prima erano 25 richieste in 5 ondate).'],
    ['Elenco persone (60 righe)', m?.persone?.mediana, [120, 350], 'Una pagina di elenco dalla vista dello stato clienti.'],
  ];

  return (
    <div className="vel">
      <div className="vel-testa">
        <button type="button" className="btn btn-primario" disabled={stato === 'misuro'} onClick={misura}>{stato === 'misuro' ? 'Misuro…' : giri ? 'Misura di nuovo' : 'Misura'}</button>
        <span className="piccolo muto">
          Server delle pagine ({pagine?.regione}): acceso da {acceso(pagine?.acceso_da_s)} · {pagine?.servite} pagine servite
          {s?.server && <> · server delle misure: acceso da {acceso(s.server.acceso_da_s)} · {s.server.richieste_servite} misure · database {s.database?.host}</>}
        </span>
        {b?.connessione && <span className="piccolo muto">· rete del browser: {b.connessione}</span>}
      </div>
      {s?.errore && <div className="errore" role="alert">Misura dal server non riuscita: {s.errore}</div>}
      <table className="vel-tabella">
        <thead><tr><th>Cosa</th><th>Tempo</th><th>Giudizio</th><th>Cosa vuol dire</th></tr></thead>
        <tbody>
          {righe.map(([nome, ms, soglie, nota]) => {
            const [cls, testo] = giudizio(ms, soglie);
            return (
              <tr key={nome}>
                <td>{nome}</td>
                <td className="vel-ms">{ms == null ? (stato === 'misuro' ? '…' : '—') : `${ms} ms`}</td>
                <td><span className={`tag ${cls === 'ok' ? 'tag-ok' : cls === 'forse' ? 'tag-attenzione' : cls === 'no' ? 'tag-rosso' : 'tag-neutro'}`}>{testo}</span></td>
                <td className="piccolo muto">{nota}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {stato === 'fatto' && m && (
        <div className="vel-verdetto">
          <strong>Dove va il tempo</strong>
          <ul>
            {(pagine?.acceso_da_s < 90 || s?.server?.acceso_da_s < 90) && (
              <li><b>Il server si è appena acceso</b> ({pagine?.acceso_da_s < 90 ? `pagine: ${pagine.acceso_da_s} s` : ''}{pagine?.acceso_da_s < 90 && s?.server?.acceso_da_s < 90 ? ', ' : ''}{s?.server?.acceso_da_s < 90 ? `misure: ${s.server.acceso_da_s} s` : ''}).
                Ogni avvio costa 1–1,5 s alla prima pagina. Se succede a ogni misura anche a distanza di pochi minuti, su Vercel è spento
                "Fluid compute" (Project → Settings → Functions) oppure il piano Hobby ricicla i server in fretta: accenderlo e ridistribuire.
                La query 145 fa svegliare il sito ogni 4 minuti anche sulle pagine.</li>
            )}
            {b?.pagina && Math.max(...b.pagina.tempi) > 2 * Math.min(...b.pagina.tempi) && Math.max(...b.pagina.tempi) > 700 && (
              <li>La home è arrivata in {Math.min(...b.pagina.tempi)} ms una volta e in {Math.max(...b.pagina.tempi)} un&apos;altra: la differenza è l&apos;avvio a freddo del server, non il database.</li>
            )}
            {m.semplice?.mediana > 80 && <li>Il database risponde in {m.semplice.mediana} ms a una lettura banale: è la voce più pesante, e si moltiplica per ogni richiesta. Soluzione: Supabase Pro con macchina dedicata (Micro o Small). Da Nano a Small di solito si scende sotto i 30 ms.</li>}
            {m.parallele8?.mediana > m.semplice?.mediana * 2 && <li>Otto letture insieme costano {m.parallele8.mediana} ms contro {m.semplice.mediana} di una sola: le richieste si mettono in coda. Per questo le pagine principali ora fanno una chiamata sola.</li>}
            {b?.vercel?.mediana > 400 && <li>Il server ha impiegato {b.vercel.mediana} ms a rispondere a vuoto: avvio a freddo o rete lenta. Su Vercel: Settings → Functions → Fluid compute acceso; il database lo sveglia ogni 5 minuti (query 135).</li>}
            {b?.supa?.mediana > 350 && <li>Dal browser il database risponde in {b.supa.mediana} ms: pesa su tutto quello che le pagine leggono dopo l&apos;apertura (campanella, ricerche, pannelli).</li>}
            {m.semplice?.mediana <= 80 && (b?.vercel?.mediana || 0) <= 400 && !(pagine?.acceso_da_s < 90 || s?.server?.acceso_da_s < 90) && <li>Server e database rispondono bene: le pagine devono aprirsi sotto il mezzo secondo. Se così non è, misura di nuovo mentre la pagina è lenta e mandami lo screenshot.</li>}
          </ul>
        </div>
      )}
      <p className="piccolo muto">Le misure si fanno 2–4 volte e si tiene quella di mezzo. La prima dopo tanto tempo comprende il risveglio del server: misura di nuovo per il valore vero.</p>
    </div>
  );
}
