import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { TIPI_SCADENZA } from '@/lib/stati';
import Scadenze from './Scadenze';

export const dynamic = 'force-dynamic';

// Tutte le scadenze in un posto: abbonamenti, ingressi, certificati, quote
export default async function PaginaScadenze({ searchParams }) {
  const { tipo = '', gestite = '' } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  let q = supabase.from('v_scadenze').select('*').eq('palestra_id', p);
  if (tipo && TIPI_SCADENZA[tipo]) q = q.eq('tipo', tipo);
  if (gestite !== '1') q = q.eq('gestito', false);
  const [{ data: righe }, { data: tutte }] = await Promise.all([
    q.order('data', { ascending: true, nullsFirst: true }).order('cognome').limit(1000),
    supabase.from('v_scadenze').select('tipo').eq('palestra_id', p).eq('gestito', false).limit(5000),
  ]);
  const conta = (t) => (tutte || []).filter((r) => !t || r.tipo === t).length;
  const link = (cambi) => {
    const u = new URLSearchParams(Object.entries({ tipo, gestite, ...cambi }).filter(([, v]) => v));
    return `/gestione/scadenze${u.toString() ? `?${u}` : ''}`;
  };

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Scadenze</h1>
        <p>Abbonamenti, ingressi, certificati e quote: chi è da sentire, da oggi e dall'ultimo mese.
          Segna "gestito" quando hai chiamato o scritto, così sparisce dall'elenco.</p>
      </div>

      <div className="pastiglie">
        <Link className="stato-pillola" aria-current={!tipo ? 'true' : undefined} href={link({ tipo: '' })}>Tutte <strong>{conta('')}</strong></Link>
        {Object.entries(TIPI_SCADENZA).map(([t, testo]) => (
          <Link key={t} className="stato-pillola" aria-current={tipo === t ? 'true' : undefined} href={link({ tipo: t })}>
            {testo} <strong>{conta(t)}</strong>
          </Link>
        ))}
        <Link className="stato-pillola neutro" aria-current={gestite === '1' ? 'true' : undefined}
              href={link({ gestite: gestite === '1' ? '' : '1' })}>
          {gestite === '1' ? 'Nascondi le gestite' : 'Mostra anche le gestite'}
        </Link>
      </div>

      <Scadenze palestraId={p} righe={righe || []} />
      <p className="piccolo muto" style={{ marginTop: 14 }}>
        Per rinnovare più abbonamenti in un colpo: <Link href="/gestione/rinnovi">Rinnovi in blocco</Link>.
      </p>
    </>
  );
}
