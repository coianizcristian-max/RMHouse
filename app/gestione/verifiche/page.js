import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { oggiISO, spostaGiorni } from '@/lib/formato';
import Verifiche from './Verifiche';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Export per le verifiche' };

const ISO = (d) => d.toISOString().slice(0, 10);

// Export per le verifiche: una o due volte l'anno si scarica un pacchetto di file e lo si dà a Claude,
// che incrocia i dati e trova quello che la segreteria non ha sistemato. Qui ci sono anche le istruzioni
// e il messaggio da incollare, così lo può fare chiunque anche a distanza di mesi.
export default async function PaginaVerifiche() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const oggi = oggiISO();
  const [{ data: pal }, { data: fatte }, { data: prossimo }, { data: io }] = await Promise.all([
    supabase.from('palestre').select('nome, mese_inizio_stagione').eq('id', p).maybeSingle(),
    supabase.from('verifiche_export').select('id, creato_at, chi, dal, al, file').eq('palestra_id', p).order('creato_at', { ascending: false }).limit(10),
    supabase.from('promemoria').select('data, per_staff').eq('palestra_id', p).eq('fatto', false).like('testo', 'Export per le verifiche%')
      .gte('data', oggi).order('data').limit(1).maybeSingle(),
    supabase.from('staff').select('nome, cognome').eq('id', staff.id).maybeSingle(),
  ]);

  const [a, m] = oggi.split('-').map(Number);
  const meseStag = pal?.mese_inizio_stagione || 9;
  const annoStag = m >= meseStag ? a : a - 1;
  const inizioStag = ISO(new Date(Date.UTC(annoStag, meseStag - 1, 1)));
  const inizioStagScorsa = ISO(new Date(Date.UTC(annoStag - 1, meseStag - 1, 1)));
  const seiMesi = ISO(new Date(Date.UTC(a, m - 7, Number(oggi.slice(8)) + 1)));
  const ultima = fatte?.[0] || null;
  const periodi = [
    ultima && ultima.al < oggi && { k: 'ultima', testo: 'Dall\'ultima verifica', dal: spostaGiorni(ultima.al, 1), al: oggi },
    { k: 'stagione', testo: `Stagione ${annoStag}/${String(annoStag + 1).slice(2)} fino a oggi`, dal: inizioStag, al: oggi },
    { k: 'scorsa', testo: `Stagione ${annoStag - 1}/${String(annoStag).slice(2)}`, dal: inizioStagScorsa, al: spostaGiorni(inizioStag, -1) },
    { k: 'sei', testo: 'Ultimi 6 mesi', dal: seiMesi, al: oggi },
    { k: 'anno', testo: `Anno ${a - 1}`, dal: `${a - 1}-01-01`, al: `${a - 1}-12-31` },
  ].filter(Boolean);

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Conti</div>
        <h1>Export per le verifiche</h1>
        <p>Una o due volte l&apos;anno scarichi un pacchetto di file e lo dai a Claude: incrocia clienti, abbonamenti, pagamenti,
          ricevute, presenze e modifiche e ti dice cosa non torna (incassi mancanti, ricevute saltate, chi frequenta senza abbonamento,
          certificati scaduti, contanti non versati…). Qui sotto c&apos;è tutto: cosa fare, in che ordine e il messaggio da incollare.</p>
      </div>
      <Verifiche palestraId={p} scuola={pal?.nome || 'la scuola'} oggi={oggi} periodi={periodi}
                 fatte={fatte || []} prossimo={prossimo?.data || null} chi={`${io?.nome || staff.nome || ''} ${io?.cognome || ''}`.trim()} />
    </>
  );
}
