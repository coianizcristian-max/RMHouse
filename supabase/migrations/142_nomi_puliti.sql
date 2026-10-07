-- =====================================================================
-- RMHouse — 142 NOMI SENZA SPAZI DOPPI
-- Alcuni abbonamenti importati avevano spazi doppi nel nome ("ATTREZZI  90 min 2 volte Annuale"): nella ricerca
-- "attrezzi 90" non li trovava. Si tolgono gli spazi doppi e quelli all'inizio e alla fine da abbonamenti, corsi
-- e voci di listino, e da ora si tolgono da soli a ogni salvataggio. Si può eseguire più volte.
-- =====================================================================

create or replace function trg_nome_pulito() returns trigger language plpgsql as $$
begin
  if new.nome is not null then new.nome := regexp_replace(btrim(new.nome), '\s+', ' ', 'g'); end if;
  return new;
end $$;

drop trigger if exists nome_pulito on tipi_abbonamento;
create trigger nome_pulito before insert or update of nome on tipi_abbonamento for each row execute function trg_nome_pulito();
drop trigger if exists nome_pulito on corsi;
create trigger nome_pulito before insert or update of nome on corsi for each row execute function trg_nome_pulito();
drop trigger if exists nome_pulito on voci_listino;
create trigger nome_pulito before insert or update of nome on voci_listino for each row execute function trg_nome_pulito();

update tipi_abbonamento set nome = nome where nome ~ '\s{2,}|^\s|\s$';
update corsi set nome = nome where nome ~ '\s{2,}|^\s|\s$';
update voci_listino set nome = nome where nome ~ '\s{2,}|^\s|\s$';
