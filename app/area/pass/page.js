import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { qrSvg } from '@/lib/qr';

export const dynamic = 'force-dynamic';

// Il pass d'ingresso: un QR per persona, da mostrare alla reception
export default async function Pass() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/area/accedi');
  const [{ data: allievi }, { data: pal }] = await Promise.all([
    supabase.from('allievi').select('id, nome, cognome, token, account!inner ( user_id )').eq('account.user_id', user.id).order('created_at'),
    supabase.from('palestre').select('base_url').limit(1).maybeSingle(),
  ]);
  const base = pal?.base_url || '';

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">La mia area</div>
        <h1>Il mio pass</h1>
        <p>Mostralo alla reception quando entri: la presenza si segna da sola. Alza la luminosità dello schermo.</p>
      </div>
      <div className="pass-elenco">
        {(allievi || []).map((a) => (
          <div key={a.id} className="pass">
            <div className="pass-qr" dangerouslySetInnerHTML={{ __html: qrSvg(`${base}/ingresso?t=${a.token}`) }} />
            <strong>{a.nome} {a.cognome}</strong>
          </div>
        ))}
      </div>
    </>
  );
}
