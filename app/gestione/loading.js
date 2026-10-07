// Scheletro della pagina mentre arriva: titolo, barra di filtri e tre blocchi grigi che pulsano.
// Compare subito al clic (grazie al prefetch dei link del menù) e si rimpiazza con la pagina vera.
export default function Caricamento() {
  return (
    <main className="pagina-larga sk" aria-busy="true" aria-label="Carico la pagina">
      <div className="sk-riga sk-occhiello" />
      <div className="sk-riga sk-titolo" />
      <div className="sk-barra"><span /><span /><span /><span /></div>
      <div className="sk-blocchi"><div className="sk-blocco" /><div className="sk-blocco" /><div className="sk-blocco" /></div>
      <div className="sk-blocco sk-lungo" />
    </main>
  );
}
