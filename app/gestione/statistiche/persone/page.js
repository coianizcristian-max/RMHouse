import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { leggiPeriodo } from '@/lib/periodo';
import { Numero, Anello, BarreOrizzontali } from '@/lib/grafici';
import Testa, { Blocco } from '../Testa';

export const dynamic = 'force-dynamic';

// Chi frequenta: la fotografia degli iscritti attivi oggi (il periodo vale per le altre sezioni)
export default async function Persone({ searchParams }) {
  const per = leggiPeriodo(await searchParams, 'stagione');
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const [{ data: k }, { data: s }, { data: distribuzione }] = await Promise.all([
    supabase.rpc('cruscotto', { p_palestra: p, p_dal: per.dal, p_al: per.al }),
    supabase.rpc('statistiche_stagione', { p_palestra: p, p_dal: per.dal, p_al: per.al }),
    supabase.rpc('distribuzione_iscritti', { p_palestra: p }),
  ]);
  const d = k || {}; const st = s || {};
  const perTipo = (t) => (distribuzione || []).filter((x) => x.tipo === t).map((x) => ({ etichetta: x.etichetta, valore: Number(x.valore) }));
  const genere = st.genere || [];
  const f = genere.find((g) => g.etichetta === 'Femmine')?.valore || 0;
  const m = genere.find((g) => g.etichetta === 'Maschi')?.valore || 0;

  return (
    <>
      <Testa scheda="persone" per={per} />
      <p className="st-nota" style={{ marginTop: -6, marginBottom: 12 }}>La fotografia degli iscritti attivi oggi.</p>
      <div className="st-numeri">
        <Numero titolo="Iscritti attivi" valore={d.persone_attive ?? 0} />
        <Numero titolo="Età media" valore={st.eta_media != null ? `${String(st.eta_media).replace('.', ',')} anni` : '–'} />
        <Numero titolo="Minorenni" valore={st.minorenni ?? 0} nota={d.persone_attive ? `${Math.round(((st.minorenni || 0) / d.persone_attive) * 100)}% degli iscritti` : null} />
        <Numero titolo="Femmine / maschi" valore={`${f} / ${m}`} nota="dal codice fiscale o dalla scheda" />
      </div>
      <div className="st-griglia">
        <Blocco titolo="Per fascia d'età"><Anello dati={perTipo('fascia')} /></Blocco>
        <Blocco titolo="Per categoria"><Anello dati={perTipo('categoria')} /></Blocco>
        <Blocco titolo="Per disciplina"><BarreOrizzontali dati={(st.discipline || []).map((x) => ({ etichetta: x.etichetta, valore: x.valore }))} /></Blocco>
        <Blocco titolo="Genere"><Anello dati={genere} /></Blocco>
        <Blocco titolo="Da quanto tempo sono con noi"><Anello dati={st.anzianita || []} /></Blocco>
        <Blocco titolo="Da dove arrivano" nota="come ci hanno conosciuto"><Anello dati={perTipo('fonte')} /></Blocco>
        <Blocco titolo="Dove abitano" nota="città di chi paga"><BarreOrizzontali dati={st.citta || []} colore="#111" /></Blocco>
      </div>
    </>
  );
}
