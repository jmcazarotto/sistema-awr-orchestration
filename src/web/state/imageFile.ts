/** Lê uma imagem local e devolve um data URL JPEG/PNG reduzido (limita o tamanho salvo no template). */
export function readImageDownscaled(file: File, maxW = 1080, maxH = 1350): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Escolha um arquivo de imagem (PNG, JPG ou WebP).'));
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const ctx = c.getContext('2d'); if (!ctx) return reject(new Error('Não foi possível processar a imagem.'));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(file.type === 'image/png' && k === 1 && file.size < 600_000 ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', .85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
    img.src = url;
  });
}
