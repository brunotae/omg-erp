// Classifica produtos para os filtros "Tipo de pele" e "Necessidade" (roda na aba do ERP).
const N = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tem = (t, l) => l.some(k => t.includes(k));
const FORA_PELE = ['shampoo', 'condicionador', 'cabelo', 'capilar', 'couro cabeludo', 'hair', 'scalp', 'batom', 'lip tint', 'tint ', 'gloss', 'labial', 'mascara de cilios', 'mascara para cilios', 'cilios', 'sombra', 'delineador', 'sobrancelha', 'unha', 'esmalte', 'suplemento', 'aparelho', 'device', 'esponja', 'pincel', 'espatula', 'escova', 'perfume', 'fragrancia'];
const NEC = {
  'Acne e espinhas': ['acne', 'espinha', 'cravo', 'blemish', 'pimple', 'salicil', 'bha', 'tea tree', 'melaleuca', 'azelai', 'ac collection', 'cat:adesivos-para-acne', 'cat:cuidado-localizado'],
  'Poros e oleosidade': ['poro', 'pore', 'oleosidade', 'oleosa', 'sebo', 'sebum', 'matte', 'controle de brilho', 'oil control'],
  'Manchas e luminosidade': ['mancha', 'clarea', 'uniformiz', 'ilumin', 'brighten', 'vitamina c', 'vitamin c', 'vita c', 'niacinamid', 'tranex', 'glutation', 'kojic', 'kojico', 'arbutin', 'glow', 'vico', 'luminosidade'],
  'Hidratação': ['hidrat', 'hialur', 'hyalu', 'moistur', 'aqua', 'umect', 'ressecad'],
  'Calmante e pele sensível': ['calmant', 'calming', 'cica', 'centella', 'madeca', 'soothing', 'sensive', 'vermelhid', 'heartleaf', 'houttuynia', 'pantenol', 'panthenol', 'aloe', 'acalma'],
  'Antiidade e firmeza': ['firmeza', 'firming', 'firmador', 'rugas', 'linhas finas', 'retinol', 'retinal', 'bakuchiol', 'peptid', 'colageno', 'collagen', 'antienvelhec', 'anti-idade', 'antiidade', 'elastic', 'pdrn', 'adenosin', 'wrinkle'],
  'Proteção solar': ['protetor solar', 'fps', 'spf', 'sunscreen', 'sun cream', 'sun stick', 'sun serum', 'sun essence', 'filtro solar', 'bloqueador'],
  'Limpeza': ['limpeza', 'cleans', 'espuma', 'foam', 'sabonete', 'micelar', 'demaquil', 'cleanser', 'wash'],
  'Barreira da pele': ['barreira', 'barrier', 'ceramid'],
};
export function classificar(r) {
  const tit = N(r.t + ' ' + r.y + ' ' + (r.tags || []).join(' '));
  const ind = N(r.ind);
  const base = tit + ' ' + N(r.ben) + ' ' + ind + ' ' + N(r.txt).slice(0, 320);
  const nec = [];
  for (const [k, l] of Object.entries(NEC)) {
    const fonte = k === 'Proteção solar' ? tit : (k === 'Limpeza' ? tit : base);
    if (tem(fonte, l)) nec.push(k);
  }
  if (tem(tit, FORA_PELE) && !nec.includes('Proteção solar')) return { pele: [], nec: nec.filter(n => n !== 'Limpeza' || /facial|rosto/.test(tit)).filter(n => !tem(tit, ['shampoo', 'cabelo', 'capilar', 'hair', 'scalp'])) };
  let pele = [];
  if (/todos os tipos|todo tipo|qualquer tipo|all skin/.test(ind)) pele.push('Todos os tipos');
  if (/oleos/.test(ind)) pele.push('Oleosa');
  if (/mista/.test(ind)) pele.push('Mista');
  if (/\bseca|ressecad/.test(ind)) pele.push('Seca');
  if (/normal/.test(ind)) pele.push('Normal');
  if (/sensive/.test(ind)) pele.push('Sensível');
  if (!pele.length) {
    if (nec.includes('Acne e espinhas') || nec.includes('Poros e oleosidade')) pele.push('Oleosa', 'Mista');
    if (nec.includes('Hidratação') || nec.includes('Barreira da pele')) pele.push('Seca', 'Normal');
    if (nec.includes('Calmante e pele sensível')) pele.push('Sensível');
    if (!pele.length) pele.push('Todos os tipos');
  }
  return { pele: [...new Set(pele)], nec };
}
export async function coletar(SH) {
  const rows = []; let after = null;
  do { const r = await SH({ acao: 'filtros_dados', after }); if (!r.ok) throw new Error(JSON.stringify(r)); rows.push(...r.rows); after = r.proximo; } while (after);
  return rows;
}
