-- =====================================================================
-- RMHouse — 010 AZIONI RAPIDE SUL CALENDARIO
-- Modifiche che valgono per una sola lezione (posti, blocco prenotazioni,
-- annullamento), duplicazione di un orario e pannello del giorno.
-- Da eseguire dopo 001…009.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ECCEZIONI SULLA SINGOLA LEZIONE
--    Il corso e l'orario restano com'erano: qui si cambia solo questa volta.
-- ---------------------------------------------------------------------
alter table lezioni add column if not exists capienza_override int;
alter table lezioni add column if not exists prenotabile boolean not null default true;

-- La capienza della lezione: prima l'eccezione, poi il corso, poi la sala
drop view if exists v_appello;
drop view if exists v_occupazione;
drop view if exists v_lezioni;

create view v_lezioni with (security_invoker = true) as
  select l.*, c.nome as corso_nome, c.disciplina_id, c.fascia_eta_id, c.livello_id, c.colore, c.foto_url,
         c.max_prove_per_lezione,
         coalesce(l.capienza_override, c.capienza, s.capienza) as capienza,
         s.nome as sala_nome, st.nome as insegnante_nome,
         (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id) as partecipanti,
         (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id and vp.tipo <> 'prova') as iscritti,
         (select count(*) from prove pr where pr.lezione_id = l.id
            and pr.stato in ('in_attesa_pagamento', 'confermata', 'presente', 'assente')) as prove
  from lezioni l
  join corsi c on c.id = l.corso_id
  left join sale s on s.id = l.sala_id
  left join staff st on st.id = l.insegnante_id;

create view v_occupazione with (security_invoker = true) as
  select l.id as lezione_id, l.palestra_id, l.corso_id, l.data, l.inizio, l.fine, l.stato,
         l.insegnante_id, l.sala_id, l.prenotabile,
         c.nome as corso_nome, c.colore,
         coalesce(l.capienza_override, c.capienza, s.capienza) as capienza,
         (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id and vp.tipo <> 'prova') as iscritti,
         (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id and vp.tipo = 'prova') as prove,
         (select count(*) from presenze ps where ps.lezione_id = l.id and ps.presente) as presenti,
         (select count(*) from presenze ps where ps.lezione_id = l.id and not ps.presente) as assenti,
         round(extract(epoch from (l.fine - l.inizio)) / 3600.0, 2) as ore
  from lezioni l
  join corsi c on c.id = l.corso_id
  left join sale s on s.id = l.sala_id;

create view v_appello with (security_invoker = true) as
  select vp.lezione_id, vp.palestra_id, vp.allievo_id, vp.tipo, vp.riferimento_id,
         a.nome, a.cognome, a.data_nascita, a.certificato_scadenza,
         (vp.tipo <> 'prova' and (a.certificato_scadenza is null or a.certificato_scadenza < l.data)) as bloccato,
         (vp.tipo <> 'prova' and a.certificato_scadenza is not null
            and a.certificato_scadenza >= l.data and a.certificato_scadenza < l.data + 30) as certificato_in_scadenza,
         (vp.tipo <> 'prova' and not quota_pagata(a.id, l.data)) as quota_mancante,
         ps.presente
  from v_partecipanti_lezione vp
  join allievi a on a.id = vp.allievo_id
  join lezioni l on l.id = vp.lezione_id
  left join presenze ps on ps.lezione_id = vp.lezione_id and ps.allievo_id = vp.allievo_id;

