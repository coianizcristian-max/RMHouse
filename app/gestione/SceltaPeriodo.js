import Link from 'next/link';
import { periodiPronti } from '@/lib/periodo';

// Scelta del periodo: periodi pronti (chip) oppure una data o un intervallo a mano.
// base: la pagina; altri: altri parametri da tenere (es. { chi: '…' })
export default function SceltaPeriodo({ base, per, altri = {}, conOggi = true }) {
  const extra = Object.entries(altri).filter(([, v]) => v).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  return (
    <div className="periodo">
      <nav className="periodo-chip" aria-label="Periodo">
        {periodiPronti(conOggi).map(([k, t]) => (
          <Link prefetch={false} key={k} href={`${base}?p=${k}${extra}`} aria-current={per.chiave === k ? 'true' : undefined}>{t}</Link>
        ))}
      </nav>
      <form className="periodo-date" action={base}>
        {Object.entries(altri).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <span>Dal</span><input type="date" name="dal" defaultValue={per.dal} aria-label="Dal" />
        <span>al</span><input type="date" name="al" defaultValue={per.al} aria-label="Al" />
        <button className="btn btn-piccolo">Mostra</button>
        <span className="piccolo">{per.etichetta}</span>
      </form>
    </div>
  );
}
