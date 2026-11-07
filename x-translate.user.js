// ==UserScript==
// @name         X Translate
// @namespace    https://github.com/y0usaf/x-translate
// @version      0.1.0
// @description  Translates foreign-language posts on X in place, styled like X's own translation row.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_xmlhttpRequest
// @connect      translate.googleapis.com
// @run-at       document-idle
// @noframes
// @downloadURL  https://raw.githubusercontent.com/y0usaf/x-translate/main/x-translate.user.js
// @updateURL    https://raw.githubusercontent.com/y0usaf/x-translate/main/x-translate.user.js
// ==/UserScript==

(() => {
  const locale = navigator.language || "en";
  const target = locale.split("-")[0].toLowerCase();
  const names = new Intl.DisplayNames([locale], { type: "language" });
  const SKIP = /^(und|zxx|q[a-z]{2})$/;
  const TOKEN = /\uE000\s*(\d+)\s*\uE001/g;
  const NATIVE = /^(Show original|Translated from .+)$/;
  const ICON =
    '<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M7.25 1.5h1.5V3H12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.25zM4 4.5a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V5a.5.5 0 0 0-.5-.5zm1.5 2h1.75v1.75H5.5zm3.25 0h1.75v1.75H8.75zM6 9.5h4V11H6zM0 6.5h1.25v3H0zm14.75 0H16v3h-1.25z"/></svg>';
  const cache = new Map();
  const state = new WeakMap();

  const style = document.createElement("style");
  style.textContent = `
[data-xtr-hidden]{display:none!important}
.xtr-row{display:flex;align-items:center;gap:4px;margin-top:4px;font-size:13px;line-height:16px;font-family:inherit}
.xtr-row svg{width:16px;height:16px;flex:none}
.xtr-row button{all:unset;cursor:pointer}
.xtr-row button:hover{text-decoration:underline}`;
  document.head.append(style);

  function translate(text) {
    if (cache.has(text)) return cache.get(text);
    const request = new Promise((resolve, reject) =>
      GM_xmlhttpRequest({
        method: "POST",
        url: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t`,
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        data: "q=" + encodeURIComponent(text),
        timeout: 15000,
        onload: (r) => {
          try {
            const d = JSON.parse(r.responseText);
            resolve({ text: d[0].map((s) => s[0] || "").join(""), from: String(d[2] || "") });
          } catch (e) {
            reject(e);
          }
        },
        onerror: reject,
        ontimeout: reject,
      }),
    );
    cache.set(text, request);
    request.catch(() => cache.delete(text));
    return request;
  }

  function serialize(el) {
    const anchors = [];
    let text = "";
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) text += child.data;
        else if (child.nodeName === "A") {
          text += `\uE000${anchors.length}\uE001`;
          anchors.push(child);
        } else if (child.nodeName === "IMG") text += child.alt || "";
        else if (child.nodeName === "BR") text += "\n";
        else walk(child);
      }
    };
    walk(el);
    return { text, anchors };
  }

  function render(body, translated, anchors) {
    const parts = [];
    let last = 0;
    for (const m of translated.matchAll(TOKEN)) {
      parts.push(translated.slice(last, m.index));
      const original = anchors[Number(m[1])];
      if (original) {
        const a = original.cloneNode(true);
        a.addEventListener("click", (e) => {
          if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || !original.isConnected) return;
          e.preventDefault();
          e.stopPropagation();
          original.click();
        });
        parts.push(a);
      }
      last = m.index + m[0].length;
    }
    parts.push(translated.slice(last));
    body.replaceChildren(...parts);
  }

  function scope(el) {
    return el.closest('[data-testid="quoteTweet"]') || el.closest("article") || el.parentElement;
  }

  function translateButtons(el) {
    const home = scope(el);
    return [...home.querySelectorAll('button, [role="button"]')].filter(
      (b) => scope(b) === home && !b.closest(".xtr") && /^Translate (post|Tweet)$/.test(b.textContent.trim()),
    );
  }

  function nativelyTranslated(el) {
    const home = scope(el);
    return [...home.querySelectorAll("button, span")].some(
      (n) => scope(n) === home && !n.closest(".xtr") && n.childElementCount === 0 && NATIVE.test(n.textContent.trim()),
    );
  }

  function apply(el, st) {
    el.toggleAttribute("data-xtr-hidden", !st.showOriginal);
    st.body.toggleAttribute("data-xtr-hidden", st.showOriginal);
    st.toggle.textContent = st.showOriginal ? "Show translation" : "Show original";
    for (const b of translateButtons(el)) b.toggleAttribute("data-xtr-hidden", !st.showOriginal);
  }

  function build(el, st) {
    const wrap = document.createElement("div");
    wrap.className = "xtr";
    const body = document.createElement("div");
    body.className = el.className;
    body.style.cssText = el.style.cssText;
    body.dir = "auto";
    body.lang = target;
    const row = document.createElement("div");
    row.className = "xtr-row";
    const time = el.closest("article")?.querySelector("time");
    row.style.color = getComputedStyle(time || el).color;
    const label = document.createElement("span");
    const toggle = document.createElement("button");
    toggle.type = "button";
    const link = el.querySelector("a");
    toggle.style.color = link ? getComputedStyle(link).color : "rgb(29, 155, 240)";
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      st.showOriginal = !st.showOriginal;
      apply(el, st);
    });
    row.innerHTML = ICON;
    row.append(label, document.createTextNode("·"), toggle);
    wrap.append(body, row);
    Object.assign(st, { wrap, body, label, toggle });
  }

  function paint(el, st, out) {
    if (!st.wrap) build(el, st);
    if (el.nextElementSibling !== st.wrap) el.after(st.wrap);
    render(st.body, out.text, st.anchors);
    const from = out.from || el.lang;
    let name = from;
    try {
      name = names.of(from) || from;
    } catch {}
    st.label.textContent = `Translated from ${name}`;
    apply(el, st);
  }

  function consider(el) {
    const lang = (el.getAttribute("lang") || "").toLowerCase();
    if (!lang || SKIP.test(lang) || lang.split("-")[0] === target) return;
    const { text, anchors } = serialize(el);
    const prev = state.get(el);
    if (prev && prev.text === text && !(prev.failedAt < Date.now() - 30000)) {
      if (prev.wrap && el.nextElementSibling !== prev.wrap) el.after(prev.wrap);
      return;
    }
    if (!text.replace(TOKEN, "").trim() || nativelyTranslated(el)) {
      prev?.wrap?.remove();
      el.removeAttribute("data-xtr-hidden");
      state.set(el, { text });
      return;
    }
    const st = { text, anchors, showOriginal: prev?.showOriginal ?? false };
    if (prev?.wrap) Object.assign(st, { wrap: prev.wrap, body: prev.body, label: prev.label, toggle: prev.toggle });
    state.set(el, st);
    translate(text)
      .then((out) => {
        if (state.get(el) !== st || !el.isConnected) return;
        if (out.from.split("-")[0] === target || !out.text.trim()) {
          st.wrap?.remove();
          st.wrap = null;
          el.removeAttribute("data-xtr-hidden");
          return;
        }
        paint(el, st, out);
      })
      .catch(() => {
        st.failedAt = Date.now();
      });
  }

  function scan() {
    queued = false;
    for (const wrap of document.querySelectorAll(".xtr")) {
      const source = wrap.previousElementSibling;
      if (!source || state.get(source)?.wrap !== wrap) wrap.remove();
    }
    for (const el of document.querySelectorAll('[data-testid="tweetText"]')) consider(el);
  }

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(scan);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  scan();
})();