-- Le prove si prenotano solo dove la lezione è aperta
create or replace function prenota_prova(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pal palestre; v_corso corsi; v_fascia fasce_eta; v_lez lezioni;
  v_acc uuid; v_all uuid; v_prova uuid; v_pag uuid;
  v_email text := lower(trim(p->'titolare'->>'email'));
  v_adulto boolean := coalesce((p->>'adulto')::boolean, true);
  v_nome text; v_cognome text; v_nascita date; v_eta int;
  v_occupati int; v_capienza int; v_stato stato_prova;
begin
  if coalesce((p->>'consenso_privacy')::boolean, false) is not true then
    raise exception 'consenso_privacy_mancante';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_non_valida';
  end if;

  select * into v_pal from palestre where slug = p->>'palestra_slug';
  if not found then raise exception 'palestra_non_trovata'; end if;

  select * into v_corso from corsi
   where id = (p->>'corso_id')::uuid and palestra_id = v_pal.id and attivo and prova_abilitata
     and visibilita = 'pubblico' and prenotabile;
  if not found then raise exception 'corso_non_disponibile'; end if;
  select * into v_fascia from fasce_eta where id = v_corso.fascia_eta_id;

  if v_adulto then
    v_nome := p->'titolare'->>'nome'; v_cognome := p->'titolare'->>'cognome';
    v_nascita := (p->'titolare'->>'data_nascita')::date;
  else
    v_nome := p->'partecipante'->>'nome'; v_cognome := p->'partecipante'->>'cognome';
    v_nascita := (p->'partecipante'->>'data_nascita')::date;
  end if;
  if v_nome is null or v_cognome is null or v_nascita is null then
    raise exception 'dati_partecipante_mancanti';
  end if;

  v_eta := eta_al(v_nascita, current_date);
  if v_eta < v_fascia.eta_min or (v_fascia.eta_max is not null and v_eta > v_fascia.eta_max) then
    raise exception 'eta_non_compatibile';
  end if;

  insert into account (palestra_id, nome, cognome, email, telefono, fonte, utm, consenso_privacy_at, consenso_marketing)
  values (v_pal.id, p->'titolare'->>'nome', p->'titolare'->>'cognome', v_email, p->'titolare'->>'telefono',
          p->>'fonte', p->'utm', now(), coalesce((p->>'consenso_marketing')::boolean, false))
  on conflict (palestra_id, email) do update
    set telefono = coalesce(excluded.telefono, account.telefono),
        consenso_privacy_at = now(),
        consenso_marketing = account.consenso_marketing or excluded.consenso_marketing
  returning id into v_acc;

  select id into v_all from allievi
   where account_id = v_acc and lower(nome) = lower(v_nome) and data_nascita = v_nascita;
  if v_all is null then
    insert into allievi (palestra_id, account_id, nome, cognome, data_nascita, is_titolare)
    values (v_pal.id, v_acc, v_nome, v_cognome, v_nascita, v_adulto)
    returning id into v_all;
  end if;

  insert into lead_eventi (palestra_id, allievo_id, corso_id, evento)
  values (v_pal.id, v_all, v_corso.id, 'richiesta') on conflict do nothing;

  if p->>'lezione_id' is null then
    return jsonb_build_object('esito', 'richiesta_registrata', 'allievo_id', v_all);
  end if;

  select * into v_lez from lezioni
   where id = (p->>'lezione_id')::uuid and corso_id = v_corso.id and stato = 'programmata' and prenotabile
     and inizio > now() + make_interval(hours => v_pal.preavviso_ore)
   for update;
  if not found then raise exception 'lezione_non_disponibile'; end if;

  if exists (select 1 from prove where allievo_id = v_all and corso_id = v_corso.id
              and stato in ('in_attesa_pagamento', 'confermata')) then
    raise exception 'prova_gia_prenotata';
  end if;

  select count(*) into v_occupati from prove
   where lezione_id = v_lez.id and stato in ('in_attesa_pagamento', 'confermata');
  if v_occupati >= v_corso.max_prove_per_lezione then raise exception 'posti_prova_esauriti'; end if;

  select coalesce(v_lez.capienza_override, v_corso.capienza, s.capienza) into v_capienza
    from lezioni l left join sale s on s.id = l.sala_id where l.id = v_lez.id;
  if v_capienza is not null and
     (select count(*) from v_partecipanti_lezione where lezione_id = v_lez.id) + 1 > v_capienza then
    raise exception 'lezione_al_completo';
  end if;

  v_stato := case when v_corso.prezzo_prova_cent > 0 then 'in_attesa_pagamento' else 'confermata' end;

  if v_corso.prezzo_prova_cent > 0 then
    insert into pagamenti (palestra_id, account_id, corso_id, causale, descrizione, importo_cent)
    values (v_pal.id, v_acc, v_corso.id, 'prova',
            'Lezione di prova ' || v_corso.nome || ' - ' || v_nome || ' ' || v_cognome,
            v_corso.prezzo_prova_cent)
    returning id into v_pag;
  end if;

  insert into prove (palestra_id, allievo_id, corso_id, lezione_id, prezzo_cent, stato, pagamento_id)
  values (v_pal.id, v_all, v_corso.id, v_lez.id, v_corso.prezzo_prova_cent, v_stato, v_pag)
  returning id into v_prova;

  insert into lead_eventi (palestra_id, allievo_id, corso_id, evento)
  values (v_pal.id, v_all, v_corso.id, 'prova_prenotata') on conflict do nothing;

  update allievi set stato_lead = 'prova_prenotata'
   where id = v_all and stato_lead in ('nuovo', 'perso');

  return jsonb_build_object(
    'esito', case when v_pag is null then 'prova_confermata' else 'pagamento_richiesto' end,
    'prova_id', v_prova, 'pagamento_id', v_pag, 'importo_cent', v_corso.prezzo_prova_cent);
end $$;
revoke execute on function prenota_prova(jsonb) from public, anon, authenticated;
grant execute on function prenota_prova(jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 2. AZIONI SULLA LEZIONE E SULL'ORARIO
-- ---------------------------------------------------------------------
-- Cambia qualcosa solo su questa lezione, oppure da oggi in avanti su tutte
create or replace function modifica_lezione(
  p_lezione uuid, p_cosa text, p_valore text, p_da_oggi boolean default false
) returns int language plpgsql security definer set search_path = public as $$
declare l lezioni; n int;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  if auth.uid() is not null and not is_gestione(l.palestra_id) then raise exception 'non_autorizzato'; end if;

  if p_cosa = 'posti' then
    update lezioni set capienza_override = nullif(p_valore, '')::int
     where (id = p_lezione) or (p_da_oggi and orario_id = l.orario_id and inizio > now());
  elsif p_cosa = 'prenotabile' then
    update lezioni set prenotabile = p_valore::boolean
     where (id = p_lezione) or (p_da_oggi and orario_id = l.orario_id and inizio > now());
  elsif p_cosa = 'annulla' then
    update lezioni set stato = 'annullata', note = nullif(p_valore, '')
     where (id = p_lezione) or (p_da_oggi and orario_id = l.orario_id and inizio > now());
  elsif p_cosa = 'ripristina' then
    update lezioni set stato = 'programmata', note = null
     where (id = p_lezione) or (p_da_oggi and orario_id = l.orario_id and inizio > now());
  elsif p_cosa = 'insegnante' then
    update lezioni set insegnante_id = nullif(p_valore, '')::uuid
     where (id = p_lezione) or (p_da_oggi and orario_id = l.orario_id and inizio > now());
  elsif p_cosa = 'sala' then
    update lezioni set sala_id = nullif(p_valore, '')::uuid
     where (id = p_lezione) or (p_da_oggi and orario_id = l.orario_id and inizio > now());
  else
    raise exception 'azione_sconosciuta';
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- Duplica un orario settimanale su un altro giorno o a un'altra ora
create or replace function duplica_orario(p_orario uuid, p_giorno smallint default null, p_ora time default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o orari; v_id uuid;
begin
  select * into o from orari where id = p_orario;
  if not found then raise exception 'orario_non_trovato'; end if;
  if auth.uid() is not null and not is_gestione(o.palestra_id) then raise exception 'non_autorizzato'; end if;

  insert into orari (palestra_id, corso_id, giorno_settimana, ora_inizio, durata_min, sala_id, insegnante_id, valido_dal, valido_al, attivo)
  values (o.palestra_id, o.corso_id, coalesce(p_giorno, o.giorno_settimana), coalesce(p_ora, o.ora_inizio),
          o.durata_min, o.sala_id, o.insegnante_id, greatest(o.valido_dal, current_date), o.valido_al, o.attivo)
  returning id into v_id;
  return v_id;
end $$;

-- Cambia il colore del corso direttamente dal calendario
create or replace function colore_corso(p_corso uuid, p_colore text)
returns void language plpgsql security definer set search_path = public as $$
declare v_pal uuid;
begin
  select palestra_id into v_pal from corsi where id = p_corso;
  if v_pal is null then raise exception 'corso_non_trovato'; end if;
  if auth.uid() is not null and not is_gestione(v_pal) then raise exception 'non_autorizzato'; end if;
  if p_colore !~ '^#[0-9a-fA-F]{6}$' then raise exception 'colore_non_valido'; end if;
  update corsi set colore = p_colore where id = p_corso;
end $$;

-- ---------------------------------------------------------------------
-- 3. PANNELLO DEL GIORNO: prove in arrivo, affitti sala e note
-- ---------------------------------------------------------------------
create or replace function giornata(p_palestra uuid, p_data date)
returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'prove', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ora', to_char(l.inizio at time zone 'Europe/Rome', 'HH24:MI'),
        'corso', c.nome, 'nome', a.nome || ' ' || a.cognome,
        'telefono', acc.telefono, 'stato', pr.stato,
        'allievo_id', a.id, 'lezione_id', l.id) order by l.inizio)
      from prove pr
      join lezioni l on l.id = pr.lezione_id
      join corsi c on c.id = pr.corso_id
      join allievi a on a.id = pr.allievo_id
      join account acc on acc.id = a.account_id
      where pr.palestra_id = p_palestra and l.data = p_data
        and pr.stato in ('confermata', 'in_attesa_pagamento', 'presente', 'assente')), '[]'::jsonb),
    'spazi', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ora', to_char(ps.inizio at time zone 'Europe/Rome', 'HH24:MI') || '–' ||
               to_char(ps.fine at time zone 'Europe/Rome', 'HH24:MI'),
        'titolo', ps.titolo, 'contatto', ps.contatto_nome, 'sala', s.nome, 'stato', ps.stato) order by ps.inizio)
      from prenotazioni_spazi ps join sale s on s.id = ps.sala_id
      where ps.palestra_id = p_palestra and (ps.inizio at time zone 'Europe/Rome')::date = p_data
        and ps.stato in ('opzione', 'confermata', 'completata')), '[]'::jsonb),
    'recuperi', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ora', to_char(l.inizio at time zone 'Europe/Rome', 'HH24:MI'),
        'corso', c.nome, 'nome', a.nome || ' ' || a.cognome) order by l.inizio)
      from prenotazioni pn
      join lezioni l on l.id = pn.lezione_id
      join corsi c on c.id = l.corso_id
      join allievi a on a.id = pn.allievo_id
      where pn.palestra_id = p_palestra and l.data = p_data and pn.stato = 'confermata'), '[]'::jsonb),
    'note', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'testo', n.testo, 'creata', n.created_at) order by n.created_at)
      from note_giorno n where n.palestra_id = p_palestra and n.data = p_data), '[]'::jsonb)
  );
$$;

grant execute on function modifica_lezione(uuid, text, text, boolean) to authenticated;
grant execute on function duplica_orario(uuid, smallint, time) to authenticated;
grant execute on function colore_corso(uuid, text) to authenticated;
