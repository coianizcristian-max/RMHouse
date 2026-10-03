import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { leggiPeriodo } from '@/lib/periodo';
import { BarraRiempimento, BarreOrizzontali, Numero } from '@/lib/grafici';
import { eur, pct } from '@/lib/statistiche';
import Testa, { Blocco } from '../Testa';

export const dynamic = 'force-dynamic';

export default async function Corsi({ searchParams }) {
  const sp = await searchParams;
  const per = leggiPeriodo(sp, 'stagione');
  const ordina = ['riempimento', 'iscritti', 'margine', 'presenza'].includes(sp.ordina) ? sp.ordina : 'riempimento';
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const [{ data: corsi }, { data: insegnanti }, { data: sale }] = await Promise.all([
    supabase.rpc('economia_corsi', { p_palestra: p, p_dal: per.dal, p_al: per.al }),
    supabase.rpc('statistiche_insegnanti', { p_palestra: p, p_dal: per.dal, p_al: per.al }),
    supabase.rpc('statistiche_sale', { p_palestra: p, p_dal: per.dal, p_al: per.al }),
  ]);
  const chiave = { riempimento: 'riempimento_pct', iscritti: 'iscritti', margine: 'margine_cent', presenza: 'presenza_pct' }[ordina];
  const elenco = [...(corsi || [])].sort((a, b) => Number(b[chiave] ?? -1) - Number(a[chiave] ?? -1));
  const pieni = elenco.filter((c) => c.riempimento_pct >= 80).length;
  const vuoti = elenco.filter((c) => c.riempimento_pct != null && c.riempimento_pct < 50).length;
  const inPerdita = elenco.filter((c) => c.margine_cent < 0).length;
  const qsBase = per.chiave === 'libero' ? `dal=${per.dal}&al=${per.al}` : `p=${per.chiave}`;

  return (
    <>
      <Testa scheda="corsi" per={per} />
      <div className="st-numeri">
        <Numero titolo="Corsi con lezioni" valore={elenco.length} />
        <Numero titolo="Pieni (80% e oltre)" valore={pieni} tono="ok" />
        <Numero titolo="Sotto il 50%" valore={vuoti} tono={vuoti ? 'male' : null} nota="da valutare: orario, livello, promozione" />
        <Numero titolo="In perdita" valore={inPerdita} tono={inPerdita ? 'male' : null} nota="margine negativo nel periodo" />
      </div>

      <div className="st-griglia">
        <Blocco titolo="Riempimento dei corsi" nota="i 12 più pieni">
          {elenco.slice().sort((a, b) => Number(b.riempimento_pct ?? -1) - Number(a.riempimento_pct ?? -1)).slice(0, 12).map((c) => (
            <BarraRiempimento key={c.corso_id} valore={c.riempimento_pct || 0} etichetta={c.corso} nota={`${c.iscritti} iscritti`} />
          ))}
          {elenco.length === 0 && <p className="muto">Nessun corso nel periodo.</p>}
        </Blocco>
        <Blocco titolo="I meno pieni" nota="sotto il 50%">
          {elenco.filter((c) => c.riempimento_pct != null && c.riempimento_pct < 50).sort((a, b) => a.riempimento_pct - b.riempimento_pct).slice(0, 12).map((c) => (
            <BarraRiempimento key={c.corso_id} valore={c.riempimento_pct || 0} etichetta={c.corso} nota={`${c.iscritti} iscritti`} />
          ))}
          {vuoti === 0 && <p className="muto piccolo">Nessun corso sotto il 50%.</p>}
        </Blocco>
        <Blocco titolo="Margine per corso" nota="i migliori">
          <BarreOrizzontali dati={elenco.slice().sort((a, b) => b.margine_cent - a.margine_cent).filter((c) => c.margine_cent > 0).slice(0, 10)
            .map((c) => ({ etichetta: c.corso, valore: Math.round(c.margine_cent / 100), nota: pct(c.margine_pct) }))} formato={(v) => `${v} €`} colore="var(--ok)" />
        </Blocco>
        <Blocco titolo="Insegnanti: ore nel periodo">
          <BarreOrizzontali dati={(insegnanti || []).filter((i) => Number(i.ore) > 0).slice(0, 12)
            .map((i) => ({ etichetta: i.insegnante, valore: Number(i.ore), nota: `${i.lezioni} lezioni · ${pct(i.riempimento_pct)} pieno` }))} formato={(v) => `${String(v).replace('.', ',')} h`} colore="#111" />
        </Blocco>
      </div>

      <section className="scheda st-blocco" style={{ marginBottom: 14 }}>
        <div className="st-titolo">
          <strong>Tutti i corsi</strong>
          <span className="periodo-chip">
            {[['riempimento', 'più pieni'], ['iscritti', 'più iscritti'], ['margine', 'margine'], ['presenza', 'presenza']].map(([o, t]) => (
              <a key={o} href={`/gestione/statistiche/corsi?${qsBase}&ordina=${o}`} aria-current={ordina === o ? 'true' : undefined}>{t}</a>
            ))}
          </span>
        </div>
        <div className="tabella-scorre">
          <table>
            <thead><tr><th>Corso</th><th>Iscritti</th><th>Ore</th><th>Riempim.</th><th>Presenza</th><th>Ricavi</th><th>Costi</th><th>Margine</th></tr></thead>
            <tbody>
              {elenco.map((c) => (
                <tr key={c.corso_id}>
                  <td>{c.corso}</td><td>{c.iscritti}</td><td>{c.ore}</td><td>{pct(c.riempimento_pct)}</td><td>{pct(c.presenza_pct)}</td>
                  <td>{eur(c.ricavi_cent)}</td>
                  <td>{eur(Number(c.costo_insegnanti_cent) + Number(c.costo_sale_cent) + Number(c.altre_spese_cent))}</td>
                  <td style={{ color: c.margine_cent < 0 ? 'var(--rosso-scuro)' : 'var(--ok)', fontWeight: 700 }}>{eur(c.margine_cent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="st-nota">Ricavi = abbonamenti attivi nel periodo più le prove. Costi = ore × compenso dell'insegnante, più il costo orario della sala e le spese legate al corso.</p>
      </section>

      <div className="st-griglia">
        <Blocco titolo="Insegnanti">
          <div className="tabella-scorre">
            <table>
              <thead><tr><th>Insegnante</th><th>Lezioni</th><th>Ore</th><th>Allievi medi</th><th>Riempim.</th><th>Presenza</th><th>Costo</th></tr></thead>
              <tbody>
                {(insegnanti || []).map((i) => (
                  <tr key={i.insegnante_id}><td>{i.insegnante}</td><td>{i.lezioni}</td><td>{i.ore}</td><td>{i.allievi_medi ?? '–'}</td>
                    <td>{pct(i.riempimento_pct)}</td><td>{pct(i.presenza_pct)}</td><td>{eur(i.costo_cent)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Blocco>
        <Blocco titolo="Sale">
          <div className="tabella-scorre">
            <table>
              <thead><tr><th>Sala</th><th>Capienza</th><th>Lezioni</th><th>Ore</th><th>Ore/sett.</th><th>Riempim.</th><th>Costo</th></tr></thead>
              <tbody>
                {(sale || []).map((s) => (
                  <tr key={s.sala_id}><td>{s.sala}</td><td>{s.capienza ?? '–'}</td><td>{s.lezioni}</td><td>{s.ore}</td>
                    <td>{s.ore_settimana}</td><td>{pct(s.riempimento_pct)}</td><td>{eur(s.costo_cent)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Blocco>
      </div>
    </>
  );
}
