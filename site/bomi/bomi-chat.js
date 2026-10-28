// Bomi  chat do site da OMG (ohmygirl.com.br).
// Carregado pelo tema do Shopify com uma linha so (snippets/bomi-chat.liquid):
//   <script src="https://cdn.jsdelivr.net/gh/brunotae/omg-erp@main/site/bomi/bomi-chat.js" defer></script>
// Mudou algo aqui? E so subir para o GitHub: o robo "Bomi - atualizar CDN" limpa o cache do jsDelivr e o site pega a versao nova.
(function () {
  var CSS = "#bomi-raiz{--b-pri:#B83D66;--b-fram:#D9577F;--b-bebe:#FDE4EC;--b-creme:#FFF9F6;--b-ameixa:#4A2638;--b-muted:#7A5566;--b-linha:#F6E2E9;\n    position:fixed;right:16px;bottom:88px;z-index:2147483000;font-family:inherit;color:var(--b-ameixa)}\n  #bomi-raiz *{box-sizing:border-box}\n  #bomi-botao{display:flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:12px 18px 12px 14px;background:var(--b-pri);color:#fff;\n    font-family:inherit;font-size:15px;font-weight:600;line-height:1;box-shadow:0 6px 20px rgba(74,38,56,.25);cursor:pointer}\n  #bomi-botao:hover{background:var(--b-fram)}\n  #bomi-botao .bomi-av{width:26px;height:26px;border-radius:50%;background:#fff;color:var(--b-pri);display:grid;place-items:center;font-size:15px}\n  #bomi-janela{position:absolute;right:0;bottom:0;width:min(380px,calc(100vw - 32px));height:min(600px,calc(100vh - 110px));background:var(--b-creme);\n    border-radius:18px;box-shadow:0 12px 40px rgba(74,38,56,.3);display:none;flex-direction:column;overflow:hidden;border:1px solid var(--b-linha)}\n  #bomi-raiz.aberta #bomi-janela{display:flex}\n  #bomi-raiz.aberta #bomi-botao{display:none}\n  .bomi-topo{background:var(--b-pri);color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px}\n  .bomi-topo b{display:block;font-size:15px}\n  .bomi-topo small{opacity:.9;font-size:12px}\n  .bomi-topo .bomi-av{width:34px;height:34px;border-radius:50%;background:#fff;color:var(--b-pri);display:grid;place-items:center;font-size:18px;flex:none}\n  .bomi-fechar{margin-left:auto;background:none;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px}\n  #bomi-msgs{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:8px}\n  .bomi-l{display:flex}\n  .bomi-l.c{justify-content:flex-end}\n  .bomi-bolha{max-width:85%;padding:9px 12px;border-radius:16px;font-size:14px;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere}\n  .bomi-l.b .bomi-bolha{background:#fff;border:1px solid var(--b-linha);border-bottom-left-radius:4px}\n  .bomi-l.c .bomi-bolha{background:var(--b-bebe);border-bottom-right-radius:4px}\n  .bomi-bolha a{color:var(--b-pri);text-decoration:underline}\n  .bomi-digitando{color:var(--b-muted);font-style:italic}\n  .bomi-evento{align-self:center;font-size:12px;color:var(--b-muted);background:var(--b-bebe);padding:4px 10px;border-radius:999px}\n  .bomi-boas{color:var(--b-muted);font-size:13px;text-align:center;padding:8px 6px}\n  .bomi-chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:10px}\n  .bomi-chips button{border:1px solid var(--b-pri);color:var(--b-pri);background:#fff;border-radius:999px;padding:6px 11px;font-family:inherit;font-size:13px;cursor:pointer}\n  .bomi-form{display:flex;gap:6px;padding:10px;border-top:1px solid var(--b-linha);background:#fff;align-items:flex-end}\n  .bomi-form textarea{flex:1;resize:none;border:1px solid var(--b-linha);border-radius:14px;padding:9px 12px;font-family:inherit;font-size:14px;line-height:1.35;max-height:96px;\n    background:var(--b-creme);color:var(--b-ameixa);min-width:0}\n  .bomi-form textarea:focus{outline:2px solid var(--b-fram);outline-offset:0}\n  .bomi-bt{flex:none;width:40px;height:40px;border-radius:50%;border:0;display:grid;place-items:center;cursor:pointer;font-size:18px}\n  .bomi-enviar{background:var(--b-pri);color:#fff}\n  .bomi-enviar:disabled{opacity:.5;cursor:default}\n  .bomi-mic{background:var(--b-bebe);color:var(--b-pri)}\n  .bomi-mic[aria-pressed=\"true\"]{background:var(--b-pri);color:#fff;animation:bomi-pulso 1.2s infinite}\n  @keyframes bomi-pulso{50%{box-shadow:0 0 0 6px rgba(184,61,102,.2)}}\n  .bomi-rodape{font-size:11px;color:var(--b-muted);text-align:center;padding:0 10px 8px;background:#fff}\n  .bomi-rodape a{color:var(--b-muted)}\n  .bomi-nota{display:flex;gap:6px;justify-content:center;font-size:12px;color:var(--b-muted);align-items:center}\n  .bomi-nota button{background:none;border:1px solid var(--b-linha);border-radius:999px;padding:2px 8px;cursor:pointer;font-size:14px}\n  @media (max-width:480px){\n    #bomi-raiz{right:12px;bottom:84px}\n    #bomi-raiz.aberta{right:0;bottom:0;left:0;top:0}\n    #bomi-raiz.aberta #bomi-janela{width:100%;height:100%;border-radius:0;position:static}\n    .bomi-form textarea{font-size:16px}\n  }";

  var BOMI_LIGADA = true;
  var URL_BOMI = "https://nzsiuniabovvptuqmkmi.supabase.co/functions/v1/bomi";
  if (!BOMI_LIGADA || window.__bomi) return;
  window.__bomi = true;
  var estilo = document.createElement("style");
  estilo.textContent = CSS;
  document.head.appendChild(estilo);
  var raiz = document.createElement("div");
  raiz.id = "bomi-raiz";
  document.body.appendChild(raiz);

  // memoria da conversa entre paginas (some quando a aba fecha)
  var mem = {};
  function ler(k) { try { return JSON.parse(sessionStorage.getItem("bomi_" + k)); } catch (e) { return mem[k]; } }
  function gravar(k, v) { mem[k] = v; try { sessionStorage.setItem("bomi_" + k, JSON.stringify(v)); } catch (e) {} }
  function novoId() {
    try { return crypto.randomUUID(); } catch (e) { return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
  }
  var sessao = ler("sessao") || novoId(); gravar("sessao", sessao);
  var hist = ler("hist") || [];   // [{p:'c'|'b'|'e', t}]
  var ocupada = false;

  raiz.innerHTML =
    '<button id="bomi-botao" type="button" aria-label="Abrir o chat com a Bomi"><span class="bomi-av" aria-hidden="true">\ud83c\udf38</span>D\u00favidas? Fale com a Bomi</button>' +
    '<section id="bomi-janela" role="dialog" aria-label="Chat com a Bomi, assistente virtual da OMG">' +
      '<div class="bomi-topo"><span class="bomi-av" aria-hidden="true">\ud83c\udf38</span><div><b>Bomi</b><small>assistente virtual (IA) da OMG</small></div>' +
      '<button class="bomi-fechar" type="button" aria-label="Fechar o chat">\u00d7</button></div>' +
      '<div id="bomi-msgs" aria-live="polite"></div>' +
      '<form class="bomi-form" autocomplete="off">' +
        '<button class="bomi-bt bomi-mic" type="button" aria-label="Falar em vez de digitar" aria-pressed="false" hidden>\ud83c\udfa4</button>' +
        '<textarea rows="1" maxlength="800" placeholder="Escreva sua d\u00favida\u2026" aria-label="Sua mensagem"></textarea>' +
        '<button class="bomi-bt bomi-enviar" type="submit" aria-label="Enviar">\u27a4</button>' +
      '</form>' +
      '<div class="bomi-rodape">N\u00e3o envie dados de cart\u00e3o ou senha. <a href="/policies/privacy-policy" target="_blank">Privacidade</a></div>' +
    '</section>';

  var $ = function (s) { return raiz.querySelector(s); };
  var msgs = $("#bomi-msgs"), txt = $("textarea"), btEnviar = $(".bomi-enviar"), btMic = $(".bomi-mic");

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function md(t) {
    var h = esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    return h.replace(/(https:\/\/[^\s<]+[^\s<.,;:!?)])/g, function (u) {
      var interno = /^https:\/\/(www\.)?ohmygirl\.com\.br\//.test(u);
      return '<a href="' + u + '"' + (interno ? "" : ' target="_blank" rel="noopener"') + ">" + u.replace(/^https:\/\/(www\.)?ohmygirl\.com\.br/, "ohmygirl.com.br") + "</a>";
    });
  }
  function rolar() { msgs.scrollTop = msgs.scrollHeight; }
  function bolha(p, t) {
    var d = document.createElement("div");
    if (p === "e") { d.className = "bomi-evento"; d.textContent = t; }
    else { d.className = "bomi-l " + p; d.innerHTML = '<div class="bomi-bolha">' + (p === "b" ? md(t) : esc(t)) + "</div>"; }
    msgs.appendChild(d); rolar(); return d;
  }
  function boasVindas() {
    msgs.innerHTML = '<div class="bomi-boas">Oi! Eu sou a Bomi, assistente virtual da OMG \ud83d\udc97<br>Tiro d\u00favidas sobre pedidos, entrega, impostos e produtos.' +
      '<div class="bomi-chips"><button type="button">Cad\u00ea meu pedido?</button><button type="button">Quanto pago de imposto?</button><button type="button">Me indica um protetor solar</button></div></div>';
    msgs.querySelectorAll(".bomi-chips button").forEach(function (b) { b.addEventListener("click", function () { enviar(b.textContent); }); });
  }
  function desenhar() {
    if (!hist.length) return boasVindas();
    msgs.innerHTML = "";
    hist.forEach(function (m) { bolha(m.p, m.t); });
    if (hist.length >= 6 && !ler("notou")) {
      var n = document.createElement("div"); n.className = "bomi-nota";
      n.innerHTML = 'A Bomi ajudou? <button type="button" data-n="bom" aria-label="Sim">\ud83d\udc4d</button><button type="button" data-n="ruim" aria-label="N\u00e3o">\ud83d\udc4e</button>';
      n.addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return;
        gravar("notou", true); n.textContent = "Obrigada pelo retorno! \ud83d\udc97";
        fetch(URL_BOMI, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessao: sessao, nota: b.dataset.n }) }).catch(function () {});
      });
      msgs.appendChild(n);
    }
    rolar();
  }
  function abrir(sim) {
    raiz.classList.toggle("aberta", sim); gravar("aberta", sim);
    if (sim) { desenhar(); setTimeout(function () { txt.focus(); }, 50); }
  }
  $("#bomi-botao").addEventListener("click", function () { abrir(true); });
  $(".bomi-fechar").addEventListener("click", function () { abrir(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && raiz.classList.contains("aberta")) abrir(false); });
  if (ler("aberta") && window.innerWidth > 480) abrir(true);

  function enviar(texto) {
    texto = String(texto || "").trim();
    if (!texto || ocupada) return;
    ocupada = true; btEnviar.disabled = true;
    if (!hist.length) msgs.innerHTML = "";
    hist.push({ p: "c", t: texto }); gravar("hist", hist); bolha("c", texto);
    var dig = bolha("b", "digitando\u2026"); dig.querySelector(".bomi-bolha").classList.add("bomi-digitando");
    var fim = function (partes, transferida) {
      dig.remove();
      if (transferida && !ler("transf")) { gravar("transf", true); hist.push({ p: "e", t: "Conversa passada para a equipe da OMG" }); bolha("e", "Conversa passada para a equipe da OMG"); }
      partes.forEach(function (t) { hist.push({ p: "b", t: t }); bolha("b", t); });
      gravar("hist", hist.slice(-60)); ocupada = false; btEnviar.disabled = false; txt.focus();
    };
    fetch(URL_BOMI, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessao: sessao, texto: texto, pagina: location.pathname }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { fim(j.mensagens && j.mensagens.length ? j.mensagens : ["Ops, n\u00e3o consegui responder agora \ud83d\ude15 Tente de novo em instantes."], j.transferida); })
      .catch(function () { fim(["Sem conex\u00e3o no momento \ud83d\ude15 Tente de novo, ou fale com a equipe: info.br@ohmygirl.com.br."]); });
  }
  $("form").addEventListener("submit", function (e) { e.preventDefault(); var v = txt.value; txt.value = ""; ajustar(); enviar(v); });
  txt.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("form").requestSubmit ? $("form").requestSubmit() : $("form").dispatchEvent(new Event("submit", { cancelable: true })); } });
  function ajustar() { txt.style.height = "auto"; txt.style.height = Math.min(txt.scrollHeight, 96) + "px"; }
  txt.addEventListener("input", ajustar);

  //  ditado (o proprio navegador transcreve; o audio nao vai para a OMG)
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    btMic.hidden = false;
    var rec = null;
    btMic.addEventListener("click", function () {
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = "pt-BR"; rec.interimResults = true; rec.continuous = false;
      var antes = txt.value ? txt.value.replace(/\s*$/, " ") : "";
      rec.onresult = function (e) {
        var t = ""; for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
        txt.value = antes + t; ajustar();
      };
      rec.onend = function () { rec = null; btMic.setAttribute("aria-pressed", "false"); txt.focus(); };
      rec.onerror = function () { if (rec) rec.stop(); };
      btMic.setAttribute("aria-pressed", "true");
      try { rec.start(); } catch (e) { rec = null; btMic.setAttribute("aria-pressed", "false"); }
    });
  }
})();

