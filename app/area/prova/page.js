import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { utenteCorrente } from '@/lib/utente';
import Percorso from '../../prova/Percorso';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lezione di prova · Ritmo Metropolitano' };

// La lezione di prova dentro l'app: stesso percorso del sito, con i dati di chi è entrato già scritti
export default async function ProvaInApp() {
  const user = await utenteCorrente();
  if (!user) redirect('/area/accedi?da=/area/prova');
  const supabase = await supabaseServer();
  const { data: acc } = await supabase.from('account').select('id, nome, cognome, email, telefono').eq('user_id', user.id).limit(1).maybeSingle();
  const { data: tit } = acc
    ? await supabase.from('allievi').select('data_nascita').eq('account_id', acc.id).eq('is_titolare', true).limit(1).maybeSingle()
    : { data: null };
  return (
    <div className="area-sala">
      <Percorso contatto={{ nome: acc?.nome || '', cognome: acc?.cognome || '', email: acc?.email || user.email || '',
                            telefono: acc?.telefono || '', data_nascita: tit?.data_nascita || '' }} />
    </div>
  );
}
