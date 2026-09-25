import { supabaseServer } from '@/lib/supabase/server';
import { comeCsv } from '@/lib/stati';
import { creaZip } from '@/lib/zip';

export const dynamic = 'force-dynamic';

const eu = (c) => (c == null ? '' : (Number(c) / 100).toFixed(2).replace('.', ','));
const valida = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

// Le estrazioni per il commercialista, una alla volta o tutte in uno ZIP
export async function GET(request) {
  const u = new URL(request.url).searchParams;
  const dal = u.get('dal'), al = u.get('al'), file = u.get('file') || 'tutto';
  if (!valida(dal) || !valida(al)) return new Response('Date non valide.', { status: 400 });

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Non autorizzato.', { status: 401 });
  const { data: staff } = await supabase.from('staff').select('palestra_id, ruolo')
    .eq('user_id', user.id).eq('attivo', true).maybeSingle();
  if (!staff || staff.ruolo === 'insegnante') return new Response('Servono i permessi di segreteria.', { status: 403 });
  const args = { p_palestra: staff.palestra_id, p_dal: dal, p_al: al };

  const estrazioni = {
    documenti: async () => {
      const { data } = await supabase.rpc('registro_documenti', args);
      return comeCsv(['Data', 'Tipo', 'Sezionale', 'Numero', 'Intestatario', 'Codice fiscale', 'Descrizione', 'Imponibile', 'IVA',
        'Totale', 'Aliquota', 'Natura', 'Metodo', 'Annullata', 'Rif. ricevuta'],
        (data || []).map((r) => [r.data, r.tipo, r.sezionale, r.numero, r.intestatario, r.codice_fiscale || '', r.descrizione,
          eu(r.imponibile_cent), eu(r.iva_cent), eu(r.totale_cent), r.aliquota, r.natura || '', r.metodo || '',
          r.annullata ? 'sì' : '', r.riferimento || '']));
    },
    corrispettivi: async () => {
      const { data } = await supabase.rpc('corrispettivi_giornalieri', args);
      return comeCsv(['Data', 'Aliquota', 'Natura', 'Documenti', 'Imponibile', 'IVA', 'Totale', 'Di cui contanti', 'Di cui elettronici'],
        (data || []).map((r) => [r.data, r.aliquota, r.natura || '', r.documenti, eu(r.imponibile_cent), eu(r.iva_cent),
          eu(r.totale_cent), eu(r.contanti_cent), eu(r.elettronici_cent)]));
    },
    acquisti: async () => {
      const { data } = await supabase.rpc('registro_acquisti', args);
      return comeCsv(['Data', 'Numero', 'Fornitore', 'Partita IVA', 'Codice fiscale', 'Tipo documento', 'Imponibile', 'IVA', 'Totale', 'Scadenza', 'Stato'],
        (data || []).map((r) => [r.data, r.numero, r.fornitore, r.piva || '', r.codice_fiscale || '', r.tipo_documento || '',
          eu(r.imponibile_cent), eu(r.iva_cent), eu(r.totale_cent), r.scadenza || '', r.stato]));
    },
    incassi: async () => {
      const { data } = await supabase.rpc('esporta_incassi', args);
      return comeCsv(['Data', 'Causale', 'Descrizione', 'Importo', 'Metodo', 'Stato', 'Cliente', 'Codice fiscale', 'Email', 'Corso'],
        (data || []).map((r) => [r.data, r.causale, r.descrizione, eu(r.importo_cent), r.metodo, r.stato, r.cliente,
          r.codice_fiscale || '', r.email || '', r.corso || '']));
    },
    compensi: async () => {
      const [a1, m1] = dal.split('-').map(Number), [a2, m2] = al.split('-').map(Number);
      const { data } = await supabase.from('compensi').select('anno, mese, ore, lezioni, tariffa_cent, extra_cent, extra_nota, totale_cent, stato, metodo, staff ( nome, cognome )')
        .eq('palestra_id', staff.palestra_id).gte('anno', a1).lte('anno', a2).order('anno').order('mese');
      const dentro = (data || []).filter((r) => r.anno * 12 + r.mese >= a1 * 12 + m1 && r.anno * 12 + r.mese <= a2 * 12 + m2);
      return comeCsv(['Anno', 'Mese', 'Insegnante', 'Lezioni', 'Ore', 'Tariffa oraria', 'Extra', 'Nota extra', 'Totale', 'Stato', 'Metodo'],
        dentro.map((r) => [r.anno, r.mese, `${r.staff?.nome || ''} ${r.staff?.cognome || ''}`.trim(), r.lezioni,
          String(r.ore).replace('.', ','), eu(r.tariffa_cent), eu(r.extra_cent), r.extra_nota || '', eu(r.totale_cent), r.stato, r.metodo || '']));
    },
  };

  const nome = (k) => `${k}_${dal}_${al}.csv`;
  if (file !== 'tutto') {
    if (!estrazioni[file]) return new Response('Estrazione sconosciuta.', { status: 400 });
    return new Response(await estrazioni[file](), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nome(file)}"`, 'Cache-Control': 'no-store' },
    });
  }

  const { data: riepilogo } = await supabase.rpc('riepilogo_fiscale', args);
  const leggimi = [
    `Estrazione per il commercialista dal ${dal} al ${al}`,
    '',
    `Incassato nel periodo: ${eu(riepilogo?.incassato_cent)} €`,
    `Documenti emessi (ricevute meno note di credito): ${eu(riepilogo?.documenti_cent)} €`,
    `Ricevute: ${riepilogo?.ricevute ?? 0} · Note di credito: ${riepilogo?.note_credito ?? 0} · Incassi senza ricevuta: ${riepilogo?.senza_ricevuta ?? 0}`,
    `Acquisti (fatture fornitori): ${eu(riepilogo?.acquisti_cent)} € di cui IVA ${eu(riepilogo?.iva_acquisti_cent)} €`,
    `Compensi insegnanti: ${eu(riepilogo?.compensi_cent)} €`,
    `Commissioni sui pagamenti online (Stripe): ${eu(riepilogo?.commissioni_cent)} €`,
    '',
    'Per aliquota:',
    ...(riepilogo?.per_aliquota || []).map((a) => `  ${a.aliquota}${a.natura ? ` (${a.natura})` : ''}: imponibile ${eu(a.imponibile_cent)} € · IVA ${eu(a.iva_cent)} € · totale ${eu(a.totale_cent)} €`),
    '',
    'File: documenti (registro di ricevute e note di credito), corrispettivi (per giorno e aliquota),',
    'acquisti (fatture dei fornitori), incassi (tutti i pagamenti), compensi (insegnanti).',
    'I CSV usano il punto e virgola e la virgola decimale: si aprono direttamente in Excel.',
  ].join('\r\n');

  const file_ = [{ nome: 'LEGGIMI.txt', contenuto: '\uFEFF' + leggimi }];
  for (const k of Object.keys(estrazioni)) file_.push({ nome: nome(k), contenuto: await estrazioni[k]() });
  return new Response(creaZip(file_), {
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="commercialista_${dal}_${al}.zip"`, 'Cache-Control': 'no-store' },
  });
}
