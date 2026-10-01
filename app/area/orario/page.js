import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { utenteCorrente } from '@/lib/utente';
import { oggiISO } from '@/lib/formato';
import Orario from './Orario';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Orario · Ritmo Metropolitano' };

// L'orario della scuola, giorno per giorno. Accanto a ogni lezione: "ci sei", "Prenota" se la
// famiglia la può prenotare (ingressi, accesso libero, recuperi), o i posti liberi.
export default async function PaginaOrario({ searchParams }) {
  const { giorno } = await searchParams;
  const user = await utenteCorrente();
  if (!user) redirect('/area/accedi?da=/area/orario');
  const supabase = await supabaseServer();
  const oggi = oggiISO();
  const g = /^\d{4}-\d{2}-\d{2}$/.test(giorno || '') && giorno >= oggi ? giorno : oggi;

  const [{ data: dati }, { data: lezioni }, { data: regole }, { data: perMese }, { data: sedi }] = await Promise.all([
    supabase.rpc('area_riepilogo'),
    supabase.rpc('orario_area', { p_giorno: g, p_sede: null }),
    supabase.rpc('disdette_area'),
    supabase.rpc('recuperi_per_mese'),
    supabase.from('sedi').select('id, nome, principale').eq('visibile', true).order('principale', { ascending: false }).order('ordine'),
  ]);
  const massimo = regole?.recuperi_max_mese ?? null;
  const meseDi = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 7);
  const pieno = (allievo, iso) => massimo != null && ((perMese?.[allievo]?.[meseDi(iso)] || 0) >= massimo);
  if (!dati?.collegato) redirect('/area');

  // cosa può prenotare ognuno: con ingressi/accesso libero e con i recuperi (il recupero che scade prima)
  const prenotabili = {};
  const aggiungi = (lezione, voce) => {
    (prenotabili[lezione] ||= []);
    if (!prenotabili[lezione].some((x) => x.allievo_id === voce.allievo_id)) prenotabili[lezione].push(voce);
  };
  const disdette = (regole?.disdette || []).map((d) => `${d.lezione_id}:${d.allievo_id}`);
  await Promise.all((dati.allievi || []).map(async (a) => {
    const { data } = await supabase.rpc('lezioni_prenotabili', { p_allievo: a.id });
    (data || []).forEach((l) => aggiungi(l.lezione_id, { allievo_id: a.id, nome: a.nome, credito: null }));
  }));
  const crediti = [...(dati.crediti || [])].sort((x, y) => String(x.scadenza).localeCompare(String(y.scadenza)));
  for (const c of crediti) {
    const { data } = await supabase.rpc('lezioni_per_recupero', { p_credito: c.id });
    (data || []).filter((l) => !disdette.includes(`${l.lezione_id}:${c.allievo_id}`) && !pieno(c.allievo_id, l.inizio))
      .forEach((l) => aggiungi(l.lezione_id, { allievo_id: c.allievo_id, nome: c.allievo, credito: c.id }));
  }

  return <Orario giorno={g} oggi={oggi} lezioni={lezioni || []} prenotabili={prenotabili} sedi={sedi || []}
                 allievi={(dati.allievi || []).map((a) => ({ id: a.id, nome: a.nome }))} />;
}
