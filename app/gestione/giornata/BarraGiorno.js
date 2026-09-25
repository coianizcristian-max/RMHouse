import Link from 'next/link';
import { oggiISO, spostaGiorni } from '@/lib/formato';

// Navigazione della giornata: giorno prima e dopo, oggi, data a scelta, sede, vista
export default function BarraGiorno({ base, data, sede, sedi = [], vista }) {
  const link = (d, s = sede) => `${base}?${new URLSearchParams(Object.entries({ giorno: d, sede: s }).filter(([, v]) => v))}`;
  const titolo = new Date(data + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="barra-giorno">
      <div className="bg-titolo">
        <h1>{titolo}</h1>
        <div className="pastiglie" style={{ margin: 0 }}>
          <Link className="stato-pillola" aria-current={vista === 'sale' ? 'true' : undefined} href={`/gestione/giornata?giorno=${data}`}>Per sale</Link>
          <Link className="stato-pillola" aria-current={vista === 'staff' ? 'true' : undefined} href={`/gestione/giornata/staff?giorno=${data}`}>Per insegnanti</Link>
        </div>
      </div>
      <div className="bg-comandi">
        <Link className="btn btn-piccolo" href={link(spostaGiorni(data, -1))} aria-label="Giorno prima">‹</Link>
        <Link className="btn btn-piccolo" href={link(oggiISO())}>Oggi</Link>
        <Link className="btn btn-piccolo" href={link(spostaGiorni(data, 1))} aria-label="Giorno dopo">›</Link>
        <form action={base} className="bg-data">
          {sede && <input type="hidden" name="sede" value={sede} />}
          <input type="date" name="giorno" defaultValue={data} aria-label="Scegli il giorno" />
          <button className="btn btn-piccolo">Vai</button>
        </form>
        {vista === 'sale' && sedi.length > 1 && (
          <div className="pastiglie" style={{ margin: 0 }}>
            {sedi.map((s) => (
              <Link key={s.id} className="stato-pillola" aria-current={sede === s.id ? 'true' : undefined} href={link(data, s.id)}>{s.nome}</Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
