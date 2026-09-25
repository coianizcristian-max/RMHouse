import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { euro, oggiISO } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const ISO = (d) => d.toISOString().slice(0, 10);
const ore = (m) => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`;

// Rendiconto dello staff su un periodo libero: lezioni, ore, presenze, compenso stimato
export default async function Rendiconto({ searchParams }) {
  const { dal, al } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const o = new Date(oggiISO() + 'T12:00:00Z');
  const y = o.getUTCFullYear(), m = o.getUTCMonth();
  const scelte = [
    ['Questa settimana', ISO(new Date(Date.UTC(y, m, o.getUTCDate() - ((o.getUTCDay() + 6) % 7)))), oggiISO()],
    ['Questo mese', ISO(new Date(Date.UTC(y, m, 1))), ISO(new Date(Date.UTC(y, m + 1, 0)))],
    ['Mese scorso', ISO(new Date(Date.UTC(y, m - 1, 1))), ISO(new Date(Date.UTC(y, m, 0)))],
    ['Stagione', ISO(new Date(Date.UTC(m >= 8 ? y : y - 1, 8, 1))), oggiISO()],
  ];
  const da = /^\d{4}-\d{2}-\d{2}$/.test(dal || '') ? dal : scelte[1][1];
  const a = /^\d{4}-\d{2}-\d{2}$/.test(al || '') ? al : scelte[1][2];

  const { data: righe } = await supabase.rpc('rendiconto_staff', { p_palestra: staff.palestra_id, p_dal: da, p_al: a });
  const tot = (righe || []).reduce((s, r) => ({
    lezioni: s.lezioni + Number(r.lezioni), minuti: s.minuti + Number(r.minuti),
    presenze: s.presenze + Number(r.presenze), compenso: s.compenso + Number(r.compenso_cent),
  }), { lezioni: 0, minuti: 0, presenze: 0, compenso: 0 });
  const senzaTariffa = (righe || []).filter((r) => !r.tariffa_cent).length;

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Conti</div>
        <h1>Rendiconto staff</h1>
        <p>Chi ha insegnato quanto nel periodo: lezioni, ore, presenze e compenso stimato con la tariffa oraria.</p>
      </div>
      <div className="pastiglie">
        {scelte.map(([t, d1, d2]) => (
          <Link key={t} className="stato-pillola" aria-current={d1 === da && d2 === a ? 'true' : undefined}
                href={`/gestione/rendiconto?dal=${d1}&al=${d2}`}>{t}</Link>
        ))}
      </div>
      <form className="barra-cerca" action="/gestione/rendiconto">
        <input type="date" name="dal" defaultValue={da} style={{ flex: '0 1 180px', minWidth: 150 }} aria-label="Dal" />
        <input type="date" name="al" defaultValue={a} style={{ flex: '0 1 180px', minWidth: 150 }} aria-label="Al" />
        <button className="btn btn-piccolo">Mostra</button>
      </form>

      <div className="kpi" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <div className="tessera tessera-rossa"><div className="etichetta">Lezioni</div><div className="cifra">{tot.lezioni}</div></div>
        <div className="tessera"><div className="etichetta">Ore insegnate</div><div className="cifra">{ore(tot.minuti)}</div></div>
        <div className="tessera"><div className="etichetta">Presenze</div><div className="cifra">{tot.presenze}</div>
          <div className="sotto">{tot.lezioni ? `${(tot.presenze / tot.lezioni).toFixed(1).replace('.', ',')} a lezione` : '—'}</div></div>
        <div className="tessera tessera-nera"><div className="etichetta">Compenso stimato</div><div className="cifra">{euro(tot.compenso)}</div>
          <div className="sotto">{senzaTariffa ? `${senzaTariffa} senza tariffa oraria` : 'tariffe complete'}</div></div>
      </div>

      {(righe || []).length === 0 ? <div className="vuoto">Nessuna lezione nel periodo.</div> : (
        <div className="tabella-scorre">
          <table>
            <thead><tr><th>Insegnante</th><th>Lezioni</th><th>Ore</th><th>Presenze</th><th>Per lezione</th><th>Clienti diversi</th><th>Tariffa</th><th>Compenso</th></tr></thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.staff_id}>
                  <td><strong>{r.nome} {r.cognome}</strong></td>
                  <td>{r.lezioni}</td>
                  <td>{ore(Number(r.minuti))}</td>
                  <td>{r.presenze}</td>
                  <td>{Number(r.lezioni) ? (Number(r.presenze) / Number(r.lezioni)).toFixed(1).replace('.', ',') : '—'}</td>
                  <td>{r.clienti}</td>
                  <td>{r.tariffa_cent ? `${euro(r.tariffa_cent)}/h` : <span className="muto">—</span>}</td>
                  <td><strong>{r.tariffa_cent ? euro(r.compenso_cent) : '—'}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="piccolo muto" style={{ marginTop: 12 }}>
        La tariffa oraria si imposta nella scheda di ogni insegnante (Struttura → Staff). Per approvare e pagare i
        compensi del mese: <Link href="/gestione/compensi">Compensi insegnanti</Link>.
      </p>
    </>
  );
}
