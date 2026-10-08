import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { meseStagione, periodoPredefinito } from '@/lib/stagione';
import { leggiPeriodo } from '@/lib/periodo';
import { Numero, Barre, Linea, BarreGruppi, Calore, Anello } from '@/lib/grafici';
import { pct, meseDi, MESI, GIORNI, quota } from '@/lib/statistiche';
import Testa, { Blocco } from '../Testa';

export const dynamic = 'force-dynamic';

export default async function Frequenza({ searchParams }) {
  const per = leggiPeriodo(await searchParams, await periodoPredefinito(), await meseStagione());
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const [{ data: k }, { data: s }, { data: andamento }] = await Promise.all([
    supabase.rpc('cruscotto', { p_palestra: p, p_dal: per.dal, p_al: per.al }),
    supabase.rpc('statistiche_stagione', { p_palestra: p, p_dal: per.dal, p_al: per.al, p_sezione: 'frequenza' }),
    supabase.rpc('andamento_mensile', { p_palestra: p, p_mesi: 12 }),
  ]);
  const d = k || {}; const st = s || {};
  const mesi = (andamento || []).map((m) => ({ ...m, etichetta: MESI[new Date(m.mese).getMonth()] }));
  const app = st.appelli || {}; const dis = st.disdette || {}; const rec = st.recuperi || {};
  const calore = st.calore || [];
  const ore = [...new Set(calore.map((c) => c.ora))].sort((a, b) => a - b);
  const giorni = st.giorni || [];

  return (
    <>
      <Testa scheda="frequenza" per={per} />
      <div className="st-numeri">
        <Numero titolo="Presenza" valore={pct(d.presenza_pct)} nota="presenti su chi era segnato" tono={d.presenza_pct >= 80 ? 'ok' : d.presenza_pct < 60 ? 'male' : null} />
        <Numero titolo="Riempimento" valore={pct(d.riempimento_pct)} nota={`${d.posti_vuoti ?? 0} posti vuoti`} />
        <Numero titolo="Appelli fatti" valore={pct(quota(app.fatti, app.finite))} nota={`${app.fatti ?? 0} su ${app.finite ?? 0} lezioni con persone`}
                tono={quota(app.fatti, app.finite) >= 90 ? 'ok' : app.finite ? 'male' : null} />
        <Numero titolo="Disdette" valore={(dis.app ?? 0) + (dis.segreteria ?? 0)} nota={`${dis.app ?? 0} dall'app · ${dis.segreteria ?? 0} in segreteria`} />
        <Numero titolo="Recuperi dati" valore={rec.dati ?? 0} nota={`${rec.usati ?? 0} usati · ${rec.scaduti ?? 0} scaduti`} />
      </div>

      <div className="st-griglia">
        <Blocco titolo="Presenze mese per mese" nota="ultimi 12 mesi">
          <BarreGruppi dati={(st.presenze_mese || []).map((m) => ({ etichetta: meseDi(m.mese), valori: [Number(m.presenti), Number(m.segnati) - Number(m.presenti)] }))}
                       serie={[{ nome: 'Presenti' }, { nome: 'Assenti', colore: '#9a9a9a' }]} />
        </Blocco>
        <Blocco titolo="Riempimento medio delle lezioni" nota="ultimi 12 mesi">
          <Linea dati={mesi.map((m) => ({ etichetta: m.etichetta, valore: Number(m.riempimento_pct || 0) }))} formato={(v) => `${v}%`} />
        </Blocco>
      </div>

      <Blocco titolo="Quando c'è più gente" nota="persone attese in media per lezione, per giorno e ora d'inizio">
        {calore.length === 0 ? <p className="piccolo muto">Nessuna lezione nel periodo.</p> : (
          <Calore righe={GIORNI} colonne={ore}
                  celle={calore.map((c) => ({ riga: c.dow, colonna: c.ora, valore: Number(c.attesi), nota: `${c.lezioni} lezioni${c.presenti != null ? `, ${c.presenti} presenti in media` : ''}` }))}
                  formato={(v) => String(Math.round(v * 10) / 10).replace('.', ',')} />
        )}
      </Blocco>

      <div className="st-griglia" style={{ marginTop: 14 }}>
        <Blocco titolo="Persone attese per giorno della settimana" nota="nel periodo">
          <Barre dati={GIORNI.map((g, i) => ({ etichetta: g, valore: Number(giorni.find((x) => x.dow === i + 1)?.attesi || 0) }))} />
        </Blocco>
        <Blocco titolo="Recuperi dati nel periodo" nota="che fine hanno fatto">
          <Anello dati={[
            { etichetta: 'Usati', valore: rec.usati || 0 },
            { etichetta: 'Ancora da usare', valore: rec.aperti || 0 },
            { etichetta: 'Scaduti', valore: rec.scaduti || 0 },
          ]} />
        </Blocco>
      </div>
    </>
  );
}
