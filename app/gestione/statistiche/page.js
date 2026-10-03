import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { leggiPeriodo, qsPeriodo } from '@/lib/periodo';
import { Numero, BarreGruppi, Linee, Barre, BarreOrizzontali } from '@/lib/grafici';
import { eur, pct, meseDi, MESI_STAGIONE, quota } from '@/lib/statistiche';
import Testa, { Blocco } from './Testa';

export const dynamic = 'force-dynamic';

// Statistiche → Panoramica: i numeri che contano e quattro grafici, ognuno porta alla sua sezione
export default async function Panoramica({ searchParams }) {
  const per = leggiPeriodo(await searchParams, 'stagione');
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const [{ data: k }, { data: s }, { data: corsi }] = await Promise.all([
    supabase.rpc('cruscotto', { p_palestra: p, p_dal: per.dal, p_al: per.al }),
    supabase.rpc('statistiche_stagione', { p_palestra: p, p_dal: per.dal, p_al: per.al, p_sezione: 'panoramica' }),
    supabase.rpc('economia_corsi', { p_palestra: p, p_dal: per.dal, p_al: per.al }),
  ]);
  const d = k || {};
  const st = s || {};
  const isc = st.iscrizioni_mese || [];
  const stag = st.stagioni || [];
  const ora = stag.filter((x) => x.k === 0).map((x) => x.attivi);
  const prima = stag.filter((x) => x.k === 1).map((x) => x.attivi);
  const ultimoOra = [...ora].reverse().find((v) => v != null);
  const stessoMesePrima = prima[ora.findLastIndex((v) => v != null)];
  const rin = st.rinnovo || {};
  const daSistemare = (corsi || []).filter((c) => c.riempimento_pct != null && c.riempimento_pct < 50);
  const qs = qsPeriodo(per);

  return (
    <>
      <Testa per={per} />

      <div className="st-numeri">
        <Numero titolo="Iscritti attivi" valore={d.persone_attive ?? 0}
                nota={stessoMesePrima != null && ultimoOra != null ? `${ultimoOra - stessoMesePrima >= 0 ? '+' : ''}${ultimoOra - stessoMesePrima} sulla stagione scorsa` : `${d.iscrizioni_attive ?? 0} abbonamenti`}
                tono={stessoMesePrima != null && ultimoOra != null ? (ultimoOra >= stessoMesePrima ? 'ok' : 'male') : null} />
        <Numero titolo="Nuovi nel periodo" valore={d.nuovi ?? 0} tono="ok" nota={`${d.cessati ?? 0} hanno smesso`} />
        <Numero titolo="Rinnovi" valore={pct(quota(rin.rinnovate, rin.finite))} nota={`${rin.rinnovate ?? 0} su ${rin.finite ?? 0} abbonamenti finiti`}
                tono={quota(rin.rinnovate, rin.finite) >= 70 ? 'ok' : rin.finite ? 'male' : null} />
        <Numero titolo="Riempimento lezioni" valore={pct(d.riempimento_pct)} tono={d.riempimento_pct >= 70 ? 'ok' : d.riempimento_pct < 50 ? 'male' : null} nota={`${d.posti_vuoti ?? 0} posti vuoti`} />
        <Numero titolo="Presenza" valore={pct(d.presenza_pct)} nota="presenti su chi era atteso" />
        <Numero titolo="Prova → iscrizione" valore={pct(d.conversione_pct)} nota={`${d.prove_effettuate ?? 0} prove fatte`} />
        <Numero titolo="Ricavi" valore={eur(d.ricavi_cent)} nota={`${eur(d.ricavo_per_persona_cent)} a persona`} />
        <Numero titolo="Margine" valore={eur(d.margine_cent)} tono={d.margine_cent >= 0 ? 'ok' : 'male'} nota={`costi ${eur(d.costi_cent)}`} />
      </div>

      {(d.certificati_scaduti > 0 || d.in_scadenza_15gg > 0 || daSistemare.length > 0) && (
        <div className="st-griglia">
          <Blocco titolo="Da tenere d'occhio">
            <ul className="at-voci">
              {d.certificati_scaduti > 0 && <li><Link prefetch={false} href="/gestione/certificati"><span>Iscritti senza certificato valido</span><strong>{d.certificati_scaduti}</strong></Link></li>}
              {d.in_scadenza_15gg > 0 && <li><Link prefetch={false} href="/gestione/scadenze"><span>Abbonamenti in scadenza entro 15 giorni</span><strong>{d.in_scadenza_15gg}</strong></Link></li>}
              {daSistemare.length > 0 && <li><Link prefetch={false} href={`/gestione/statistiche/corsi?${qs}`}><span>Corsi sotto il 50% di riempimento</span><strong>{daSistemare.length}</strong></Link></li>}
            </ul>
          </Blocco>
        </div>
      )}

      <div className="st-griglia">
        <Blocco titolo="Iscritti attivi: questa stagione e la scorsa" link="iscrizioni" per={per}>
          <Linee etichette={MESI_STAGIONE} serie={[
            { nome: 'Questa stagione', valori: ora },
            { nome: 'Stagione scorsa', valori: prima, colore: '#9a9a9a', tratteggio: true },
          ]} />
        </Blocco>
        <Blocco titolo="Nuovi, rinnovi e chi smette (12 mesi)" link="iscrizioni" per={per}>
          <BarreGruppi dati={isc.map((m) => ({ etichetta: meseDi(m.mese), valori: [m.nuove, m.rinnovi, m.uscite] }))}
                       serie={[{ nome: 'Nuovi' }, { nome: 'Rinnovi' }, { nome: 'Hanno smesso', colore: '#9a9a9a' }]} />
        </Blocco>
        <Blocco titolo="Presenze mese per mese" link="frequenza" per={per}>
          <Barre dati={(st.presenze_mese || []).map((m) => ({ etichetta: meseDi(m.mese), valore: Number(m.presenti) }))} />
        </Blocco>
        <Blocco titolo="Iscritti per disciplina (oggi)" link="persone" per={per}>
          <BarreOrizzontali dati={(st.discipline || []).slice(0, 8).map((x) => ({ etichetta: x.etichetta, valore: x.valore }))} />
        </Blocco>
      </div>
    </>
  );
}
