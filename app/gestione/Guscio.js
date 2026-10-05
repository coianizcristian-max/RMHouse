'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Cronologia from './Cronologia';
import Campanella from './Campanella';
import { useEffect, useRef, useState, Suspense } from 'react';
import BarraCaricamento from './BarraCaricamento';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { AREE, areaDi } from '@/lib/menu';
import AzioniRapide from './AzioniRapide';
import GuidaArrivo from './GuidaArrivo';

const ICONE = {
  oggi: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  calendario: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M9 9v12M15 9v12" /></>,
  struttura: <><path d="M4 21V8l8-5 8 5v13" /><path d="M9 21v-6h6v6" /></>,
  persone: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 8.2a3 3 0 0 0 0-.4M17 14.8c2.4.5 4 2.5 4 5.2" /></>,
  conti: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  impostazioni: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  appello: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  chiudi: <><path d="M6 6l12 12M18 6 6 18" /></>,
  fissa: <><path d="M9 4h6l-1 6 3 3H7l3-3z" /><path d="M12 16v5" /></>,
  freccia: <><path d="m9 6 6 6-6 6" /></>,
  indietro: <><path d="m15 6-6 6 6 6" /></>,
  ingresso: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></>,
  esci: <><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" /><path d="m16 15 4-3-4-3M20 12H10" /></>,
};
const Icona = ({ nome }) => <svg viewBox="0 0 24 24" aria-hidden="true">{ICONE[nome]}</svg>;

