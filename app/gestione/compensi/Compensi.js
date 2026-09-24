'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve, ora } from '@/lib/formato';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
              'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export default function Compensi({ palestraId, righe, anno, mese }) {
  const router = useRouter();
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);
  const [aperto, setAperto] = useState(null);
  const [dettaglio, setDettaglio] = useState([]);

  const daPagare = righe.filter((r) => r.stato !== 'pagato' && r.totale_cent > 0);
  const totaleDaPagare = daPagare.reduce((s, r) => s + r.totale_cent, 0);
  const totalePagato = righe.filter((r) => r.stato === 'pagato').reduce((s, r) => s + r.totale_cent, 0);
  const oreTotali = righe.reduce((s, r) => s + Number(r.ore || 0), 0);

  const precedente = mese === 1 ? { a: anno - 1, m: 12 } : { a: anno, m: mese - 1 };
  const successivo = mese === 12 ? { a: anno + 1, m: 1 } : { a: anno, m: mese + 1 };

  async function calcola() {
    setInvio(true); setErrore(''); setAvviso('');
    const { data, error } = await supabaseBrowser().rpc('calcola_compensi', {
      p_palestra: palestraId, p_anno: anno, p_mese: mese,
    });
    setInvio(false);
    if (error) { setErrore('Calcolo non riuscito.'); return; }
    setAvviso(`Aggiornati ${data} cedolini sulle lezioni effettivamente svolte.`);
    router.refresh();
  }

  async function approva() {
    setInvio(true); setErrore('');
    const { data, error } = await supabaseBrowser().rpc('approva_compensi', {
      p_palestra: palestraId, p_anno: anno, p_mese: mese,
    });
    setInvio(false);
    if (error) { setErrore('Operazione non riuscita.'); return; }
    setAvviso(`Approvati ${data} cedolini: ora sono pronti da pagare.`);
    router.refresh();
  }

  async function extra(r) {
    const v = prompt(`Extra per ${r.staff.nome} (€): sostituzioni, saggio, rimborsi.`,
      r.extra_cent ? (r.extra_cent / 100).toString() : '');
    if (v === null) return;
    const nota = prompt('Per cosa?', r.extra_nota || '');
    if (nota === null) return;
    const cent = Math.round(parseFloat(String(v).replace(',', '.') || '0') * 100);
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('aggiorna_compenso', {
      p_id: r.id, p_extra_cent: Number.isFinite(cent) ? cent : 0, p_extra_nota: nota || null,
      p_ore: null, p_note: null,
    });
    setInvio(false);
    if (error) { setErrore('Non salvato.'); return; }
    router.refresh();
  }

  async function paga(r) {
    const metodo = prompt(`Come paghi ${euro(r.totale_cent)} a ${r.staff.nome}? bonifico, contanti, altro`, 'bonifico');
    if (!metodo) return;
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('paga_compenso', {
      p_id: r.id, p_metodo: metodo.trim().toLowerCase(), p_data: new Date().toLocaleDateString('sv-SE'),
    });
    setInvio(false);
    if (error) { setErrore('Pagamento non registrato.'); return; }
    setAvviso('Pagato: la spesa è finita nei costi e nel flusso di cassa.');
    router.refresh();
  }

  async function apri(r) {
    if (aperto === r.id) { setAperto(null); return; }
    setAperto(r.id); setDettaglio([]);
    const { data } = await supabaseBrowser().rpc('dettaglio_compenso', { p_id: r.id });
    setDettaglio(data || []);
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Conti</div>
        <h1>Compensi insegnanti</h1>
        <p>Le ore davvero svolte, il compenso di ciascuno, e cosa resta da pagare a fine mese.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="errore" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>{avviso}</div>}

      <div className="giorno-nav">
        <Link className="btn" href={`/gestione/compensi?anno=${precedente.a}&mese=${precedente.m}`} aria-label="Mese precedente">‹</Link>
        <h2 style={{ fontSize: 17, margin: 0, textTransform: 'capitalize' }}>{MESI[mese - 1]} {anno}</h2>
        <Link className="btn" href={`/gestione/compensi?anno=${successivo.a}&mese=${successivo.m}`} aria-label="Mese successivo">›</Link>
      </div>

      <div className="griglia" style={{ marginBottom: 14 }}>
        <div className="tessera tessera-rossa">
          <div className="etichetta">Da pagare</div>
          <div className="cifra">{euro(totaleDaPagare)}</div>
          <div className="sotto">{daPagare.length} insegnanti</div>
        </div>
        <div className="tessera">
          <div className="etichetta">Già pagato</div>
          <div className="cifra">{euro(totalePagato)}</div>
          <div className="sotto">nel mese</div>
        </div>
        <div className="tessera tessera-nera">
          <div className="etichetta">Ore svolte</div>
          <div className="cifra">{oreTotali.toFixed(1)}</div>
          <div className="sotto">{righe.reduce((s, r) => s + (r.lezioni || 0), 0)} lezioni</div>
        </div>
      </div>

      <div className="azioni-riga" style={{ marginBottom: 14 }}>
        <button className="btn btn-primario" disabled={invio} onClick={calcola}>
          {righe.length ? 'Ricalcola il mese' : 'Calcola il mese'}
        </button>
        {righe.some((r) => r.stato === 'bozza') && (
          <button className="btn" disabled={invio} onClick={approva}>Approva tutti</button>
        )}
        <Link className="link-btn" href="/gestione/costi">Vedi i costi</Link>
      </div>

      {righe.length === 0 && (
        <div className="vuoto">
          Nessun cedolino per questo mese.
          <div className="piccolo" style={{ marginTop: 8 }}>Premi "Calcola il mese": le ore vengono dalle lezioni in calendario.</div>
        </div>
      )}

      {righe.map((r) => (
        <div key={r.id} className="scheda-corso" style={{ gridTemplateColumns: '6px 1fr', alignItems: 'start' }}>
          <span className="banda" style={{ background: r.staff?.colore || 'var(--nero)' }} />
          <span className="centro" style={{ paddingRight: 14 }}>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {r.staff?.foto_url
                ? <img src={r.staff.foto_url} alt="" className="miniatura" />
                : <span className="miniatura segnaposto">{(r.staff?.nome?.[0] || '') + (r.staff?.cognome?.[0] || '')}</span>}
              <span className="titolo">{r.staff?.nome} {r.staff?.cognome}</span>
              {r.stato === 'bozza' && <span className="tag tag-neutro">bozza</span>}
              {r.stato === 'approvato' && <span className="tag tag-attenzione">da pagare</span>}
              {r.stato === 'pagato' && <span className="tag tag-ok">pagato {dataBreve(r.pagato_at)}</span>}
            </span>

            <span className="riga">
              {Number(r.ore).toFixed(1)} ore su {r.lezioni} lezioni × {euro(r.tariffa_cent)} all'ora
              {r.extra_cent > 0 && ` · extra ${euro(r.extra_cent)}${r.extra_nota ? ` (${r.extra_nota})` : ''}`}
            </span>
            <span style={{ fontSize: 22, fontWeight: 850, color: 'var(--nero)' }}>{euro(r.totale_cent)}</span>
            {r.tariffa_cent === 0 && (
              <span className="riga" style={{ color: 'var(--rosso)' }}>
                Tariffa oraria mancante: impostala in Struttura → Staff.
              </span>
            )}

            <span className="azioni-riga">
              <button className="link-btn piccolo" onClick={() => apri(r)}>
                {aperto === r.id ? 'Chiudi il dettaglio' : 'Vedi le lezioni'}
              </button>
              {r.stato !== 'pagato' && (
                <>
                  <button className="link-btn piccolo" disabled={invio} onClick={() => extra(r)}>Extra</button>
                  <button className="link-btn piccolo" disabled={invio || r.totale_cent <= 0} onClick={() => paga(r)}>Segna pagato</button>
                </>
              )}
            </span>

            {aperto === r.id && (
              <ul className="elenco" style={{ marginTop: 8 }}>
                {dettaglio.length === 0 && <li className="persona"><span className="muto piccolo">Nessuna lezione in questo mese.</span></li>}
                {dettaglio.map((d, i) => (
                  <li key={i} className="persona">
                    <span>
                      {dataBreve(d.data)} · {d.corso}
                      <span className="piccolo muto" style={{ display: 'block' }}>
                        {ora(d.inizio)} · {d.sala || 'sala non indicata'} · {d.iscritti} iscritti
                      </span>
                    </span>
                    <span className="piccolo">{Number(d.ore).toFixed(2)} h</span>
                  </li>
                ))}
              </ul>
            )}
          </span>
        </div>
      ))}

      <p className="piccolo muto" style={{ marginTop: 18 }}>
        Il calcolo parte dalle lezioni in calendario non annullate, moltiplicate per la tariffa oraria della persona.
        Quando segni pagato, nasce una spesa di categoria "compensi": da lì finisce nei costi, nei margini dei corsi
        e nel flusso di cassa. Un cedolino già pagato non viene più toccato dal ricalcolo.
      </p>
    </>
  );
}
