import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { utenteCorrente } from '@/lib/utente';
import Richiesta from '../../spazi/Richiesta';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Prenota una sala · Ritmo Metropolitano' };

// "Prenota una sala" dentro l'app: stessa richiesta del sito, ma con i dati di chi è entrato già scritti
export default async function PrenotaSala() {
  const user = await utenteCorrente();
  if (!user) redirect('/area/accedi?da=/area/sala');
  const supabase = await supabaseServer();
  const { data: acc } = await supabase.from('account').select('nome, cognome, email, telefono').eq('user_id', user.id).limit(1).maybeSingle();
  return (
    <div className="area-sala">
      <Richiesta titolo="Prenota una sala"
                 contatto={{ nome: `${acc?.nome || ''} ${acc?.cognome || ''}`.trim(), email: acc?.email || user.email || '', telefono: acc?.telefono || '' }} />
    </div>
  );
}
