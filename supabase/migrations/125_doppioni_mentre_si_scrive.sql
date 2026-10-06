-- =====================================================================
-- RMHouse — 125 DOPPIONI MENTRE SI SCRIVE (Nuovo cliente)
--
-- Mentre la segreteria compila un nuovo cliente, RMHouse cerca se la persona c'è già, mettendo insieme più dati:
--   • "c'è già"          stesso codice fiscale, oppure stesso nome e cognome (anche scritti al contrario: il nome nel
--                         campo cognome) insieme a data di nascita, email o telefono;
--   • "forse c'è già"    stesso nome e cognome da soli (può essere un omonimo), oppure stessa data di nascita con
--                         lo stesso nome o lo stesso cognome, oppure stessa email/telefono con lo stesso nome;
--   • "stessa famiglia"  stessa email o telefono ma persona diversa (es. un fratello): solo un'informazione.
-- La sola email (o il solo telefono) non fa mai un doppione.
-- Veloce: ogni ricerca usa un indice (codice fiscale, nome e cognome, data di nascita, email, telefono) e guarda
-- solo le poche schede trovate, senza scorrere tutto l'archivio.
-- Si può eseguire più volte. Va dopo la 124.
-- =====================================================================

create or replace function testo_norm(t text) returns text language sql immutable as $$
  select nullif(lower(regexp_replace(trim(coalesce(t, '')), '\s+', ' ', 'g')), '');
$$;
create or replace function cf_norm(p text) returns text language sql immutable as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;
-- le ultime 9 cifre del telefono (così +39 348… e 348… sono lo stesso numero)
create or replace function tel_norm(p text) returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9), '');
$$;

create index if not exists allievi_nome_norm on allievi (palestra_id, testo_norm(nome || ' ' || coalesce(cognome, '')));
create index if not exists allievi_cf_norm on allievi (palestra_id, cf_norm(codice_fiscale));
create index if not exists allievi_nascita on allievi (palestra_id, data_nascita);
create index if not exists account_tel_norm on account (palestra_id, tel_norm(telefono));
create index if not exists ix_account_email on account (palestra_id, lower(email));

create or replace function possibili_doppioni(p_palestra uuid, p_nome text, p_cognome text, p_nascita date,
                                              p_cf text, p_email text, p_telefono text)
returns table (allievo_id uuid, nome text, cognome text, data_nascita date, email text, telefono text,
               chi_paga text, livello text, motivo text)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_n text := testo_norm(p_nome); v_c text := testo_norm(p_cognome);
  v_nc text := testo_norm(coalesce(p_nome, '') || ' ' || coalesce(p_cognome, ''));
  v_cn text := testo_norm(coalesce(p_cognome, '') || ' ' || coalesce(p_nome, ''));
  v_cf text := case when length(cf_norm(p_cf)) = 16 then cf_norm(p_cf) end;
  v_em text := case when p_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(trim(p_email)) end;
  v_tel text := case when length(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g')) >= 8 then tel_norm(p_telefono) end;
  v_nomi boolean := length(coalesce(v_n, '')) >= 2 and length(coalesce(v_c, '')) >= 2;
begin
  if not is_gestione(p_palestra) then return; end if;
  return query
  with cand as (   -- le schede da guardare: ognuna trovata con un indice
    select a.id from allievi a where v_cf is not null and a.palestra_id = p_palestra and cf_norm(a.codice_fiscale) = v_cf
    union
    select a.id from allievi a where v_nomi and a.palestra_id = p_palestra
       and testo_norm(a.nome || ' ' || coalesce(a.cognome, '')) in (v_nc, v_cn)
    union
    select a.id from allievi a where p_nascita is not null and a.palestra_id = p_palestra and a.data_nascita = p_nascita
    union
    select a.id from account ac join allievi a on a.account_id = ac.id
     where v_em is not null and ac.palestra_id = p_palestra and lower(ac.email) = v_em
    union
    select a.id from account ac join allievi a on a.account_id = ac.id
     where v_tel is not null and ac.palestra_id = p_palestra and tel_norm(ac.telefono) = v_tel
  ), dati as (
    select a.id, a.nome, a.cognome, a.data_nascita, ac.email, ac.telefono,
           case when a.is_titolare then null else trim(coalesce(ac.nome, '') || ' ' || coalesce(ac.cognome, '')) end as paga,
           v_cf is not null and cf_norm(a.codice_fiscale) = v_cf as s_cf,
           v_nomi and testo_norm(a.nome || ' ' || coalesce(a.cognome, '')) = v_nc as s_nomi,
           v_nomi and testo_norm(a.nome || ' ' || coalesce(a.cognome, '')) = v_cn and v_nc <> v_cn as s_invertiti,
           p_nascita is not null and a.data_nascita = p_nascita as s_nascita,
           p_nascita is not null and a.data_nascita is not null and a.data_nascita <> p_nascita as d_nascita,
           v_em is not null and lower(ac.email) = v_em as s_email,
           v_tel is not null and tel_norm(ac.telefono) = v_tel as s_tel,
           -- lo stesso nome (o lo stesso cognome), anche se scritto nell'altro campo
           (v_n is not null and testo_norm(a.nome) in (v_n, v_c)) or (v_c is not null and testo_norm(a.cognome) in (v_n, v_c)) as s_un_nome,
           v_n is not null and (testo_norm(a.nome) = v_n or testo_norm(a.cognome) = v_n) as s_primo_nome
      from cand join allievi a on a.id = cand.id left join account ac on ac.id = a.account_id
     where a.cognome is distinct from 'anonimizzata'
  ), voti as (
    select d.*,
           case
             when s_cf or ((s_nomi or s_invertiti) and (s_nascita or s_email or s_tel) and not d_nascita) then 'sicuro'
             when ((s_nomi or s_invertiti) and not d_nascita)
               or (s_nascita and s_un_nome)
               or ((s_email or s_tel) and s_primo_nome and not d_nascita) then 'probabile'
             when s_email or s_tel then 'famiglia'
           end as liv
      from dati d
  )
  select v.id, v.nome, v.cognome, v.data_nascita, v.email, v.telefono, v.paga, v.liv,
         concat_ws(', ',
           case when s_cf then 'stesso codice fiscale' end,
           case when s_nomi then 'stesso nome e cognome' end,
           case when s_invertiti then 'stesso nome e cognome, ma scritti al contrario' end,
           case when s_nascita then 'stessa data di nascita' end,
           case when s_email then 'stessa email' end,
           case when s_tel then 'stesso telefono' end)
    from voti v
   where v.liv is not null
   order by case v.liv when 'sicuro' then 0 when 'probabile' then 1 else 2 end, v.cognome, v.nome
   limit 8;
end $$;
revoke execute on function possibili_doppioni(uuid, text, text, date, text, text, text) from public, anon;
grant execute on function possibili_doppioni(uuid, text, text, date, text, text, text) to authenticated;

analyze allievi;
analyze account;
