-- =====================================================================
-- RMHouse — 012 NOMI DI SALA E INSEGNANTE NEL PALINSESTO
-- Le schede del palinsesto mostrano chi insegna e in quale sala:
-- servono i nomi già pronti nella vista.
-- Da eseguire dopo 001…011.
-- =====================================================================

drop view if exists v_occupazione;
create view v_occupazione with (security_invoker = true) as
  select l.id as lezione_id, l.palestra_id, l.corso_id, l.data, l.inizio, l.fine, l.stato,
         l.insegnante_id, l.sala_id, l.prenotabile, l.note,
         c.nome as corso_nome, c.colore, c.visibilita,
         s.nome as sala_nome, st.nome as insegnante_nome,
         coalesce(l.capienza_override, c.capienza, s.capienza) as capienza,
         (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id and vp.tipo <> 'prova') as iscritti,
         (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id and vp.tipo = 'prova') as prove,
         (select count(*) from presenze ps where ps.lezione_id = l.id and ps.presente) as presenti,
         (select count(*) from presenze ps where ps.lezione_id = l.id and not ps.presente) as assenti,
         round(extract(epoch from (l.fine - l.inizio)) / 3600.0, 2) as ore
  from lezioni l
  join corsi c on c.id = l.corso_id
  left join sale s on s.id = l.sala_id
  left join staff st on st.id = l.insegnante_id;
