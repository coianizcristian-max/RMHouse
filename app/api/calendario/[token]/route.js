import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Calendario personale dell'insegnante, nel formato che Google, iPhone e
// Outlook sanno leggere. L'indirizzo si abbona una volta e resta aggiornato.
const scappa = (t = '') => String(t).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
const quando = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export async function GET(request, { params }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return new Response('Indirizzo non valido.', { status: 400 });
  }

  const { data, error } = await supabaseAdmin().rpc('lezioni_calendario', { p_token: token });
  if (error) {
    console.error(error);
    return new Response('Calendario non disponibile.', { status: 500 });
  }

  const scuola = data?.[0]?.scuola || 'Ritmo Metropolitano';
  const righe = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RMHouse//Calendario insegnante//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${scappa(`Lezioni · ${scuola}`)}`,
    'X-WR-TIMEZONE:Europe/Rome',
    'REFRESH-INTERVAL;VALUE=DURATION:PT2H',
    'X-PUBLISHED-TTL:PT2H',
  ];

  for (const l of data || []) {
    const posti = l.capienza ? `${l.iscritti} su ${l.capienza}` : `${l.iscritti} iscritti`;
    righe.push(
      'BEGIN:VEVENT',
      `UID:${l.lezione_id}@rmhouse`,
      `DTSTAMP:${quando(l.aggiornato)}`,
      `DTSTART:${quando(l.inizio)}`,
      `DTEND:${quando(l.fine)}`,
      `SUMMARY:${scappa(l.stato === 'annullata' ? `ANNULLATA — ${l.corso}` : l.corso)}`,
      `DESCRIPTION:${scappa(`${posti}${l.sala ? ` · ${l.sala}` : ''}`)}`,
      l.sala ? `LOCATION:${scappa(l.sala)}` : null,
      l.stato === 'annullata' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  }
  righe.push('END:VCALENDAR');

  return new Response(righe.filter(Boolean).join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
      'Content-Disposition': 'inline; filename="lezioni.ics"',
    },
  });
}
