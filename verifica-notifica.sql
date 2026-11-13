-- SOLO LETTURA: da incollare in Supabase → SQL Editor → Run. Non cambia niente.
-- A chi è arrivato "Domani hai lezione" per Pole Dance Liv.1 di venerdì 13/11, e su quale telefono.
-- Se compare un account che non è il tuo ma con il tuo telefono (es. "SM-..." / Android): è il caso spiegato
-- nelle ISTRUZIONI (telefono rimasto collegato a un altro account dopo un'uscita o un cambio account).
select ac.email, trim(ac.nome || ' ' || ac.cognome) as account, a.nome as allievo, vp.tipo as come_partecipa,
       pi.dispositivo as telefono, pi.created_at as collegato_il
  from lezioni l
  join corsi c on c.id = l.corso_id
  join v_partecipanti_lezione vp on vp.lezione_id = l.id
  join allievi a on a.id = vp.allievo_id
  join account ac on ac.id = a.account_id
  join push_iscrizioni pi on pi.account_id = ac.id and pi.attiva
 where c.nome = 'Pole Dance Liv.1' and l.data = date '2026-11-13'
 order by ac.email;
