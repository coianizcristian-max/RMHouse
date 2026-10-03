-- 098 · Cambio insegnante: solo questa lezione, tutte le prossime, oppure fino a una data;
--       e, per le ultime due, solo questo orario o tutte le lezioni del corso (tutti i giorni).
-- - "Tutte le prossime": cambio stabile (vale anche per le lezioni che il calendario genererà; si aggiorna l'orario).
-- - "Fino al …": sostituzione per un periodo; ogni lezione ricorda la titolare e torna a lei dopo.
-- - "Tutto il corso": le lezioni del corso negli altri giorni che hanno la stessa insegnante (titolare) di questa.
-- Una notifica sola (non una per lezione) a chi riceve le lezioni e a chi le lascia.
-- Rieseguibile.

-- la notifica "Ti è stata assegnata una lezione" si spegne mentre si cambiano molte lezioni insieme
create or replace function trg_push_staff_lezione()
returns trigger language plpgsql security definer set search_path = public as $$
declare c corsi; v_quando text;
begin
  begin
    if coalesce(current_setting('rm.cambio_in_blocco', true), '') = '1' then return new; end if;
    -- solo lezioni future, e solo per modifiche fatte da una persona (non dalla generazione notturna)
    if new.inizio < now() or auth.uid() is null then return new; end if;
    select * into c from corsi where id = new.corso_id;
    v_quando := c.nome || ' · ' || to_char(new.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI');
    if new.stato = 'annullata' and old.stato is distinct from 'annullata' and new.insegnante_id is not null then
      perform accoda_push_staff(new.palestra_id, 'lezione', 'Lezione annullata', v_quando,
                                '/gestione/calendario', null, new.insegnante_id, 'lez-ann:' || new.id);
    elsif new.insegnante_id is distinct from old.insegnante_id and new.insegnante_id is not null then
      perform accoda_push_staff(new.palestra_id, 'lezione', 'Ti è stata assegnata una lezione', v_quando,
                                '/gestione/appello/' || new.id, null, new.insegnante_id, 'lez-ass:' || new.id || ':' || new.insegnante_id);
    end if;
  exception when others then null;
  end;
  return new;
end $$;


-- Orario modificato (palinsesto): le lezioni future seguono sala, insegnante e prenotabilità.
-- Ora però: non si toccano le lezioni annullate e le sostituzioni già decise (insegnante_titolare),
-- e durante un cambio insegnante fatto da sostituisci_lezione l'orario si aggiorna senza rigenerare le lezioni.
create or replace function trg_orari_lezioni()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('rm.cambio_in_blocco', true), '') = '1' then return new; end if;
  if tg_op = 'UPDATE' then
    delete from lezioni l
    where l.orario_id = new.id and l.inizio > now()
      and l.stato <> 'annullata' and l.insegnante_titolare is null
      and not exists (select 1 from prove pr where pr.lezione_id = l.id)
      and not exists (select 1 from prenotazioni pn where pn.lezione_id = l.id)
      and not exists (select 1 from presenze ps where ps.lezione_id = l.id);
    update lezioni set sala_id = new.sala_id, prenotabile = new.prenotabile,
                       insegnante_id = case when insegnante_titolare is null then new.insegnante_id else insegnante_id end
    where orario_id = new.id and inizio > now();
  end if;
  if new.attivo then
    perform genera_lezioni(new.palestra_id, current_date, current_date + 90, new.id);
  end if;
  return new;
end $$;

drop function if exists sostituisci_lezione(uuid, uuid, boolean);
drop function if exists sostituisci_lezione(uuid, uuid, boolean, date, boolean);
create function sostituisci_lezione(p_lezione uuid, p_staff uuid, p_da_oggi boolean default false,
                                    p_fino date default null, p_tutto_corso boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l lezioni; io staff; nuova staff; v_gest boolean; v_corso text; v_quando text; n int := 1; v_blocco boolean;
        v_periodo text;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  io := mio_staff(l.palestra_id);
  if io.id is null then raise exception 'non_autorizzato'; end if;
  v_gest := io.ruolo::text in ('admin', 'segreteria');
  if l.stato = 'annullata' then raise exception 'lezione_annullata'; end if;
  if p_staff is not null then
    select * into nuova from staff where id = p_staff and palestra_id = l.palestra_id and attivo and not coalesce(archiviato, false);
    if not found then raise exception 'staff_non_trovato'; end if;
  end if;

  if not v_gest then
    -- l'insegnante: solo una sua lezione futura, solo quella data, a un'altra persona
    if l.insegnante_id is distinct from io.id then raise exception 'non_tua'; end if;
    if l.inizio <= now() then raise exception 'lezione_passata'; end if;
    if p_staff is null or p_staff = io.id then raise exception 'scegli_chi'; end if;
    p_da_oggi := false; p_fino := null; p_tutto_corso := false;
  end if;
  if p_fino is not null then
    p_da_oggi := false;
    if p_fino < l.data then raise exception 'data_non_valida'; end if;
  end if;
  v_blocco := p_da_oggi or p_fino is not null;
  if not v_blocco and p_staff is not distinct from l.insegnante_id then return jsonb_build_object('cambiate', 0); end if;

  select nome into v_corso from corsi where id = l.corso_id;
  v_quando := coalesce(v_corso, 'Lezione') || ' di '
              || (array['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'])[extract(isodow from l.inizio at time zone 'Europe/Rome')::int]
              || ' ' || to_char(l.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI');

  if v_blocco then
    perform set_config('rm.cambio_in_blocco', '1', true);
    create temp table if not exists _da_cambiare (id uuid primary key) on commit drop;
    truncate _da_cambiare;
    insert into _da_cambiare
    select x.id from lezioni x
     where x.id = l.id
        or (x.palestra_id = l.palestra_id and x.inizio >= l.inizio and x.stato <> 'annullata'
            and (p_fino is null or x.data <= p_fino)
            and case when p_tutto_corso
                     then x.corso_id = l.corso_id and coalesce(x.insegnante_titolare, x.insegnante_id) is not distinct from coalesce(l.insegnante_titolare, l.insegnante_id)
                     else l.orario_id is not null and x.orario_id = l.orario_id end);

    if p_da_oggi then
      -- cambio stabile: niente "titolare", e gli orari (per le lezioni che il calendario genererà)
      update lezioni set insegnante_id = p_staff, insegnante_titolare = null, sostituzione_da = null, sostituzione_at = null
       where id in (select id from _da_cambiare);
      get diagnostics n = row_count;
      if p_tutto_corso then
        update orari set insegnante_id = p_staff where corso_id = l.corso_id and insegnante_id is not distinct from coalesce(l.insegnante_titolare, l.insegnante_id);
      elsif l.orario_id is not null then
        update orari set insegnante_id = p_staff where id = l.orario_id;
      end if;
    else
      -- sostituzione per un periodo: ogni lezione ricorda la sua titolare
      update lezioni x set insegnante_id = p_staff,
             insegnante_titolare = case when p_staff is not distinct from coalesce(x.insegnante_titolare, x.insegnante_id) then null
                                        else coalesce(x.insegnante_titolare, x.insegnante_id) end,
             sostituzione_da = case when p_staff is not distinct from coalesce(x.insegnante_titolare, x.insegnante_id) then null else io.id end,
             sostituzione_at = case when p_staff is not distinct from coalesce(x.insegnante_titolare, x.insegnante_id) then null else now() end
       where x.id in (select id from _da_cambiare);
      get diagnostics n = row_count;
    end if;
    perform set_config('rm.cambio_in_blocco', '', true);
  else
    update lezioni set insegnante_id = p_staff,
           -- torna alla titolare: niente più sostituzione
           insegnante_titolare = case when p_staff is not distinct from coalesce(l.insegnante_titolare, l.insegnante_id) then null
                                      else coalesce(l.insegnante_titolare, l.insegnante_id) end,
           sostituzione_da = case when p_staff is not distinct from coalesce(l.insegnante_titolare, l.insegnante_id) then null else io.id end,
           sostituzione_at = case when p_staff is not distinct from coalesce(l.insegnante_titolare, l.insegnante_id) then null else now() end
     where id = l.id;
  end if;

  v_periodo := case when p_fino is not null then ' e le lezioni ' || case when p_tutto_corso then 'del corso' else 'di questo orario' end
                                                 || ' fino al ' || to_char(p_fino, 'DD/MM') || ' (' || n || ' in tutto)'
                    when p_da_oggi then ' e tutte le prossime ' || case when p_tutto_corso then 'del corso' else 'di questo orario' end
                                        || ' (' || n || ' in tutto)'
                    else '' end;
  begin
    if not v_gest then
      perform accoda_push_staff(l.palestra_id, 'lezione', 'Lezione passata a un''altra insegnante',
        trim(io.nome || ' ' || coalesce(io.cognome, '')) || ' ha passato ' || v_quando || ' a ' || trim(nuova.nome || ' ' || coalesce(nuova.cognome, '')),
        '/gestione/appello/' || l.id, array['admin', 'segreteria'], null, 'lez-sost:' || l.id || ':' || p_staff);
    else
      -- a chi le lascia
      if l.insegnante_id is not null and l.insegnante_id <> io.id and (l.inizio > now() or v_blocco) then
        perform accoda_push_staff(l.palestra_id, 'lezione',
          case when p_staff is null then 'Lezione senza insegnante' else 'Le tue lezioni le terrà ' || nuova.nome end,
          v_quando || v_periodo, '/gestione/calendario', null, l.insegnante_id,
          'lez-tolta:' || l.id || ':' || coalesce(p_staff::text, '-') || ':' || coalesce(p_fino::text, p_da_oggi::text));
      end if;
      -- a chi le riceve (una notifica sola per il blocco; per la lezione singola ci pensa il trigger)
      if v_blocco and p_staff is not null and p_staff <> io.id then
        perform accoda_push_staff(l.palestra_id, 'lezione', 'Ti sono state assegnate delle lezioni',
          v_quando || v_periodo, '/gestione/calendario', null, p_staff,
          'lez-ass-blocco:' || l.id || ':' || p_staff || ':' || coalesce(p_fino::text, p_da_oggi::text));
      end if;
    end if;
  exception when others then null;
  end;
  return jsonb_build_object('cambiate', n);
end $$;
revoke execute on function sostituisci_lezione(uuid, uuid, boolean, date, boolean) from public, anon;
grant execute on function sostituisci_lezione(uuid, uuid, boolean, date, boolean) to authenticated;
