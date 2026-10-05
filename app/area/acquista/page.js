import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { utenteCorrente } from '@/lib/utente';
import { stripeAttivo } from '@/lib/stripe';
import Acquista from './Acquista';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Acquista · Ritmo Metropolitano' };

// Il negozio dell'app: si sceglie l'abbonamento, il corso, i giorni e la data di inizio;
// si paga con carta (se attiva) o con bonifico (la segreteria conferma).
export default async function PaginaAcquista({ searchParams }) {
  const { corso, annullato } = await searchParams;
  const user = await utenteCorrente();
  if (!user) redirect(`/area/accedi?da=${encodeURIComponent('/area/acquista' + (corso ? `?corso=${corso}` : ''))}`);
  const supabase = await supabaseServer();
  const { data: dati } = await supabase.rpc('area_riepilogo');
  if (!dati?.collegato) redirect('/area');
  const { data: pal } = await supabase.from('palestre').select('id, stripe, quota_iscrizione_cent, area_cliente').limit(1).maybeSingle();

  const [{ data: tipi }, { data: corsi }, { data: orari }, { data: coperti }, { data: gruppi }, { data: persone }] = await Promise.all([
    supabase.from('tipi_abbonamento')
      .select('id, nome, descrizione, modalita, lezioni_settimanali, num_ingressi, prezzo_cent, prezzo_web_cent, durata_mesi, durata_giorni, scadenza_fine_mese, rinnovo_automatico, gruppo_id')
      .eq('palestra_id', pal.id).eq('attivo', true).eq('acquistabile_online', true).or('archiviato.is.null,archiviato.eq.false').order('nome'),
    supabase.from('corsi').select('id, nome, colore, iscrizioni_app, nota_iscrizioni').eq('palestra_id', pal.id).eq('attivo', true).order('nome'),
    supabase.from('orari').select('id, corso_id, giorno_settimana, ora_inizio, durata_min, prenotabile, attivo').eq('palestra_id', pal.id),
    supabase.from('tipi_abbonamento_corsi').select('tipo_abbonamento_id, corso_id'),
    supabase.from('gruppi_listino').select('id, nome, ordine').eq('palestra_id', pal.id).order('ordine'),
    supabase.rpc('profilo_area'),
  ]);
  const [{ data: pieni }, { data: attivi }] = await Promise.all([
    supabase.rpc('orari_pieni', { p_palestra: pal.id }),
    supabase.from('iscrizioni').select('allievo_id, corso_id, data_fine').eq('stato', 'attiva').gte('data_fine', new Date().toISOString().slice(0, 10)),
  ]);

  return <Acquista
    allievi={(persone || []).map((p) => ({ id: p.id, nome: p.nome, quota: !!p.quota_mancante }))}
    tipi={tipi || []} corsi={corsi || []} orari={(orari || []).filter((o) => o.attivo !== false)}
    coperti={coperti || []} gruppi={gruppi || []} corsoIniziale={corso || ''}
    quotaCent={pal?.quota_iscrizione_cent || 0}
    carta={stripeAttivo() && pal?.stripe?.abbonamenti_online !== false}
    rinnovo={!!pal?.stripe?.rinnovo_automatico}
    bonifico={pal?.area_cliente?.bonifico || null} annullato={!!annullato} pieni={pieni || []} attivi={attivi || []} />;
}
