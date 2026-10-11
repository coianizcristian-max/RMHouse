'use client';
// La barra del cliente sopra la ricevuta: stampa e PDF da scaricare (query/aggiornamento 193)
export default function StampaSemplice({ token = null }) {
  return (
    <div className="senza-stampa azioni-riga" style={{ marginBottom: 18 }}>
      <button className="btn btn-primario" onClick={() => window.print()}>Stampa</button>
      {token && <a className="btn" href={`/api/ricevuta/${token}/pdf`}>Scarica il PDF</a>}
    </div>
  );
}
