import { staffCorrente } from '@/lib/staff';
import { euro, dataBreve } from '@/lib/formato';
import Stampa from '../../ricevute/[id]/Stampa';

export const dynamic = 'force-dynamic';

// Attestati per la detrazione delle spese sportive dei ragazzi: uno per pagina
export default async function Attestati({ searchParams }) {
  const { anno, id } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  const a = parseInt(anno, 10) || new Date().getFullYear();

  const [{ data: ragazzi }, { data: pal }] = await Promise.all([
    supabase.rpc('versamenti_ragazzi', { p_palestra: staff.palestra_id, p_anno: a, p_storico: true }),
    supabase.from('palestre').select('nome, indirizzo, telefono, email, dati_fiscali').eq('id', staff.palestra_id).maybeSingle(),
  ]);
  const elenco = (ragazzi || []).filter((r) => !id || r.allievo_id === id);
  const oggi = dataBreve(new Date());

  return (
    <>
      <div className="foglio senza-stampa" style={{ paddingBottom: 0 }}>
        <Stampa />
        <p className="piccolo muto">
          {elenco.length} attestati per l'anno {a}. Il testo è una proposta: fallo vedere al commercialista la prima volta.
        </p>
      </div>
      {elenco.map((r) => (
        <div key={r.allievo_id} className="foglio attestato">
          <header className="foglio-testa">
            <div>
              <strong>{pal?.nome}</strong>
              <div className="piccolo muto" style={{ whiteSpace: 'pre-wrap' }}>
                {pal?.dati_fiscali || [pal?.indirizzo, pal?.telefono, pal?.email].filter(Boolean).join('\n')}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="piccolo muto">Attestazione</div>
              <strong>anno {a}</strong>
            </div>
          </header>

          <h2 style={{ marginTop: 26, fontSize: 18 }}>Attestazione di pagamento per attività sportiva</h2>
          <p>
            Si attesta che <strong>{r.pagante}</strong>{r.pagante_cf ? <>, codice fiscale <strong>{r.pagante_cf}</strong></> : null},
            ha versato nell'anno {a} la somma complessiva di <strong>{euro(r.totale_cent)}</strong> per la pratica di attività
            sportiva dilettantistica presso questa società da parte di <strong>{r.nome} {r.cognome}</strong>
            {r.data_nascita && <>, nato/a il {dataBreve(r.data_nascita)}</>}
            {r.codice_fiscale && <>, codice fiscale <strong>{r.codice_fiscale}</strong></>}.
          </p>

          <table style={{ marginTop: 16, width: '100%' }}>
            <thead><tr><th>Data</th><th>Causale</th><th style={{ textAlign: 'right' }}>Importo</th></tr></thead>
            <tbody>
              {(r.voci || []).map((v, i) => (
                <tr key={i}><td>{dataBreve(v.data)}</td><td>{v.descrizione}</td><td style={{ textAlign: 'right' }}>{euro(v.importo_cent)}</td></tr>
              ))}
              <tr><td /><td><strong>Totale</strong></td><td style={{ textAlign: 'right' }}><strong>{euro(r.totale_cent)}</strong></td></tr>
            </tbody>
          </table>

          <p className="piccolo muto" style={{ marginTop: 18 }}>
            Rilasciata su richiesta dell'interessato per gli usi consentiti dalla legge (detrazione delle spese per
            l'attività sportiva dei ragazzi tra 5 e 18 anni).
          </p>
          <footer className="foglio-piede" style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
            <span>Luogo e data: ______________ {oggi}</span>
            <span>Timbro e firma: ______________________</span>
          </footer>
        </div>
      ))}
      {elenco.length === 0 && <div className="foglio"><div className="vuoto">Nessun versamento trovato per l'anno {a}.</div></div>}
    </>
  );
}
