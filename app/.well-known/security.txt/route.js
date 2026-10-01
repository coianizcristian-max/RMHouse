import { datiScuola } from '@/lib/scuola';

export const revalidate = 86400;

// Dove segnalare un problema di sicurezza (standard RFC 9116)
export async function GET() {
  const s = await datiScuola();
  const scade = new Date(Date.now() + 365 * 86400000).toISOString();
  const testo = [
    s.email ? `Contact: mailto:${s.email}` : `Contact: ${s.base_url || ''}/privacy`,
    `Expires: ${scade}`,
    'Preferred-Languages: it, en',
    `Policy: ${s.base_url || ''}/privacy`,
  ].join('\n');
  return new Response(testo + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
