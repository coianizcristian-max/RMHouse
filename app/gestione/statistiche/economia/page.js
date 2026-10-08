import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { meseStagione, periodoPredefinito } from '@/lib/stagione';
import { leggiPeriodo } from '@/lib/periodo';
import { Numero, Barre, BarreGruppi, Anello, BarreOrizzontali } from '@/lib/grafici';
import { eur, pct, kEur, MESI } from '@/lib/statistiche';
import Testa, { Blocco } from '../Testa';

export const dynamic = 'force-dynamic';

export default async function Economia({ searchParams }) {
  const per = leggiPeriodo(await searchParams, await periodoPredefinito(), await meseStagione());
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const [{ data: k }, { data: flussoR }, { data: andamento }, { data: s }, { data: spazi }] = await Promise.all([
    supabase.rpc('cruscotto', { p_palestra: p, p_dal: per.dal, p_al: per.al }),
    supabase.rpc('flusso_cassa', { p_palestra: p, p_dal: per.dal, p_al: per.al }),
    supabase.rpc('andamento_mensile', { p_palestra: p, p_mesi: 12 }),
    supabase.rpc('statistiche_stagione', { p_palestra: p, p_dal: per.dal, p_al: per.al, p_sezione: 'economia' }),
    supabase.rpc('statistiche_spazi', { p_palestra: p, p_dal: per.dal, p_al: per.al }),
  ]);
  const d = k || {}; const flusso = flussoR || {}; const st = s || {};
  const mesi = (andamento || []).map((m) => ({ ...m, etichetta: MESI[new Date(m.mese).getMonth()] }));

  return (
    <>
      <Testa scheda="economia" per={per} />
      <h2 style={{ fontSize: 17, margin: '4px 0 8px' }}>Competenza: la scuola guadagna?</h2>
      <div className="st-numeri">
        <Numero titolo="Ricavi" valore={eur(d.ricavi_cent)} nota={`${eur(d.ricavo_per_persona_cent)} a persona`} />
        <Numero titolo="Costi" valore={eur(d.costi_cent)} nota={`di cui ${eur(d.compensi_cent)} insegnanti`} />
        <Numero titolo="Margine" valore={eur(d.margine_cent)} tono={d.margine_cent >= 0 ? 'ok' : 'male'} nota={`affitto ${pct(d.incidenza_affitto_pct)} dei ricavi`} />
      </div>
      <h2 style={{ fontSize: 17, margin: '4px 0 8px' }}>Cassa: i soldi ci sono?</h2>
      <div className="st-numeri">
        <Numero titolo="Entrate" valore={eur(flusso.entrate_cent)} nota="incassi registrati" />
        <Numero titolo="Uscite" valore={eur(flusso.uscite_cent)} nota="spese e compensi pagati" />
        <Numero titolo="Saldo" valore={eur(flusso.saldo_cent)} tono={(flusso.saldo_cent ?? 0) >= 0 ? 'ok' : 'male'} />
        <Numero titolo="Ancora da incassare" valore={eur(flusso.da_incassare_cent)} nota={`compensi da pagare ${eur(flusso.compensi_da_pagare_cent)}`} />
      </div>

      <div className="st-griglia">
        <Blocco titolo="Ricavi e costi mese per mese (€)" nota="ultimi 12 mesi">
          <BarreGruppi dati={mesi.map((m) => ({ etichetta: m.etichetta, valori: [Math.round(Number(m.ricavi_cent) / 100), Math.round(Number(m.costi_cent || 0) / 100)] }))}
                       serie={[{ nome: 'Ricavi' }, { nome: 'Costi', colore: '#111' }]} formato={kEur} />
        </Blocco>
        <Blocco titolo="Saldo di cassa mese per mese (€)">
          {(flusso.per_mese || []).length === 0 ? <p className="piccolo muto">Nessun movimento nel periodo.</p> : (
            <Barre dati={(flusso.per_mese || []).map((m) => ({ etichetta: m.mese.slice(5) + '/' + m.mese.slice(2, 4), valore: Math.round(Number(m.saldo_cent) / 100) }))} formato={kEur} />
          )}
        </Blocco>
        <Blocco titolo="Come si paga (€)" nota="incassi del periodo">
          <Anello dati={st.metodi || []} />
        </Blocco>
        <Blocco titolo="Per cosa si paga (€)">
          <BarreOrizzontali dati={st.causali || []} formato={(v) => `${v} €`} />
        </Blocco>
        <Blocco titolo="Uscite per categoria">
          <BarreOrizzontali dati={Object.entries(flusso.uscite_per_categoria || {}).map(([c, v]) => ({ etichetta: c, valore: Math.round(Number(v) / 100) }))
            .sort((a, b) => b.valore - a.valore)} formato={(v) => `${v} €`} colore="#111" vuoto="Nessuna spesa pagata nel periodo." />
        </Blocco>
        <Blocco titolo="Affitto spazi ed eventi">
          <ul className="at-voci">
            <li><span><span>Richieste</span><strong>{spazi?.richieste ?? 0}</strong></span></li>
            <li><span><span>Da rispondere</span><strong>{spazi?.da_rispondere ?? 0}</strong></span></li>
            <li><span><span>Confermate</span><strong>{spazi?.confermate ?? 0}</strong></span></li>
            <li><span><span>Ore affittate</span><strong>{spazi?.ore ?? 0}</strong></span></li>
            <li><span><span>Ricavi (incassati)</span><strong>{eur(spazi?.ricavi_cent)} ({eur(spazi?.incassato_cent)})</strong></span></li>
          </ul>
        </Blocco>
      </div>
      <p className="st-nota">
        I ricavi sono di competenza: gli abbonamenti attivi nel periodo, anche se pagati prima o dopo. Le entrate sono i soldi
        realmente incassati. Le due cifre non coincidono quasi mai: la prima dice se la scuola guadagna, la seconda se ha i soldi in cassa.
      </p>
    </>
  );
}
