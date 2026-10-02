import Link from 'next/link';

export default function Testata({ destra, sinistra = null }) {
  return (
    <header className="testata">
      <span className="testata-sx">
        {sinistra}
        <Link href="/" className="marchio" aria-label="Ritmo Metropolitano">
          <img src="/logo-marchio.png" alt="" width="47" height="30" />
          <span>Ritmo Metropolitano</span>
        </Link>
      </span>
      {destra}
    </header>
  );
}
