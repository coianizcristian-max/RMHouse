'use client';

// Barra che non finisce nella stampa
export default function Stampa() {
  return (
    <div className="senza-stampa azioni-riga" style={{ marginBottom: 18 }}>
      <button className="btn btn-primario" onClick={() => window.print()}>Stampa o salva in PDF</button>
      <button className="link-btn" onClick={() => window.close()}>Chiudi</button>
    </div>
  );
}
