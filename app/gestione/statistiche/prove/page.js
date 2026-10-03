import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { leggiPeriodo } from '@/lib/periodo';
import { Numero, Anello, BarreGruppi, BarreOrizzontali } from '@/lib/grafici';
import { pct, meseDi, quota } from '@/lib/statistiche';
import Testa, { Blocco } from '../Testa';

export const dynamic = 'force-dynamic';
const MOTIVI = { orari: 'Orari', prezzo: 'Prezzo', livello: 'Livello non adatto', distanza: 'Distanza', non_mi_e_piaciuto: 'Disciplina non adatta', altra_struttura: 'Altra struttura', altro: 'Altro' };

export default async function Prove({ searchParams }) {
  const per = leggiPeriodo(await searchParams, 'stagione');
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const [{ data: k }, { data: s }, { data: funnel }, { data: feedback }] = await Promise.all([
    supabase.rpc('cruscotto', { p_palestra: p, p_dal: per.dal, p_al: per.al }),
    supabase.rpc('statistiche_stagione', { p_palestra: p, p_dal: per.dal, p_al: per.al, p_sezione: 'prove' }),
    supabase.rpc('statistiche_funnel', { p_palestra: p, p_dal: per.dal, p_al: per.al }),
    supabase.from('feedback_prove').select('motivo').eq('palestra_id', p).gte('created_at', per.dal).lte('created_at', per.al + 'T23:59:59'),
  ]);
  const d = k || {}; const st = s || {};
  const righe = (funnel || []).filter((r) => r.richieste > 0 || r.prove_prenotate > 0);
  const tot = righe.reduce((a, r) => ({ ri: a.ri + Number(r.richieste), pp: a.pp + Number(r.prove_prenotate), pf: a.pf + Number(r.prove_effettuate), is: a.is + Number(r.iscrizioni) }), { ri: 0, pp: 0, pf: 0, is: 0 });
  const motivi = Object.entries((feedback || []).reduce((m, f) => ({ ...m, [f.motivo]: (m[f.motivo] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <Testa scheda="prove" per={per} />
      <div className="st-numeri">
        <Numero titolo="Richieste" valore={tot.ri} />
        <Numero titolo="Prove prenotate" valore={tot.pp} nota={tot.ri ? `${pct(quota(tot.pp, tot.ri))} delle richieste` : null} />
        <Numero titolo="Prove fatte" valore={tot.pf} nota={tot.pp ? `${pct(quota(tot.pf, tot.pp))} delle prenotate` : null} />
        <Numero titolo="Iscritti dopo la prova" valore={tot.is} tono="ok" />
        <Numero titolo="Prova → iscrizione" valore={pct(d.conversione_pct)} tono={d.conversione_pct >= 40 ? 'ok' : d.conversione_pct != null ? 'male' : null} />
      </div>

      <div className="st-griglia">
        <Blocco titolo="Il percorso, dalla richiesta all'iscrizione">
          <BarreOrizzontali dati={[
            { etichetta: 'Richieste', valore: tot.ri },
            { etichetta: 'Prove prenotate', valore: tot.pp },
            { etichetta: 'Prove fatte', valore: tot.pf },
            { etichetta: 'Iscritti', valore: tot.is },
          ]} />
        </Blocco>
        <Blocco titolo="Prove mese per mese" nota="ultimi 12 mesi">
          <BarreGruppi dati={(st.prove_mese || []).map((m) => ({ etichetta: meseDi(m.mese), valori: [m.prenotate, m.fatte, m.iscritti] }))}
                       serie={[{ nome: 'Prenotate', colore: '#9a9a9a' }, { nome: 'Fatte', colore: '#111' }, { nome: 'Iscritti' }]} />
        </Blocco>
        <Blocco titolo="Perché non si sono iscritti" nota="sondaggio dopo la prova">
          {motivi.length === 0 ? <p className="piccolo muto">Nessuna risposta nel periodo.</p>
            : <Anello dati={motivi.map(([m, n]) => ({ etichetta: MOTIVI[m] || m, valore: n }))} />}
        </Blocco>
        <Blocco titolo="Corsi che convertono di più">
          <BarreOrizzontali dati={righe.filter((r) => r.conversione_pct != null).sort((a, b) => b.conversione_pct - a.conversione_pct).slice(0, 10)
            .map((r) => ({ etichetta: r.corso, valore: Number(r.conversione_pct), nota: `${r.iscrizioni} su ${r.prove_effettuate}` }))} formato={(v) => `${v}%`} colore="var(--ok)" />
        </Blocco>
      </div>

      <section className="scheda st-blocco">
        <div className="st-titolo"><strong>Corso per corso</strong></div>
        <div className="tabella-scorre">
          <table>
            <thead><tr><th>Corso</th><th>Richieste</th><th>Prove prenotate</th><th>Prove fatte</th><th>Iscrizioni</th><th>Conversione</th></tr></thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.corso_id}><td>{r.corso}</td><td>{r.richieste}</td><td>{r.prove_prenotate}</td><td>{r.prove_effettuate}</td><td>{r.iscrizioni}</td><td>{pct(r.conversione_pct)}</td></tr>
              ))}
              {righe.length === 0 && <tr><td colSpan={6} className="muto">Nessuna richiesta nel periodo.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
