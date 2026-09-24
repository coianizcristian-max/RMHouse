import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// --- lettura del file FatturaPA -------------------------------------
// Niente librerie: servono pochi campi e l'XML dello SDI è regolare.
// I file .p7m sono firmati: l'XML sta dentro, lo si ritaglia.
const dentro = (xml, tag) => {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`));
  return m ? m[1] : null;
};
const tutti = (xml, tag) => {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'g');
  return [...xml.matchAll(re)].map((m) => m[1]);
};
const testo = (xml, tag) => {
  const v = dentro(xml, tag);
  return v == null ? null : v.replace(/<[^>]*>/g, '').trim() || null;
};
const cent = (v) => (v == null ? 0 : Math.round(parseFloat(String(v).replace(',', '.')) * 100) || 0);

function estraiXml(contenuto) {
  const inizio = contenuto.indexOf('<');
  const fine = contenuto.lastIndexOf('>');
  if (inizio < 0 || fine < 0) return null;
  return contenuto.slice(inizio, fine + 1);
}

function leggiFattura(xml) {
  const generali = dentro(xml, 'DatiGeneraliDocumento') || xml;
  const cedente = dentro(xml, 'CedentePrestatore') || '';
  const cessionario = dentro(xml, 'CessionarioCommittente') || '';

  const anagrafica = (blocco) => {
    const den = testo(blocco, 'Denominazione');
    if (den) return den;
    const nome = testo(blocco, 'Nome'), cognome = testo(blocco, 'Cognome');
    return [nome, cognome].filter(Boolean).join(' ') || null;
  };

  const riepiloghi = tutti(xml, 'DatiRiepilogo');
  const imponibile = riepiloghi.reduce((s, r) => s + cent(testo(r, 'ImponibileImporto')), 0);
  const iva = riepiloghi.reduce((s, r) => s + cent(testo(r, 'Imposta')), 0);
  const totale = cent(testo(generali, 'ImportoTotaleDocumento')) || imponibile + iva;

  return {
    numero: testo(generali, 'Numero') || 's.n.',
    data: testo(generali, 'Data'),
    tipo_documento: testo(generali, 'TipoDocumento'),
    fornitore: anagrafica(cedente),
    fornitore_piva: testo(dentro(cedente, 'IdFiscaleIVA') || '', 'IdCodice'),
    fornitore_cf: testo(cedente, 'CodiceFiscale'),
    cliente: anagrafica(cessionario),
    cliente_piva: testo(dentro(cessionario, 'IdFiscaleIVA') || '', 'IdCodice'),
    imponibile_cent: imponibile,
    iva_cent: iva,
    totale_cent: totale,
    scadenza: testo(xml, 'DataScadenzaPagamento'),
    righe: tutti(xml, 'DettaglioLinee').map((r) => ({
      descrizione: testo(r, 'Descrizione') || '—',
      quantita: testo(r, 'Quantita') ? parseFloat(testo(r, 'Quantita').replace(',', '.')) : null,
      prezzo_cent: cent(testo(r, 'PrezzoUnitario')),
      totale_cent: cent(testo(r, 'PrezzoTotale')),
      aliquota: testo(r, 'AliquotaIVA') ? parseFloat(testo(r, 'AliquotaIVA').replace(',', '.')) : null,
    })),
  };
}

export async function POST(request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 });

  const { data: staff } = await supabase.from('staff')
    .select('palestra_id, ruolo').eq('user_id', user.id).eq('attivo', true).maybeSingle();
  if (!staff || staff.ruolo === 'insegnante') {
    return NextResponse.json({ errore: 'Servono i permessi di segreteria.' }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const files = form?.getAll('file') || [];
  const tipo = form?.get('tipo') === 'attiva' ? 'attiva' : 'passiva';
  if (files.length === 0) return NextResponse.json({ errore: 'Nessun file.' }, { status: 400 });

  let importate = 0, saltate = 0;
  const problemi = [];

  for (const file of files) {
    if (!(file instanceof File)) continue;
    if (file.size > 3 * 1024 * 1024) { problemi.push(`${file.name}: file troppo grande`); continue; }

    const xml = estraiXml(await file.text());
    if (!xml) { problemi.push(`${file.name}: non sembra un XML di fattura`); continue; }

    let f;
    try { f = leggiFattura(xml); } catch { problemi.push(`${file.name}: non leggibile`); continue; }
    if (!f.data || !f.numero) { problemi.push(`${file.name}: mancano numero o data`); continue; }

    const controparte = tipo === 'passiva' ? f.fornitore : f.cliente;
    const impronta = `${tipo}-${f.numero}-${f.data}-${(controparte || '').slice(0, 30)}`;

    const { data: creata, error } = await supabase.from('fatture').insert({
      palestra_id: staff.palestra_id, tipo,
      numero: f.numero, data: f.data, controparte: controparte || 'Sconosciuto',
      piva: tipo === 'passiva' ? f.fornitore_piva : f.cliente_piva,
      codice_fiscale: tipo === 'passiva' ? f.fornitore_cf : null,
      imponibile_cent: f.imponibile_cent, iva_cent: f.iva_cent, totale_cent: f.totale_cent,
      scadenza: f.scadenza, tipo_documento: f.tipo_documento, impronta,
    }).select('id').maybeSingle();

    if (error) {
      if (error.code === '23505') saltate++;           // già importata
      else problemi.push(`${file.name}: ${error.message}`);
      continue;
    }

    if (f.righe.length) {
      await supabase.from('fatture_righe').insert(
        f.righe.slice(0, 50).map((r) => ({ ...r, fattura_id: creata.id })),
      );
    }
    importate++;
  }

  return NextResponse.json({ importate, saltate, problemi });
}
