-- 091 · Rendiconto staff: contano solo le lezioni confermate dall'appello
-- Prima contava tutte le lezioni in calendario nel periodo (anche quelle future).
-- Ora per ogni insegnante:
--   previste      = lezioni in calendario a lei nel periodo (anche future): il "piano"
--   svolte        = lezioni che ha confermato di aver tenuto (anche come sostituta)
--   da_confermare = lezioni già finite, a lei in calendario, che nessuno ha ancora confermato
--   presenze, clienti e compenso stimato si calcolano solo sulle svolte.
-- Se nelle impostazioni dei compensi "solo_confermate" è false, le lezioni finite contano come svolte.
-- Rieseguibile.

drop function if exists rendiconto_staff(uuid, date, date);
create function rendiconto_staff(p_palestra uuid, p_dal date, p_al date)
returns table (staff_id uuid, nome text, cognome text, foto_url text,
               previste bigint, minuti_previsti bigint,
               lezioni bigint, minuti bigint, da_confermare bigint,
               presenze bigint, clienti bigint, tariffa_cent int, compenso_cent bigint)
language sql stable security invoker set search_path = public as $$
  with imp as (
    select coalesce((compensi ->> 'solo_confermate')::boolean, true) as solo from palestre where id = p_palestra
  ),
  l as (
    select x.*, extract(epoch from (x.fine - x.inizio)) / 60 as minuti_l,
           -- chi l'ha tenuta davvero (null = non ancora)
           case when x.svolta_da is not null then x.svolta_da
                when not (select solo from imp) and x.fine <= now() then x.insegnante_id end as tenuta_da
      from lezioni x
     where x.palestra_id = p_palestra and x.stato <> 'annullata' and x.data between p_dal and p_al
  ),
  per as (
    select s.id, s.nome, s.cognome, s.foto_url, s.compenso_ora_cent,
           count(*) filter (where l.insegnante_id = s.id) as previste,
           coalesce(sum(l.minuti_l) filter (where l.insegnante_id = s.id), 0)::bigint as minuti_previsti,
           count(*) filter (where l.tenuta_da = s.id) as svolte,
           coalesce(sum(l.minuti_l) filter (where l.tenuta_da = s.id), 0)::bigint as minuti_svolti,
           count(*) filter (where l.insegnante_id = s.id and l.tenuta_da is null and l.fine <= now()) as da_confermare
      from staff s
      join l on l.insegnante_id = s.id or l.tenuta_da = s.id
     where s.palestra_id = p_palestra
     group by s.id
  )
  select p.id, p.nome, p.cognome, p.foto_url, p.previste, p.minuti_previsti,
         p.svolte, p.minuti_svolti, p.da_confermare,
         (select count(*) from presenze ps join l on l.id = ps.lezione_id where l.tenuta_da = p.id and ps.presente),
         (select count(distinct ps.allievo_id) from presenze ps join l on l.id = ps.lezione_id where l.tenuta_da = p.id and ps.presente),
         p.compenso_ora_cent,
         round(p.minuti_svolti / 60.0 * coalesce(p.compenso_ora_cent, 0))::bigint
    from per p
   order by p.minuti_svolti desc, p.minuti_previsti desc;
$$;
grant execute on function rendiconto_staff(uuid, date, date) to authenticated;
