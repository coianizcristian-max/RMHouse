import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { leggiData } from '@/lib/csv';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const testo = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null;
const simile = (a, b) => a && b && a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');

// Importazione: ogni riga è una persona; corso e abbonamento sono facoltativi.
// Scrive con i permessi di chi è collegato, quindi solo admin/segreteria.
export async function POST(request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 });

  const { data: staff } = await supabase
    .from('staff').select('palestra_id, ruolo').eq('user_id', user.id).eq('attivo', true).maybeSingle();
  if (!staff || staff.ruolo === 'insegnante') {
    return NextResponse.json({ errore: 'Servono i permessi di segreteria.' }, { status: 403 });
  }

  const { righe } = await request.json().catch(() => ({}));
  if (!Array.isArray(righe) || !righe.length) return NextResponse.json({ errore: 'Nessuna riga da importare.' }, { status: 400 });
  if (righe.length > 500) return NextResponse.json({ errore: 'Massimo 500 righe per volta.' }, { status: 400 });

  const [{ data: corsi }, { data: tipi }, { data: orari }] = await Promise.all([
    supabase.from('corsi').select('id, nome').eq('palestra_id', staff.palestra_id),
    supabase.from('tipi_abbonamento').select('id, nome').eq('palestra_id', staff.palestra_id),
    supabase.from('orari').select('id, corso_id').eq('palestra_id', staff.palestra_id).eq('attivo', true),
  ]);

  let creati = 0, aggiornati = 0, iscrizioni = 0;
  const errori = [];

  for (const [indice, r] of righe.entries()) {
    const numero = indice + 2;                 // +2: la prima riga del file è l'intestazione
    const nome = testo(r.nome), cognome = testo(r.cognome);
    const email = testo(r.email, 200)?.toLowerCase();
    const nascita = leggiData(r.data_nascita);
    const etichetta = `${cognome || ''} ${nome || ''}`.trim() || '(senza nome)';

    if (!nome || !cognome) { errori.push({ riga: numero, nome: etichetta, motivo: 'nome o cognome mancante' }); continue; }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { errori.push({ riga: numero, nome: etichetta, motivo: 'email mancante o non valida' }); continue; }
    if (!nascita) { errori.push({ riga: numero, nome: etichetta, motivo: 'data di nascita illeggibile' }); continue; }

    try {
      // famiglia: un account per email
      const { data: esistente } = await supabase
        .from('account').select('id').eq('palestra_id', staff.palestra_id).eq('email', email).maybeSingle();

      let accountId = esistente?.id;
      const datiAccount = {
        nome: testo(r.genitore_nome) || nome,
        cognome: testo(r.genitore_cognome) || cognome,
        telefono: testo(r.telefono, 30),
        codice_fiscale: testo(r.codice_fiscale, 20),
      };

      if (accountId) {
        await supabase.from('account').update(datiAccount).eq('id', accountId);
        aggiornati++;
      } else {
        const { data, error } = await supabase.from('account')
          .insert({ ...datiAccount, palestra_id: staff.palestra_id, email, fonte: 'import' })
          .select('id').single();
        if (error) throw error;
        accountId = data.id;
        creati++;
      }

      // allievo: se c'è già lo stesso nome con la stessa data, non lo duplichiamo
      const { data: gia } = await supabase
        .from('allievi').select('id, nome').eq('account_id', accountId).eq('data_nascita', nascita);
      let allievoId = (gia || []).find((a) => simile(a.nome, nome))?.id;

      if (!allievoId) {
        const { data, error } = await supabase.from('allievi').insert({
          palestra_id: staff.palestra_id, account_id: accountId, nome, cognome,
          data_nascita: nascita,
          is_titolare: !testo(r.genitore_nome),
          certificato_scadenza: leggiData(r.certificato_scadenza),
        }).select('id').single();
        if (error) throw error;
        allievoId = data.id;
      } else if (leggiData(r.certificato_scadenza)) {
        await supabase.from('allievi')
          .update({ certificato_scadenza: leggiData(r.certificato_scadenza) }).eq('id', allievoId);
      }

      // iscrizione, se il file indica corso e abbonamento riconoscibili
      const nomeCorso = testo(r.corso);
      const nomeTipo = testo(r.abbonamento);
      if (nomeCorso && nomeTipo) {
        const corso = corsi.find((c) => simile(c.nome, nomeCorso));
        const tipo = tipi.find((t) => simile(t.nome, nomeTipo));
        if (!corso) { errori.push({ riga: numero, nome: etichetta, motivo: `corso "${nomeCorso}" non trovato: persona importata senza iscrizione` }); continue; }
        if (!tipo) { errori.push({ riga: numero, nome: etichetta, motivo: `abbonamento "${nomeTipo}" non trovato: persona importata senza iscrizione` }); continue; }

        const { error } = await supabase.rpc('crea_iscrizione', {
          p_allievo: allievoId,
          p_tipo_abbonamento: tipo.id,
          p_corso: corso.id,
          p_data_inizio: leggiData(r.data_inizio) || new Date().toISOString().slice(0, 10),
          p_orari: orari.filter((o) => o.corso_id === corso.id).map((o) => o.id),
          p_sconto_cent: 0,
          p_quota: false,
          p_note: 'importata da CSV',
        });
        if (error) {
          errori.push({
            riga: numero, nome: etichetta,
            motivo: error.message?.includes('iscrizione_gia_attiva')
              ? 'era già iscritta a questo corso: persona importata senza nuova iscrizione'
              : 'iscrizione non creata',
          });
        } else iscrizioni++;
      }
    } catch (e) {
      console.error(e);
      errori.push({ riga: numero, nome: etichetta, motivo: 'errore durante il salvataggio' });
    }
  }

  return NextResponse.json({ creati, aggiornati, iscrizioni, errori });
}
