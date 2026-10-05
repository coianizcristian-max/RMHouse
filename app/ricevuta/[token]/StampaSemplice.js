'use client';
export default function StampaSemplice() {
  return (
    <div className="senza-stampa azioni-riga" style={{ marginBottom: 18 }}>
      <button className="btn btn-primario" onClick={() => window.print()}>Stampa o salva in PDF</button>
    </div>
  );
}
