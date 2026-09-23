import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { SLUG } from '@/lib/palestra';

const MESSAGGI = {
  consenso_privacy_mancante: 'Per inviare la richiesta serve il consenso al trattamento dei dati.',
  email_non_valida: "L'indirizzo email non sembra corretto.",
  contatti_mancanti: 'Servono nome e telefono per ricontattarti.',
  orario_non_valido: "L'orario indicato non è valido.",
  troppo_a_ridosso: 'Serve almeno mezza giornata di preavviso: scrivici o chiamaci per le urgenze.',
  sala_occupata: 'Quella fascia è appena stata occupata. Scegli un altro orario.',
  sala_non_trovata: 'Sala non disponibile.',
  pacchetto_non_disponibile: 'Questo pacchetto non è più disponibile.',
};

const testo = (v, max = 160) => (typeof v === 'string' ? v.trim().slice(0, max) : null) || null;

export async function POST(request) {
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 400 }); }

  const payload = {
    palestra_slug: SLUG,
    sala_id: testo(b.sala_id, 36),
    pacchetto_id: testo(b.pacchetto_id, 36),
    inizio: testo(b.inizio, 40),
    fine: testo(b.fine, 40),
    titolo: testo(b.titolo),
    ospiti: Number.isFinite(+b.ospiti) && +b.ospiti > 0 ? Math.min(+b.ospiti, 500) : null,
    note: testo(b.note, 800),
    consenso_privacy: b.consenso_privacy === true,
    contatto: { nome: testo(b.contatto?.nome), email: testo(b.contatto?.email, 200), telefono: testo(b.contatto?.telefono, 30) },
  };

  const { data, error } = await supabaseAdmin().rpc('richiedi_spazio', { p: payload });
  if (error) {
    const codice = Object.keys(MESSAGGI).find((k) => error.message?.includes(k));
    if (!codice) console.error(error);
    return NextResponse.json({ errore: MESSAGGI[codice] || 'Invio non riuscito. Riprova tra poco.' }, { status: codice ? 409 : 500 });
  }
  return NextResponse.json(data);
}
