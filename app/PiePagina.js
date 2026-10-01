import Link from 'next/link';

// Piede delle pagine pubbliche: i collegamenti che la legge chiede siano sempre raggiungibili
export default function PiePagina({ nome = 'Ritmo Metropolitano', datiFiscali = '' }) {
  return (
    <footer className="pie-pagina">
      <span>© {new Date().getFullYear()} {nome}{datiFiscali ? ` · ${datiFiscali.split('\n')[0]}` : ''}</span>
      <nav aria-label="Informazioni legali">
        <Link href="/privacy">Privacy</Link>
        <Link href="/cookie">Cookie</Link>
        <Link href="/area/privacy">I miei dati</Link>
      </nav>
    </footer>
  );
}
