import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { oggiISO } from '@/lib/formato';
import { Barre, Linea, Anello, BarraRiempimento, Numero } from '@/lib/grafici';

export const dynamic = 'force-dynamic';

const eur = (c) => (Number(c || 0) / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pct = (v) => (v == null ? '–' : `${v}%`);
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const MOTIVI = { orari: 'Orari', prezzo: 'Prezzo', livello: 'Livello non adatto', distanza: 'Distanza', non_mi_e_piaciuto: 'Disciplina non adatta', altra_struttura: 'Altra struttura', altro: 'Altro' };

export default async function Statistiche({ searchParams }) {
  const sp = await searchParams;
  const oggi = oggiISO();
  const dal = /^\d{4}-\d{2}-\d{2}$/.test(sp.dal || '') ? sp.dal : oggi.slice(0, 8) + '01';
  const al = /^\d{4}-\d{2}-\d{2}$/.test(sp.al || '') ? sp.al : oggi;

  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  const [k, andamento, corsi, insegnanti, sale, funnel, distribuzione, spazi, feedback] = await Promise.all([
    supabase.rpc('cruscotto', { p_palestra: p, p_dal: dal, p_al: al }),
    supabase.rpc('andamento_mensile', { p_palestra: p, p_mesi: 12 }),
    supabase.rpc('economia_corsi', { p_palestra: p, p_dal: dal, p_al: al }),
    supabase.rpc('statistiche_insegnanti', { p_palestra: p, p_dal: dal, p_al: al }),
    supabase.rpc('statistiche_sale', { p_palestra: p, p_dal: dal, p_al: al }),
    supabase.rpc('statistiche_funnel', { p_palestra: p, p_dal: dal, p_al: al }),
    supabase.rpc('distribuzione_iscritti', { p_palestra: p }),
    supabase.rpc('statistiche_spazi', { p_palestra: p, p_dal: dal, p_al: al }),
    supabase.from('feedback_prove').select('motivo').eq('palestra_id', p).gte('created_at', dal).lte('created_at', al + 'T23:59:59'),
  ]);

  const d = k.data || {};
  const mesi = (andamento.data || []).map((m) => ({ ...m, etichetta: MESI[new Date(m.mese).getMonth()] }));
  const perTipo = (t) => (distribuzione.data || []).filter((x) => x.tipo === t).map((x) => ({ etichetta: x.etichetta, valore: Number(x.valore) }));
  const motivi = Object.entries((feedback.data || []).reduce((m, f) => ({ ...m, [f.motivo]: (m[f.motivo] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const corsiOrdinati = corsi.data || [];
  const daSistemare = corsiOrdinati.filter((c) => c.riempimento_pct != null && c.riempimento_pct < 50);

  const periodo = (etichetta, d1, d2) => (
    <Link href={`/gestione/statistiche?dal=${d1}&al=${d2}`} aria-current={dal === d1 && al === d2 ? 'true' : undefined}>{etichetta}</Link>
  );
  const meseScorso = new Date(oggi.slice(0, 8) + '01T12:00:00');
  meseScorso.setMonth(meseScorso.getMonth() - 1);
  const inizioMeseScorso = meseScorso.toLocaleDateString('sv-SE').slice(0, 8) + '01';
  const fineMeseScorso = new Date(meseScorso.getFullYear(), meseScorso.getMonth() + 1, 0).toLocaleDateString('sv-SE');
  const inizioStagione = `${oggi.slice(5, 7) >= '09' ? oggi.slice(0, 4) : Number(oggi.slice(0, 4)) - 1}-09-01`;

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Conti</div>
        <h1>Statistiche e margini</h1>
        <p>Iscritti, riempimento, conversione delle prove e margine di ogni corso.</p>
      </div>
      <div className="filtri">
        {periodo('Questo mese', oggi.slice(0, 8) + '01', oggi)}
        {periodo('Mese scorso', inizioMeseScorso, fineMeseScorso)}
        {periodo('Stagione', inizioStagione, oggi)}
      </div>
      <form className="filtri" style={{ alignItems: 'end' }}>
        <div className="campo" style={{ margin: 0 }}><label htmlFor="dal">Dal</label><input id="dal" type="date" name="dal" defaultValue={dal} /></div>
        <div className="campo" style={{ margin: 0 }}><label htmlFor="al">Al</label><input id="al" type="date" name="al" defaultValue={al} /></div>
        <button className="btn">Aggiorna</button>
      </form>

      {/* I numeri che contano */}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginTop: 8 }}>
        <Numero titolo="Iscritti attivi" valore={d.persone_attive ?? 0} nota={`${d.iscrizioni_attive ?? 0} abbonamenti`} />
        <Numero titolo="Nuovi nel periodo" valore={d.nuovi ?? 0} tono="ok" nota={`${d.cessati ?? 0} usciti`} />
        <Numero titolo="Abbandono" valore={pct(d.abbandono_pct)} tono={d.abbandono_pct > 5 ? 'male' : 'ok'} nota="sotto il 5% è sano" />
        <Numero titolo="Riempimento lezioni" valore={pct(d.riempimento_pct)} tono={d.riempimento_pct >= 70 ? 'ok' : d.riempimento_pct < 50 ? 'male' : null} nota={`${d.posti_vuoti ?? 0} posti vuoti`} />
        <Numero titolo="Presenza" valore={pct(d.presenza_pct)} nota="chi c'era sul totale segnato" />
        <Numero titolo="Prova → iscrizione" valore={pct(d.conversione_pct)} nota={`${d.prove_effettuate ?? 0} prove fatte`} />
        <Numero titolo="Ricavi del periodo" valore={eur(d.ricavi_cent)} nota={`${eur(d.ricavo_per_persona_cent)} a persona`} />
        <Numero titolo="Costi" valore={eur(d.costi_cent)} nota={`di cui ${eur(d.compensi_cent)} insegnanti`} />
        <Numero titolo="Margine" valore={eur(d.margine_cent)} tono={d.margine_cent >= 0 ? 'ok' : 'male'} nota={`affitto ${pct(d.incidenza_affitto_pct)} dei ricavi`} />
      </div>

      {(d.certificati_scaduti > 0 || d.in_scadenza_15gg > 0 || daSistemare.length > 0) && (
        <>
          <h2 style={{ marginTop: 28 }}>Da sistemare</h2>
          <ul className="elenco">
            {d.certificati_scaduti > 0 && (
              <li className="persona">
                <span>Iscritti senza certificato valido</span>
                <Link className="tag tag-rosso" href="/gestione/certificati">{d.certificati_scaduti}</Link>
              </li>
            )}
            {d.in_scadenza_15gg > 0 && (
              <li className="persona">
                <span>Abbonamenti in scadenza entro 15 giorni</span>
                <span className="tag tag-attenzione">{d.in_scadenza_15gg}</span>
              </li>
            )}
            {daSistemare.length > 0 && (
              <li className="persona">
                <span>Corsi sotto il 50% di riempimento</span>
                <span className="tag tag-attenzione">{daSistemare.length}</span>
              </li>
            )}
          </ul>
        </>
      )}

      {/* Andamento */}
      <h2 style={{ marginTop: 30 }}>Andamento degli ultimi 12 mesi</h2>
      <div className="scheda" style={{ marginBottom: 14 }}>
        <div className="piccolo muto">Iscritti attivi mese per mese</div>
        <Linea dati={mesi.map((m) => ({ etichetta: m.etichetta, valore: Number(m.iscritti_attivi) }))} />
      </div>
      <div className="scheda" style={{ marginBottom: 14 }}>
        <div className="piccolo muto">Nuovi iscritti</div>
        <Barre dati={mesi.map((m) => ({ etichetta: m.etichetta, valore: Number(m.nuovi) }))} />
      </div>
      <div className="scheda" style={{ marginBottom: 14 }}>
        <div className="piccolo muto">Chi ha smesso</div>
        <Barre dati={mesi.map((m) => ({ etichetta: m.etichetta, valore: Number(m.cessati) }))} colore="var(--nero)" />
      </div>
      <div className="scheda" style={{ marginBottom: 14 }}>
        <div className="piccolo muto">Riempimento medio delle lezioni</div>
        <Linea dati={mesi.map((m) => ({ etichetta: m.etichetta, valore: Number(m.riempimento_pct || 0) }))} formato={(v) => `${v}%`} />
      </div>
      <div className="scheda" style={{ marginBottom: 14 }}>
        <div className="piccolo muto">Abbonamenti venduti (€)</div>
        <Barre dati={mesi.map((m) => ({ etichetta: m.etichetta, valore: Math.round(Number(m.ricavi_cent) / 100) }))}
               formato={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : v)} />
      </div>

      {/* Chi frequenta */}
      <h2 style={{ marginTop: 30 }}>Chi frequenta</h2>
      <div className="scheda" style={{ marginBottom: 14 }}>
        <div className="piccolo muto" style={{ marginBottom: 8 }}>Per fascia d'età</div>
        <Anello dati={perTipo('fascia')} />
      </div>
      <div className="scheda" style={{ marginBottom: 14 }}>
        <div className="piccolo muto" style={{ marginBottom: 8 }}>Per categoria</div>
        <Anello dati={perTipo('categoria')} />
      </div>
      <div className="scheda" style={{ marginBottom: 14 }}>
        <div className="piccolo muto" style={{ marginBottom: 8 }}>Da dove arrivano</div>
        <Anello dati={perTipo('fonte')} />
      </div>

      {/* Corsi */}
      <h2 style={{ marginTop: 30 }}>Corsi: quanto sono pieni e quanto rendono</h2>
      <div className="scheda" style={{ marginBottom: 14 }}>
        {corsiOrdinati.slice(0, 12).map((c) => (
          <BarraRiempimento key={c.corso_id} valore={c.riempimento_pct || 0} etichetta={c.corso}
                            nota={`${c.iscritti} iscritti · margine ${eur(c.margine_cent)}`} />
        ))}
        {corsiOrdinati.length === 0 && <p className="muto">Nessun corso nel periodo.</p>}
      </div>
      <div className="tabella-scorre">
        <table>
          <thead>
            <tr><th>Corso</th><th>Iscritti</th><th>Ore</th><th>Riempim.</th><th>Presenza</th><th>Ricavi</th><th>Costi</th><th>Margine</th></tr>
          </thead>
          <tbody>
            {corsiOrdinati.map((c) => (
              <tr key={c.corso_id}>
                <td>{c.corso}</td>
                <td>{c.iscritti}</td>
                <td>{c.ore}</td>
                <td>{pct(c.riempimento_pct)}</td>
                <td>{pct(c.presenza_pct)}</td>
                <td>{eur(c.ricavi_cent)}</td>
                <td>{eur(Number(c.costo_insegnanti_cent) + Number(c.costo_sale_cent) + Number(c.altre_spese_cent))}</td>
                <td style={{ color: c.margine_cent < 0 ? 'var(--rosso-scuro)' : 'var(--ok)', fontWeight: 700 }}>{eur(c.margine_cent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="piccolo muto">
        Ricavi = abbonamenti attivi nel periodo più le prove. Costi = ore di lezione per il compenso dell'insegnante,
        più il costo orario della sala e le spese legate a quel corso. Compensi e costi orari si impostano in Altro → Costi.
      </p>

      {/* Insegnanti */}
      <h2 style={{ marginTop: 30 }}>Insegnanti</h2>
      <div className="tabella-scorre">
        <table>
          <thead><tr><th>Insegnante</th><th>Lezioni</th><th>Ore</th><th>Allievi medi</th><th>Riempim.</th><th>Presenza</th><th>Costo</th></tr></thead>
          <tbody>
            {(insegnanti.data || []).map((i) => (
              <tr key={i.insegnante_id}>
                <td>{i.insegnante}</td><td>{i.lezioni}</td><td>{i.ore}</td><td>{i.allievi_medi ?? '–'}</td>
                <td>{pct(i.riempimento_pct)}</td><td>{pct(i.presenza_pct)}</td><td>{eur(i.costo_cent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sale */}
      <h2 style={{ marginTop: 30 }}>Sale</h2>
      <div className="tabella-scorre">
        <table>
          <thead><tr><th>Sala</th><th>Capienza</th><th>Lezioni</th><th>Ore</th><th>Ore/sett.</th><th>Riempim.</th><th>Costo</th></tr></thead>
          <tbody>
            {(sale.data || []).map((s) => (
              <tr key={s.sala_id}>
                <td>{s.sala}</td><td>{s.capienza ?? '–'}</td><td>{s.lezioni}</td><td>{s.ore}</td>
                <td>{s.ore_settimana}</td><td>{pct(s.riempimento_pct)}</td><td>{eur(s.costo_cent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Spazi */}
      <h2 style={{ marginTop: 30 }}>Affitto spazi ed eventi</h2>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Numero titolo="Richieste" valore={spazi.data?.richieste ?? 0} nota={`${spazi.data?.da_rispondere ?? 0} da rispondere`}
                tono={spazi.data?.da_rispondere > 0 ? 'male' : null} />
        <Numero titolo="Confermate" valore={spazi.data?.confermate ?? 0} nota={`${spazi.data?.eventi ?? 0} feste ed eventi`} />
        <Numero titolo="Ore affittate" valore={spazi.data?.ore ?? 0} />
        <Numero titolo="Ricavi dagli spazi" valore={eur(spazi.data?.ricavi_cent)} nota={`incassati ${eur(spazi.data?.incassato_cent)}`} />
      </div>

      {/* Funnel */}
      <h2 style={{ marginTop: 30 }}>Dalla richiesta all'iscrizione</h2>
      <div className="tabella-scorre">
        <table>
          <thead><tr><th>Corso</th><th>Richieste</th><th>Prove prenotate</th><th>Prove fatte</th><th>Iscrizioni</th><th>Conversione</th></tr></thead>
          <tbody>
            {(funnel.data || []).filter((r) => r.richieste > 0).map((r) => (
              <tr key={r.corso_id}>
                <td>{r.corso}</td><td>{r.richieste}</td><td>{r.prove_prenotate}</td>
                <td>{r.prove_effettuate}</td><td>{r.iscrizioni}</td><td>{pct(r.conversione_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 30 }}>Perché non si sono iscritti</h2>
      {motivi.length === 0 ? <div className="vuoto">Nessuna risposta al sondaggio nel periodo.</div> : (
        <div className="scheda"><Anello dati={motivi.map(([m, n]) => ({ etichetta: MOTIVI[m] || m, valore: n }))} /></div>
      )}
    </>
  );
}
