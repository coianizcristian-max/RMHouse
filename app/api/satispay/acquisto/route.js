import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { baseUrl } from '@/lib/stripe';
import { satispayAttivo, creaPagamentoOnline } from '@/lib/satispay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MESSAGGI = {
  abbonamento_non_acquistabile: 'Questo abbonamento non si può acquistare online.',
  corso_non_compreso: 'Questo abbonamento non comprende il corso scelto.',
  scegli_i_giorni: 'Scegli i giorni in cui verrai.',
  troppi_giorni: 'Hai scelto più giorni di quelli compresi nell\'abbonamento.',
  prezzo_mancante: 'Prezzo non disponibile: chiedi in segreteria.',
  orario_non_attivo: 'Uno dei giorni scelti non c\'è più: torna indietro e scegline un altro.',
  orario_pieno: 'Uno dei giorni scelti è al completo: scegline un altro o mettiti in coda.',
  eta_non_adatta: 'Questo corso è per un\'altra età: torna indietro e scegline un altro.',
  inizio_meta_mese: 'Dall\'app si parte il 1° del mese. Per iniziare adesso passa dalla segreteria.',
  annuale_in_segreteria: 'L\'annuale iniziato a stagione avviata si fa in segreteria.',
  corso_non_valido: 'Questo corso non c\'è più: aggiorna la pagina.',
  orario_non_del_corso: 'Uno dei giorni scelti non è di questo corso: riscegli i giorni.',
};

// Acquisto dall'app pagato con Satispay: prepara l'iscrizione (come con la carta) e manda il cliente
// sulla pagina di Satispay (dal telefono si apre l'app). Al ritorno (o all'avviso di Satispay) si completa.
export async function POST(request) {
  if (!(await satispayAttivo())) return NextResponse.json({ errore: 'Satispay non è ancora attivo.' }, { status: 503 });
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errore: 'Accedi prima alla tua area.' }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const db = supabaseAdmin();
  const { data: corso } = await db.from('corsi').select('iscrizioni_app').eq('id', b.corso_id || '00000000-0000-0000-0000-000000000000').maybeSingle();
  if (corso && corso.iscrizioni_app && corso.iscrizioni_app !== 'aperte') return NextResponse.json({ errore: 'Le iscrizioni a questo corso non sono aperte.' }, { status: 400 });

  const { data: a, error } = await supabase.rpc('prepara_acquisto', { p: {
    allievo_id: b.allievo_id, tipo_abbonamento_id: b.tipo_abbonamento_id, corso_id: b.corso_id,
    orari: Array.isArray(b.orari) ? b.orari.slice(0, 7) : [], data_inizio: b.data_inizio || null, ricorrente: false,
  } });
  if (error) {
    const k = Object.keys(MESSAGGI).find((x) => error.message?.includes(x));
    return NextResponse.json({ errore: MESSAGGI[k] || 'Acquisto non riuscito.' }, { status: 400 });
  }
  const sito = baseUrl(request);
  try {
    const p = await creaPagamentoOnline({
      importoCent: a.importo_cent, riferimento: a.acquisto_id,
      descrizione: (a.righe || []).map((r) => r.descrizione).join(' + '),
      callback: `${sito}/api/satispay/notifica?id={uuid}`,
      ritorno: `${sito}/area/iscriviti/fatto?sp=${a.acquisto_id}`,
    });
    await db.from('acquisti_online').update({ satispay_id: p.id }).eq('id', a.acquisto_id);
    await db.from('pagamenti').update({ satispay_id: p.id, metodo: 'satispay' }).eq('id', a.pagamento_id);
    return NextResponse.json({ url: p.url });
  } catch (e) {
    console.error('Satispay acquisto', e);
    await db.from('pagamenti').update({ stato: 'annullato' }).eq('id', a.pagamento_id);
    await db.from('acquisti_online').update({ stato: 'errore', errore: e.message }).eq('id', a.acquisto_id);
    return NextResponse.json({ errore: 'Satispay non risponde: riprova tra poco o paga con un altro metodo.' }, { status: 502 });
  }
}
