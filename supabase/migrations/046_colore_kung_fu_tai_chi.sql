-- =====================================================================
-- RMHouse — 046 KUNG FU E TAI CHI GIALLI
-- Erano verdi e si confondevano con gli affitti delle sale (verdi).
-- Cambia la disciplina e tutti i suoi corsi. Si può rieseguire.
-- =====================================================================

update discipline set colore = '#ffd000'
 where nome ilike '%kung fu%' or nome ilike 'tai chi%';

update corsi c set colore = d.colore
  from discipline d
 where d.id = c.disciplina_id
   and (d.nome ilike '%kung fu%' or d.nome ilike 'tai chi%')
   and c.colore is distinct from d.colore;

select c.nome, c.colore from corsi c join discipline d on d.id = c.disciplina_id
 where d.nome ilike '%kung fu%' or d.nome ilike 'tai chi%' order by c.nome;
