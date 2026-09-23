import Link from 'next/link';

export default function Testata({ destra }) {
  return (
    <header className="testata">
      <Link href="/" className="marchio" aria-label="Ritmo Metropolitano">
        <img src="/logo-tondo.png" alt="" width="26" height="34" />
        <span>Ritmo Metropolitano</span>
      </Link>
      {destra}
    </header>
  );
}
