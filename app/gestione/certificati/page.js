import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { oggiISO, spostaGiorni } from '@/lib/formato';
import Certificati from './Certificati';

export const dynamic = 'force-dynamic';
const PER_PAGINA = 40;

// Certificati medici: da verificare (i più vecchi prima), approvati (per scadenza), rifiutati.
// Ricerca per nome, numeri su ogni scheda, 40 alla volta: regge anche 450 certificati.
export default async function PaginaCertificati({ searchParams }) {
  const { stato = 'da_verificare', q = '', pagina = '1', scadenza = '' } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const n = Math.max(1, parseInt(pagina, 10) || 1);
  const testo = String(q).trim().replace(/[%_,()]/g, ' ').slice(0, 40);
  const oggi = oggiISO(), fra30 = spostaGiorni(oggi, 30);

  let query = supabase.from('certificati')
    .select('id, nome_file, scadenza, stato, note, caricato_at, verificato_at, allievi!inner ( id, nome, cognome, certificato_scadenza )', { count: 'exact' })
    .eq('palestra_id', p).eq('stato', stato);
  if (testo) query = query.or(`nome.ilike.%${testo}%,cognome.ilike.%${testo}%`, { referencedTable: 'allievi' });
  if (stato === 'valido' && scadenza === '30') query = query.gte('scadenza', oggi).lte('scadenza', fra30);
  if (stato === 'valido' && scadenza === 'scaduti') query = query.lt('scadenza', oggi);
  query = stato === 'da_verificare' ? query.order('caricato_at', { ascending: true })
        : stato === 'valido' ? query.order('scadenza', { ascending: true, nullsFirst: true })
        : query.order('caricato_at', { ascending: false });

  const conta = (s) => supabase.from('certificati').select('id', { count: 'exact', head: true }).eq('palestra_id', p).eq('stato', s);
  const [{ data, count }, daVer, appr, rif, inScad] = await Promise.all([
    query.range((n - 1) * PER_PAGINA, n * PER_PAGINA - 1),
    conta('da_verificare'), conta('valido'), conta('rifiutato'),
    supabase.from('certificati').select('id', { count: 'exact', head: true }).eq('palestra_id', p).eq('stato', 'valido').gte('scadenza', oggi).lte('scadenza', fra30),
  ]);
  const pagine = Math.max(1, Math.ceil((count || 0) / PER_PAGINA));
  const link = (cambi) => {
    const u = new URLSearchParams({ stato });
    if (testo) u.set('q', testo);
    if (scadenza) u.set('scadenza', scadenza);
    Object.entries(cambi).forEach(([k, v]) => u.set(k, v));
    return `/gestione/certificati?${u.toString()}`;
  };

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Certificati medici</h1>
        <p>Controlla il documento, scrivi la scadenza, approva. I più vecchi in alto.</p>
      </div>

      <div className="schede-sezione" role="tablist">
        {[['da_verificare', 'Da verificare', daVer.count], ['valido', 'Approvati', appr.count], ['rifiutato', 'Rifiutati', rif.count]].map(([k, l, c]) => (
          <Link prefetch={false} key={k} role="tab" aria-selected={k === stato} href={`/gestione/certificati?stato=${k}`} className="scheda-link">
            {l} <span className={k === 'da_verificare' && c > 0 ? 'conta-mini' : 'muto'}>{c || 0}</span>
          </Link>
        ))}
      </div>

      <form className="filtri-persone filtri-cert" action="/gestione/certificati">
        <input type="hidden" name="stato" value={stato} />
        <input type="search" name="q" defaultValue={testo} placeholder="Cerca per cognome o nome" aria-label="Cerca persona" />
        {stato === 'valido' && (
          <select name="scadenza" defaultValue={scadenza} aria-label="Scadenza">
            <option value="">Tutti</option>
            <option value="30">Scadono entro 30 giorni ({inScad.count || 0})</option>
            <option value="scaduti">Già scaduti</option>
          </select>
        )}
        <button className="btn btn-piccolo">Cerca</button>
        <span className="piccolo muto">{count || 0} {count === 1 ? 'certificato' : 'certificati'}{testo ? ` per "${testo}"` : ''}</span>
      </form>

      {(data || []).length === 0
        ? <div className="vuoto">{testo ? 'Nessuno con questo nome.' : stato === 'da_verificare' ? 'Niente da verificare: tutto in ordine.' : 'Nessun certificato in questo elenco.'}</div>
        : <Certificati certificati={data} stato={stato} oggi={oggi} />}

      {pagine > 1 && (
        <div className="paginazione">
          {n > 1 && <Link prefetch={false} className="btn btn-piccolo" href={link({ pagina: String(n - 1) })}>‹ Precedenti</Link>}
          <span className="piccolo muto">Pagina {n} di {pagine}</span>
          {n < pagine && <Link prefetch={false} className="btn btn-piccolo" href={link({ pagina: String(n + 1) })}>Successivi ›</Link>}
        </div>
      )}
    </>
  );
}
