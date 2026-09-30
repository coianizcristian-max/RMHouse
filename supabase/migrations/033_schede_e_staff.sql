-- =====================================================================
-- RMHouse — 033 SCHEDE PIÙ CHIARE E STAFF DOPPIO
--
-- 1. La quota annuale vale per la sua stagione oppure per 12 mesi dal
--    pagamento anche nelle schede dei corsi (prima solo per stagione).
-- 2. unisci_staff(): unisce due schede dello staff che sono la stessa
--    persona, spostando lezioni, orari, corsi, compensi e riferimenti.
-- 3. La usa subito sui casi evidenti: chi ha l'accesso al gestionale con
--    il solo nome ("Erika") e una scheda completa senza accesso con lo
--    stesso nome ("Erika Bonfanti") diventano una persona sola, che tiene
--    l'accesso e prende cognome, specialità, colore e foto.
-- Da eseguire dopo la 032. Si può rieseguire.
-- =====================================================================

create or replace function quota_pagata(p_allievo uuid, p_data date default current_date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from quote_iscrizione q join allievi a on a.id = q.allievo_id join palestre p on p.id = a.palestra_id
    where q.allievo_id = p_allievo
      and (q.stagione = stagione_di(p_data, p.mese_inizio_stagione) or q.data > p_data - 365)
  );
$$;

create or replace function unisci_staff(p_tenere uuid, p_togliere uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t staff; v staff;
begin
  select * into t from staff where id = p_tenere;
  select * into v from staff where id = p_togliere;
  if t.id is null or v.id is null or t.palestra_id <> v.palestra_id or t.id = v.id then
    raise exception 'staff_non_validi';
  end if;
  if auth.uid() is not null and not is_gestione(t.palestra_id) then raise exception 'non_autorizzato'; end if;

  update orari set insegnante_id = t.id where insegnante_id = v.id;
  update lezioni set insegnante_id = t.id where insegnante_id = v.id;
  insert into corsi_insegnanti (corso_id, staff_id, palestra_id)
    select corso_id, t.id, palestra_id from corsi_insegnanti where staff_id = v.id
  on conflict do nothing;
  delete from corsi_insegnanti where staff_id = v.id;
  update compensi set staff_id = t.id where staff_id = v.id;
  update allievi set seguito_da = t.id where seguito_da = v.id;

  update staff set
    cognome = coalesce(nullif(t.cognome, ''), v.cognome),
    email = coalesce(t.email, v.email),
    telefono = coalesce(t.telefono, v.telefono),
    specialita = coalesce(t.specialita, v.specialita),
    colore = coalesce(t.colore, v.colore),
    foto_url = coalesce(t.foto_url, v.foto_url),
    bio = coalesce(t.bio, v.bio),
    visibilita = v.visibilita,
    collaboratore = t.collaboratore or v.collaboratore
  where id = t.id;
  delete from staff where id = v.id;
end $$;
revoke execute on function unisci_staff(uuid, uuid) from public, anon;
grant execute on function unisci_staff(uuid, uuid) to authenticated;

-- Casi evidenti: accesso con il solo nome + scheda completa con lo stesso nome
do $$
declare r record; n int := 0;
begin
  for r in
    select a.id as tenere, (array_agg(b.id))[1] as togliere, a.nome
    from staff a
    join staff b on b.palestra_id = a.palestra_id and b.id <> a.id
                and lower(trim(b.nome)) = lower(trim(a.nome)) and coalesce(b.cognome, '') <> ''
                and b.user_id is null
    where a.user_id is not null and coalesce(trim(a.cognome), '') = ''
    group by a.id, a.nome
    having count(*) = 1
  loop
    perform unisci_staff(r.tenere, r.togliere);
    n := n + 1;
    raise notice 'Unito: % (con accesso) + la scheda completa con lo stesso nome', r.nome;
  end loop;
  raise notice 'Schede unite: %', n;
end $$;

select nome, cognome, ruolo, user_id is not null as con_accesso from staff order by nome;
