import { notFound } from 'next/navigation';
import Link from 'next/link';
import { staffCorrente } from '@/lib/staff';
import Firma from './Firma';

export const dynamic = 'force-dynamic';

// Firma sul tablet della reception
export default async function FirmaReception({ params, searchParams }) {
  const { id } = await params;
  const { m } = await searchParams;
  const { supabase } = await staffCorrente();
  const [{ data: a }, { data: modulo }] = await Promise.all([
    supabase.from('allievi').select('id, nome, cognome, data_nascita, is_titolare, account ( nome, cognome )').eq('id', id).maybeSingle(),
    supabase.from('moduli').select('id, titolo, testo').eq('id', m || '00000000-0000-0000-0000-000000000000').maybeSingle(),
  ]);
  if (!a || !modulo) notFound();
  const minore = a.data_nascita && new Date(a.data_nascita) > new Date(new Date().setFullYear(new Date().getFullYear() - 18));
  const genitore = !a.is_titolare && a.account ? `${a.account.nome} ${a.account.cognome || ''}`.trim() : '';
  return (
    <div style={{ maxWidth: 760 }}>
      <div className="occhiello"><Link href={`/gestione/persone/${a.id}`}>{a.nome} {a.cognome}</Link></div>
      <Firma modulo={modulo} allievo={a} minore={!!minore} nome={minore ? genitore : `${a.nome} ${a.cognome}`} />
    </div>
  );
}
