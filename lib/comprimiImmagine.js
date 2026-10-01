// Rimpicciolisce una foto nel telefono/computer PRIMA di caricarla:
// lato lungo al massimo `lato` pixel, JPEG di buona qualità, foto girata nel verso giusto.
// Una foto da 6-12 MB del telefono diventa di 200-600 KB; un certificato resta ben leggibile.
// PDF, GIF e SVG passano così come sono; se qualcosa va storto si carica l'originale.
export async function comprimiImmagine(file, { lato = 1600, qualita = 0.82 } = {}) {
  if (!file || !file.type?.startsWith('image/') || ['image/gif', 'image/svg+xml'].includes(file.type)) return file;
  try {
    const img = await caricaImmagine(file);
    const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
    if (!w || !h) return file;
    const k = Math.min(1, lato / Math.max(w, h));
    // già piccola e già leggera: inutile ricomprimerla
    if (k === 1 && file.size < 400 * 1024) return file;
    // PNG piccoli (loghi con trasparenza): si tengono come sono
    if (file.type === 'image/png' && file.size < 1024 * 1024) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';                       // le parti trasparenti diventano bianche
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.close?.();

    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', qualita));
    if (!blob || blob.size >= file.size) return file;
    const nome = (file.name || 'immagine').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nome, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

async function caricaImmagine(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* si prova sotto */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
