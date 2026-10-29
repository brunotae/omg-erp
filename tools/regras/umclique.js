/* ===== Regra 7 · Um clique: opções favoritas + campo livre (Tae · 29/10/2026) =====
   Módulo genérico, sem dependências. Cole antes de </body> (ou dentro do script principal).
   O que faz, sozinho, em qualquer tela (MutationObserver):
   1) <select> com até 10 opções curtas → vira botões lado a lado (1 clique). O select continua no formulário, escondido.
   2) <select> maior                      → ganha botões favoritos abaixo da lista (exceto data-1c="lista").
   3) <input type=number> com rótulo      → ganha a linha de favoritos: [12%] [15%] [20%] [+ favorito] [✎]
      e campos de texto marcados com data-fav também.
   Favoritos: "+ favorito" guarda o valor que está no campo; "✎" mostra o × para tirar. Valem por pessoa e por aparelho.
   Padrões por campo: data-fav="10,15,20" (sugestões iniciais). Unidade nos botões: data-fav-un="%" ou "R$" (ou detecta pelo rótulo).
   Desligar num campo ou num bloco: data-1c="off". Chave própria: data-fav-key="desconto-valor".
   Botões do select: data-1c="botoes" força botões; data-1c="lista" força lista. */
(function () {
  if (window.__umclique) return; window.__umclique = true;
  const APP = (document.querySelector('meta[name="app-id"]') || {}).content || location.pathname.replace(/index\.html$/, '');
  const K = k => 'umclique:' + APP + ':' + k;
  const ler = k => { try { return JSON.parse(localStorage.getItem(K(k)) || 'null'); } catch (_) { return null; } };
  const gravar = (k, v) => { try { localStorage.setItem(K(k), JSON.stringify(v)); } catch (_) {} };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const off = el => !!el.closest('[data-1c="off"]') && el.dataset['1c'] !== 'botoes';

  const css = document.createElement('style');
  css.textContent =
    '.uc-hid{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;overflow:hidden!important}' +
    '.uc-seg{display:flex;flex-wrap:wrap;gap:6px}' +
    '.uc-seg button,.uc-fav button{font:inherit;font-size:13px;line-height:1.2;border:1px solid var(--line,#E6D9DF);background:var(--surface,#fff);color:inherit;border-radius:999px;padding:7px 12px;min-height:34px;cursor:pointer}' +
    '.uc-seg button[aria-pressed="true"]{background:var(--accent,var(--pri,#B83D66));border-color:var(--accent,var(--pri,#B83D66));color:var(--on-accent,var(--on-pri,#fff));font-weight:600}' +
    '.uc-seg button:disabled,.uc-fav button:disabled{opacity:.5;cursor:default}' +
    '.uc-fav{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center}' +
    '.uc-fav .uc-v[aria-pressed="true"]{border-color:var(--accent,var(--pri,#B83D66));color:var(--accent,var(--pri,#B83D66));font-weight:600}' +
    '.uc-fav .uc-add,.uc-fav .uc-ed{border-style:dashed;color:var(--muted,var(--mute,#8a7480))}' +
    '.uc-fav .uc-x{margin-left:6px;font-weight:700;opacity:.7}' +
    '.uc-fav.uc-vazio{display:none}' +
    ':focus-within>.uc-fav.uc-vazio,.uc-fav.uc-vazio:focus-within{display:flex}';
  document.head.appendChild(css);

  const setVal = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    d && d.set ? d.set.call(el, v) : (el.value = v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const rotulo = el => {
    const l = (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) || el.closest('label');
    return l ? l.textContent.trim() : (el.getAttribute('aria-label') || '');
  };
  const chave = el => el.dataset.favKey || el.name || el.id || rotulo(el).toLowerCase().slice(0, 40);
  const unidade = el => el.dataset.favUn || (/%/.test(rotulo(el)) ? '%' : /R\$/.test(rotulo(el)) ? 'R$' : '');
  const mostra = (v, un) => un === 'R$' ? 'R$ ' + String(v).replace('.', ',') : un === '%' ? String(v).replace('.', ',') + '%' : String(v);

  // ---------- select → botões ----------
  // valor trocado por código (sel.value = …, sem evento) também atualiza os botões
  if (!window.__ucValor) {
    window.__ucValor = true;
    for (const prop of ['value', 'selectedIndex']) {
      const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
      if (d && d.set) Object.defineProperty(HTMLSelectElement.prototype, prop, { configurable: true, enumerable: d.enumerable, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); if (this.__ucSync) this.__ucSync(); } });
    }
  }
  function botoes(sel) {
    // opção vazia só vira botão se tiver nome (ex.: "— nenhum —"); "Outra…" do campo livre vira botão próprio no fim
    const opcoes = () => [...sel.options].filter(o => o.value !== '__outra' && (o.value !== '' || !/^[—–-]*$/.test(o.text.trim())));
    const ops0 = opcoes();
    const forca = sel.dataset['1c'];
    if (forca === 'lista') return false;
    // poucas opções curtas (até 10, somando até ~90 letras: cabem em duas linhas) viram botões
    const letras = ops0.reduce((t, o) => t + o.text.trim().length, 0);
    if (forca !== 'botoes' && (ops0.length < 2 || ops0.length > 10 || letras > 90 || ops0.some(o => o.text.trim().length > 40) || sel.multiple)) return false;
    const box = document.createElement('div'); box.className = 'uc-seg'; box.setAttribute('role', 'group');
    const nome = rotulo(sel); if (nome) box.setAttribute('aria-label', nome);
    const desenha = () => {
      const ops = opcoes(), temOutra = [...sel.options].some(o => o.value === '__outra');
      box.innerHTML = ops.map(o => '<button type="button" data-v="' + esc(o.value) + '" aria-pressed="' + (sel.value === o.value) + '"' + (sel.disabled ? ' disabled' : '') + '>' + esc(o.text.trim()) + '</button>').join('') +
        (temOutra ? '<button type="button" data-v="__outra" aria-pressed="' + (sel.value === '__outra') + '"' + (sel.disabled ? ' disabled' : '') + '>Outra…</button>' : '');
    };
    desenha();
    sel.__ucSync = desenha;
    // opções trocadas por código (lista refeita) → botões refeitos
    new MutationObserver(desenha).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] });
    box.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; setVal(sel, b.dataset.v); desenha(); if (b.dataset.v === '__outra') { const o = sel.parentNode.querySelector('input[type="text"]'); o && o.focus(); } });
    sel.addEventListener('change', desenha);
    sel.classList.add('uc-hid'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    sel.insertAdjacentElement('afterend', box);
    return true;
  }

  // ---------- favoritos (select grande, número, texto com data-fav) ----------
  function favoritos(el) {
    const k = chave(el); if (!k) return;
    const un = el.tagName === 'SELECT' ? '' : unidade(el);
    const padrao = (el.dataset.fav || '').split(',').map(s => s.trim()).filter(Boolean);
    let editando = false;
    const box = document.createElement('div'); box.className = 'uc-fav';
    const lista = () => { const s = ler(k); return Array.isArray(s) ? s : padrao; };
    const texto = v => el.tagName === 'SELECT' ? ((([...el.options].find(o => o.value === v) || {}).text) || v) : mostra(v, un);
    const desenha = () => {
      const L = lista(), cur = String(el.value ?? '');
      box.classList.toggle('uc-vazio', !L.length && !editando);
      box.innerHTML = L.map(v => '<button type="button" class="uc-v" data-v="' + esc(v) + '" aria-pressed="' + (cur !== '' && String(v) === cur) + '"' + (el.disabled || el.readOnly ? ' disabled' : '') + '>' + esc(texto(v)) + (editando ? '<span class="uc-x" aria-label="tirar">×</span>' : '') + '</button>').join('') +
        (el.disabled || el.readOnly ? '' : '<button type="button" class="uc-add" title="Guarda o valor que está no campo como botão">+ favorito</button>' + (L.length ? '<button type="button" class="uc-ed" aria-pressed="' + editando + '" title="Tirar favoritos">' + (editando ? 'Pronto' : '✎') + '</button>' : ''));
    };
    box.addEventListener('mousedown', e => e.preventDefault()); // não tira o foco do campo
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.classList.contains('uc-add')) {
        const v = String(el.value ?? '').trim();
        if (!v || v === '__outra') { el.focus(); el.setAttribute('placeholder', 'Digite ou escolha e toque em + favorito'); return; }
        const L = lista().filter(x => String(x) !== v); L.push(v);
        if (el.type === 'number') L.sort((a, b) => Number(a) - Number(b));
        gravar(k, L.slice(-12)); desenha(); return;
      }
      if (b.classList.contains('uc-ed')) { editando = !editando; desenha(); return; }
      if (editando && e.target.closest('.uc-x')) { gravar(k, lista().filter(x => String(x) !== b.dataset.v)); desenha(); return; }
      setVal(el, b.dataset.v); desenha();
    });
    el.addEventListener('input', desenha); el.addEventListener('change', desenha);
    el.insertAdjacentElement('afterend', box);
    desenha();
  }

  function aplica(raiz) {
    const Q = 'select:not([data-uc]),input:not([data-uc])';
    [...(raiz.matches && raiz.matches(Q) ? [raiz] : []), ...raiz.querySelectorAll(Q)].forEach(el => {
      el.dataset.uc = '1';
      if (off(el) || el.type === 'hidden' || el.closest('.uc-seg,.uc-fav')) return;
      // só em formulários e quadros (filtros de barra ficam como estão, a não ser com data-1c="botoes")
      if (!el.closest('form,[role="dialog"],.modal,[data-1c="on"]') && el.dataset['1c'] !== 'botoes' && el.dataset.fav === undefined) return;
      // lista grande: ganha favoritos (menos as marcadas data-1c="lista", que o próprio sistema preenche)
      if (el.tagName === 'SELECT') { if (!botoes(el) && (el.dataset.fav !== undefined || el.dataset['1c'] !== 'lista')) favoritos(el); return; }
      const temRotulo = !!rotulo(el) && !!((el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) || el.closest('label'));
      if ((el.type === 'number' && temRotulo) || el.dataset.fav !== undefined) favoritos(el);
    });
  }
  const go = () => { aplica(document); new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) aplica(n); }))).observe(document.body, { childList: true, subtree: true }); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', go) : go();
})();
