-- =====================================================================
-- RMHouse — 146 PIÙ FAMIGLIE PER ABBONAMENTO
-- La "famiglia" di un abbonamento era un testo solo: dentro c'erano più famiglie insieme ("Aerea, Pole Dance,
-- Antigravity") e anche la fascia d'età ("Aerea e Pole Dance Kids/Teen"), che è già il gruppo di listino.
-- Risultato: 19 "famiglie" diverse per 65 abbonamenti, molte doppie.
-- Ora:
--  • tipi_abbonamento.famiglie = elenco di famiglie (una o più), scelte da un elenco nella scheda dell'abbonamento;
--  • tipi_abbonamento.famiglia resta come etichetta di comodo (le famiglie unite da ", "), tenuta aggiornata da sola:
--    tutte le pagine che la mostravano continuano a funzionare;
--  • le famiglie già scritte vengono ripulite con questa tabella di conversione (le fasce d'età spariscono):
--      "Aerea Agonismo"                         → Aerea, Agonismo
--      "Aerea Kids e Teen" / "Aerea adulti"     → Aerea
--      "Aerea e Pole Dance …" (Kids/Teen, adulti)→ Aerea, Pole Dance
--      "Aerea, Pole Dance, Antigravity"         → Aerea, Pole Dance, Antigravity
--      "Antigravity"                            → Antigravity
--      "Con attrezzi / Open"                    → Con attrezzi, Open
--      "Ingressi liberi"                        → Ingressi liberi
--      "Pole Dance" / "Pole Young"              → Pole Dance
--      "Street" / "Street Kids e Teen" / "Street adulti" → Street
--      "Street e Danza …" / "Street Danza …"    → Street, Danza
--      "Tai Chi e Shaolin"                      → Tai Chi, Shaolin
--    Qualunque altro testo viene diviso su virgola, "/" e " e ", togliendo Kids, Teen, adulti.
--  • rinomina_famiglia(palestra, da, a) rinomina o unisce una famiglia dentro gli elenchi; con "a" vuoto la toglie.
-- Si può eseguire più volte: la conversione tocca solo gli abbonamenti che non hanno ancora l'elenco.
-- =====================================================================

alter table tipi_abbonamento add column if not exists famiglie text[] not null default '{}';

-- pulizia di un elenco: spazi, vuoti, doppioni (senza maiuscole), ordine
create or replace function famiglie_pulite(p text[]) returns text[] language sql immutable as $$
  select coalesce(array_agg(x.f order by x.f), '{}')
    from (select distinct on (lower(f)) regexp_replace(btrim(f), '\s+', ' ', 'g') as f
            from unnest(coalesce(p, '{}')) u(f)
           where btrim(coalesce(f, '')) <> ''
           order by lower(f), f) x;
$$;

-- dal vecchio testo all'elenco (tabella di conversione + regola generale)
create or replace function famiglie_dal_testo(p text) returns text[] language plpgsql immutable as $$
declare t text := lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')); parti text[]; r text[] := '{}'; x text;
begin
  if t = '' then return '{}'; end if;
  if t = 'aerea agonismo' then return array['Aerea', 'Agonismo']; end if;
  if t in ('aerea kids e teen', 'aerea adulti', 'aerea') then return array['Aerea']; end if;
  if t like 'aerea e pole dance%' then return array['Aerea', 'Pole Dance']; end if;
  if t = 'aerea, pole dance, antigravity' then return array['Aerea', 'Pole Dance', 'Antigravity']; end if;
  if t = 'con attrezzi / open' then return array['Con attrezzi', 'Open']; end if;
  if t in ('pole dance', 'pole young') then return array['Pole Dance']; end if;
  if t in ('street', 'street kids e teen', 'street adulti') then return array['Street']; end if;
  if t like 'street e danza%' or t like 'street danza%' then return array['Street', 'Danza']; end if;
  if t = 'tai chi e shaolin' then return array['Tai Chi', 'Shaolin']; end if;
  -- regola generale: virgola, "/" e " e " dividono; le fasce d'età non sono famiglie
  parti := regexp_split_to_array(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'), '\s*(,|/| e )\s*');
  foreach x in array parti loop
    x := btrim(regexp_replace(x, '\m(kids|teen|adulti|adulto|bambini|ragazzi)\M', '', 'gi'));
    x := btrim(regexp_replace(x, '\s+', ' ', 'g'));
    if x <> '' then r := r || x; end if;
  end loop;
  return famiglie_pulite(r);
end $$;

-- conversione dei dati già scritti (solo chi non ha ancora l'elenco)
update tipi_abbonamento set famiglie = famiglie_dal_testo(famiglia)
 where cardinality(famiglie) = 0 and famiglia is not null and btrim(famiglia) <> '';

-- da ora: l'elenco comanda, l'etichetta "famiglia" si ricava; chi scrive ancora solo "famiglia" viene convertito
create or replace function trg_tipi_famiglie() returns trigger language plpgsql security definer set search_path = public as $$
declare v_lista text[]; v_una text; v_usata text;
begin
  if tg_op = 'UPDATE' and new.famiglie is not distinct from old.famiglie and new.famiglia is distinct from old.famiglia then
    new.famiglie := famiglie_dal_testo(new.famiglia);        -- ha scritto il testo: lo si divide
  end if;
  v_lista := famiglie_pulite(new.famiglie);
  -- stessa grafia delle famiglie già usate nella palestra (maiuscole diverse → una sola)
  new.famiglie := '{}';
  foreach v_una in array v_lista loop
    v_usata := null;
    select x.nome into v_usata from (select unnest(t.famiglie) as nome from tipi_abbonamento t where t.palestra_id = new.palestra_id and t.id is distinct from new.id) x
     where lower(x.nome) = lower(v_una) group by x.nome order by count(*) desc, x.nome limit 1;
    new.famiglie := new.famiglie || coalesce(v_usata, v_una);
  end loop;
  new.famiglie := famiglie_pulite(new.famiglie);
  new.famiglia := nullif(array_to_string(new.famiglie, ', '), '');
  return new;
end $$;
drop trigger if exists famiglia_pulita on tipi_abbonamento;
drop trigger if exists tipi_famiglie on tipi_abbonamento;
create trigger tipi_famiglie before insert or update of famiglie, famiglia on tipi_abbonamento
  for each row execute function trg_tipi_famiglie();

-- l'etichetta allineata per tutti (passa dal trigger)
update tipi_abbonamento set famiglie = famiglie where true;

-- rinomina o unisce una famiglia in tutti gli elenchi; p_a vuoto = la toglie
create or replace function rinomina_famiglia(p_palestra uuid, p_da text, p_a text)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; v_a text := nullif(regexp_replace(btrim(coalesce(p_a, '')), '\s+', ' ', 'g'), ''); r record;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  if p_da is null or btrim(p_da) = '' then return 0; end if;
  -- grafia già in uso per la destinazione (se esiste con maiuscole diverse)
  if v_a is not null then
    select coalesce((select x.nome from (select unnest(t.famiglie) as nome from tipi_abbonamento t where t.palestra_id = p_palestra) x
                      where lower(x.nome) = lower(v_a) group by x.nome order by count(*) desc, x.nome limit 1), v_a) into v_a;
  end if;
  for r in select id, famiglie from tipi_abbonamento where palestra_id = p_palestra and exists (select 1 from unnest(famiglie) f where lower(f) = lower(p_da)) loop
    update tipi_abbonamento set famiglie = famiglie_pulite(array(select case when lower(u.nome) = lower(p_da) then v_a else u.nome end from unnest(r.famiglie) as u(nome))) where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function rinomina_famiglia(uuid, text, text) from public, anon;
grant execute on function rinomina_famiglia(uuid, text, text) to authenticated;
