import Testata from '../Testata';
import Compila from './Compila';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sondaggio · Ritmo Metropolitano', robots: { index: false } };

// Sondaggio dal link personale ricevuto per email
export default async function Sondaggio({ searchParams }) {
  const { t } = await searchParams;
  let invito = null;
  if (t && /^[0-9a-f-]{36}$/i.test(t)) {
    const { data } = await supabaseAdmin().from('sondaggi_inviti')
      .select('token, risposto_at, sondaggi ( titolo, intro, domande, attivo ), allievi ( nome )').eq('token', t).maybeSingle();
    invito = data;
  }
  return (
    <>
      <Testata />
      <main className="pagina" style={{ maxWidth: 640 }}>
        {!invito || !invito.sondaggi?.attivo ? (
          <><h1>Link non valido</h1><p>Questo sondaggio non è più disponibile.</p></>
        ) : invito.risposto_at ? (
          <><h1>Grazie!</h1><p>Hai già risposto a questo sondaggio.</p></>
        ) : (
          <>
            <h1>{invito.sondaggi.titolo}</h1>
            {invito.sondaggi.intro && <p className="muto">{invito.allievi?.nome ? `Ciao ${invito.allievi.nome}! ` : ''}{invito.sondaggi.intro}</p>}
            <Compila token={t} domande={invito.sondaggi.domande} />
          </>
        )}
      </main>
    </>
  );
}
