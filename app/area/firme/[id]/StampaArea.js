'use client';

export default function StampaArea() {
  return <button type="button" className="btn btn-piccolo btn-primario" onClick={() => window.print()}>Salva in PDF o stampa</button>;
}
