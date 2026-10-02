-- 084 · Maschile e femminile
-- Le scritte che parlano di una persona si accordano con lei: "Benvenuta Martina", "Giulia (figlia di …)
-- si è iscritta", "Persa", "nata il". Il genere si prende dal campo sesso (F/M) o, se manca, dal codice
-- fiscale (giorno di nascita + 40 per le donne). Se non si sa si scrivono le due forme.
-- Rieseguibile: le funzioni esistenti si correggono con replace solo se il testo vecchio c'è ancora.

-- 1. Il genere di una persona: 'F', 'M' o null
create or replace function genere_di(p_sesso text, p_cf text)
returns text language sql immutable as $$
  select case
    when upper(trim(coalesce(p_sesso, ''))) in ('F', 'M') then upper(trim(p_sesso))
    when length(trim(coalesce(p_cf, ''))) = 16
         and translate(substr(upper(trim(p_cf)), 10, 2), 'LMNPQRSTUV', '0123456789') ~ '^\d\d$'
      then case when translate(substr(upper(trim(p_cf)), 10, 2), 'LMNPQRSTUV', '0123456789')::int > 40
                then 'F' else 'M' end
  end
$$;
grant execute on function genere_di(text, text) to authenticated, service_role;

-- 2. Primo accesso all'app: "Benvenuta" o "Benvenuto" (il genere di chi paga, cioè di chi entra)
do $$
declare d text := pg_get_functiondef('stato_accesso(text)'::regprocedure);
begin
  if position('''genere''' in d) = 0 then
    d := replace(d, $a$return jsonb_build_object('stato', 'da_attivare', 'nome', acc.nome,$a$,
                    $b$return jsonb_build_object('stato', 'da_attivare', 'nome', acc.nome,
    'genere', coalesce((select genere_di(a.sesso, a.codice_fiscale) from allievi a
                         where a.account_id = acc.id and a.is_titolare limit 1),
                       genere_di(null, acc.codice_fiscale)),$b$);
    execute d;
  end if;
end $$;
revoke execute on function stato_accesso(text) from public, anon, authenticated;
grant execute on function stato_accesso(text) to service_role;

-- 3. Campanella della segreteria quando qualcuno entra dall'app:
--    "Figlia aggiunta dall'app · Giulia Marino (figlia di Martina Marino) si è iscritta alla scuola"
create or replace function trg_allievi_nuovo_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tit text; v_figlio boolean; g text := genere_di(new.sesso, new.codice_fiscale);
  v_figl text; v_iscr text;
begin
  if is_staff(new.palestra_id) then return new; end if;
  select trim(nome || ' ' || coalesce(cognome, '')) into v_tit from account where id = new.account_id;
  v_figlio := not new.is_titolare and exists (select 1 from allievi x where x.account_id = new.account_id and x.id <> new.id);
  v_figl := case g when 'F' then 'figlia' when 'M' then 'figlio' else 'figlio/a' end;
  v_iscr := case g when 'F' then 'iscritta' when 'M' then 'iscritto' else 'iscritto/a' end;
  begin
    perform accoda_push_staff(new.palestra_id, 'cliente',
      case when v_figlio then initcap(v_figl) || case g when 'F' then ' aggiunta' when 'M' then ' aggiunto' else ' aggiunto/a' end || ' dall''app'
           else 'Nuovo cliente' end,
      trim(new.nome || ' ' || coalesce(new.cognome, '')) ||
        case when v_figlio then ' (' || v_figl || ' di ' || coalesce(v_tit, '?') || ')'
             when not new.is_titolare and v_tit is not null then ' · genitore ' || v_tit else '' end ||
        ' si è ' || v_iscr || ' alla scuola',
      '/gestione/persone/' || new.id, array['admin', 'segreteria'], null, 'cli:' || new.id);
  exception when others then null; end;
  return new;
end $$;

-- 4. "Da ricontattare": il motivo di chi ha provato non dice più "non iscritto"
do $$
declare d text := pg_get_functiondef('da_ricontattare'::regproc);
begin
  if position('prova fatta, non iscritto' in d) > 0 then
    execute replace(d, 'prova fatta, non iscritto', 'prova fatta, senza iscrizione');
  end if;
end $$;

-- 5. Appello: la nota della prenotazione aggiunta dall'insegnante
do $$
declare d text := pg_get_functiondef('aggiungi_in_appello'::regproc);
begin
  if position('aggiunto in appello da ' in d) > 0 then
    execute replace(d, 'aggiunto in appello da ', 'aggiunta in appello da ');
  end if;
end $$;

-- 6. Email dopo la prova: "Se ti sei trovato bene" → vale per tutti e tutte
--    (si cambia solo se il testo è ancora quello di partenza; se l'avete riscritto resta il vostro)
update messaggi_template
   set corpo = replace(corpo, 'Se ti sei trovato bene,', 'Se ti è piaciuta,')
 where evento = 'follow_up_prova' and corpo like '%Se ti sei trovato bene,%';
