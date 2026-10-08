import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Sportello from './Sportello';
import { satispayAttivo } from '@/lib/satispay';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sportello' };

// Sportello: il cliente al banco in una schermata (cerca o nuovo → situazione → abbonamento, quota,
// certificato, posto a lezione → incasso e ricevuta per email → gruppo WhatsApp e tessera dell'ente)
export default async function PaginaSportello({ searchParams }) {
  const { persona, workshop: workshopIniziale } = (await searchParams) || {};
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  // una chiamata sola per corsi, abbonamenti, orari, impostazioni, staff e Satispay (query 144); se manca, le letture una per una
  // i workshop aperti (query 147) insieme: nessuna attesa in più
  const [{ data: insieme, error: erroreInsieme }, { data: workshop }] = await Promise.all([
    supabase.rpc('sportello_dati', { p_palestra: p }),
    supabase.rpc('workshop_aperti', { p_palestra: p }),
  ]);
  let corsi, tipi, orari, palestra, persone, satispay;
  if (!erroreInsieme && insieme) {
    ({ corsi, tipi, orari, palestra, persone } = insieme);
    satispay = insieme.satispay || !!(process.env.SATISPAY_KEY_ID && process.env.SATISPAY_CHIAVE_PRIVATA);
  } else {
    [{ data: corsi }, { data: tipi }, { data: orari }, { data: palestra }, { data: persone }] = await Promise.all([
      supabase.from('corsi').select('id, nome, colore, capienza, link_whatsapp').eq('palestra_id', p).eq('attivo', true).order('nome'),
      supabase.from('tipi_abbonamento')
        .select('id, nome, famiglia, modalita, durata_mesi, durata_giorni, num_ingressi, lezioni_settimanali, scadenza_fine_mese, prezzo_cent, tipi_abbonamento_corsi ( corso_id )')
        .eq('palestra_id', p).eq('attivo', true).eq('archiviato', false).order('famiglia').order('nome'),
      supabase.from('orari').select('id, corso_id, giorno_settimana, ora_inizio, valido_al, gruppo, insegnante_id').eq('palestra_id', p).eq('attivo', true)
        .order('giorno_settimana').order('ora_inizio'),
      supabase.from('palestre').select('nome, quota_iscrizione_cent, sconti, ente, mese_fine_stagione, mese_inizio_annuale, mese_inizio_stagione')
        .eq('id', p).maybeSingle(),
      supabase.from('staff').select('id, nome, cognome').eq('palestra_id', p),
    ]);
    satispay = await satispayAttivo();
  }
  const nomeIns = Object.fromEntries((persone || []).map((x) => [x.id, `${x.nome} ${x.cognome || ''}`.trim()]));

  return (
    <Sportello palestraId={p} corsi={corsi || []} tipi={tipi || []} orari={(orari || []).map((o) => ({ ...o, insegnante: nomeIns[o.insegnante_id] || '' }))} palestra={palestra || {}}
               personaIniziale={persona || null} satispay={satispay}
               workshop={Array.isArray(workshop) ? workshop.filter((w) => w.stato !== 'annullato' && (w.opzioni || []).length) : []} workshopIniziale={workshopIniziale || null} />
  );
}
