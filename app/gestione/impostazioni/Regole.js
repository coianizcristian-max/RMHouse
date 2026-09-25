'use client';
import { useState } from 'react';
import { useSalva, BottoneSalva } from './Salva';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const SOGLIE = [
  ['in_scadenza_giorni', 'In scadenza', 'giorni prima della fine', 10],
  ['esaurimento_ingressi', 'In esaurimento', 'ingressi rimasti o meno', 2],
  ['perso_giorni', 'Perso', 'giorni dopo la scadenza senza rinnovo', 30],
  ['inattivo_giorni', 'Inattivo', 'giorni senza presenze', 14],
  ['rientro_giorni', 'Rientrato', 'giorni di pausa prima di tornare', 60],
  ['fedele_mesi', 'Iscritto da mesi', 'mesi dalla prima iscrizione', 3],
];
const SCONTI = [
  ['piu_corsi_2', 'Secondo corso', 'stessa persona'],
  ['piu_corsi_3', 'Dal terzo corso', 'stessa persona'],
  ['famiglia_2', 'Secondo della famiglia', 'fratelli, genitore e figlio…'],
  ['famiglia_3', 'Dal terzo della famiglia', ''],
];

export default function Regole({ palestra }) {
  const { salva, stato } = useSalva(palestra.id);
  const [f, setF] = useState({
    quota: ((palestra.quota_iscrizione_cent || 0) / 100).toString(),
    mese: palestra.mese_inizio_stagione || 9,
    giorni: palestra.giorni_prenotabili ?? 21,
    preavviso: palestra.preavviso_ore ?? 2,
    recensione: palestra.google_review_url || '',
    ...Object.fromEntries(SOGLIE.map(([k, , , base]) => [k, palestra.soglie?.[k] ?? base])),
    ...Object.fromEntries(SCONTI.map(([k]) => [`s_${k}`, palestra.sconti?.[k] ?? ''])),
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function invia(e) {
    e.preventDefault();
    salva({
      quota_iscrizione_cent: Math.round(parseFloat(String(f.quota).replace(',', '.') || '0') * 100),
      mese_inizio_stagione: parseInt(f.mese, 10),
      giorni_prenotabili: parseInt(f.giorni, 10),
      preavviso_ore: parseInt(f.preavviso, 10),
      google_review_url: f.recensione || null,
      soglie: Object.fromEntries(SOGLIE.map(([k, , , base]) => [k, parseInt(f[k], 10) || base])),
      sconti: Object.fromEntries(SCONTI.map(([k]) => [k, f[`s_${k}`] === '' ? null : Math.min(100, Math.max(0, parseInt(f[`s_${k}`], 10) || 0))])),
    });
  }

  return (
    <form onSubmit={invia} className="scheda-due">
      <div>
        <section className="pannello">
          <h2>Quota e stagione</h2>
          <div className="griglia-soglie">
            <div className="campo"><label htmlFor="quota">Quota annuale (€)</label>
              <input id="quota" inputMode="decimal" value={f.quota} onChange={set('quota')} />
              <span className="piccolo muto">Vale per la stagione o per 12 mesi dal pagamento.</span></div>
            <div className="campo"><label htmlFor="mese">La stagione inizia a</label>
              <select id="mese" value={f.mese} onChange={set('mese')}>
                {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select></div>
          </div>
        </section>
        <section className="pannello">
          <h2>Prove dal sito</h2>
          <div className="griglia-soglie">
            <div className="campo"><label htmlFor="gg">Prenotabili fino a (giorni)</label>
              <input id="gg" type="number" min="1" value={f.giorni} onChange={set('giorni')} /></div>
            <div className="campo"><label htmlFor="pv">Preavviso minimo (ore)</label>
              <input id="pv" type="number" min="0" value={f.preavviso} onChange={set('preavviso')} /></div>
          </div>
          <div className="campo"><label htmlFor="rec">Link per le recensioni Google</label>
            <input id="rec" value={f.recensione} onChange={set('recensione')} placeholder="https://g.page/r/…/review" />
            <span className="piccolo muto">Finisce nell'email dopo la prova.</span></div>
        </section>
      </div>
      <aside>
        <section className="pannello">
          <h2>Stato dei clienti</h2>
          <p className="piccolo muto" style={{ marginTop: -4 }}>Le soglie con cui ogni persona prende da sola il suo stato.</p>
          <div className="griglia-soglie">
            {SOGLIE.map(([k, nome, aiuto]) => (
              <div className="campo" key={k}><label htmlFor={k}>{nome}</label>
                <input id={k} type="number" min="1" value={f[k]} onChange={set(k)} />
                <span className="piccolo muto">{aiuto}</span></div>
            ))}
          </div>
        </section>
        <section className="pannello">
          <h2>Sconti da proporre (%)</h2>
          <p className="piccolo muto" style={{ marginTop: -4 }}>
            Quando iscrivi qualcuno, la scheda propone lo sconto giusto: tu decidi se applicarlo. Vuoto = nessuna proposta.
          </p>
          <div className="griglia-soglie">
            {SCONTI.map(([k, nome, aiuto]) => (
              <div className="campo" key={k}><label htmlFor={`s_${k}`}>{nome}</label>
                <input id={`s_${k}`} type="number" min="0" max="100" value={f[`s_${k}`]} onChange={set(`s_${k}`)} />
                {aiuto && <span className="piccolo muto">{aiuto}</span>}</div>
            ))}
          </div>
        </section>
        <BottoneSalva stato={stato} testo="Salva le regole" />
      </aside>
    </form>
  );
}
