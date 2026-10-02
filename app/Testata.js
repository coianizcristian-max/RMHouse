import Link from 'next/link';

// home: dove porta il logo. Sul sito pubblico la home; dentro l'area clienti e il gestionale
// la pagina principale di chi è entrato (non deve mai sembrare di essere usciti)
export default function Testata({ destra, sinistra = null, home = '/' }) {
  return (
    <header className="testata">
      <span className="testata-sx">
        {sinistra}
        <Link href={home} prefetch={false} className="marchio" aria-label={home === '/' ? 'Ritmo Metropolitano' : 'Ritmo Metropolitano, torna alla pagina principale'}>
          <img src="/logo-marchio.png" alt="" width="47" height="30" />
          <span>Ritmo Metropolitano</span>
        </Link>
      </span>
      {destra}
    </header>
  );
}
