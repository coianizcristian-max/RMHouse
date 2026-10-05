-- =====================================================================
-- RMHouse — 122 SALE AFFITTABILI O NO
-- Non tutte le sale si affittano. Nuova spunta sale.affittabile (di partenza: sì per tutte, come oggi):
--   • sul sito (Affitto sale e feste) compaiono e si possono chiedere solo le sale affittabili;
--   • richiedi_spazio rifiuta una sala non affittabile (anche se qualcuno forza la richiesta);
--   • i pacchetti festa legati a una sala non affittabile restano prenotabili (sono una scelta voluta della scuola).
-- La segreteria può sempre segnare "uso interno" (prove, manutenzione) su qualunque sala.
-- Si può eseguire più volte. Va dopo la 121.
-- =====================================================================

alter table sale add column if not exists affittabile boolean not null default true;

do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('richiedi_spazio(jsonb)'::regprocedure); v0 := v;
  if v not like '%sala_non_affittabile%' then
    v := replace(v, '  if not found then raise exception ''sala_non_trovata''; end if;
',
'  if not found then raise exception ''sala_non_trovata''; end if;
  -- una sala non affittabile non si chiede dal sito (salvo un pacchetto festa che la usa)
  if not v_sala.affittabile and v_pac.id is null then raise exception ''sala_non_affittabile''; end if;
');
    if v = v0 then raise exception 'richiedi_spazio: testo non trovato'; end if;
    execute v;
  end if;
end $$;
