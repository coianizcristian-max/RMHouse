'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve, ora } from '@/lib/formato';

const STATO_RIGA = { da_verificare: 'NON CONFERMATA: non contata', forfait: 'nel forfait', sostituita: 'non contata', contata: null, mensile: null };
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
              'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export default function Compensi({ palestraId, righe, anno, mese, soloConfermate = true, senzaInsegnante = 0, ore = null }) {
  const router = useRouter();
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);
  const [aperto, setAperto] = useState(null);
  const [dettaglio, setDettaglio] = useState([]);

  const daPagare = righe.filter((r) => r.stato !== 'pagato' && r.totale_cent > 0);
  const totaleDaPagare = daPagare.reduce((s, r) => s + r.totale_cent, 0);
  const totalePagato = righe.filter((r) => r.stato === 'pagato').reduce((s, r) => s + r.totale_cent, 0);
  const h = (v) => { const t = Math.round((v || 0) * 60); return `${Math.floor(t / 60)}h${t % 60 ? String(t % 60).padStart(2, '0') : ''}`; };

  const precedente = mese === 1 ? { a: anno - 1, m: 12 } : { a: anno, m: mese - 1 };
  const successivo = mese === 12 ? { a: anno + 1, m: 1 } : { a: anno, m: mese + 1 };

  async function calcola() {
    setInvio(true); setErrore(''); setAvviso('');
    const { data, error } = await supabaseBrowser().rpc('calcola_compensi', {
      p_palestra: palestraId, p_anno: anno, p_mese: mese,
    });
    setInvio(false);
    if (error) { setErrore('Calcolo non riuscito.'); return; }
    setAvviso(`Calcolati ${data} cedolini di ${MESI[mese - 1]} ${anno}.`);
    router.refresh();
  }

  async function cambiaSolo(v) {
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().from('palestre').update({ compensi: { solo_confermate: v } }).eq('id', palestraId);
    setInvio(false);
    if (error) { setErrore('Impostazione non salvata.'); return; }
    setAvviso(v ? 'Ora contano solo le lezioni confermate: premi "Ricalcola il mese".' : 'Ora contano tutte le lezioni in calendario: premi "Ricalcola il mese".');
    router.refresh();
  }

  async function eliminaBozze() {
    const n = righe.filter((r) => r.stato === 'bozza').length;
    if (!confirm(`Eliminare i ${n} cedolini in bozza di ${MESI[mese - 1]} ${anno}?\nQuelli approvati o pagati restano. Si possono ricreare con "Calcola il mese".`)) return;
    setInvio(true); setErrore(''); setAvviso('');
    const { data, error } = await supabaseBrowser().rpc('elimina_bozze_compensi', { p_palestra: palestraId, p_anno: anno, p_mese: mese });
    setInvio(false);
    if (error) { setErrore('Operazione non riuscita.'); return; }
    setAvviso(`Eliminati ${data} cedolini in bozza.`);
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
        <p>Le ore davvero svolte, il compenso di ogni persona, e cosa resta da pagare a fine mese.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="errore" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>{avviso}</div>}

      <div className="giorno-nav">
        <Link prefetch={false} className="btn" href={`/gestione/compensi?anno=${precedente.a}&mese=${precedente.m}`} aria-label="Mese precedente">‹</Link>
        <h2 style={{ fontSize: 17, margin: 0, textTransform: 'capitalize' }}>{MESI[mese - 1]} {anno}</h2>
        <Link prefetch={false} className="btn" href={`/gestione/compensi?anno=${successivo.a}&mese=${successivo.m}`} aria-label="Mese successivo">›</Link>
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
          <div className="cifra">{h(ore?.svolte)}</div>
          <div className="sotto">{ore?.lezioniSvolte ?? 0} lezioni confermate con l&apos;appello
            {ore?.daConfermare ? ` · ${ore.daConfermare} finite da confermare` : ''}</div>
        </div>
        <div className="tessera">
          <div className="etichetta">Ore in calendario</div>
          <div className="cifra">{h(ore?.calendario)}</div>
          <div className="sotto">{ore?.lezioni ?? 0} lezioni previste nel mese</div>
        </div>
      </div>

      {senzaInsegnante > 0 && (
        <div className="errore" style={{ background: 'var(--attenzione-tenue)', color: 'var(--attenzione)' }}>
          {senzaInsegnante} lezioni del mese non hanno l&apos;insegnante e nessuno le ha confermate: non vanno a nessuno.
          Assegna l&apos;insegnante nel palinsesto oppure fai confermare la lezione dall&apos;appello.
        </div>
      )}

      <div className="azioni-riga" style={{ marginBottom: 14 }}>
        <button className="btn btn-primario" disabled={invio} onClick={calcola}>
          {righe.length ? 'Ricalcola il mese' : 'Calcola il mese'}
        </button>
        {righe.some((r) => r.stato === 'bozza') && (
          <button className="btn" disabled={invio} onClick={approva}>Approva tutti</button>
        )}
        {righe.some((r) => r.stato === 'bozza') && (
          <button className="link-btn" disabled={invio} onClick={eliminaBozze}>Elimina le bozze</button>
        )}
        <Link prefetch={false} className="link-btn" href="/gestione/costi">Vedi i costi</Link>
        <label className="spunta" style={{ margin: 0 }}>
          <input type="checkbox" checked={soloConfermate} disabled={invio} onChange={(e) => cambiaSolo(e.target.checked)} />
          <span className="piccolo">Conta solo le lezioni confermate con l&apos;appello</span>
        </label>
      </div>

      {righe.length === 0 && (
        <div className="vuoto">
          Nessun cedolino per questo mese.
          <div className="piccolo" style={{ marginTop: 8 }}>Premi "Calcola il mese": le ore vengono dalle lezioni confermate con l'appello e dalle regole di ogni insegnante.</div>
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
              {Number(r.ore).toFixed(1)} ore · {r.lezioni} lezioni
              {r.sostituzioni > 0 && ` · ${r.sostituzioni} sostituzioni`}
              {r.forfait_cent > 0 && ` · forfait e fissi ${euro(r.forfait_cent)}`}
              {r.extra_cent > 0 && ` · extra ${euro(r.extra_cent)}${r.extra_nota ? ` (${r.extra_nota})` : ''}`}
            </span>
            <span style={{ fontSize: 22, fontWeight: 850, color: 'var(--nero)' }}>{euro(r.totale_cent)}</span>
            {r.da_verificare > 0 && (
              <span className="riga" style={{ color: 'var(--attenzione)' }}>
                {r.da_verificare} lezioni senza conferma: non contate. Si confermano dall&apos;appello (anche dopo) e poi si ricalcola.
              </span>
            )}
            {r.tariffa_cent === 0 && (
              <span className="riga" style={{ color: 'var(--rosso)' }}>Tariffa oraria standard mancante: impostala nella scheda in Struttura → Staff.</span>
            )}
            {r.visto_at && <span className="riga" style={{ color: 'var(--ok)' }}>✓ Confermato dall&apos;insegnante il {dataBreve(r.visto_at)}</span>}
            {r.segnalazione && <span className="riga" style={{ color: 'var(--rosso-scuro)' }}>Segnala: “{r.segnalazione}” ({dataBreve(r.segnalata_at)})</span>}

            <span className="azioni-riga">
              <button className="link-btn piccolo" onClick={() => apri(r)}>
                {aperto === r.id ? 'Chiudi il dettaglio' : 'Vedi le lezioni'}
              </button>
              <Link prefetch={false} className="link-btn piccolo" href={`/gestione/compensi/${r.id}`} target="_blank">PDF</Link>
              <Link prefetch={false} className="link-btn piccolo" href={`/gestione/staff/${r.staff_id}`}>regole</Link>
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
                  <li key={i} className={`persona cr-${d.stato}`}>
                    <span>
                      {d.inizio ? `${dataBreve(d.data)} ${ora(d.inizio)} · ` : ''}{d.corso}
                      <span className="piccolo muto" style={{ display: 'block' }}>
                        {[d.ore > 0 && `${Number(d.ore).toFixed(2).replace('.', ',')} h`, d.presenti != null && d.stato !== 'mensile' && `${d.presenti} presenti / ${d.prenotati} prenotati`,
                          d.sostituzione, d.regola, STATO_RIGA[d.stato]].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="piccolo" style={{ fontWeight: 700 }}>{['contata', 'mensile'].includes(d.stato) ? euro(d.importo_cent) : '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </span>
        </div>
      ))}

      <p className="piccolo muto" style={{ marginTop: 18 }}>
        Il calcolo prende le lezioni finite del mese tenute da ogni insegnante (confermate con l'appello: se ha sostituito
        un'altra, le ore vanno a chi l'ha tenuta) più le lezioni private confermate, e applica le sue regole (scheda staff →
        Regole di compenso); senza regole vale la tariffa oraria standard. Forfait e fissi mensili si aggiungono una volta.
        Quando segni pagato, nasce una spesa di categoria "compensi": da lì finisce nei costi, nei margini dei corsi
        e nel flusso di cassa. Un cedolino già pagato non viene più toccato dal ricalcolo.
      </p>
    </>
  );
}