// Acompanhe seu pedido: a pagina /pages/acompanhe-seu-pedido tem so <div id="omg-rastreio"></div>; este codigo monta o formulario.
(function () {
  var URL_BOMI = "https://nzsiuniabovvptuqmkmi.supabase.co/functions/v1/bomi";
  function iniciar() {
    var raiz = document.getElementById("omg-rastreio");
    if (!raiz || raiz.dataset.pronto) return;
    raiz.dataset.pronto = "1";
    var css = document.createElement("style");
    css.textContent = "#omg-rastreio{--r-pri:#B83D66;--r-fram:#D9577F;--r-bebe:#FDE4EC;--r-menta:#9EDFC4;--r-ameixa:#4A2638;--r-muted:#7A5566;--r-linha:#F6E2E9;max-width:620px;margin:0 auto;color:var(--r-ameixa);font-family:inherit}" +
      "#omg-rastreio form{display:grid;gap:12px;background:#fff;border:1px solid var(--r-linha);border-radius:18px;padding:20px}" +
      "#omg-rastreio label{display:grid;gap:6px;font-size:14px;font-weight:600}" +
      "#omg-rastreio input{font:inherit;font-size:16px;padding:12px 14px;border:1px solid var(--r-linha);border-radius:12px;color:var(--r-ameixa);background:#FFF9F6}" +
      "#omg-rastreio input:focus{outline:2px solid var(--r-fram);outline-offset:1px}" +
      "#omg-rastreio button{font:inherit;font-weight:700;font-size:16px;border:0;border-radius:999px;padding:13px 18px;background:var(--r-pri);color:#fff;cursor:pointer}" +
      "#omg-rastreio button[disabled]{opacity:.6}" +
      "#omg-rastreio .r-dica{font-size:13px;color:var(--r-muted);margin:0}" +
      "#omg-rastreio .r-erro{color:#B5303B;font-size:14px;margin:0}" +
      "#omg-rastreio .r-res{margin-top:18px;background:#fff;border:1px solid var(--r-linha);border-radius:18px;padding:20px}" +
      "#omg-rastreio .r-res h3{margin:0 0 4px;font-size:18px}" +
      "#omg-rastreio .r-det{margin:0 0 16px;color:var(--r-muted);font-size:14px}" +
      "#omg-rastreio ol{list-style:none;margin:0;padding:0}" +
      "#omg-rastreio li{position:relative;padding:0 0 18px 34px;font-size:15px}" +
      "#omg-rastreio li:last-child{padding-bottom:0}" +
      "#omg-rastreio li:before{content:'';position:absolute;left:6px;top:4px;width:14px;height:14px;border-radius:50%;border:2px solid var(--r-linha);background:#fff}" +
      "#omg-rastreio li:after{content:'';position:absolute;left:13px;top:22px;bottom:2px;width:2px;background:var(--r-linha)}" +
      "#omg-rastreio li:last-child:after{display:none}" +
      "#omg-rastreio li.feito:before{background:var(--r-menta);border-color:var(--r-menta)}" +
      "#omg-rastreio li.feito:after{background:var(--r-menta)}" +
      "#omg-rastreio li.atual:before{background:var(--r-pri);border-color:var(--r-pri);box-shadow:0 0 0 4px var(--r-bebe)}" +
      "#omg-rastreio li.atual{font-weight:700}" +
      "#omg-rastreio li small{display:block;color:var(--r-muted);font-weight:400;font-size:13px}" +
      "#omg-rastreio li.falta{color:var(--r-muted)}" +
      "#omg-rastreio .r-extra{margin-top:16px;padding-top:14px;border-top:1px solid var(--r-linha);font-size:14px;display:grid;gap:6px}";
    document.head.appendChild(css);
    var p = new URLSearchParams(location.search);
    raiz.innerHTML =
      '<form novalidate>' +
      '<label>N\u00famero do pedido<input name="pedido" inputmode="numeric" autocomplete="off" placeholder="Ex.: 1001" required></label>' +
      '<label>E-mail da compra ou 3 \u00faltimos d\u00edgitos do CPF<input name="dono" autocomplete="email" placeholder="voce@email.com" required></label>' +
      '<p class="r-dica">O n\u00famero est\u00e1 no e-mail de confirma\u00e7\u00e3o da compra.</p>' +
      '<p class="r-erro" role="alert" hidden></p>' +
      '<button type="submit">Acompanhar pedido</button></form>' +
      '<div class="r-res" hidden aria-live="polite"></div>';
    var f = raiz.querySelector("form"), erro = raiz.querySelector(".r-erro"), res = raiz.querySelector(".r-res"), bt = f.querySelector("button");
    if (p.get("pedido")) f.pedido.value = p.get("pedido").replace(/\D/g, "");
    function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
    f.addEventListener("submit", function (e) {
      e.preventDefault(); erro.hidden = true;
      var ped = f.pedido.value.replace(/\D/g, ""), dono = f.dono.value.trim();
      if (!ped || !dono) { erro.textContent = "Preencha o n\u00famero do pedido e o e-mail (ou o final do CPF)."; erro.hidden = false; return; }
      bt.disabled = true; bt.textContent = "Consultando\u2026";
      fetch(URL_BOMI, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ acao: "rastreio", pedido: ped, email_ou_cpf: dono }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          bt.disabled = false; bt.textContent = "Acompanhar pedido";
          if (!x.ok) { erro.textContent = x.j.erro || "N\u00e3o foi poss\u00edvel consultar agora. Tente de novo."; erro.hidden = false; res.hidden = true; return; }
          var d = x.j;
          var linha = (d.linha || []).map(function (s) {
            return '<li class="' + (s.atual ? "atual feito" : s.feito ? "feito" : "falta") + '">' + esc(s.titulo) + (s.data ? "<small>" + esc(s.data) + "</small>" : "") + "</li>";
          }).join("");
          res.innerHTML = "<h3>Pedido " + esc(d.numero) + (d.nome ? " \u00b7 " + esc(d.nome) : "") + "</h3>" +
            '<p class="r-det"><b>' + esc(d.etapa) + ".</b> " + esc(d.detalhe) + "</p>" +
            (linha ? "<ol>" + linha + "</ol>" : "") +
            '<div class="r-extra">' + (d.data_compra ? "<span>Compra em " + esc(d.data_compra) + "</span>" : "") +
            (d.rastreio ? "<span>C\u00f3digo de rastreio: <b>" + esc(d.rastreio) + "</b></span>" : "") +
            (d.itens && d.itens.length ? "<span>Itens: " + esc(d.itens.join(", ")) + "</span>" : "") +
            '<span>D\u00favidas? Fale com a Bomi no bot\u00e3o do canto da tela ou escreva para info.br@ohmygirl.com.br.</span></div>';
          res.hidden = false;
        })
        .catch(function () { bt.disabled = false; bt.textContent = "Acompanhar pedido"; erro.textContent = "Sem conex\u00e3o agora. Tente de novo em instantes."; erro.hidden = false; });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
