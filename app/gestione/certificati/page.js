import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { dataBreve } from '@/lib/formato';
import Verifica from './Verifica';

export const dynamic = 'force-dynamic';

// Certificati caricati dai clienti: la segreteria legge il documento e registra la scadenza
export default async function Certificati({ searchParams }) {
  const { stato = 'da_verificare' } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');

  const { data: certificati } = await supabase
    .from('certificati')
    .select('id, file_path, nome_file, scadenza, stato, note, caricato_at, allievi ( id, nome, cognome, certificato_scadenza )')
    .eq('palestra_id', staff.palestra_id)
    .eq('stato', stato)
    .order('caricato_at', { ascending: false })
    .limit(100);

  // link temporanei per vedere il documento (il bucket è privato)
  const db = supabaseAdmin();
  const conLink = await Promise.all((certificati || []).map(async (c) => {
    const { data } = await db.storage.from('certificati').createSignedUrl(c.file_path, 3600);
    return { ...c, url: data?.signedUrl || null };
  }));

  const filtri = [['da_verificare', 'Da verificare'], ['valido', 'Approvati'], ['rifiutato', 'Rifiutati']];

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Certificati medici</h1>
        <p>I documenti caricati dai clienti: controlla, metti la scadenza, approva.</p>
      </div>
      <div className="filtri">
        {filtri.map(([k, l]) => (
          <a key={k} href={`/gestione/certificati?stato=${k}`} aria-current={k === stato ? 'true' : undefined}>{l}</a>
        ))}
      </div>
      {conLink.length === 0 && <div className="vuoto">Nessun certificato in questo elenco.</div>}
      <ul className="elenco">
        {conLink.map((c) => (
          <li key={c.id} style={{ padding: '14px 4px' }}>
            <div className="persona-nome">{c.allievi.cognome} {c.allievi.nome}</div>
            <div className="piccolo muto">
              Caricato il {dataBreve(c.caricato_at)}
              {c.allievi.certificato_scadenza && ` · in archivio scade il ${dataBreve(c.allievi.certificato_scadenza)}`}
            </div>
            {c.url && <p style={{ margin: '8px 0' }}><a href={c.url} target="_blank" rel="noopener">Apri il documento</a></p>}
            <Verifica certificato={c} />
          </li>
        ))}
      </ul>
    </>
  );
}
