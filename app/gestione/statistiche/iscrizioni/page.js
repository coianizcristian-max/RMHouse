import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { leggiPeriodo } from '@/lib/periodo';
import { Numero, BarreGruppi, Linee, Linea, BarreOrizzontali, Anello } from '@/lib/grafici';
import { eur, pct, meseDi, MESI, MESI_STAGIONE, quota } from '@/lib/statistiche';
import Testa, { Blocco } from '../Testa';

export const dynamic = 'force-dynamic';

export default async function Iscrizioni({ searchParams }) {
  const per = leggiPeriodo(await searchParams, 'stagione');
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const [{ data: k }, { data: s }, { data: andamento }] = await Promise.all([
    supabase.rpc('cruscotto', { p_palestra: p, p_dal: per.dal, p_al: per.al }),
    supabase.rpc('statistiche_stagione', { p_palestra: p, p_dal: per.dal, p_al: per.al, p_sezione: 'iscrizioni' }),
    supabase.rpc('andamento_mensile', { p_palestra: p, p_mesi: 12 }),
  ]);
  const d = k || {}; const st = s || {};
  const isc = st.iscrizioni_mese || [];
  const stag = st.stagioni || [];
  const rin = st.rinnovo || {};
  const abb = st.abbonamenti || [];
  const mesi = (andamento || []).map((m) => ({ ...m, etichetta: MESI[new Date(m.mese).getMonth()] }));
  const tot = isc.reduce((a, m) => ({ n: a.n + m.nuove, r: a.r + m.rinnovi, u: a.u + m.uscite }), { n: 0, r: 0, u: 0 });

  return (
    <>
      <Testa scheda="iscrizioni" per={per} />
      <div className="st-numeri">
        <Numero titolo="Iscritti attivi" valore={d.persone_attive ?? 0} nota={`${d.iscrizioni_attive ?? 0} abbonamenti attivi`} />
        <Numero titolo="Nuovi nel periodo" valore={d.nuovi ?? 0} tono="ok" nota="prima iscrizione in assoluto" />
        <Numero titolo="Hanno smesso" valore={d.cessati ?? 0} tono={d.cessati > d.nuovi ? 'male' : null} nota="finito senza rinnovare" />
        <Numero titolo="Tasso di rinnovo" valore={pct(quota(rin.rinnovate, rin.finite))} nota={`${rin.rinnovate ?? 0} rinnovati su ${rin.finite ?? 0} finiti`}
                tono={quota(rin.rinnovate, rin.finite) >= 70 ? 'ok' : rin.finite ? 'male' : null} />
        <Numero titolo="Abbandono" valore={pct(d.abbandono_pct)} tono={d.abbandono_pct > 5 ? 'male' : 'ok'} nota="sotto il 5% è sano" />
        <Numero titolo="Ultimi 12 mesi" valore={`${tot.n} + ${tot.r}`} nota={`nuovi + rinnovi · ${tot.u} usciti`} />
      </div>

      <div className="st-griglia">
        <Blocco titolo="Iscritti attivi: questa stagione e la scorsa" nota="al 15 di ogni mese">
          <Linee etichette={MESI_STAGIONE} serie={[
            { nome: 'Questa stagione', valori: stag.filter((x) => x.k === 0).map((x) => x.attivi) },
            { nome: 'Stagione scorsa', valori: stag.filter((x) => x.k === 1).map((x) => x.attivi), colore: '#9a9a9a', tratteggio: true },
          ]} />
        </Blocco>
        <Blocco titolo="Nuovi, rinnovi e chi smette" nota="ultimi 12 mesi">
          <BarreGruppi dati={isc.map((m) => ({ etichetta: meseDi(m.mese), valori: [m.nuove, m.rinnovi, m.uscite] }))}
                       serie={[{ nome: 'Nuovi' }, { nome: 'Rinnovi' }, { nome: 'Hanno smesso', colore: '#9a9a9a' }]} />
        </Blocco>
        <Blocco titolo="Abbonamenti più scelti" nota="iniziati nel periodo">
          <BarreOrizzontali dati={abb.map((a) => ({ etichetta: a.nome, valore: a.n, nota: eur(a.euro) }))} />
        </Blocco>
        <Blocco titolo="Da quanto tempo sono con noi" nota="iscritti attivi oggi">
          <Anello dati={st.anzianita || []} />
        </Blocco>
        <Blocco titolo="Abbandono mese per mese" nota="% di chi ha smesso sugli attivi">
          <Linea dati={mesi.map((m) => ({ etichetta: m.etichetta, valore: Number(m.abbandono_pct || 0) }))} formato={(v) => `${v}%`} colore="#111" />
        </Blocco>
        <Blocco titolo="Abbonamenti venduti (€)" nota="ultimi 12 mesi">
          <Linea dati={mesi.map((m) => ({ etichetta: m.etichetta, valore: Math.round(Number(m.ricavi_cent) / 100) }))} formato={(v) => `${v} €`} />
        </Blocco>
      </div>
      <p className="st-nota">
        Nuovi = prima iscrizione in assoluto. Rinnovi = ogni iscrizione successiva. Hanno smesso = abbonamento finito e
        nessun altro iniziato entro 45 giorni. Tasso di rinnovo = abbonamenti finiti nel periodo seguiti da un altro entro 45 giorni.
      </p>
    </>
  );
}
