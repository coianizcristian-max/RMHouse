import Link from 'next/link';
import Testata from './Testata';

export default function Home() {
  return (
    <>
      <Testata destra={<Link href="/login" className="piccolo">Area staff</Link>} />
      <main className="pagina">
        <img src="/logo.png" alt="Ritmo Metropolitano, acrobatic and dance center"
             style={{ display: 'block', width: '100%', maxWidth: 340, margin: '8px auto 20px' }} />
        <h1>Prova una lezione da noi</h1>
        <p className="muto">
          Scegli la disciplina, trova l'orario giusto per età e livello e prenota in un minuto.
        </p>
        <Link href="/prova" className="btn btn-primario btn-pieno">Prenota la lezione di prova</Link>
        <p style={{ marginTop: 28 }}>
          <strong>Ti serve uno spazio?</strong><br />
          <span className="muto">Affittiamo le sale a ore e organizziamo feste di compleanno e workshop.</span>
        </p>
        <Link href="/spazi" className="btn btn-pieno">Affitta una sala o organizza una festa</Link>
      
      <p style={{ marginTop: 14 }}>
        <Link className="btn" href="/area">Sei già iscritto? Entra nella tua area</Link>
      </p>
</main>
    </>
  );
}
