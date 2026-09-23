import Testata from '../Testata';
import Carica from './Carica';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { dataBreve } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Certificato medico · Ritmo Metropolitano' };

export default async function Certificato({ searchParams }) {
  const { t } = await searchParams;
  let allievo = null;
  if (t && /^[0-9a-f-]{36}$/i.test(t)) {
    const { data } = await supabaseAdmin().from('allievi')
      .select('nome, certificato_scadenza').eq('token', t).maybeSingle();
    allievo = data;
  }

  return (
    <>
      <Testata />
      <main className="pagina">
        {!allievo ? (
          <>
            <h1>Link non valido</h1>
            <p>Chiedi in segreteria un nuovo link per caricare il certificato.</p>
          </>
        ) : (
          <>
            <h1>Certificato medico di {allievo.nome}</h1>
            <p className="muto">
              {allievo.certificato_scadenza
                ? `Quello che abbiamo scade il ${dataBreve(allievo.certificato_scadenza)}.`
                : 'Non abbiamo ancora un certificato valido.'}
            </p>
            <Carica token={t} />
          </>
        )}
      </main>
    </>
  );
}
