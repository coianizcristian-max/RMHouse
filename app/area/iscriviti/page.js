import { redirect } from 'next/navigation';
import { tutte } from '@/lib/tutte';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { utenteCorrente } from '@/lib/utente';
import { stripeAttivo } from '@/lib/stripe';
import Iscriviti from './Iscriviti';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Iscriviti · Ritmo Metropolitano' };

// Iscrizione guidata dal telefono: per chi → corso (filtrato per età) → abbonamento → giorni → paga
export default async function PaginaIscriviti({ searchParams }) {
  const { corso, annullato, per } = (await searchParams) || {};
  const user = await utenteCorrente();
  if (!user) redirect(`/area/accedi?da=${encodeURIComponent('/area/iscriviti' + (corso ? `?corso=${corso}` : ''))}`);
  const supabase = await supabaseServer();
  await supabase.rpc('collega_account');
  const { data: pal } = await supabase.from('palestre').select('id, stripe, quota_iscrizione_cent, area_cliente').limit(1).maybeSingle();
  if (!pal) redirect('/area');

  const [{ data: persone }, { data: catalogo }, { data: corsi }, { data: tipi }, { data: orari }, { data: coperti }, { data: pieni }, { data: attivi }] = await Promise.all([
    supabase.rpc('profilo_area'),
    supabaseAdmin().from('v_corsi_pubblici').select('id, nome, descrizione, colore, foto_url, disciplina, categoria, fascia, eta_min, eta_max, livello, sede, insegnanti, orari').eq('palestra_id', pal.id),
    supabase.from('corsi').select('id, iscrizioni_app, nota_iscrizioni').eq('palestra_id', pal.id).eq('attivo', true),
    supabase.from('tipi_abbonamento')
      .select('id, nome, descrizione, modalita, lezioni_settimanali, num_ingressi, prezzo_cent, prezzo_web_cent, durata_mesi, durata_giorni, scadenza_fine_mese, rinnovo_automatico')
      .eq('palestra_id', pal.id).eq('attivo', true).eq('acquistabile_online', true).or('archiviato.is.null,archiviato.eq.false'),
    supabase.from('orari').select('id, corso_id, giorno_settimana, ora_inizio, durata_min, prenotabile, attivo').eq('palestra_id', pal.id).eq('attivo', true),
    tutte(() => supabase.from('tipi_abbonamento_corsi').select('tipo_abbonamento_id, corso_id, tipi_abbonamento!inner ( palestra_id )')
      .eq('tipi_abbonamento.palestra_id', pal.id).order('tipo_abbonamento_id').order('corso_id')),
    supabase.rpc('orari_pieni', { p_palestra: pal.id }),
    supabase.from('iscrizioni').select('allievo_id, corso_id, data_fine').eq('stato', 'attiva').gte('data_fine', new Date().toISOString().slice(0, 10)),
  ]);
  if (!(persone || []).length) redirect('/area');

  // solo i corsi che si possono comprare dall'app, con il loro stato delle iscrizioni
  const stato = Object.fromEntries((corsi || []).map((c) => [c.id, c]));
  const elenco = (catalogo || []).filter((c) => stato[c.id]).map((c) => ({ ...c, iscrizioni_app: stato[c.id].iscrizioni_app || 'aperte', nota_iscrizioni: stato[c.id].nota_iscrizioni }));

  return (
    <Iscriviti
      persone={(persone || []).map((p) => ({ id: p.id, nome: p.nome, nascita: p.nascita, quota: !!p.quota_mancante, certificatoOk: !!p.certificato_ok, inVerifica: !!p.certificato_in_verifica, token: p.token }))}
      corsi={elenco} tipi={tipi || []} orari={(orari || []).filter((o) => o.prenotabile !== false)} coperti={coperti || []}
      pieni={pieni || []} attivi={attivi || []} quotaCent={pal.quota_iscrizione_cent || 0}
      carta={stripeAttivo() && pal.stripe?.abbonamenti_online !== false} rinnovo={!!pal.stripe?.rinnovo_automatico}
      bonifico={pal.area_cliente?.bonifico || null}
      corsoIniziale={typeof corso === 'string' ? corso : ''} perIniziale={typeof per === 'string' ? per : ''} annullato={!!annullato} />
  );
}
