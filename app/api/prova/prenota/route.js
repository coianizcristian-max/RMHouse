import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { SLUG } from '@/lib/palestra';
import { stripeAttivo, creaCheckout, baseUrl } from '@/lib/stripe';

const MESSAGGI = {
  consenso_privacy_mancante: 'Per prenotare serve il consenso al trattamento dei dati.',
  email_non_valida: "L'indirizzo email non sembra corretto.",
  corso_non_disponibile: 'Questo corso non è più prenotabile. Scegline un altro.',
  dati_partecipante_mancanti: 'Mancano nome, cognome o data di nascita di chi partecipa.',
  eta_non_compatibile: "L'età di chi partecipa non è compatibile con questo corso. Torna indietro e controlla la data di nascita.",
  lezione_non_disponibile: 'Questa lezione non è più prenotabile. Scegli un altro orario.',
  prova_gia_prenotata: 'Hai già una prova prenotata per questo corso. Controlla la tua email.',
  posti_prova_esauriti: 'I posti per la prova in questa lezione sono appena finiti. Scegli un altro orario.',
  lezione_al_completo: 'Questa lezione è al completo. Scegli un altro orario.',
};

const pulisci = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : null) || null;
const dataValida = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function POST(request) {
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 400 }); }

  const adulto = b.adulto !== false;
  const utm = b.utm && typeof b.utm === 'object'
    ? Object.fromEntries(Object.entries(b.utm).slice(0, 6).map(([k, v]) => [k.slice(0, 20), String(v).slice(0, 80)]))
    : null;

  const payload = {
    palestra_slug: SLUG,
    corso_id: pulisci(b.corso_id, 36),
    lezione_id: pulisci(b.lezione_id, 36),
    adulto,
    consenso_privacy: b.consenso_privacy === true,
    consenso_marketing: b.consenso_marketing === true,
    fonte: pulisci(b.fonte, 40) || 'sito',
    utm,
    titolare: {
      nome: pulisci(b.titolare?.nome), cognome: pulisci(b.titolare?.cognome),
      email: pulisci(b.titolare?.email, 200), telefono: pulisci(b.titolare?.telefono, 30),
      data_nascita: adulto ? dataValida(b.titolare?.data_nascita) : null,
    },
    partecipante: adulto ? null : {
      nome: pulisci(b.partecipante?.nome), cognome: pulisci(b.partecipante?.cognome),
      data_nascita: dataValida(b.partecipante?.data_nascita),
    },
  };
  if (!payload.titolare.nome || !payload.titolare.cognome || !payload.titolare.telefono) {
    return NextResponse.json({ errore: 'Compila nome, cognome, email e telefono.' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db.rpc('prenota_prova', { p: payload });
  if (error) {
    const codice = Object.keys(MESSAGGI).find((k) => error.message?.includes(k));
    if (!codice) console.error(error);
    return NextResponse.json(
      { errore: MESSAGGI[codice] || 'Prenotazione non riuscita. Riprova tra poco.' },
      { status: codice ? 409 : 500 }
    );
  }

  if (data.esito === 'pagamento_richiesto') {
    const { data: pal } = await db.from('palestre').select('stripe').eq('slug', SLUG).maybeSingle();
    const online = stripeAttivo() && pal?.stripe?.prove_online !== false;
    // Senza pagamenti online la prova si conferma e si paga in sede
    if (!online) {
      await db.from('prove').update({ stato: 'confermata' }).eq('id', data.prova_id);
      return NextResponse.json({ esito: 'da_pagare_in_sede', importo_cent: data.importo_cent });
    }
    const { data: pag } = await db.from('pagamenti').select('descrizione').eq('id', data.pagamento_id).maybeSingle();
    const sito = baseUrl(request);
    try {
      const s = await creaCheckout({
        righe: [{ descrizione: pag?.descrizione || 'Lezione di prova', importo_cent: data.importo_cent }],
        metadata: { tipo: 'prova', pagamento_id: data.pagamento_id, riferimento: data.prova_id },
        email: payload.titolare.email, scadenzaMinuti: 45,
        successo: `${sito}/prova/pagata`, annullato: `${sito}/prova?pagamento=annullato`,
      });
      await db.from('pagamenti').update({ stripe_session_id: s.id }).eq('id', data.pagamento_id);
      return NextResponse.json({ esito: 'paga_online', url: s.url, importo_cent: data.importo_cent });
    } catch (e) {
      // Stripe non risponde: meglio confermare e far pagare in sede che perdere la prova
      console.error(e);
      await db.from('prove').update({ stato: 'confermata' }).eq('id', data.prova_id);
      return NextResponse.json({ esito: 'da_pagare_in_sede', importo_cent: data.importo_cent });
    }
  }
  return NextResponse.json({ esito: data.esito, importo_cent: data.importo_cent ?? 0 });
}
