'use client';
import { useState } from 'react';
import { useSalva, BottoneSalva } from '../Salva';
import { testoSu } from '@/lib/colori';

const COLORI = ['#f40000', '#000000', '#b3001b', '#e11d9c', '#2200ff', '#008080', '#ff8c00'];

export default function Aspetto({ palestra }) {
  const { salva, stato } = useSalva(palestra.id);
  const a = palestra.area_cliente || {};
  const [f, setF] = useState({ benvenuto: a.benvenuto || '', avviso: a.avviso || '', colore: a.colore || '#f40000' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const colore = /^#[0-9a-f]{6}$/i.test(f.colore) ? f.colore : '#f40000';
  // "La scuola" nell'app: contatti con orari, apertura, social, responsabile safeguarding
  const [contatti, setContatti] = useState(() => {
    const c = Array.isArray(a.contatti) ? a.contatti : [];
    return [...c, ...Array(Math.max(0, 3 - c.length)).fill(null).map(() => ({ etichetta: '', telefono: '', orari: '' }))].slice(0, 3);
  });
  const [g, setG] = useState({
    orari_apertura: a.orari_apertura || '', instagram: a.instagram || '', facebook: a.facebook || '', youtube: a.youtube || '',
    sg_nome: a.safeguarding?.nome || '', sg_email: a.safeguarding?.email || '', sg_telefono: a.safeguarding?.telefono || '',
    bn_intestatario: a.bonifico?.intestatario || '', bn_iban: a.bonifico?.iban || '', bn_banca: a.bonifico?.banca || '',
  });
  const setC = (i, k) => (e) => setContatti(contatti.map((c, j) => (j === i ? { ...c, [k]: e.target.value } : c)));
  const setGg = (k) => (e) => setG({ ...g, [k]: e.target.value });
  function salvaScuola(e) {
    e.preventDefault();
    salva({ area_cliente: { ...a, ...f, colore,
      contatti: contatti.filter((c) => c.etichetta.trim() || c.telefono.trim()).map((c) => ({ etichetta: c.etichetta.trim(), telefono: c.telefono.trim(), orari: c.orari.trim() })),
      orari_apertura: g.orari_apertura.trim(), instagram: g.instagram.trim(), facebook: g.facebook.trim(), youtube: g.youtube.trim(),
      safeguarding: { nome: g.sg_nome.trim(), email: g.sg_email.trim(), telefono: g.sg_telefono.trim() },
      bonifico: { intestatario: g.bn_intestatario.trim(), iban: g.bn_iban.trim().toUpperCase(), banca: g.bn_banca.trim() },
    } });
  }

  return (
    <div className="scheda-due">
      <form className="pannello" onSubmit={(e) => { e.preventDefault(); salva({ area_cliente: { ...a, ...f, colore } }); }}>
        <div className="campo"><label htmlFor="ben">Messaggio di benvenuto</label>
          <textarea id="ben" rows={3} value={f.benvenuto} onChange={set('benvenuto')}
                    placeholder="Es. Bentornati! Da ottobre il sabato mattina c'è Antigravity per principianti." />
          <span className="piccolo muto">Compare sotto il saluto, in alto.</span></div>
        <div className="campo"><label htmlFor="avv">Avviso in evidenza</label>
          <textarea id="avv" rows={3} value={f.avviso} onChange={set('avviso')}
                    placeholder="Es. Il 1° novembre la scuola è chiusa." />
          <span className="piccolo muto">Riquadro con il bordo colorato. Vuoto = nessun avviso.</span></div>
        <div className="campo">
          <label>Colore principale</label>
          <div className="tinte">
            {COLORI.map((c) => (
              <button type="button" key={c} aria-label={c} aria-pressed={colore.toLowerCase() === c}
                      onClick={() => setF({ ...f, colore: c })} style={{ background: c, color: testoSu(c) }}>
                {colore.toLowerCase() === c ? '✓' : ''}
              </button>
            ))}
          </div>
          <div className="tinte-libero" style={{ marginTop: 8 }}>
            <input type="color" value={colore} onChange={set('colore')} aria-label="Colore libero" />
            <input type="text" value={f.colore} onChange={set('colore')} aria-label="Codice colore" maxLength={7} />
          </div>
        </div>
        <BottoneSalva stato={stato} />
      </form>

      <form className="pannello scuola-app" onSubmit={salvaScuola}>
        <h2>La scuola nell'app</h2>
        <p className="piccolo muto">Compare in Io → "La scuola": i clienti chiamano o scrivono su WhatsApp con un tocco.</p>
        {contatti.map((c, i) => (
          <div key={i} className="scuola-contatto">
            <input value={c.etichetta} onChange={setC(i, 'etichetta')} placeholder={i === 0 ? 'Segreteria corsi' : i === 1 ? 'Direzione ed eventi (Erika)' : 'Altro contatto'} aria-label={`Contatto ${i + 1}: chi`} />
            <input value={c.telefono} onChange={setC(i, 'telefono')} placeholder="Telefono / WhatsApp" inputMode="tel" aria-label={`Contatto ${i + 1}: telefono`} />
            <input value={c.orari} onChange={setC(i, 'orari')} placeholder="Lun-Ven 16:00-20:00" aria-label={`Contatto ${i + 1}: orari`} />
          </div>
        ))}
        <div className="campo"><label htmlFor="ap">Orari di apertura</label><input id="ap" value={g.orari_apertura} onChange={setGg('orari_apertura')} placeholder="Lun-Ven 9:30-22:00" /></div>
        <div className="scuola-contatto">
          <input value={g.instagram} onChange={setGg('instagram')} placeholder="Instagram (link o @nome)" aria-label="Instagram" />
          <input value={g.facebook} onChange={setGg('facebook')} placeholder="Facebook (link)" aria-label="Facebook" />
          <input value={g.youtube} onChange={setGg('youtube')} placeholder="YouTube (link o @nome)" aria-label="YouTube" />
        </div>
        <label className="piccolo" style={{ fontWeight: 700 }}>Responsabile safeguarding</label>
        <div className="scuola-contatto">
          <input value={g.sg_nome} onChange={setGg('sg_nome')} placeholder="Nome e cognome" aria-label="Safeguarding: nome" />
          <input value={g.sg_email} onChange={setGg('sg_email')} placeholder="Email" type="email" aria-label="Safeguarding: email" />
          <input value={g.sg_telefono} onChange={setGg('sg_telefono')} placeholder="Telefono" inputMode="tel" aria-label="Safeguarding: telefono" />
        </div>
        <label className="piccolo" style={{ fontWeight: 700 }}>Pagamento con bonifico (compare nel negozio dell'app, solo a chi sta pagando)</label>
        <div className="scuola-contatto">
          <input value={g.bn_intestatario} onChange={setGg('bn_intestatario')} placeholder="Intestato a" aria-label="Bonifico: intestatario" />
          <input value={g.bn_iban} onChange={setGg('bn_iban')} placeholder="IBAN" aria-label="Bonifico: IBAN" autoCapitalize="characters" />
          <input value={g.bn_banca} onChange={setGg('bn_banca')} placeholder="Banca" aria-label="Bonifico: banca" />
        </div>
        <BottoneSalva stato={stato} />
      </form>

      <aside>
        <div className="telefono">
          <div className="tel-testa"><strong>{palestra.nome}</strong><span style={{ color: colore }}>La mia area</span></div>
          <div className="tel-corpo">
            <div className="tel-occhiello" style={{ color: colore }}>LA MIA AREA</div>
            <div className="tel-titolo">Ciao Giulia</div>
            <p className="tel-testo">{f.benvenuto || 'La prossima lezione è giovedì alle 19:45.'}</p>
            {f.avviso && <div className="tel-avviso" style={{ borderColor: colore }}>{f.avviso}</div>}
            <div className="tel-lezione"><span style={{ background: colore }} /><div><strong>19:45</strong><br />Pole Dance Liv.3</div></div>
            <div className="tel-bottone" style={{ background: colore, color: testoSu(colore) }}>Prenota un recupero</div>
          </div>
        </div>
      </aside>
    </div>
  );
}
