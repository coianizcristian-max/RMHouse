import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';

// Utente collegato + scheda staff nella palestra di questo sito.
// "cache": layout e pagina della stessa richiesta la calcolano una volta sola.
export const staffCorrente = cache(async () => {
  contatore.pagine += 1;
  const supabase = await supabaseServer();
  // getClaims verifica il token senza chiamare il server quando il progetto usa le chiavi asimmetriche
  let user = null;
  if (typeof supabase.auth.getClaims === 'function') {
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) user = { id: data.claims.sub, email: data.claims.email };
  }
  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data?.user || null;
  }
  if (!user) redirect('/login');
  // la scheda staff cambia di rado: la si tiene in memoria per un minuto, così ogni pagina risparmia
  // un viaggio al database prima ancora di cominciare (su Vercel: 80-150 ms a pagina)
  const inMemoria = schedeStaff.get(user.id);
  if (inMemoria && inMemoria.fino > Date.now()) return { supabase, user, staff: inMemoria.staff };
  const { data: staff } = await supabase
    .from('staff')
    .select('id, ruolo, ruolo_id, nome, palestra_id, palestre!inner(slug, nome)')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .eq('palestre.slug', process.env.NEXT_PUBLIC_PALESTRA_SLUG || 'rmhouse')
    .maybeSingle();
  // chi non è (ancora) staff non viene ricordato: appena viene abilitato entra subito
  if (staff) schedeStaff.set(user.id, { staff, fino: Date.now() + 60_000 });
  return { supabase, user, staff };
});

const schedeStaff = new Map();   // user.id → { staff, fino }
// quando è partito questo processo del server e quante pagine ha servito: lo mostra Impostazioni → Velocità
export const avvioProcesso = Date.now();
export const contatore = { pagine: 0 };
// da chiamare quando si cambia ruolo o si disattiva qualcuno: la pagina successiva rilegge subito
export function dimenticaStaff(userId) { if (userId) schedeStaff.delete(userId); else schedeStaff.clear(); }

// Dati del guscio (funzioni attive, voci nascoste del profilo, "vede attività"): cambiano di rado, si tengono in memoria
// un minuto per palestra+profilo. Prima ogni pagina (e ogni prefetch) faceva 3 richieste al database solo per il menù.
const datiGuscio = new Map();   // chiave → { dati, fino }
export async function guscioDati(supabase, staff) {
  const chiave = `${staff.palestra_id}|${staff.ruolo_id || ''}|${staff.ruolo}|${staff.id}`;
  const inMemoria = datiGuscio.get(chiave);
  if (inMemoria && inMemoria.fino > Date.now()) return inMemoria.dati;
  const [{ data: pal }, { data: profilo }, { data: vedeAttivita }] = await Promise.all([
    supabase.from('palestre').select('funzioni').eq('id', staff.palestra_id).maybeSingle(),
    staff.ruolo_id && staff.ruolo !== 'admin'
      ? supabase.from('ruoli').select('voci_nascoste').eq('id', staff.ruolo_id).maybeSingle()
      : Promise.resolve({ data: null }),
    staff.ruolo !== 'insegnante' ? supabase.rpc('puo_vedere_attivita', { p_palestra: staff.palestra_id }) : Promise.resolve({ data: false }),
  ]);
  const dati = { funzioni: pal?.funzioni || {}, nascoste: profilo?.voci_nascoste || [], vedeAttivita: vedeAttivita === true };
  datiGuscio.set(chiave, { dati, fino: Date.now() + 60_000 });
  return dati;
}
export function dimenticaGuscio() { datiGuscio.clear(); }
