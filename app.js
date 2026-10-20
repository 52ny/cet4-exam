/* ============================================================
 * CET-4 真题训练 · 应用逻辑
 * 纯静态、无构建步骤，可直接部署到 GitHub Pages
 * ============================================================ */
(function () {
  "use strict";

  const DATA = window.CET_DATA;
  const PAPERS = DATA.papers;

  const LS = {
    settings: "cet4.settings.v1",
    progress: "cet4.progress.v1",
    vocab: "cet4.vocab.v1",
    drafts: "cet4.drafts.v1",
    theme: "cet4.theme.v1"
  };

  const PRESETS = {
    deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
    openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" }
  };

  const TYPE_META = {
    writing: { label: "写作", icon: "✎", desc: "命题作文 · AI 批改" },
    cloze: { label: "选词填空", icon: "Aa", desc: "15 词库选 10 空" },
    matching: { label: "长篇阅读", icon: "≡", desc: "段落信息匹配" },
    reading: { label: "仔细阅读", icon: "▤", desc: "两篇短文 · 四选一" },
    translation: { label: "翻译", icon: "文", desc: "汉译英 · AI 批改" }
  };

  const DIRECTIONS = {
    writing:
      "For this part, you are allowed 30 minutes to write an essay. You should write at least 120 words but no more than 180 words.",
    cloze:
      "In this section, there is a passage with ten blanks. You are required to select one word for each blank from a list of choices given in a word bank following the passage. Each choice in the bank is identified by a letter. You may not use any of the words in the bank more than once.",
    matching:
      "In this section, you are going to read a passage with ten statements attached to it. Each statement contains information given in one of the paragraphs. Identify the paragraph from which the information is derived. You may choose a paragraph more than once.",
    reading:
      "There are two passages in this section. Each passage is followed by five questions. For each of them there are four choices marked A), B), C) and D). You should decide on the best choice.",
    translation:
      "For this part, you are allowed 30 minutes to translate a passage from Chinese into English. You should write your answer on Answer Sheet 2."
  };

  /* ---------------- 工具 ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("localStorage 写入失败", e);
    }
  }

  const state = {
    settings: load(LS.settings, { provider: "deepseek", baseUrl: "", model: "", apiKey: "" }),
    progress: load(LS.progress, {}),
    vocab: load(LS.vocab, {}),
    drafts: load(LS.drafts, {}),
    flash: { index: 0, revealed: false }
  };

  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function saveProgress() {
    save(LS.progress, state.progress);
    updateGlobalProgress();
    renderNav();
  }

  function saveDraft(sid, value) {
    state.drafts[sid] = value;
    save(LS.drafts, state.drafts);
  }

  function saveVocab() {
    save(LS.vocab, state.vocab);
    updateGlobalProgress();
    syncWordHighlight();
  }

  function getPaper(pid) {
    return PAPERS.find((p) => p.id === pid);
  }

  function getSection(pid, sid) {
    const paper = getPaper(pid);
    if (!paper) return null;
    const section = paper.sections.find((s) => s.id === sid);
    return section ? { paper, section } : null;
  }

  function findSectionById(sid) {
    for (const paper of PAPERS) {
      const section = paper.sections.find((s) => s.id === sid);
      if (section) return { paper, section };
    }
    return null;
  }

  function questionList(section) {
    if (section.type === "cloze" || section.type === "matching") return section.questions;
    if (section.type === "reading") return section.passages.reduce((arr, p) => arr.concat(p.questions), []);
    return [];
  }

  function exerciseTotal() {
    return PAPERS.reduce((n, p) => n + p.sections.length, 0);
  }

  function isDone(sid) {
    const p = state.progress[sid];
    return !!(p && p.submitted);
  }

  function correctRate() {
    let score = 0;
    let total = 0;
    Object.keys(state.progress).forEach((sid) => {
      const info = findSectionById(sid);
      const p = state.progress[sid];
      if (!info || !p || !p.submitted) return;
      const t = info.section.type;
      if (t === "cloze" || t === "matching" || t === "reading") {
        score += Number(p.score) || 0;
        total += Number(p.total) || 0;
      }
    });
    return total ? Math.round((score / total) * 100) : 0;
  }

  function objectiveDone() {
    let score = 0;
    let total = 0;
    PAPERS.forEach((paper) => {
      paper.sections.forEach((section) => {
        if (!["cloze", "matching", "reading"].includes(section.type)) return;
        const p = state.progress[section.id];
        total += questionList(section).length;
        if (p && p.submitted) score += Number(p.score) || 0;
      });
    });
    return { score, total };
  }

  function updateGlobalProgress() {
    const done = PAPERS.reduce(
      (n, p) => n + p.sections.filter((s) => isDone(s.id)).length,
      0
    );
    const pct = Math.round((done / exerciseTotal()) * 100);
    const el = $("#globalProgress");
    if (el) el.textContent = pct + "% 完成";
  }

  /* ---------------- 主题 ---------------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    save(LS.theme, theme);
    const icon = $("#themeIcon");
    const label = $("#themeLabel");
    if (icon) icon.textContent = theme === "dark" ? "☀" : "◐";
    if (label) label.textContent = theme === "dark" ? "浅色模式" : "深色模式";
  }

  function initTheme() {
    const saved = load(LS.theme, null);
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
  }

  /* ---------------- 侧栏 ---------------- */
  function renderNav() {
    const nav = $("#sidebarNav");
    if (!nav) return;
    const { parts } = parseHash();
    const activePaper = parts[0] === "paper" || parts[0] === "practice" ? parts[1] : null;
    const activeSid = parts[0] === "practice" ? parts[2] : null;
    const isHome = parts.length === 0;
    const isVocab = parts[0] === "vocab";
    const isAbout = parts[0] === "about";

    let html = `<div class="nav-group">
      <a class="nav-link ${isHome ? "active" : ""}" href="#/">
        <span class="n-ico">⌂</span><span>首页总览</span>
      </a>
    </div>`;

    let lastYear = null;
    PAPERS.forEach((paper) => {
      const done = paper.sections.filter((s) => isDone(s.id)).length;
      const isActive = activePaper === paper.id;
      const year = paper.date.slice(0, 4);
      if (year !== lastYear) {
        lastYear = year;
        html += `<div class="nav-year">${year}</div>`;
      }
      html += `<div class="nav-group">
        <a class="nav-link ${isActive && !activeSid ? "active" : ""}" href="#/paper/${paper.id}">
          <span class="n-ico">▸</span><span>${esc(paper.label)}</span>
          <span class="spacer"></span>
          <span class="badge ${done === paper.sections.length ? "done" : ""}">${done}/${paper.sections.length}</span>
        </a>
        ${isActive ? `<div class="nav-sub">${paper.sections
          .map(
            (s) =>
              `<a class="${s.id === activeSid ? "active" : ""}" href="#/practice/${paper.id}/${s.id}">
                <span>${esc(s.short)}</span>${isDone(s.id) ? '<span class="tick">✓</span>' : ""}
              </a>`
          )
          .join("")}</div>` : ""}
      </div>`;
    });

    html += `<div class="nav-group" style="margin-top:10px">
      <a class="nav-link ${isVocab ? "active" : ""}" href="#/vocab">
        <span class="n-ico">☆</span><span>生词本</span>
        <span class="spacer"></span>
        <span class="badge">${Object.keys(state.vocab).length}</span>
      </a>
      <a class="nav-link ${isAbout ? "active" : ""}" href="#/about">
        <span class="n-ico">ⓘ</span><span>关于与数据说明</span>
      </a>
    </div>`;

    nav.innerHTML = html;
  }

  /* ---------------- 路由 ---------------- */
  function parseHash() {
    const raw = (location.hash || "#/").replace(/^#/, "");
    const parts = raw.split("/").filter(Boolean);
    return { parts, path: "/" + parts.join("/") };
  }

  function setCrumbs(items) {
    const crumbs = $("#crumbs");
    if (!crumbs) return;
    crumbs.innerHTML = items
      .map((item, i) => {
        const inner = item.href
          ? `<a href="${item.href}">${esc(item.label)}</a>`
          : `<span>${esc(item.label)}</span>`;
        return (i ? '<span class="sep">/</span>' : "") + inner;
      })
      .join("");
  }

  function router() {
    closeSidebar();
    const { parts } = parseHash();
    renderNav();
    updateGlobalProgress();

    if (parts[0] === "paper") return renderPaper(parts[1]);
    if (parts[0] === "practice") return renderPractice(parts[1], parts[2]);
    if (parts[0] === "type") return renderType(parts[1]);
    if (parts[0] === "vocab") return renderVocabPage();
    if (parts[0] === "about") return renderAbout();
    return renderHome();
  }

  function mount(html) {
    const app = $("#app");
    app.innerHTML = html;
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    setCrumbs([{ label: "首页" }]);
    const done = PAPERS.reduce((n, p) => n + p.sections.filter((s) => isDone(s.id)).length, 0);
    const total = exerciseTotal();
    const pct = Math.round((done / total) * 100);
    const rate = correctRate();
    const obj = objectiveDone();
    const recent = Object.keys(state.progress)
      .map((sid) => ({ sid, info: findSectionById(sid), p: state.progress[sid] }))
      .filter((x) => x.info && x.p && x.p.submitted)
      .sort((a, b) => (b.p.at || 0) - (a.p.at || 0))
      .slice(0, 5);

    mount(`
      <section class="hero">
        <div class="eyebrow">CET-4 · 2021.6 – 2026.6 真题全集</div>
        <h1>大学英语四级真题训练</h1>
        <p class="lead">覆盖五年考期 ${PAPERS.length} 套真题，把“做题—复盘—背词”放进同一条流程：在线作答、即时判分、AI 批改作文与翻译，每个模块结束后自动沉淀本模块高频词。</p>
        <div class="hero-meta">
          <span class="badge primary">${PAPERS.length} 套真题</span>
          <span class="badge">${PAPERS.reduce((n, p) => n + p.sections.filter((s) => ["cloze", "matching", "reading"].includes(s.type)).reduce((m, s) => m + questionList(s).length, 0), 0)} 道客观题</span>
          <span class="badge">写作 + 翻译 AI 批改</span>
          <span class="badge">不含听力</span>
        </div>
        <div class="hero-actions">
          <a class="btn primary" href="#/practice/2026-06-1/writing-1">从卷 1 开始 →</a>
          <a class="btn" href="#/practice/2026-06-1/cloze-1">直接做选词填空</a>
          <a class="btn" href="#/vocab">复习生词本</a>
        </div>
      </section>

      <div class="stat-grid">
        <div class="stat"><div class="k">整体完成度</div><div class="v">${pct}<small>%</small></div></div>
        <div class="stat"><div class="k">客观题正确率</div><div class="v">${rate}<small>%</small></div></div>
        <div class="stat"><div class="k">客观题得分</div><div class="v">${obj.score}<small> / ${obj.total}</small></div></div>
        <div class="stat"><div class="k">生词本</div><div class="v">${Object.keys(state.vocab).length}<small> 词</small></div></div>
      </div>

      <div class="section-head"><h2>真题套卷</h2><span>点击展开套卷，或直接进入某个模块</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>套卷</th><th>主题</th><th>模块进度</th><th>状态</th><th></th></tr></thead>
          <tbody>
            ${PAPERS.map((paper, idx) => {
              const d = paper.sections.filter((s) => isDone(s.id)).length;
              const pp = Math.round((d / paper.sections.length) * 100);
              const yearHead = idx === 0 || PAPERS[idx - 1].date.slice(0, 4) !== paper.date.slice(0, 4)
                ? `<tr class="year-row"><td colspan="5">${paper.date.slice(0, 4)} 年考期</td></tr>`
                : "";
              return `${yearHead}<tr>
                <td><a class="paper-name" href="#/paper/${paper.id}">${esc(paper.label)}</a><span class="paper-theme">${esc(paper.theme)}</span></td>
                <td>${paper.sections.length} 个模块</td>
                <td><div class="mini-bar"><i style="width:${pp}%"></i></div><span class="small muted">${d}/${paper.sections.length}</span></td>
                <td>${d === paper.sections.length ? '<span class="badge done">已完成</span>' : d ? '<span class="badge warn">进行中</span>' : '<span class="badge">未开始</span>'}</td>
                <td style="text-align:right"><a class="btn sm" href="#/paper/${paper.id}">查看</a></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>

      <div class="section-head"><h2>按题型训练</h2><span>词汇与 AI 批改已嵌入各题型</span></div>
      <div class="paper-grid">
        ${Object.keys(TYPE_META).map((type) => {
          const meta = TYPE_META[type];
          return `<a class="info-card" href="#/type/${type}" style="color:inherit">
            <div style="font-size:20px;color:var(--primary);margin-bottom:4px">${meta.icon}</div>
            <div class="v">${meta.label}</div>
            <div class="k" style="text-transform:none;letter-spacing:0">${meta.desc}</div>
          </a>`;
        }).join("")}
      </div>

      <div class="callout">
        <span class="ci">✦</span>
        <div>
          <p><strong>词汇是“渗透式”的：</strong>阅读文章中的蓝色词可点击查义；每做完一个模块，结果页会汇总该模块的高频词，可一键加入生词本，再用间隔复习卡片巩固。没有单独的“背单词”任务。</p>
          <p><strong>AI 批改：</strong>写作与翻译支持 OpenAI 兼容接口（DeepSeek / OpenAI / 自定义）。不填 API Key 也能用，系统会用本地规则给出评分与修改建议。</p>
        </div>
      </div>

      ${recent.length ? `<div class="section-head"><h2>最近练习</h2><span>本地保存，仅自己可见</span></div>
      <div class="recent-list">
        ${recent.map((x) => `<div class="recent-item">
          <span class="badge primary">${TYPE_META[x.info.section.type].label}</span>
          <span class="r-title">${esc(x.info.paper.label)} · ${esc(x.info.section.title)}</span>
          <span class="muted">${x.p.total ? `${x.p.score}/${x.p.total}` : `${x.p.score}/15`} 分</span>
          <time>${formatTime(x.p.at)}</time>
          <a class="btn sm" href="#/practice/${x.info.paper.id}/${x.info.section.id}">回顾</a>
        </div>`).join("")}
      </div>` : ""}
    `);
  }

  function formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /* ---------------- 试卷页 ---------------- */
  function renderPaper(pid) {
    const paper = getPaper(pid);
    if (!paper) return renderNotFound();
    setCrumbs([{ label: "首页", href: "#/" }, { label: paper.label }]);
    const done = paper.sections.filter((s) => isDone(s.id)).length;
    const pct = Math.round((done / paper.sections.length) * 100);
    const minutes = paper.sections.reduce((n, s) => n + (s.minutes || 0), 0);
    const vocab = collectVocab(paper.sections);

    mount(`
      <div class="page-head">
        <span class="badge primary">${paper.date.slice(0, 4)} 年 ${parseInt(paper.date.slice(5, 7), 10)} 月 · 真题</span>
        <h1>${esc(paper.label)}</h1>
        <p class="sub">${esc(paper.theme)}</p>
        <div class="paper-meta-row">
          <span class="badge">${paper.sections.length} 个模块</span>
          <span class="badge">建议 ${minutes} 分钟</span>
          <span class="badge ${done === paper.sections.length ? "done" : ""}">完成 ${done}/${paper.sections.length}</span>
          <span class="badge">${vocab.length} 个高频词</span>
        </div>
      </div>

      <div class="section-list">
        ${paper.sections.map((s) => {
          const meta = TYPE_META[s.type];
          const d = isDone(s.id);
          const p = state.progress[s.id];
          return `<div class="section-row">
            <div class="s-ico">${meta.icon}</div>
            <div class="s-main">
              <div class="s-title">${esc(s.title)}</div>
              <div class="s-desc">${meta.desc} · ${s.type === "writing" || s.type === "translation" ? "建议 " + s.minutes + " 分钟" : questionList(s).length + " 题 · 建议 " + s.minutes + " 分钟"}</div>
            </div>
            <div class="s-right">
              ${d ? `<span class="badge done">${p.total ? p.score + "/" + p.total : p.score + "/15"}</span>` : ""}
              <a class="btn ${d ? "" : "primary"} sm" href="#/practice/${paper.id}/${s.id}">${d ? "回顾" : "开始"}</a>
            </div>
          </div>`;
        }).join("")}
      </div>

      <div class="result" style="margin-top:26px">
        <div class="result-head">
          <div class="score-ring" style="--pct:${pct}"><span>${done}/${paper.sections.length}</span></div>
          <div>
            <div class="result-title">${pct === 100 ? "本卷已完成" : pct ? "正在推进" : "尚未开始"}</div>
            <div class="result-sub">完成 ${done} 个模块 · 共 ${paper.sections.length} 个模块</div>
          </div>
        </div>
        <div class="vocab-summary">
          <h3>本卷高频词 <span class="badge">${vocab.length}</span></h3>
          <p class="small muted">点击词汇查看释义，或直接收藏到生词本。</p>
          <div class="vocab-chips">
            ${vocab.map((v) => vocabChip(v)).join("")}
          </div>
        </div>
      </div>
    `);

    bindVocabChips();
  }

  function collectVocab(sections) {
    const map = new Map();
    sections.forEach((s) => {
      (s.vocab || []).forEach((v) => {
        if (!map.has(v.word)) map.set(v.word, v);
      });
    });
    return Array.from(map.values());
  }

  function vocabChip(v) {
    const saved = !!state.vocab[v.word];
    return `<button class="vocab-chip ${saved ? "saved" : ""}" data-word="${esc(v.word)}">
      <b>${esc(v.word)}</b><span>${esc(v.cn)}</span><span class="plus">${saved ? "✓" : "+"}</span>
    </button>`;
  }

  function bindVocabChips() {
    $$(".vocab-chip").forEach((btn) => {
      btn.addEventListener("click", () => openWordModal(btn.dataset.word));
    });
  }

  /* ---------------- 题型列表页 ---------------- */
  function renderType(type) {
    const meta = TYPE_META[type];
    if (!meta) return renderNotFound();
    setCrumbs([{ label: "首页", href: "#/" }, { label: meta.label }]);
    const items = [];
    PAPERS.forEach((paper) => {
      paper.sections.forEach((s) => {
        if (s.type === type) items.push({ paper, section: s });
      });
    });

    mount(`
      <div class="page-head">
        <span class="badge primary">按题型训练</span>
        <h1>${meta.label}</h1>
        <p class="sub">${meta.desc}。共 ${items.length} 个练习，来自 ${PAPERS.length} 套历年真题。</p>
      </div>
      <div class="section-list">
        ${items.map(({ paper, section }) => {
          const d = isDone(section.id);
          const p = state.progress[section.id];
          return `<div class="section-row">
            <div class="s-ico">${meta.icon}</div>
            <div class="s-main">
              <div class="s-title">${esc(paper.label)} · ${esc(section.title)}</div>
              <div class="s-desc">${section.type === "writing" || section.type === "translation" ? "主观题 · 建议 " + section.minutes + " 分钟" : questionList(section).length + " 题 · 建议 " + section.minutes + " 分钟"}</div>
            </div>
            <div class="s-right">
              ${d ? `<span class="badge done">${p.total ? p.score + "/" + p.total : p.score + "/15"}</span>` : ""}
              <a class="btn ${d ? "" : "primary"} sm" href="#/practice/${paper.id}/${section.id}">${d ? "回顾" : "开始"}</a>
            </div>
          </div>`;
        }).join("")}
      </div>
    `);
  }

  /* ---------------- 练习页 ---------------- */
  function renderPractice(pid, sid) {
    const found = getSection(pid, sid);
    if (!found) return renderNotFound();
    const { paper, section } = found;
    const meta = TYPE_META[section.type];
    const qTotal = questionList(section).length;
    setCrumbs([
      { label: "首页", href: "#/" },
      { label: paper.short, href: "#/paper/" + paper.id },
      { label: meta.label }
    ]);
    renderNav();

    const pageHead = `
      <div class="practice-head">
        <span class="badge primary">${esc(paper.label)}</span>
        <h1>${esc(section.title)}</h1>
        <div class="meta">
          <span>${meta.desc}</span>
          <span>${qTotal ? qTotal + " 题" : "主观题"}</span>
          <span>建议 ${section.minutes} 分钟</span>
          ${isDone(section.id) ? '<span style="color:var(--green)">已完成 · 可重做</span>' : ""}
        </div>
      </div>
      <div class="directions"><strong>Directions:</strong> ${esc(DIRECTIONS[section.type])}</div>
    `;

    let body = "";
    if (section.type === "cloze") body = clozeHTML(section);
    else if (section.type === "matching") body = matchingHTML(section);
    else if (section.type === "reading") body = readingHTML(section);
    else if (section.type === "writing") body = writingHTML(section);
    else if (section.type === "translation") body = translationHTML(section);

    mount(pageHead + body + navFooter(paper, section));

    if (section.type === "cloze") bindCloze(section, paper);
    else if (section.type === "matching") bindMatching(section, paper);
    else if (section.type === "reading") bindReading(section, paper);
    else if (section.type === "writing") bindWriting(section, paper);
    else if (section.type === "translation") bindTranslation(section, paper);

    bindVocabChips();
    hydrateWordHighlights();
    if (isDone(section.id)) restoreSubmitted(section);
  }

  function navFooter(paper, section) {
    const idx = paper.sections.findIndex((s) => s.id === section.id);
    const prev = paper.sections[idx - 1];
    const next = paper.sections[idx + 1];
    return `<div class="action-bar" style="margin-top:26px">
      ${prev ? `<a class="btn" href="#/practice/${paper.id}/${prev.id}">← ${esc(prev.short)}</a>` : `<a class="btn" href="#/paper/${paper.id}">← 返回套卷</a>`}
      ${next ? `<a class="btn" href="#/practice/${paper.id}/${next.id}">下一模块：${esc(next.short)} →</a>` : `<a class="btn" href="#/vocab">去生词本复习 →</a>`}
    </div>`;
  }

  /* ---------- 选词填空 ---------- */
  function clozeHTML(section) {
    const paras = section.passage.split(/\n\n+/);
    const draft = state.drafts[section.id] || {};
    return `<div class="card">
      <div class="cloze-passage">
        ${paras.map((p) => `<p>${renderClozeParagraph(p, section, draft)}</p>`).join("")}
      </div>
      <div class="bank">
        ${section.bank.map((b) => `<span class="word-chip" data-key="${b.key}"><b>${b.key}</b>${esc(b.word)}</span>`).join("")}
      </div>
      <div class="action-bar">
        <button class="btn" id="resetBtn">重置</button>
        <button class="btn primary" id="submitBtn">提交答案</button>
        <span class="hint">同一词只能使用一次 · 提交后立即判分</span>
      </div>
    </div>
    <div id="resultHost"></div>`;
  }

  function renderClozeParagraph(text, section, draft) {
    const re = /\[\[(\d+)\]\]/g;
    let html = "";
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      html += highlightText(text.slice(last, m.index), section.vocab);
      const no = m[1];
      const val = draft[no] || "";
      html += `<span class="blank" data-q="${no}"><span class="b-no">${no}</span><select data-q="${no}" aria-label="第 ${no} 空">
        <option value="">—</option>
        ${section.bank.map((b) => `<option value="${b.key}" ${val === b.key ? "selected" : ""}>${b.key}) ${esc(b.word)}</option>`).join("")}
      </select></span>`;
      last = re.lastIndex;
    }
    html += highlightText(text.slice(last), section.vocab);
    return html;
  }

  function bindCloze(section, paper) {
    const selects = $$(".cloze-passage select");
    const updateBank = () => {
      const used = new Set(selects.map((s) => s.value).filter(Boolean));
      $$(".bank .word-chip").forEach((chip) => {
        chip.classList.toggle("used", used.has(chip.dataset.key));
      });
      selects.forEach((s) => s.classList.toggle("answered", !!s.value));
    };
    selects.forEach((sel) => {
      sel.addEventListener("change", () => {
        const draft = {};
        selects.forEach((s) => { if (s.value) draft[s.dataset.q] = s.value; });
        saveDraft(section.id, draft);
        updateBank();
      });
    });
    updateBank();

    $("#resetBtn").addEventListener("click", () => resetExercise(section, paper));
    $("#submitBtn").addEventListener("click", () => {
      const answers = {};
      selects.forEach((s) => { answers[s.dataset.q] = s.value; });
      const unanswered = section.questions.filter((q) => !answers[q.id]).length;
      if (unanswered && !confirm(`还有 ${unanswered} 题未作答，确定提交吗？`)) return;
      let score = 0;
      section.questions.forEach((q) => { if (answers[q.id] === q.answer) score++; });
      submitObjective(section, paper, answers, score);
    });
  }

  /* ---------- 长篇阅读 ---------- */
  function matchingHTML(section) {
    const draft = state.drafts[section.id] || {};
    return `<div class="card">
      <div class="article">
        <h3>${esc(section.passageTitle)}</h3>
        ${section.paragraphs.map((p) => `<div class="para"><span class="pl">${p.label}</span><p>${highlightText(p.text, section.vocab)}</p></div>`).join("")}
      </div>
      <div class="match-list">
        ${section.questions.map((q) => `<div class="match-item" data-q="${q.id}">
          <span class="q-no">${q.id}</span>
          <span class="q-text">${esc(q.stem)}</span>
          <select data-q="${q.id}" aria-label="第 ${q.id} 题">
            <option value="">选择</option>
            ${section.paragraphs.map((p) => `<option value="${p.label}" ${draft[q.id] === p.label ? "selected" : ""}>${p.label}</option>`).join("")}
          </select>
          <div class="q-fb"></div>
        </div>`).join("")}
      </div>
      <div class="action-bar">
        <button class="btn" id="resetBtn">重置</button>
        <button class="btn primary" id="submitBtn">提交答案</button>
        <span class="hint">段落可重复选择</span>
      </div>
    </div>
    <div id="resultHost"></div>`;
  }

  function bindMatching(section, paper) {
    const selects = $$(".match-list select");
    selects.forEach((sel) => {
      sel.addEventListener("change", () => {
        const draft = {};
        selects.forEach((s) => { if (s.value) draft[s.dataset.q] = s.value; });
        saveDraft(section.id, draft);
      });
    });
    $("#resetBtn").addEventListener("click", () => resetExercise(section, paper));
    $("#submitBtn").addEventListener("click", () => {
      const answers = {};
      selects.forEach((s) => { answers[s.dataset.q] = s.value; });
      const unanswered = section.questions.filter((q) => !answers[q.id]).length;
      if (unanswered && !confirm(`还有 ${unanswered} 题未作答，确定提交吗？`)) return;
      let score = 0;
      section.questions.forEach((q) => { if (answers[q.id] === q.answer) score++; });
      submitObjective(section, paper, answers, score);
    });
  }

  /* ---------- 仔细阅读 ---------- */
  function readingHTML(section) {
    const draft = state.drafts[section.id] || {};
    return `<div class="card">
      ${section.passages.map((p) => `<div class="passage-block">
        <h3>${esc(p.title)}</h3>
        <div class="article">${p.text.split(/\n\n+/).map((t) => `<p>${highlightText(t, section.vocab)}</p>`).join("")}</div>
        <div class="mcq-list" style="margin-top:18px">
          ${p.questions.map((q) => `<div class="mcq" data-q="${q.id}">
            <div class="stem"><span class="q-no">${q.id}.</span>${esc(q.stem)}</div>
            ${q.options.map((o) => `<label class="option" data-key="${o.key}">
              <input type="radio" name="q-${q.id}" value="${o.key}" ${draft[q.id] === o.key ? "checked" : ""}>
              <span><span class="ok">${o.key})</span>${esc(o.text)}</span>
            </label>`).join("")}
            <div class="explain"></div>
          </div>`).join("")}
        </div>
      </div>`).join("")}
      <div class="action-bar">
        <button class="btn" id="resetBtn">重置</button>
        <button class="btn primary" id="submitBtn">提交答案</button>
        <span class="hint">共 ${section.passages.reduce((n, p) => n + p.questions.length, 0)} 题</span>
      </div>
    </div>
    <div id="resultHost"></div>`;
  }

  function bindReading(section, paper) {
    $$(".mcq input[type=radio]").forEach((input) => {
      input.addEventListener("change", () => {
        const draft = {};
        $$(".mcq").forEach((mcq) => {
          const checked = mcq.querySelector("input:checked");
          if (checked) draft[mcq.dataset.q] = checked.value;
        });
        saveDraft(section.id, draft);
      });
    });
    $("#resetBtn").addEventListener("click", () => resetExercise(section, paper));
    $("#submitBtn").addEventListener("click", () => {
      const answers = {};
      $$(".mcq").forEach((mcq) => {
        const checked = mcq.querySelector("input:checked");
        answers[mcq.dataset.q] = checked ? checked.value : "";
      });
      const all = questionList(section);
      const unanswered = all.filter((q) => !answers[q.id]).length;
      if (unanswered && !confirm(`还有 ${unanswered} 题未作答，确定提交吗？`)) return;
      let score = 0;
      all.forEach((q) => { if (answers[q.id] === q.answer) score++; });
      submitObjective(section, paper, answers, score);
    });
  }

  /* ---------- 写作 ---------- */
  function writingHTML(section) {
    const draft = state.drafts[section.id] || "";
    return `<div class="card">
      <div class="prompt-en">${highlightText(section.promptEn, section.vocab)}</div>
      <p class="prompt-zh">${esc(section.promptZh)}</p>
      <textarea id="essayInput" placeholder="Write your essay here... (建议 120–180 词)">${esc(draft)}</textarea>
      <div class="answer-toolbar">
        <button class="btn" id="clearBtn">清空</button>
        <button class="btn primary" id="gradeBtn">AI 批改</button>
        <span class="word-count" id="wordCount">0 / 120–180 词</span>
      </div>
    </div>
    <div id="resultHost"></div>
    <details class="reference">
      <summary>查看参考范文（建议先自己写完再看）</summary>
      <div class="ref-body">
        ${section.modelEssay.split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join("")}
        <div class="revision" style="margin-top:12px">${esc(section.modelEssayZh)}</div>
      </div>
    </details>`;
  }

  function bindWriting(section, paper) {
    const textarea = $("#essayInput");
    const count = $("#wordCount");
    const update = () => {
      const n = wordCount(textarea.value);
      count.textContent = `${n} / 120–180 词`;
      count.className = "word-count" + (n >= 120 && n <= 180 ? " ok" : n > 180 ? " over" : "");
    };
    update();
    let timer = null;
    textarea.addEventListener("input", () => {
      update();
      clearTimeout(timer);
      timer = setTimeout(() => saveDraft(section.id, textarea.value), 350);
    });
    $("#clearBtn").addEventListener("click", () => {
      if (!textarea.value || confirm("确定清空当前作文吗？")) {
        textarea.value = "";
        saveDraft(section.id, "");
        update();
      }
    });
    $("#gradeBtn").addEventListener("click", async () => {
      const text = textarea.value.trim();
      if (wordCount(text) < 40) return toast("至少写 40 词再提交批改");
      const btn = $("#gradeBtn");
      btn.disabled = true;
      btn.textContent = "批改中…";
      try {
        const grade = await gradeAnswer("writing", section, text);
        saveSubjectResult(section, text, grade);
        renderGradeResult(section, grade);
        toast(grade.engine === "ai" ? "AI 批改完成" : "已生成本地评分");
      } catch (e) {
        console.error(e);
        toast("批改失败，请稍后重试");
      } finally {
        btn.disabled = false;
        btn.textContent = "AI 批改";
      }
    });
  }

  /* ---------- 翻译 ---------- */
  function translationHTML(section) {
    const draft = state.drafts[section.id] || "";
    return `<div class="card">
      <div class="original-text">
        <h3 style="margin-bottom:8px">原文</h3>
        <blockquote class="prompt-en" style="border-left-color:var(--accent)">${esc(section.original)}</blockquote>
      </div>
      <div style="margin-top:18px">
        <textarea id="essayInput" placeholder="Translate the passage into English...">${esc(draft)}</textarea>
        <div class="answer-toolbar">
          <button class="btn" id="clearBtn">清空</button>
          <button class="btn primary" id="gradeBtn">AI 批改</button>
          <span class="word-count" id="wordCount">0 词</span>
        </div>
      </div>
      <div class="vocab-summary" style="border-top:1px dashed var(--line);margin-top:20px">
        <h3>本题关键表达 <span class="badge">先试着译出来</span></h3>
        <div class="vocab-chips">
          ${section.keyPhrases.map((k) => `<span class="vocab-chip" title="${esc(k.en)}"><b>${esc(k.cn)}</b><span>点击查看</span></span>`).join("")}
        </div>
      </div>
    </div>
    <div id="resultHost"></div>
    <details class="reference">
      <summary>查看参考译文</summary>
      <div class="ref-body">${section.reference.split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join("")}</div>
    </details>`;
  }

  function bindTranslation(section, paper) {
    const textarea = $("#essayInput");
    const count = $("#wordCount");
    const update = () => {
      const n = wordCount(textarea.value);
      const cn = (textarea.value.match(/[\u4e00-\u9fa5]/g) || []).length;
      count.textContent = `${n} 词` + (cn ? ` · 仍有 ${cn} 个中文字符` : "");
      count.className = "word-count" + (cn ? " over" : "");
    };
    update();
    let timer = null;
    textarea.addEventListener("input", () => {
      update();
      clearTimeout(timer);
      timer = setTimeout(() => saveDraft(section.id, textarea.value), 350);
    });
    $("#clearBtn").addEventListener("click", () => {
      if (!textarea.value || confirm("确定清空当前译文吗？")) {
        textarea.value = "";
        saveDraft(section.id, "");
        update();
      }
    });
    $("#gradeBtn").addEventListener("click", async () => {
      const text = textarea.value.trim();
      if (wordCount(text) < 20) return toast("至少写 20 词再提交批改");
      const btn = $("#gradeBtn");
      btn.disabled = true;
      btn.textContent = "批改中…";
      try {
        const grade = await gradeAnswer("translation", section, text);
        saveSubjectResult(section, text, grade);
        renderGradeResult(section, grade);
        toast(grade.engine === "ai" ? "AI 批改完成" : "已生成本地评分");
      } catch (e) {
        console.error(e);
        toast("批改失败，请稍后重试");
      } finally {
        btn.disabled = false;
        btn.textContent = "AI 批改";
      }
    });

    // 关键表达点击显示英文
    $$(".vocab-chips .vocab-chip").forEach((chip, i) => {
      chip.addEventListener("click", () => {
        const k = section.keyPhrases[i];
        if (k) toast(k.en);
      });
    });
  }

  /* ---------------- 判分与结果 ---------------- */
  function submitObjective(section, paper, answers, score) {
    const total = questionList(section).length;
    state.progress[section.id] = {
      submitted: true,
      score,
      total,
      answers,
      at: Date.now()
    };
    saveProgress();
    delete state.drafts[section.id];
    save(LS.drafts, state.drafts);
    paintObjectiveFeedback(section, answers);
    const host = $("#resultHost");
    if (host) host.innerHTML = objectiveResultHTML(section, paper, answers, score, total);
    bindResultEvents(section, paper);
    host.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function paintObjectiveFeedback(section, answers) {
    if (section.type === "cloze") {
      $$(".cloze-passage .blank").forEach((blank) => {
        const qid = blank.dataset.q;
        const q = section.questions.find((x) => String(x.id) === String(qid));
        const sel = blank.querySelector("select");
        blank.classList.remove("correct", "wrong");
        if (!q) return;
        sel.value = answers[qid] || "";
        if (sel.value === q.answer) blank.classList.add("correct");
        else blank.classList.add("wrong");
        sel.disabled = true;
      });
      $$(".bank .word-chip").forEach((c) => c.classList.add("used"));
    } else if (section.type === "matching") {
      $$(".match-item").forEach((item) => {
        const qid = item.dataset.q;
        const q = section.questions.find((x) => String(x.id) === String(qid));
        const sel = item.querySelector("select");
        sel.value = answers[qid] || "";
        item.classList.add("show-fb");
        item.classList.remove("correct", "wrong");
        item.classList.add(sel.value === q.answer ? "correct" : "wrong");
        sel.disabled = true;
        item.querySelector(".q-fb").innerHTML = `<b>答案：${q.answer}</b> · ${esc(q.explanation)}`;
      });
    } else if (section.type === "reading") {
      $$(".mcq").forEach((mcq) => {
        const qid = mcq.dataset.q;
        const all = questionList(section);
        const q = all.find((x) => String(x.id) === String(qid));
        const chosen = answers[qid];
        mcq.querySelectorAll(".option").forEach((opt) => {
          const key = opt.dataset.key;
          opt.classList.remove("correct", "wrong");
          if (key === q.answer) opt.classList.add("correct");
          if (chosen && key === chosen && chosen !== q.answer) opt.classList.add("wrong");
          const input = opt.querySelector("input");
          if (input) {
            input.checked = chosen === key;
            input.disabled = true;
          }
        });
        const ex = mcq.querySelector(".explain");
        ex.classList.add("show");
        ex.innerHTML = `<b>正确答案：${q.answer}</b> · ${esc(q.explanation)}`;
      });
    }
  }

  function objectiveResultHTML(section, paper, answers, score, total) {
    const pct = Math.round((score / total) * 100);
    const wrong = section.questions
      ? section.questions.filter((q) => answers[q.id] !== q.answer)
      : section.passages.reduce((arr, p) => arr.concat(p.questions), []).filter((q) => answers[q.id] !== q.answer);
    const next = paper.sections[paper.sections.findIndex((s) => s.id === section.id) + 1];

    return `<div class="result">
      <div class="result-head">
        <div class="score-ring" style="--pct:${pct}"><span>${score}/${total}</span></div>
        <div>
          <div class="result-title">${pct === 100 ? "全对，漂亮！" : pct >= 80 ? "完成得不错" : pct >= 60 ? "基础尚可，回看错题" : "需要重点复盘"}</div>
          <div class="result-sub">正确率 ${pct}% · 做错 ${wrong.length} 题 · 已自动保存进度</div>
        </div>
      </div>

      ${wrong.length ? `<div class="wrong-list">
        <h3 style="font-size:14.5px;margin-bottom:8px">错题回看</h3>
        ${wrong.map((q) => {
          const qid = q.id;
          const your = answers[qid] || "未作答";
          return `<div class="wrong-item">
            <b>${qid}</b> 你的答案：${esc(your)} · <span class="wa">正确答案：${q.answer}</span>
            <div style="margin-top:3px">${esc(q.explanation || "")}</div>
          </div>`;
        }).join("")}
      </div>` : ""}

      ${objectiveExplainList(section)}
      ${vocabSummaryHTML(section)}

      <div class="action-bar" style="margin-top:18px">
        <button class="btn" id="redoBtn">再做一次</button>
        ${next ? `<a class="btn" href="#/practice/${paper.id}/${next.id}">下一模块：${esc(next.short)} →</a>` : `<a class="btn" href="#/vocab">去生词本 →</a>`}
        <a class="btn" href="#/paper/${paper.id}">返回套卷</a>
      </div>
    </div>`;
  }

  function objectiveExplainList(section) {
    if (section.type === "cloze") {
      return `<details class="reference" style="margin-top:16px">
        <summary>逐题解析（10 题）</summary>
        <div class="ref-body">
          ${section.questions.map((q) => {
            const word = (section.bank.find((b) => b.key === q.answer) || {}).word || "";
            return `<p><b>${q.id}. ${q.answer}) ${esc(word)}</b> —— ${esc(q.explanation)}</p>`;
          }).join("")}
        </div>
      </details>`;
    }
    if (section.type === "matching") {
      return `<details class="reference" style="margin-top:16px">
        <summary>逐题定位（10 题）</summary>
        <div class="ref-body">
          ${section.questions.map((q) => `<p><b>${q.id}. ${q.answer}</b> —— ${esc(q.explanation)}</p>`).join("")}
        </div>
      </details>`;
    }
    if (section.type === "reading") {
      return `<details class="reference" style="margin-top:16px">
        <summary>逐题解析（10 题）</summary>
        <div class="ref-body">
          ${section.passages.map((p) => p.questions.map((q) => `<p><b>${q.id}. ${q.answer}</b> —— ${esc(q.explanation)}</p>`).join("")).join("")}
        </div>
      </details>`;
    }
    return "";
  }

  function vocabSummaryHTML(section) {
    const vocab = section.vocab || [];
    if (!vocab.length) return "";
    return `<div class="vocab-summary">
      <h3>本模块高频词 <span class="badge">${vocab.length}</span> <span class="badge">点击可查义</span></h3>
      <p class="small muted">这些词来自本篇材料，建议结合原句记忆，而不是孤立背诵。</p>
      <div class="vocab-chips">${vocab.map((v) => vocabChip(v)).join("")}</div>
      <div class="vocab-actions">
        <button class="btn sm" id="saveAllVocab">一键收藏本模块词汇</button>
        <a class="btn sm" href="#/vocab">去生词本复习</a>
      </div>
    </div>`;
  }

  function bindResultEvents(section, paper) {
    const redo = $("#redoBtn");
    if (redo) redo.addEventListener("click", () => resetExercise(section, paper));
    const saveAll = $("#saveAllVocab");
    if (saveAll) {
      saveAll.addEventListener("click", () => {
        let n = 0;
        (section.vocab || []).forEach((v) => {
          if (!state.vocab[v.word]) {
            state.vocab[v.word] = { ...v, addedAt: Date.now(), mastered: false };
            n++;
          }
        });
        saveVocab();
        $$(".vocab-chip").forEach((chip) => {
          if (state.vocab[chip.dataset.word]) chip.classList.add("saved");
        });
        toast(n ? `已收藏 ${n} 个词` : "本模块词汇已在生词本中");
      });
    }
    bindVocabChips();
  }

  function resetExercise(section, paper) {
    if (!confirm("重置后本次作答与得分将被清除，确定继续吗？")) return;
    delete state.progress[section.id];
    delete state.drafts[section.id];
    save(LS.progress, state.progress);
    save(LS.drafts, state.drafts);
    router();
    toast("已重置，可以重新作答");
  }

  function restoreSubmitted(section) {
    const p = state.progress[section.id];
    if (!p || !p.submitted) return;
    if (["cloze", "matching", "reading"].includes(section.type)) {
      paintObjectiveFeedback(section, p.answers || {});
      const found = findSectionById(section.id);
      const host = $("#resultHost");
      if (found && host) {
        host.innerHTML = objectiveResultHTML(found.section, found.paper, p.answers || {}, p.score, p.total);
        bindResultEvents(found.section, found.paper);
      }
    } else {
      if (p.grade) renderGradeResult(section, p.grade);
    }
  }

  /* ---------------- 主观题评分 ---------------- */
  function wordCount(text) {
    const t = String(text || "").trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function saveSubjectResult(section, text, grade) {
    state.progress[section.id] = {
      submitted: true,
      score: grade.total,
      total: 15,
      text,
      grade,
      engine: grade.engine,
      at: Date.now()
    };
    saveProgress();
    saveDraft(section.id, text);
  }

  async function gradeAnswer(kind, section, text) {
    const cfg = state.settings;
    if (!cfg.apiKey || !cfg.baseUrl || !cfg.model) {
      return localGrade(kind, section, text);
    }
    try {
      const prompt = buildGraderPrompt(kind, section);
      const content = await callChat(cfg, [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${prompt}\n\n【学生作答】\n${text}\n\n请严格输出 JSON。` }
      ]);
      const parsed = parseJSONLoose(content);
      if (!parsed) throw new Error("无法解析模型返回的 JSON");
      return normalizeGrade(parsed, "ai");
    } catch (e) {
      console.warn("AI 批改失败，回退本地评分：", e);
      const local = localGrade(kind, section, text);
      local.engine = "local";
      local.note = "AI 接口调用失败，已使用本地规则评分。" + (e.message ? "（" + e.message + "）" : "");
      return local;
    }
  }

  const SYSTEM_PROMPT =
    "你是一名经验丰富的大学英语四级阅卷老师。请严格、客观、按 15 分制评分，给出可执行的修改建议。只输出 JSON，不要输出 Markdown 代码块或任何解释性文字。";

  function buildGraderPrompt(kind, section) {
    if (kind === "writing") {
      return `请批改一篇大学英语四级作文。
【题目】
${section.promptEn}
【要求】120–180 词，切题、结构清晰、语言准确。
【评分维度】内容与切题 5 分；结构与连贯 4 分；语言准确性 4 分；词汇与句式 2 分。总分 15 分。
【输出 JSON 格式】
{
  "total": 数字,
  "dimensions": [{"name":"内容与切题","score":数字,"max":5},{"name":"结构与连贯","score":数字,"max":4},{"name":"语言准确性","score":数字,"max":4},{"name":"词汇与句式","score":数字,"max":2}],
  "strengths": ["2-3 条具体优点"],
  "improvements": ["2-4 条具体可执行的改进建议"],
  "revisions": [{"original":"原文中有问题的句子","suggested":"修改后的句子","reason":"中文说明"}]
}`;
    }
    return `请批改一段大学英语四级汉译英。
【中文原文】
${section.original}
【评分维度】信息完整 5 分；表达连贯 4 分；语法准确 4 分；词汇与句式 2 分。总分 15 分。
【输出 JSON 格式】
{
  "total": 数字,
  "dimensions": [{"name":"信息完整","score":数字,"max":5},{"name":"表达连贯","score":数字,"max":4},{"name":"语法准确","score":数字,"max":4},{"name":"词汇与句式","score":数字,"max":2}],
  "strengths": ["2-3 条具体优点"],
  "improvements": ["2-4 条具体可执行的改进建议"],
  "revisions": [{"original":"原文中有问题的表达","suggested":"修改后的表达","reason":"中文说明"}]
}`;
  }

  async function callChat(cfg, messages) {
    const url = /\/chat\/completions\/?$/.test(cfg.baseUrl)
      ? cfg.baseUrl.replace(/\/$/, "")
      : cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions";

    const baseBody = {
      model: cfg.model,
      temperature: 0.2,
      messages
    };

    let res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + cfg.apiKey
      },
      body: JSON.stringify({ ...baseBody, response_format: { type: "json_object" } })
    });

    if (!res.ok && (res.status === 400 || res.status === 422)) {
      // 部分兼容接口不支持 response_format，去掉后重试一次
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + cfg.apiKey
        },
        body: JSON.stringify(baseBody)
      });
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${detail ? " " + detail.slice(0, 120) : ""}`);
    }

    const json = await res.json();
    const content =
      json.choices && json.choices[0] && json.choices[0].message
        ? json.choices[0].message.content
        : "";
    if (!content) throw new Error("模型未返回内容");
    return content;
  }

  function parseJSONLoose(text) {
    if (!text) return null;
    let t = String(text).trim();
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      return JSON.parse(t);
    } catch (e) {
      const start = t.indexOf("{");
      const end = t.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try { return JSON.parse(t.slice(start, end + 1)); } catch (e2) { return null; }
      }
      return null;
    }
  }

  function clamp(n, min, max) {
    n = Number(n);
    if (!Number.isFinite(n)) n = min;
    return Math.max(min, Math.min(max, n));
  }

  function normalizeGrade(g, engine) {
    const dims = Array.isArray(g.dimensions) && g.dimensions.length
      ? g.dimensions.map((d) => ({
          name: String(d.name || "评分项"),
          score: Math.round(clamp(d.score, 0, Number(d.max) || 5) * 2) / 2,
          max: Number(d.max) || 5
        }))
      : [
          { name: "内容与切题", score: 3, max: 5 },
          { name: "结构与连贯", score: 2.5, max: 4 },
          { name: "语言准确性", score: 2.5, max: 4 },
          { name: "词汇与句式", score: 1, max: 2 }
        ];
    const total = clamp(g.total != null ? g.total : dims.reduce((n, d) => n + d.score, 0), 0, 15);
    return {
      engine: engine || "ai",
      total: Math.round(total * 2) / 2,
      dimensions: dims,
      strengths: Array.isArray(g.strengths) ? g.strengths.slice(0, 5).map(String) : [],
      improvements: Array.isArray(g.improvements) ? g.improvements.slice(0, 6).map(String) : [],
      revisions: Array.isArray(g.revisions)
        ? g.revisions.slice(0, 4).map((r) => ({
            original: String(r.original || ""),
            suggested: String(r.suggested || ""),
            reason: String(r.reason || "")
          }))
        : [],
      note: g.note || ""
    };
  }

  /* ---------- 本地评分兜底 ---------- */
  function localGrade(kind, section, text) {
    return kind === "writing" ? localWriting(section, text) : localTranslation(section, text);
  }

  function localWriting(section, text) {
    const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean) : [];
    const n = words.length;
    const lower = text.toLowerCase();
    const sents = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 3);
    const paras = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    const unique = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z']/g, "")).filter(Boolean));
    const ttr = unique.size / Math.max(n, 1);
    const transitions = (lower.match(/\b(first|second|third|moreover|however|therefore|in addition|besides|for one thing|for another|to sum up|in conclusion|finally|on the other hand|as a result)\b/g) || []).length;
    const longWords = words.filter((w) => w.replace(/[^a-zA-Z]/g, "").length >= 8).length;
    const avgLen = n / Math.max(sents.length, 1);
    const promptKeys = (section.promptEn.match(/\b[a-zA-Z]{5,}\b/g) || [])
      .map((w) => w.toLowerCase())
      .filter((w) => !["suppose", "university", "students", "write", "essay", "should", "words", "about", "there"].includes(w));
    const topicHits = Array.from(new Set(promptKeys)).filter((k) => lower.includes(k)).length;
    const lowercaseI = (text.match(/\bi\b/g) || []).length;
    const noPunct = !/[.!?]/.test(text);

    let content = 2.5;
    if (n >= 120 && n <= 180) content += 1;
    else if (n >= 100) content += 0.5;
    if (topicHits >= 2) content += 1;
    if (paras.length >= 2) content += 0.5;
    content = clamp(content, 0, 5);

    let structure = 2;
    if (paras.length >= 3) structure += 0.8;
    else if (paras.length === 2) structure += 0.4;
    structure += transitions >= 3 ? 1 : transitions >= 1 ? 0.5 : 0;
    structure = clamp(structure, 0, 4);

    let language = 2.5;
    if (n >= 80) language += 0.5;
    if (avgLen >= 10 && avgLen <= 24) language += 0.7;
    if (n >= 100) language += 0.3;
    if (lowercaseI) language -= Math.min(1, lowercaseI * 0.25);
    if (noPunct) language -= 0.5;
    if (/\b(very very|really really)\b/.test(lower)) language -= 0.3;
    language = clamp(language, 0, 4);

    let vocab = 0.8;
    if (ttr >= 0.5) vocab += 0.5;
    else if (ttr >= 0.42) vocab += 0.3;
    if (longWords / Math.max(n, 1) >= 0.12) vocab += 0.5;
    if (transitions >= 2) vocab += 0.2;
    vocab = clamp(vocab, 0, 2);

    const total = Math.round((content + structure + language + vocab) * 2) / 2;

    const strengths = [];
    const improvements = [];
    if (n >= 120 && n <= 180) strengths.push("词数符合 120–180 词的要求，篇幅控制得当。");
    if (paras.length >= 2) strengths.push(`段落结构清晰，共 ${paras.length} 段。`);
    if (transitions >= 2) strengths.push(`使用了 ${transitions} 处衔接表达，行文较连贯。`);
    if (ttr >= 0.45) strengths.push("用词有一定变化，重复率较低。");
    if (!strengths.length) strengths.push("已经完成成文，具备继续打磨的基础。");

    if (n < 120) improvements.push(`当前 ${n} 词，低于 120 词下限；建议补充一个具体例子或结果句。`);
    if (n > 180) improvements.push(`当前 ${n} 词，超过 180 词上限；删减重复表述，保留核心论证。`);
    if (paras.length < 2) improvements.push("建议分为 2–3 段：观点段、论证段、总结段。");
    if (transitions < 2) improvements.push("衔接词偏少，可加入 First / Moreover / However / To sum up 等信号词。");
    if (ttr < 0.42) improvements.push("重复用词较多，尝试用同义替换（如 important → vital / crucial）。");
    if (lowercaseI) improvements.push("人称代词 I 必须大写，请检查文中所有 i。");
    if (avgLen > 26) improvements.push("句子偏长，适当拆分，避免一句话包含过多从句。");
    if (avgLen < 9 && n > 60) improvements.push("句子偏短，可用定语从句或分词结构合并简单句。");
    if (!improvements.length) improvements.push("可进一步加入具体数据或例子，让论证更有说服力。");

    const revisions = [];
    if (/i think/i.test(text)) revisions.push({ original: "I think ...", suggested: "From my perspective, ...", reason: "避免口语化的 I think，使议论文语气更正式。" });
    if (/more and more/i.test(text)) revisions.push({ original: "more and more ...", suggested: "an increasing number of ...", reason: "更书面化的数量表达。" });
    if (/very important/i.test(text)) revisions.push({ original: "very important", suggested: "of great importance / vital", reason: "避免 very + 形容词的简单搭配。" });
    if (/a lot of/i.test(text)) revisions.push({ original: "a lot of ...", suggested: "a considerable amount of / numerous", reason: "提升词汇层次。" });
    if (!revisions.length) revisions.push({ original: "（示例）It is important for students to join activities.", suggested: "Participating in campus activities plays a vital role in students' all-round development.", reason: "用动名词作主语，句式更灵活，表达更具体。" });

    return {
      engine: "local",
      total,
      dimensions: [
        { name: "内容与切题", score: Math.round(content * 2) / 2, max: 5 },
        { name: "结构与连贯", score: Math.round(structure * 2) / 2, max: 4 },
        { name: "语言准确性", score: Math.round(language * 2) / 2, max: 4 },
        { name: "词汇与句式", score: Math.round(vocab * 2) / 2, max: 2 }
      ],
      strengths,
      improvements,
      revisions,
      note: "本地评分依据词数、段落、衔接词、词汇多样性与常见错误启发式生成，仅供参考；配置 AI 接口后可获得更细的语义点评。"
    };
  }

  function localTranslation(section, text) {
    const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean) : [];
    const n = words.length;
    const lower = text.toLowerCase();
    const cnLeft = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const sents = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 3);
    const unique = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z']/g, "")).filter(Boolean));
    const ttr = unique.size / Math.max(n, 1);

    const keyHits = section.keyPhrases.filter((k) => {
      const toks = k.en.toLowerCase().match(/[a-z]{4,}/g) || [];
      return toks.some((t) => lower.includes(t));
    }).length;
    const coverage = keyHits / Math.max(section.keyPhrases.length, 1);

    let content = 1.5 + coverage * 3.5;
    if (n >= 90) content += 0.4;
    if (cnLeft > 3) content -= Math.min(1.5, cnLeft * 0.05);
    content = clamp(content, 0, 5);

    let structure = 1.8;
    if (sents.length >= 5) structure += 0.9;
    else if (sents.length >= 3) structure += 0.5;
    if (/\b(which|that|who|when|while|because|although)\b/.test(lower)) structure += 0.5;
    if (n >= 90) structure += 0.4;
    structure = clamp(structure, 0, 4);

    let language = 2.3;
    if (n >= 90) language += 0.6;
    if (/[a-z]/.test(text) && /[.!?]/.test(text)) language += 0.3;
    if (cnLeft > 3) language -= Math.min(1.2, cnLeft * 0.04);
    if (/\s{3,}/.test(text)) language -= 0.2;
    language = clamp(language, 0, 4);

    let vocab = 0.7 + coverage * 0.9;
    if (ttr >= 0.5) vocab += 0.2;
    if (n >= 100) vocab += 0.1;
    vocab = clamp(vocab, 0, 2);

    const total = Math.round((content + structure + language + vocab) * 2) / 2;
    const missing = section.keyPhrases.filter((k) => {
      const toks = k.en.toLowerCase().match(/[a-z]{4,}/g) || [];
      return !toks.some((t) => lower.includes(t));
    }).slice(0, 4);

    const strengths = [];
    const improvements = [];
    if (coverage >= 0.5) strengths.push(`覆盖了约 ${Math.round(coverage * 100)}% 的关键表达，信息较完整。`);
    if (n >= 90) strengths.push("译文长度充足，基本完成了整段转换。");
    if (sents.length >= 4) strengths.push("句子数量与原文信息层次匹配，具备基本的连贯性。");
    if (!strengths.length) strengths.push("已经尝试完成整段翻译，可作为修改基础。");

    if (cnLeft > 3) improvements.push(`译文中仍有 ${cnLeft} 个中文字符，请全部转为英文。`);
    if (coverage < 0.5) improvements.push("关键信息遗漏较多，先逐句圈出原文信息点，再检查是否都有对应表达。");
    if (n < 80) improvements.push("译文偏短，可能有句子被合并或信息被省略。");
    if (sents.length < 3) improvements.push("句子偏少，注意原文中的并列与转折关系，适当拆分长句。");
    if (ttr < 0.42) improvements.push("重复用词较多，可准备 2–3 个同义表达替换。");
    if (!improvements.length) improvements.push("可进一步检查冠词、单复数和时态，提升语言准确性。");

    return {
      engine: "local",
      total,
      dimensions: [
        { name: "信息完整", score: Math.round(content * 2) / 2, max: 5 },
        { name: "表达连贯", score: Math.round(structure * 2) / 2, max: 4 },
        { name: "语法准确", score: Math.round(language * 2) / 2, max: 4 },
        { name: "词汇与句式", score: Math.round(vocab * 2) / 2, max: 2 }
      ],
      strengths,
      improvements,
      revisions: missing.length
        ? missing.map((k) => ({ original: k.cn, suggested: k.en, reason: "本题参考表达，可对照自己的译文补足信息。" }))
        : [],
      note: "本地评分依据关键表达覆盖率、译文长度、句子完整度与残留中文检测生成，仅供参考。"
    };
  }

  function renderGradeResult(section, grade) {
    const host = $("#resultHost");
    if (!host) return;
    bindVocabChips();
    const band =
      grade.total >= 13 ? "优秀" :
      grade.total >= 11 ? "良好" :
      grade.total >= 9 ? "中等" :
      grade.total >= 7 ? "及格边缘" : "需重点提升";

    host.innerHTML = `<div class="result">
      <div class="ai-banner ${grade.engine === "ai" ? "" : "local"}">
        <span class="dot"></span>
        <span>${grade.engine === "ai" ? "AI 批改结果（OpenAI 兼容接口）" : "本地规则评分"}</span>
        <span class="spacer"></span>
        <span class="small muted">满分 15 分</span>
      </div>
      <div class="score-hero">
        <div class="score-big">${grade.total}<small> / 15</small></div>
        <div>
          <div class="result-title">${band}</div>
          <div class="score-band">${grade.engine === "ai" ? "由 AI 按四级评分维度给出" : "未配置 AI 接口，使用本地启发式评分"}</div>
        </div>
      </div>

      <div class="dim-list">
        ${grade.dimensions.map((d) => `<div class="dim-row">
          <span>${esc(d.name)}</span>
          <div class="dim-bar"><i style="width:${Math.round((d.score / d.max) * 100)}%"></i></div>
          <span style="text-align:right">${d.score}/${d.max}</span>
        </div>`).join("")}
      </div>

      ${grade.strengths.length || grade.improvements.length ? `<div class="feedback-cols">
        <div class="feedback-box">
          <h4 style="color:var(--green)">做得好的地方</h4>
          <ul>${grade.strengths.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
        </div>
        <div class="feedback-box">
          <h4 style="color:var(--primary)">下一步改进</h4>
          <ul>${grade.improvements.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
        </div>
      </div>` : ""}

      ${grade.revisions.length ? `<div class="revision-list">
        ${grade.revisions.map((r) => `<div class="revision">
          <div><b>原：</b>${esc(r.original)}</div>
          <div><b>改：</b>${esc(r.suggested)}</div>
          ${r.reason ? `<div class="muted small">${esc(r.reason)}</div>` : ""}
        </div>`).join("")}
      </div>` : ""}

      ${grade.note ? `<p class="small muted" style="margin-top:14px">${esc(grade.note)}</p>` : ""}

      ${vocabSummaryHTML(section)}

      <div class="action-bar" style="margin-top:18px">
        <button class="btn" id="regradeBtn">重新批改</button>
        <a class="btn" href="#/paper/${(findSectionById(section.id) || {}).paper ? findSectionById(section.id).paper.id : "2026-06-1"}">返回套卷</a>
      </div>
    </div>`;

    const regrade = $("#regradeBtn");
    if (regrade) {
      regrade.addEventListener("click", () => {
        const btn = $("#gradeBtn");
        if (btn) btn.click();
      });
    }
    bindVocabChips();
    const saveAll = $("#saveAllVocab");
    if (saveAll) {
      saveAll.addEventListener("click", () => {
        let n = 0;
        (section.vocab || []).forEach((v) => {
          if (!state.vocab[v.word]) {
            state.vocab[v.word] = { ...v, addedAt: Date.now(), mastered: false };
            n++;
          }
        });
        saveVocab();
        $$(".vocab-chip").forEach((c) => { if (state.vocab[c.dataset.word]) c.classList.add("saved"); });
        toast(n ? `已收藏 ${n} 个词` : "本模块词汇已在生词本中");
      });
    }
  }

  /* ---------------- 词汇高亮与弹窗 ---------------- */
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlightText(text, vocab) {
    if (!vocab || !vocab.length) return esc(text);
    const words = vocab.map((v) => v.word).filter(Boolean).sort((a, b) => b.length - a.length);
    const re = new RegExp("\\b(" + words.map(escapeRegExp).join("|") + ")(s|es|ed|ing|ly|ies|ied)?\\b", "gi");
    return esc(text).replace(re, (match, base) => {
      const entry = vocab.find((v) => v.word.toLowerCase() === base.toLowerCase());
      if (!entry) return match;
      const saved = state.vocab[entry.word] ? " saved" : "";
      return `<button type="button" class="w${saved}" data-word="${esc(entry.word)}">${match}</button>`;
    });
  }

  function hydrateWordHighlights() {
    $$(".w").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openWordModal(btn.dataset.word);
      });
    });
  }

  function syncWordHighlight() {
    $$(".w").forEach((btn) => {
      btn.classList.toggle("saved", !!state.vocab[btn.dataset.word]);
    });
  }

  function findVocab(word) {
    for (const paper of PAPERS) {
      for (const section of paper.sections) {
        const v = (section.vocab || []).find((x) => x.word === word);
        if (v) return v;
      }
    }
    return null;
  }

  function openWordModal(word) {
    const data = state.vocab[word] || findVocab(word);
    if (!data) return;
    const saved = !!state.vocab[word];
    $("#wordModalBody").innerHTML = `
      <div class="word-head">
        <h3 id="wordModalTitle">${esc(data.word)}</h3>
        <span class="word-phonetic">${esc(data.phonetic || "")}</span>
        <span class="word-tag badge ${saved ? "done" : ""}">${saved ? "已在生词本" : "未收藏"}</span>
      </div>
      <div class="word-cn">${esc(data.cn || "")}</div>
      ${data.note ? `<div class="word-note"><b>语境：</b>${esc(data.note)}</div>` : ""}
      <div class="word-actions">
        <button class="btn ${saved ? "" : "primary"}" id="toggleWordBtn">${saved ? "移出生词本" : "加入生词本"}</button>
        <button class="btn" data-close="wordModal">关闭</button>
      </div>
    `;
    openModal("wordModal");
    $("#toggleWordBtn").addEventListener("click", () => {
      if (state.vocab[word]) {
        delete state.vocab[word];
        toast("已移出生词本");
      } else {
        state.vocab[word] = {
          word: data.word,
          phonetic: data.phonetic || "",
          cn: data.cn || "",
          note: data.note || "",
          addedAt: Date.now(),
          mastered: !!data.mastered
        };
        toast("已加入生词本");
      }
      saveVocab();
      closeModal("wordModal");
      if (location.hash.indexOf("#/vocab") === 0) renderVocabPage();
    });
  }

  /* ---------------- 生词本 ---------------- */
  function renderVocabPage() {
    setCrumbs([{ label: "首页", href: "#/" }, { label: "生词本" }]);
    const words = Object.values(state.vocab).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    const mastered = words.filter((w) => w.mastered).length;
    const current = words[state.flash.index % Math.max(words.length, 1)];

    mount(`
      <div class="page-head">
        <span class="badge primary">词汇复习</span>
        <h1>生词本</h1>
        <p class="sub">这些词来自你做题时点击或一键收藏的模块高频词。先回忆，再翻面，最后标记掌握。</p>
        <div class="paper-meta-row">
          <span class="badge">${words.length} 词</span>
          <span class="badge done">${mastered} 已掌握</span>
          <span class="badge">${words.length - mastered} 待复习</span>
        </div>
      </div>

      ${words.length ? `<div class="flashcard ${state.flash.revealed ? "revealed" : ""}" id="flashcard">
        <div class="fc-progress">${state.flash.index % words.length + 1} / ${words.length} · 点击卡片翻面</div>
        <div class="fc-word">${esc(current.word)}</div>
        <div class="fc-phonetic">${esc(current.phonetic || "")}</div>
        <div class="fc-answer">
          <div style="font-size:17px">${esc(current.cn || "")}</div>
          ${current.note ? `<div class="small muted" style="margin-top:6px">${esc(current.note)}</div>` : ""}
        </div>
        <div class="fc-actions">
          <button class="btn" id="prevWord">上一个</button>
          <button class="btn primary" id="revealWord">${state.flash.revealed ? "下一个" : "显示释义"}</button>
          <button class="btn" id="masterWord">${current.mastered ? "标记未掌握" : "标记已掌握"}</button>
        </div>
      </div>` : `<div class="empty"><div class="e-ico">☆</div><p>生词本还是空的。做完题后，在结果页一键收藏本模块词汇即可。</p><a class="btn primary" href="#/practice/2026-06-1/cloze-1">去做选词填空</a></div>`}

      ${words.length ? `<div class="vocab-toolbar">
        <input id="vocabSearch" type="search" placeholder="搜索单词或中文释义…">
        <button class="btn sm" id="exportVocab">导出 TSV</button>
      </div>
      <div class="vocab-grid" id="vocabGrid">
        ${words.map((w) => `<div class="vocab-item ${w.mastered ? "mastered" : ""}" data-word="${esc(w.word)}">
          <div class="vi-head"><span class="vi-word">${esc(w.word)}</span><span class="vi-ph">${esc(w.phonetic || "")}</span></div>
          <div class="vi-cn">${esc(w.cn || "")}</div>
          ${w.note ? `<div class="vi-note">${esc(w.note)}</div>` : ""}
          <div class="vi-actions">
            <button data-act="master">${w.mastered ? "取消掌握" : "已掌握"}</button>
            <button data-act="remove" class="danger">移除</button>
          </div>
        </div>`).join("")}
      </div>` : ""}
    `);

    if (!words.length) return;

    const card = $("#flashcard");
    card.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      state.flash.revealed = !state.flash.revealed;
      card.classList.toggle("revealed");
      $("#revealWord").textContent = state.flash.revealed ? "下一个" : "显示释义";
    });
    $("#revealWord").addEventListener("click", () => {
      if (!state.flash.revealed) {
        state.flash.revealed = true;
        card.classList.add("revealed");
        $("#revealWord").textContent = "下一个";
      } else {
        state.flash.revealed = false;
        state.flash.index = (state.flash.index + 1) % words.length;
        renderVocabPage();
      }
    });
    $("#prevWord").addEventListener("click", () => {
      state.flash.revealed = false;
      state.flash.index = (state.flash.index - 1 + words.length) % words.length;
      renderVocabPage();
    });
    $("#masterWord").addEventListener("click", () => {
      const w = state.vocab[current.word];
      if (w) {
        w.mastered = !w.mastered;
        saveVocab();
        toast(w.mastered ? "已标记掌握" : "已放回待复习");
        renderVocabPage();
      }
    });

    $("#vocabSearch").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$(".vocab-item").forEach((el) => {
        const text = el.textContent.toLowerCase();
        el.style.display = !q || text.includes(q) ? "" : "none";
      });
    });

    $$(".vi-actions button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = btn.closest(".vocab-item");
        const word = item.dataset.word;
        if (btn.dataset.act === "remove") {
          delete state.vocab[word];
          saveVocab();
          toast("已移除");
          renderVocabPage();
        } else {
          state.vocab[word].mastered = !state.vocab[word].mastered;
          saveVocab();
          renderVocabPage();
        }
      });
    });

    $("#exportVocab").addEventListener("click", () => {
      const rows = ["word\tphonetic\tmeaning\tnote\tmastered"];
      words.forEach((w) => rows.push([w.word, w.phonetic || "", w.cn || "", (w.note || "").replace(/\t/g, " "), w.mastered ? "1" : "0"].join("\t")));
      const blob = new Blob([rows.join("\n")], { type: "text/tab-separated-values;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "cet4-vocab.tsv";
      a.click();
      URL.revokeObjectURL(a.href);
      toast("已导出 TSV，可导入 Anki / 欧路词典");
    });
  }

  /* ---------------- 关于页 ---------------- */
  function renderAbout() {
    setCrumbs([{ label: "首页", href: "#/" }, { label: "关于与数据说明" }]);
    mount(`
      <div class="page-head">
        <span class="badge primary">About</span>
        <h1>关于本站</h1>
        <p class="sub">一个可以 fork 的四级真题练习站：纯静态、无需后端，适合部署在 GitHub Pages。</p>
      </div>
      <div class="card about-card">
        <h2>内容范围</h2>
        <p>当前收录 2021 年 6 月至 2026 年 6 月共 13 个考期、${PAPERS.length} 套大学英语四级真题（含 2022 年 9 月加考与 2023 年 3 月延考场次），覆盖写作、选词填空、长篇阅读、仔细阅读与翻译。听力不在本项目的训练范围内。个别套卷的阅读部分与同期卷 1 相同，仅收录其写作与翻译。后续套卷可按 <span class="kbd">data.js</span> 的结构继续追加。</p>

        <h2>怎么用</h2>
        <ul>
          <li>左侧选择套卷或模块；先自己做，再提交判分。</li>
          <li>阅读材料中的蓝色单词可以点击查看释义，并加入生词本。</li>
          <li>每个模块提交后，结果页会汇总本模块高频词，可一键收藏。</li>
          <li>写作与翻译点击“AI 批改”；未配置接口时使用本地规则评分。</li>
          <li>所有进度、草稿与生词都保存在浏览器 localStorage，不上传服务器。</li>
        </ul>

        <h2>AI 批改配置</h2>
        <p>点击左下角“AI 批改设置”，填入任意 OpenAI 兼容接口：</p>
        <ul>
          <li>DeepSeek：<span class="kbd">https://api.deepseek.com/v1</span>，模型 <span class="kbd">deepseek-chat</span></li>
          <li>OpenAI：<span class="kbd">https://api.openai.com/v1</span>，模型 <span class="kbd">gpt-4o-mini</span></li>
          <li>自定义：任何兼容 <span class="kbd">/chat/completions</span> 的服务</li>
        </ul>
        <div class="callout">
          <span class="ci">⚠</span>
          <div>
            <p><strong>密钥安全：</strong>API Key 只保存在你自己的浏览器里，不会写入代码仓库。但把站点公开部署时，请提醒使用者使用自己的密钥；如需多人共用，建议加一层自己的后端代理，不要把密钥写进前端文件。</p>
          </div>
        </div>

        <h2>数据与版权</h2>
        <p>${esc(DATA.meta.sourceNote)}</p>
        <p class="small muted">更新于 ${esc(DATA.meta.updated)}。如你是权利人并认为某段材料不宜公开，请提交 issue，我会及时处理。</p>
      </div>
    `);
  }

  function renderNotFound() {
    setCrumbs([{ label: "首页", href: "#/" }, { label: "未找到" }]);
    mount(`<div class="empty"><div class="e-ico">404</div><p>这个页面不存在。</p><a class="btn primary" href="#/">返回首页</a></div>`);
  }

  /* ---------------- 弹窗 / 侧栏 ---------------- */
  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("open");
    document.body.style.overflow = "";
  }

  function closeSidebar() {
    document.body.classList.remove("nav-open");
  }

  function openSettings() {
    const s = state.settings;
    $("#providerSelect").value = s.provider || "deepseek";
    $("#baseUrlInput").value = s.baseUrl || "";
    $("#modelInput").value = s.model || "";
    $("#apiKeyInput").value = s.apiKey || "";
    openModal("settingsModal");
  }

  function bindGlobal() {
    $("#menuBtn").addEventListener("click", () => document.body.classList.add("nav-open"));
    $("#sidebarOverlay").addEventListener("click", closeSidebar);
    $("#settingsBtn").addEventListener("click", openSettings);
    $("#settingsBtnTop").addEventListener("click", openSettings);

    $("#themeBtn").addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      applyTheme(cur === "dark" ? "light" : "dark");
    });

    $$("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeModal(btn.dataset.close));
    });

    $$(".modal").forEach((modal) => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal(modal.id);
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        $$(".modal.open").forEach((m) => closeModal(m.id));
        closeSidebar();
      }
    });

    $("#providerSelect").addEventListener("change", (e) => {
      const preset = PRESETS[e.target.value];
      if (preset) {
        $("#baseUrlInput").value = preset.baseUrl;
        $("#modelInput").value = preset.model;
      }
    });

    $("#saveSettingsBtn").addEventListener("click", () => {
      const provider = $("#providerSelect").value;
      const baseUrl = $("#baseUrlInput").value.trim();
      const model = $("#modelInput").value.trim();
      const apiKey = $("#apiKeyInput").value.trim();
      if (baseUrl && !/^https?:\/\//i.test(baseUrl)) return toast("接口地址需以 http:// 或 https:// 开头");
      state.settings = { provider, baseUrl, model, apiKey };
      save(LS.settings, state.settings);
      closeModal("settingsModal");
      toast(apiKey ? "AI 批改已启用" : "已保存；未填密钥时将使用本地评分");
    });

    $("#clearDataBtn").addEventListener("click", () => {
      if (!confirm("将清除所有答题进度、草稿和生词本，确定吗？")) return;
      [LS.progress, LS.drafts, LS.vocab, LS.settings, LS.theme].forEach((k) => localStorage.removeItem(k));
      state.progress = {};
      state.drafts = {};
      state.vocab = {};
      state.settings = { provider: "deepseek", baseUrl: "", model: "", apiKey: "" };
      closeModal("settingsModal");
      renderNav();
      updateGlobalProgress();
      router();
      toast("已清除本地数据");
    });
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    initTheme();
    bindGlobal();
    const meta = $("#footMeta");
    if (meta) meta.textContent = `更新于 ${DATA.meta.updated} · ${PAPERS.length} 套卷`;
    window.addEventListener("hashchange", router);
    if (!location.hash) location.hash = "#/";
    router();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
