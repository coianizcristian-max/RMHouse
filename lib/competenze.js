// Competenze dello staff (query 156, tabella staff_competenze): cosa insegna ogni persona, per disciplina o per area
// intera. `competenze` = righe { staff_id, disciplina_id, categoria_id }; `discipline` = { id, nome, categoria_id }.

// la persona insegna questa disciplina (direttamente o perché ha tutta la sua area)
export function adatto(staffId, disciplinaId, competenze = [], discipline = []) {
  if (!staffId || !disciplinaId) return false;
  const area = discipline.find((d) => d.id === disciplinaId)?.categoria_id || null;
  return competenze.some((k) => k.staff_id === staffId && (k.disciplina_id === disciplinaId || (area && k.categoria_id === area)));
}

// "Aerea, Pole Dance" oppure "tutta la Danza, Pilates"
export function testoCompetenze(staffId, competenze = [], discipline = [], categorie = []) {
  return competenze.filter((k) => k.staff_id === staffId)
    .map((k) => (k.categoria_id ? `tutta l'area ${categorie.find((c) => c.id === k.categoria_id)?.nome || ''}`.trim()
      : discipline.find((d) => d.id === k.disciplina_id)?.nome))
    .filter(Boolean).sort((a, b) => a.localeCompare(b, 'it')).join(', ');
}

// le persone divise in: del corso (già abilitate) · adatte (insegnano la disciplina) · altre
export function gruppiInsegnanti(persone = [], { disciplinaId = null, delCorso = [], competenze = [], discipline = [] } = {}) {
  const corso = new Set(delCorso);
  const a = [], b = [], c = [];
  for (const p of persone) {
    if (corso.has(p.id)) a.push(p);
    else if (adatto(p.id, disciplinaId, competenze, discipline)) b.push(p);
    else c.push(p);
  }
  return { delCorso: a, adatti: b, altri: c };
}
