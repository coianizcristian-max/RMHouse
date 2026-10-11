'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Finestra } from '../Gestore';
import { euro, dataBreve, ora } from '@/lib/formato';

const ore = (m) => `${Math.floor(m / 60)}h${m % 60 ? String(Math.round(m % 60)).padStart(2, '0') : ''}`;
const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const giorno = (iso) => GIORNI[new Date(`${iso}T12:00:00Z`).getUTCDay()];

// Rendiconto staff: la tabella per insegnante; cliccando una riga si apre il dettaglio giorno per giorno
// (come un cedolino: ogni lezione con iscritti, presenti, la regola usata e quanto vale). Query 153.
export default function Righe({ righe, palestraId, dal, al }) {
  const [aperta, setAperta] = useState(null);   // { r, righe, errore }
  async function apri(r) {
    setAperta({ r, righe: null });
    const { data, error } = await supabaseBrowser().rpc('rendiconto_dettaglio', { p_palestra: palestraId, p_staff: r.staff_id, p_dal: dal, p_al: al });
    setAperta({ r, righe: data || [], errore: error ? (error.message?.includes('rendiconto_dettaglio') ? 'Manca la query 153 in Supabase.' : 'Dettaglio non disponibile.') : '' });
  }
  const d = aperta?.righe || [];
  const contate = d.filter((x) => x.confermata);
  const tot = contate.reduce((t, x) => t + (x.importo_cent || 0), 0);
  const minuti = contate.reduce((t, x) => t + Number(x.ore || 0) * 60, 0);
  return (
    <>
      <div className="tabella-scorre">
        <table className="rend-tabella">
          <thead><tr><th>Insegnante</th><th>Previste</th><th>Svolte</th><th>Ore svolte</th><th>Da confermare</th><th>Presenze</th><th>Tariffa</th><th>Compenso</th></tr></thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.staff_id} className="rend-riga" tabIndex={0} role="button" aria-label={`Dettaglio di ${r.nome} ${r.cognome || ''}`}
                  onClick={() => apri(r)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apri(r); } }}>
                <td><strong>{r.nome} {r.cognome}</strong> <span className="rend-apri" aria-hidden="true">dettaglio ›</span></td>
                <td className="muto">{r.previste} · {ore(Number(r.minuti_previsti))}</td>
                <td><strong>{r.lezioni}</strong></td>
                <td>{ore(Number(r.minuti))}</td>
                <td>{Number(r.da_confermare) ? <span className="tag tag-attenzione">{r.da_confermare}</span> : <span className="muto">—</span>}</td>
                <td>{r.presenze}</td>
                <td>{r.tariffa_cent ? `${euro(r.tariffa_cent)}/h` : <span className="muto">—</span>}</td>
                <td><strong>{euro(r.compenso_cent)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aperta && (
        <Finestra larga chiudi={() => setAperta(null)} titolo={`${aperta.r.nome} ${aperta.r.cognome || ''}`.trim()}
                  sotto={`Dal ${dataBreve(dal)} al ${dataBreve(al)} · lezioni giorno per giorno`}
                  piede={<footer className="gf-piede rend-piede"><button type="button" className="btn" onClick={() => window.print()}>Stampa</button>
                    <button type="button" className="btn btn-primario" onClick={() => setAperta(null)}>Chiudi</button></footer>}>
          {aperta.righe === null ? <p className="muto">Carico…</p> : aperta.errore ? <div className="errore">{aperta.errore}</div> : (
            <div className="rend-dettaglio">
              <div className="rend-conti">
                <div><span className="etichetta">Lezioni contate</span><strong>{contate.length}</strong></div>
                <div><span className="etichetta">Ore</span><strong>{ore(Math.round(minuti))}</strong></div>
                <div><span className="etichetta">Compenso delle lezioni</span><strong>{euro(tot)}</strong></div>
                <div><span className="etichetta">Da confermare</span><strong>{d.filter((x) => !x.confermata && x.ruolo === 'sua' && new Date(x.fine) < new Date()).length}</strong></div>
              </div>
              {d.length === 0 ? <p className="muto">Nessuna lezione nel periodo.</p> : (
                <div className="tabella-scorre">
                  <table className="rend-lezioni">
                    <thead><tr><th>Giorno</th><th>Lezione</th><th>Ore</th><th title="Iscritti attesi alla lezione">Iscritti</th><th>Presenti</th><th>Come si conta</th><th style={{ textAlign: 'right' }}>Importo</th></tr></thead>
                    <tbody>
                      {d.map((x) => {
                        const futura = new Date(x.fine) > new Date();
                        const stato = x.ruolo === 'tenuta da altri' ? 'tenuta da un\'altra persona'
                          : !x.confermata ? (futura ? 'non ancora fatta' : 'da confermare: non contata') : x.ruolo === 'sostituzione' ? 'sostituzione' : null;
                        return (
                          <tr key={x.lezione_id} className={!x.confermata || x.ruolo === 'tenuta da altri' ? 'non-contata' : ''}>
                            <td>{giorno(x.data)} {dataBreve(x.data).slice(0, 5)}<span className="piccolo muto"> {ora(x.inizio)}</span></td>
                            <td>{x.corso}{x.sala ? <span className="piccolo muto"> · {x.sala}</span> : ''}
                              {x.appello_at && <span className="tag tag-ok rend-tag">appello</span>}
                              {stato && <span className="piccolo rend-stato"> · {stato}</span>}</td>
                            <td>{Number(x.ore).toFixed(2).replace('.', ',').replace(',00', '')}</td>
                            <td>{x.iscritti}</td>
                            <td>{x.appello_at ? x.presenti : <span className="muto">—</span>}</td>
                            <td className="piccolo">{x.regola}</td>
                            <td style={{ textAlign: 'right' }}><strong>{x.confermata && x.ruolo !== 'tenuta da altri' ? euro(x.importo_cent) : '—'}</strong></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="piccolo muto" style={{ margin: '10px 0 0' }}>
                Le soglie delle regole contano gli iscritti alla lezione (o i presenti, se la regola dice così). Forfait e fissi
                mensili, rimborsi auto, workshop ed extra non sono qui: sono nel cedolino del mese in Compensi.
              </p>
            </div>
          )}
        </Finestra>
      )}
    </>
  );
}