export default function Guscio({ gestione, nome, ruolo, palestraId, funzioni = {}, nascoste = [], vedeAttivita = false, children }) {
  const path = usePathname();
  const router = useRouter();
  const attiva = areaDi(path);
  // una voce è visibile se il ruolo base la permette, la funzione è accesa e il ruolo su misura non la nasconde
  const admin = ruolo === 'admin';
  const visibile = (v) => (vedeAttivita || !v.soloAttivita) && (gestione || !v.soloGestione) && (admin || !v.soloAdmin) && (!v.funzione || funzioni[v.funzione] !== false) && !nascoste.includes(v.href);
  const aree = AREE.filter((a) => (gestione || !a.soloGestione) && a.voci.some(visibile));
  const area = aree.find((a) => a.k === attiva) || aree[0];
  const voci = (area?.voci || []).filter(visibile);
  // la pagina aperta corrisponde a una voce nascosta dal ruolo su misura?
  const bloccata = nascoste.length > 0 && AREE.flatMap((a) => a.voci)
    .filter((v) => v.esatto ? path === v.href : path === v.href || path.startsWith(v.href + '/'))
    .sort((x, y) => y.href.length - x.href.length)[0];
  const vietata = bloccata && nascoste.includes(bloccata.href);

  useEffect(() => {
    document.body.classList.add('con-nav');
    return () => document.body.classList.remove('con-nav');
  }, []);

  // Ogni voce ha la sua pagina: si illumina solo quella giusta.
  // Fra due voci annidate (es. /gestione e /gestione/oggi) vince la più lunga.
  const combacia = (v) => {
    const base = v.href.split('?')[0];
    if (v.esatto) return path === base;
    return path === base || path.startsWith(base + '/');
  };
  const scelta = voci.filter(combacia).sort((a, b) => b.href.length - a.href.length)[0];
  const voceAttiva = (v) => v === scelta;
  // pagine di dettaglio senza una voce di menù: un titolo lo stesso, così la barra non resta vuota
  const DETTAGLI = [
    [/^\/gestione\/appello(\/|$)/, 'Appello'], [/^\/gestione\/persone\/[^/]+\/firma/, 'Firma del modulo'],
    [/^\/gestione\/persone\/(?!nuova)[^/]+$/, 'Scheda persona'], [/^\/gestione\/corsi\/[^/]+\/modifica/, 'Modifica corso'],
    [/^\/gestione\/corsi\/nuovo/, 'Nuovo corso'], [/^\/gestione\/corsi\/[^/]+$/, 'Scheda corso'],
    [/^\/gestione\/ricevute\/[^/]+$/, 'Documento'], [/^\/gestione\/firme\//, 'Modulo firmato'],
    [/^\/gestione\/crm\/sondaggi\/[^/]+$/, 'Risultati'], [/^\/gestione\/commercialista\/attestati/, 'Attestati'],
    [/^\/gestione\/giornata\/staff/, 'Giornata per insegnanti'], [/^\/gestione\/compensi\/[^/]+$/, 'Riepilogo compensi'],
    [/^\/gestione\/persone\/[^/]+\/firmati/, 'Moduli firmati'],
  ];
  const titoloBarra = (DETTAGLI.find(([re]) => re.test(path)) || [])[1] || scelta?.testo;

  // Menù a cassetto per il telefono: le aree, e toccandone una le sue voci
  const [cassetto, setCassetto] = useState(false);
  const [aperta, setAperta] = useState(null);
  useEffect(() => { setCassetto(false); }, [path]);
  useEffect(() => {
    document.body.classList.toggle('cassetto-aperto', cassetto);
    if (cassetto) setAperta(null);
  }, [cassetto]);
  const areaAperta = aree.find((a) => a.k === aperta);

  // Computer: il sottomenù sta nascosto per lasciare spazio alle pagine. Si apre cliccando l'icona dell'area
  // (scorre fuori da sinistra sopra la pagina) e si richiude scegliendo una voce, cliccando fuori o con Esc.
  // Chi lo preferisce sempre aperto lo "fissa" con la puntina (ricordato su questo computer).
  const [menuAperto, setMenuAperto] = useState(null);
  const [fisso, setFisso] = useState(false);
  useEffect(() => {
    try { setFisso(localStorage.getItem('rm-menu-fisso') === '1'); } catch { /* niente */ }
  }, []);
  useEffect(() => { setMenuAperto(null); }, [path]);
  useEffect(() => {
    if (!menuAperto) return;
    const esc = (e) => { if (e.key === 'Escape') setMenuAperto(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [menuAperto]);
  function cambiaFisso() {
    const v = !fisso;
    setFisso(v); setMenuAperto(null);
    try { localStorage.setItem('rm-menu-fisso', v ? '1' : '0'); } catch { /* niente */ }
  }
  function cliccaArea(e, a) {
    if (fisso || window.innerWidth < 900) return; // menù fisso o telefono: il link porta alla prima voce come sempre
    if (a.voci.filter(visibile).length < 2) return; // area con una sola voce: ci va diretto
    e.preventDefault();
    e.currentTarget.setAttribute('data-apre-menu', ''); // la barra di caricamento non deve partire: non si naviga
    // se si è appena aperto passandoci sopra col mouse, il clic non lo richiude
    if (menuAperto === a.k && Date.now() - apertoDaMouse.current < 1500) return;
    setMenuAperto(menuAperto === a.k ? null : a.k);
  }
  // Come nella vecchia app: basta passare col mouse sull'icona per far uscire il menù; si richiude uscendo col mouse
  // (dall'icona o dal menù) dopo un attimo, così si può andare dall'icona alle voci senza che si chiuda. Solo mouse, non dita.
  const timer = useRef(null);
  const apertoDaMouse = useRef(0);
  const ferma = () => { clearTimeout(timer.current); timer.current = null; };
  function entraArea(e, a) {
    if (e.pointerType !== 'mouse' || fisso || window.innerWidth < 900 || a.voci.filter(visibile).length < 2) return;
    ferma();
    timer.current = setTimeout(() => { apertoDaMouse.current = Date.now(); setMenuAperto(a.k); }, menuAperto ? 60 : 160);
  }
  function esce(e) {
    if (e.pointerType !== 'mouse' || fisso) return;
    ferma();
    timer.current = setTimeout(() => setMenuAperto(null), 350);
  }
  useEffect(() => () => ferma(), []);
  // l'area le cui voci si vedono nel sottomenù: quella aperta col clic, altrimenti quella della pagina
  const areaMenu = (menuAperto && aree.find((a) => a.k === menuAperto)) || area;
  const vociMenu = (areaMenu?.voci || []).filter(visibile);

  // La barra in basso del telefono: le quattro cose che si usano di più, poi il menù
  const scorciatoie = (gestione
    ? [['/gestione', 'Home', 'home', true], ['/gestione/calendario', 'Palinsesto', 'calendario'],
       ['/gestione/appello', 'Appello', 'appello'],
       ['/gestione/persone', 'Persone', 'persone'], ['/gestione/ingresso', 'Ingressi', 'ingresso']]
    : [['/gestione', 'Home', 'home', true], ['/gestione/appello', 'Appello', 'appello'],
       ['/gestione/calendario', 'Palinsesto', 'calendario'], ['/gestione/giornata', 'Giornata', 'oggi']])
    .filter(([href]) => !nascoste.includes(href));
  const scorciatoiaAttiva = scorciatoie.filter(([href, , , esatto]) => esatto ? path === href : path === href || path.startsWith(href + '/'))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[0];

  async function esci() {
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className={`guscio${fisso ? ' menu-fisso' : ''}${menuAperto ? ' menu-aperto' : ''}`}>
      <Suspense fallback={null}><BarraCaricamento /></Suspense>
      {/* colonna delle aree: solo su desktop */}
      <nav className="aree" aria-label="Aree">
        {aree.map((a) => (
          <Link prefetch={false} key={a.k} href={a.voci.find(visibile)?.href || a.href} aria-current={a.k === attiva ? 'page' : undefined}
                onClick={(e) => cliccaArea(e, a)} onPointerEnter={(e) => entraArea(e, a)} onPointerLeave={esce}
                aria-expanded={!fisso ? menuAperto === a.k : undefined}
                className={menuAperto === a.k ? 'area-aperta' : undefined}>
            <Icona nome={a.icona} />
            {a.titolo}
          </Link>
        ))}
        <button onClick={esci}><Icona nome="esci" />Esci</button>
      </nav>

      {/* barra in basso del telefono */}
      <nav className="barra-mobile" aria-label="Scorciatoie">
        {scorciatoie.map(([href, testo, icona]) => (
          <Link prefetch={false} key={href} href={href} aria-current={scorciatoiaAttiva === href ? 'page' : undefined}>
            <Icona nome={icona} /><span>{testo}</span>
          </Link>
        ))}
        <button type="button" onClick={() => setCassetto(true)} aria-expanded={cassetto} aria-controls="cassetto">
          <Icona nome="menu" /><span>Menù</span>
        </button>
      </nav>

      {/* il cassetto del telefono */}
      <div className={`velo${cassetto ? ' visibile' : ''}`} onClick={() => setCassetto(false)} aria-hidden="true" />
      <aside id="cassetto" className={`cassetto${cassetto ? ' aperto' : ''}`} aria-hidden={!cassetto} aria-label="Menù">
        <div className="cassetto-testa">
          <Link prefetch={false} href="/gestione" onClick={() => setCassetto(false)} aria-label="Torna al Riepilogo"><img src="/logo-marchio.png" alt="" width="58" height="37" /></Link>
          <div className="ct-testo">
            <strong>Ritmo Metropolitano</strong>
            <span>{nome} · {ruolo}</span>
          </div>
          <button type="button" className="ct-chiudi" onClick={() => setCassetto(false)} aria-label="Chiudi il menù"><Icona nome="chiudi" /></button>
        </div>
        <div className="cassetto-corpo">
          {!areaAperta ? (
            <ul className="cassetto-aree">
              {aree.map((a) => (
                <li key={a.k}>
                  <button type="button" onClick={() => setAperta(a.k)} className={a.k === attiva ? 'attiva' : undefined}>
                    <Icona nome={a.icona} /><span>{a.titolo}</span><Icona nome="freccia" />
                  </button>
                </li>
              ))}
              <li><Link prefetch={false} href="/gestione/indice"><Icona nome="menu" /><span>Tutte le funzioni</span></Link></li>
            </ul>
          ) : (
            <>
              <button type="button" className="cassetto-indietro" onClick={() => setAperta(null)}>
                <Icona nome="indietro" /><span>{areaAperta.titolo}</span>
              </button>
              <ul className="cassetto-voci">
                {areaAperta.voci.filter(visibile).map((v) => (
                  <li key={v.href}>
                    <Link prefetch={false} href={v.href} aria-current={scelta === v ? 'page' : undefined}>{v.testo}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <button type="button" className="cassetto-esci" onClick={esci}><Icona nome="esci" /><span>Esci</span></button>
      </aside>

      <div className="colonna">
        <header className="barra">
          <button type="button" className="barra-menu solo-mobile" onClick={() => setCassetto(true)} aria-label="Apri il menù">
            <Icona nome="menu" />
          </button>
          <div className="briciole">
            <span className="b-area">{area?.titolo}</span>
            {titoloBarra && <><span className="b-sep" aria-hidden="true">›</span><span className="corrente">{titoloBarra}</span></>}
          </div>
          <div className="barra-destra">
            <Campanella />
            {admin && path !== '/gestione/impostazioni/registro' && <Cronologia />}
            <div className="piccolo muto solo-desktop">{nome} · {ruolo}</div>
          </div>
        </header>

        {menuAperto && !fisso && <div className="menu-velo" onClick={() => setMenuAperto(null)} aria-hidden="true" />}
        {vociMenu.length > 0 && (
          <nav className="sottomenu" aria-label={areaMenu?.titolo}
               onPointerEnter={(e) => { if (e.pointerType === 'mouse') ferma(); }} onPointerLeave={(e) => { if (menuAperto) esce(e); }}>
            <div className="titolo-colonna solo-desktop">
              <span>{areaMenu?.titolo}</span>
              <button type="button" className={fisso ? 'menu-puntina fissato' : 'menu-puntina'} onClick={cambiaFisso}
                      title={fisso ? 'Menù fissato. Clic per toglierlo: si richiude e si riapre dalle icone' : 'Fissa il menù: resta sempre aperto e la pagina si stringe accanto'}
                      aria-label={fisso ? 'Nascondi il menù' : 'Tieni il menù sempre aperto'} aria-pressed={fisso}>
                <Icona nome="fissa" />
              </button>
            </div>
            {vociMenu.map((v) => (
              <Link prefetch={false} key={v.href} href={v.href} aria-current={voceAttiva(v) ? 'page' : undefined}
                    onClick={() => setMenuAperto(null)}>{v.testo}</Link>
            ))}
          </nav>
        )}

        <main className="contenuto">
          {/* Computer, menù a scomparsa: le voci dell'area come schede in cima alla pagina (Palinsesto · Agenda settimanale · …),
              così si passa da un calendario all'altro senza riaprire il menù, come nella vecchia app */}
          <Suspense fallback={null}><GuidaArrivo /></Suspense>
          {!fisso && voci.length > 1 && (
            <nav className="schede-area solo-desktop" aria-label={`Pagine di ${area?.titolo}`}>
              {voci.map((v) => (
                <Link prefetch={false} key={v.href} href={v.href} aria-current={voceAttiva(v) ? 'page' : undefined}>{v.testo}</Link>
              ))}
            </nav>
          )}
          {vietata ? (
            <div className="vuoto" style={{ marginTop: 30 }}>
              <strong>Questa pagina non è disponibile per il tuo ruolo.</strong>
              <div className="piccolo muto" style={{ marginTop: 6 }}>Se ti serve, chiedi all'amministrazione.</div>
            </div>
          ) : children}
        </main>
        {gestione && <AzioniRapide palestraId={palestraId} />}
      </div>
    </div>
  );
}
