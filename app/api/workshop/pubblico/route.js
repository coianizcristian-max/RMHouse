import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { SLUG } from '@/lib/palestra';
import { baseUrl, stripeAttivo } from '@/lib/stripe';
import { satispayAttivo } from '@/lib/satispay';
import { apriPagamentoWorkshop } from '@/lib/workshopPagamenti';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MESSAGGI = {
  consenso_privacy_mancante: 'Per iscriverti serve il consenso al trattamento dei dati.',
  email_non_valida: 'L\'indirizzo email non sembra corretto.',
  dati_mancanti: 'Mancano nome, cognome, data di nascita o telefono.',
  opzione_non_trovata: 'Questa opzione non c\'è più: aggiorna la pagina.',
  iscrizioni_chiuse: 'Le iscrizioni a questo workshop sono chiuse.',
  workshop_annullato: 'Questo workshop è stato annullato.',
  posti_esauriti: 'I posti per questa opzione sono finiti.',
  gia_iscritto: 'Risulti già iscritto/a a questo workshop: controlla la tua email.',
  prezzo_mancante: 'Prezzo non disponibile: scrivici o passa in segreteria.',
};
const pulisci = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : null) || null;
const data = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const persona = (x = {}, conContatti = false) => ({
  nome: pulisci(x.nome), cognome: pulisci(x.cognome), data_nascita: data(x.data_nascita), codice_fiscale: pulisci(x.codice_fiscale, 16),
  ...(conContatti ? { email: pulisci(x.email, 200), telefono: pulisci(x.telefono, 30) } : {}),
});

// Iscrizione dal link pubblico del workshop (persone esterne, o allievi che non usano l'app)
export async function POST(request) {
  const b = await request.json().catch(() => null);
  if (!b) return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 400 });
  const db = supabaseAdmin();
  const { data: w } = await db.rpc('workshop_pubblico', { p_slug: pulisci(b.slug, 120) || '', p_palestra_slug: SLUG });
  if (!w) return NextResponse.json({ errore: 'Workshop non trovato.' }, { status: 404 });
  const pagamento = ['carta', 'satispay', 'segreteria'].includes(b.pagamento) ? b.pagamento : null;
  const cartaOk = w.online && stripeAttivo();
  const satispayOk = w.online && (await satispayAttivo());
  if (pagamento === 'carta' && !cartaOk) return NextResponse.json({ errore: 'Il pagamento con carta non è disponibile.' }, { status: 400 });
  if (pagamento === 'satispay' && !satispayOk) return NextResponse.json({ errore: 'Satispay non è disponibile.' }, { status: 400 });
  if (pagamento === 'segreteria' && !w.in_segreteria) return NextResponse.json({ errore: 'Per questo workshop si paga online.' }, { status: 400 });

  const adulto = b.adulto !== false;
  const { data: r, error } = await db.rpc('iscrivi_workshop_pubblico', { p: {
    palestra_slug: SLUG, opzione_id: pulisci(b.opzione_id, 36), adulto,
    consenso_privacy: b.consenso_privacy === true, consenso_marketing: b.consenso_marketing === true, note: pulisci(b.note, 300),
    titolare: persona(b.titolare, true), partecipante: adulto ? null : persona(b.partecipante),
  } });
  if (error) {
    const k = Object.keys(MESSAGGI).find((x) => error.message?.includes(x));
    if (!k) console.error('Iscrizione workshop pubblica', error);
    return NextResponse.json({ errore: MESSAGGI[k] || 'Iscrizione non riuscita. Riprova tra poco.' }, { status: k ? 409 : 500 });
  }
  const pagina = `/workshop/${w.slug}/iscrizione/${r.codice}`;
  if (!r.importo_cent) return NextResponse.json({ pagina });
  if (pagamento === 'segreteria' || (!cartaOk && !satispayOk) || !pagamento) {
    await db.rpc('workshop_pago_in_segreteria', { p_iscrizione: r.iscrizione_id });
    return NextResponse.json({ pagina });
  }
  try {
    const sito = baseUrl(request);
    const p = await apriPagamentoWorkshop(db, r.iscrizione_id, pagamento, sito, `${sito}${pagina}`);
    if (p.errore) return NextResponse.json({ pagina, errore_pagamento: p.errore });
    return NextResponse.json({ pagina, url: p.url });
  } catch (e) {
    console.error('Pagamento workshop pubblico', e);
    return NextResponse.json({ pagina, errore_pagamento: 'Il pagamento non si è aperto: l\'iscrizione resta, puoi pagare dalla pagina che segue o in segreteria.' });
  }
}
