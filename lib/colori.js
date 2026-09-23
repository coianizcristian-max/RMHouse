// Gradazioni di un colore, con la stessa regola usata nel database:
// su un colore scuro si schiarisce soltanto, su uno chiaro si scurisce,
// altrimenti verrebbero dieci tinte identiche.

const pezzi = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const due = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

export function valido(hex) {
  return typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex);
}

export function luminosita(hex) {
  if (!valido(hex)) return 128;
  const [r, g, b] = pezzi(hex);
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

// verso > 0 schiarisce, verso < 0 scurisce
export function mix(hex, verso) {
  if (!valido(hex)) return hex;
  const t = verso >= 0 ? 255 : 0;
  const [r, g, b] = pezzi(hex).map((c) => c + (t - c) * Math.abs(verso));
  return `#${due(r)}${due(g)}${due(b)}`;
}

export function gradazioni(hex, quante = 10) {
  if (!valido(hex)) return [];
  const l = luminosita(hex);
  const dal = l < 70 ? 0 : l > 185 ? -0.75 : -0.35;
  const al = l < 70 ? 0.8 : l > 185 ? 0 : 0.6;
  return Array.from({ length: quante }, (_, i) =>
    mix(hex, dal + ((al - dal) * i) / Math.max(quante - 1, 1)));
}

// Bianco o nero, secondo cosa si legge meglio sopra quel colore
export function testoSu(hex) {
  return luminosita(hex) > 150 ? '#1a1a1a' : '#ffffff';
}
