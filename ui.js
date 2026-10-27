/* 学习助手 - 前端逻辑（由 ui.html 拆分） */
(() => {
  'use strict';

  // Electron 透明窗口模式：背景透明、内容不透明（Edge 窗口做不到，只能整窗 alpha）
  const IS_ELECTRON = new URLSearchParams(location.search).has('electron');
  if (IS_ELECTRON) document.body.classList.add('electron-transparent');

  // 透明边距穿透由主进程轮询鼠标位置处理（穿透后渲染进程收不到鼠标事件，页面判断不可靠）

  const $ = (id) => document.getElementById(id);
  const msgsEl = $('msgs'), inputEl = $('input'), sendBtn = $('send');
  const ctxEl = $('ctx'), ctxWrap = $('ctxWrap'), ctxToggle = $('ctxToggle');
  const modelEl = $('model'), drawer = $('drawer'), overlay = $('overlay');
  const notesEl = $('notes'), noteCount = $('noteCount'), toastEl = $('toast');
  const jumpBtn = $('jump');

  const STORE_CHAT = 'study-tutor:chat:v2';
  const STORE_NOTES = 'study-tutor:notes:v2';

  const PRESETS = {
    explain: '请逐行/逐段解释下面内容，用初学者能听懂的话，先给结论再展开，标出关键概念：\n\n',
    quiz: '请根据下面的内容出 3 道由易到难的练习题，先只给题目和提示，不要给答案：\n\n',
    summary: '请把下面的内容总结成要点清单（不超过 8 条，每条一句话），最后用一句话概括：\n\n',
    counter: '请针对下面的说法举一个反例，并说明为什么这个反例成立：\n\n',
    check: '下面是我的答案，请检查对错。先指出错误在哪一步，再给出正确解法：\n\n',
  };

  const EXAMPLES = [
    ['解释概念', '什么是反向传播？用一个比喻讲清楚'],
    ['出题练习', '给「极限」出 2 道基础题和 1 道提高题'],
    ['检查作业', '帮我检查这道 C 语言循环题的边界条件'],
    ['代码讲解', '逐行解释这段 Python 代码做了什么'],
  ];

  const STORE_LIB = 'study-tutor:lib:v1';
  let libOn = localStorage.getItem(STORE_LIB) === '1';
  let pendingImages = [];   // [{ mediaType, data(base64), name, thumb(dataURL) }]
  let history = [];
  let controller = null;
  let model = null;
  let busy = false;

  const saveChat = () => { try { localStorage.setItem(STORE_CHAT, JSON.stringify(history.slice(-60))) } catch {} };
  const loadChat = () => { try { const raw = localStorage.getItem(STORE_CHAT); history = raw ? (JSON.parse(raw) || []) : [] } catch { history = [] } };
  const getNotes = () => { try { return JSON.parse(localStorage.getItem(STORE_NOTES) || '[]') } catch { return [] } };
  const putNotes = (list) => { try { localStorage.setItem(STORE_NOTES, JSON.stringify(list.slice(0, 100))) } catch {} };

  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function inline(s) {
    return s
      .replace(/`([^`\n]+)`/g, (m, c) => '<code>' + c + '</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  }
  /* ================= 代码高亮（内置轻量实现，无外部依赖） ================= */
  const LANG_KEYWORDS = {
    python: ['def', 'class', 'import', 'from', 'as', 'if', 'elif', 'else', 'for', 'while', 'return', 'yield', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False', 'try', 'except', 'finally', 'with', 'lambda', 'global', 'nonlocal', 'pass', 'break', 'continue', 'raise', 'assert', 'async', 'await', 'self'],
    c: ['int', 'char', 'float', 'double', 'void', 'if', 'else', 'for', 'while', 'do', 'return', 'struct', 'union', 'enum', 'typedef', 'sizeof', 'const', 'static', 'extern', 'switch', 'case', 'default', 'break', 'continue', 'goto', 'unsigned', 'signed', 'long', 'short', 'true', 'false', 'NULL', 'include', 'define'],
    cpp: ['int', 'char', 'float', 'double', 'void', 'if', 'else', 'for', 'while', 'do', 'return', 'struct', 'class', 'public', 'private', 'protected', 'namespace', 'using', 'template', 'typename', 'virtual', 'override', 'new', 'delete', 'this', 'nullptr', 'auto', 'constexpr', 'std', 'cout', 'cin', 'include', 'define', 'const', 'static'],
    javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'class', 'extends', 'import', 'export', 'from', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'this', 'null', 'undefined', 'true', 'false', 'of', 'in'],
    typescript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'interface', 'type', 'class', 'extends', 'implements', 'import', 'export', 'from', 'async', 'await', 'new', 'this', 'null', 'undefined', 'true', 'false', 'string', 'number', 'boolean'],
    java: ['public', 'private', 'protected', 'class', 'interface', 'extends', 'implements', 'static', 'final', 'void', 'int', 'long', 'double', 'float', 'char', 'boolean', 'String', 'if', 'else', 'for', 'while', 'return', 'new', 'try', 'catch', 'finally', 'throw', 'import', 'package', 'this', 'super', 'null', 'true', 'false'],
    sql: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'ON', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'DISTINCT', 'COUNT', 'SUM', 'AVG'],
    json: ['true', 'false', 'null'],
    bash: ['if', 'then', 'else', 'fi', 'for', 'do', 'done', 'while', 'case', 'esac', 'function', 'return', 'echo', 'cd', 'ls', 'export', 'source', 'local', 'read'],
    markdown: [],
  };

  function highlightCode(code, lang) {
    const l = String(lang || '').toLowerCase();
    const source = String(code || '');
    const keywords = LANG_KEYWORDS[l];
    if (!keywords || !source.trim()) return escapeHtml(source);
    const kw = new Set(keywords);
    const commentPattern = (l === 'python' || l === 'bash' || l === 'yaml' || l === 'markdown')
      ? '#[^\\n]*'
      : (l === 'sql' ? '--[^\\n]*' : '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/');
    const tokenRe = new RegExp(
      '(' + commentPattern + ')' +
      '|("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')' +
      '|(\\b\\d+(?:\\.\\d+)?\\b)' +
      '|([A-Za-z_$][\\w$]*)',
      'g',
    );
    let out = '';
    let last = 0;
    let m;
    while ((m = tokenRe.exec(source)) !== null) {
      // 非 token 部分先转义；token 原文也逐个转义，保证 < & > 引号等特殊符号原样显示
      out += escapeHtml(source.slice(last, m.index));
      const token = m[0];
      const safe = escapeHtml(token);
      if (m[1]) out += '<span class="tok-comment">' + safe + '</span>';
      else if (m[2]) out += '<span class="tok-string">' + safe + '</span>';
      else if (m[3]) out += '<span class="tok-number">' + safe + '</span>';
      else if (m[4]) {
        const isKeyword = kw.has(l === 'sql' ? token.toUpperCase() : token);
        const nextChar = source.charAt(m.index + token.length);
        if (isKeyword) out += '<span class="tok-keyword">' + safe + '</span>';
        else if (nextChar === '(') out += '<span class="tok-function">' + safe + '</span>';
        else out += safe;
      }
      last = m.index + token.length;
    }
    out += escapeHtml(source.slice(last));
    return out;
  }

  function renderMarkdown(raw) {
    // 保留原始行：代码块内容不能先转义，否则引号/尖括号会变成 HTML 实体再被高亮器破坏
    const rawLines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let inCode = false, codeLang = 'code', codeLines = [], listType = null, para = [];

    const flushPara = () => {
      if (para.length) { out.push('<p>' + inline(escapeHtml(para.join(' '))) + '</p>'); para = []; }
    };
    const closeList = () => { if (listType) { out.push('</' + listType + '>'); listType = null; } };
    const codeBlock = () => {
      const code = codeLines.join('\n');
      const highlighted = highlightCode(code, codeLang);
      const lineCount = Math.max(1, codeLines.length);
      let lineNos = '';
      for (let i = 1; i <= lineCount; i += 1) lineNos += '<span>' + i + '</span>';
      out.push('<div class="code-block"><div class="code-head"><span>' + escapeHtml(codeLang) +
        '</span><button type="button" data-copy>复制</button></div>' +
        '<div class="code-body"><div class="code-lines">' + lineNos + '</div>' +
        '<pre><code>' + highlighted + '</code></pre></div></div>');
    };

    for (const rawLine of rawLines) {
      const fence = /^```(\w*)\s*$/.exec(rawLine);
      if (fence) {
        if (!inCode) { flushPara(); closeList(); inCode = true; codeLang = fence[1] || 'code'; codeLines = []; }
        else { codeBlock(); inCode = false; }
        continue;
      }
      if (inCode) { codeLines.push(rawLine); continue; }

      const line = escapeHtml(rawLine);
      const heading = /^(#{1,4})\s+(.*)$/.exec(rawLine);
      if (heading) {
        flushPara(); closeList();
        const level = heading[1].length;
        out.push('<h' + level + '>' + inline(escapeHtml(heading[2])) + '</h' + level + '>');
        continue;
      }
      const quote = /^>\s?(.*)$/.exec(rawLine);
      if (quote) { flushPara(); closeList(); out.push('<blockquote>' + inline(escapeHtml(quote[1])) + '</blockquote>'); continue; }

      const ul = /^\s*[-*]\s+(.*)$/.exec(rawLine);
      const ol = /^\s*\d+[.)]\s+(.*)$/.exec(rawLine);
      if (ul || ol) {
        flushPara();
        const want = ul ? 'ul' : 'ol';
        if (listType !== want) { closeList(); listType = want; out.push('<' + want + '>'); }
        out.push('<li>' + inline(escapeHtml((ul || ol)[1])) + '</li>');
        continue;
      }
      if (!rawLine.trim()) { flushPara(); closeList(); continue; }
      para.push(rawLine);
    }
    if (inCode) codeBlock();
    flushPara(); closeList();
    return out.join('');
  }

  function nearBottom() {
    return msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 80;
  }
  function scrollToBottom(force) {
    if (force || nearBottom()) msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function renderWelcome() {
    msgsEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'welcome';
    wrap.innerHTML =
      '<div class="welcome-logo">📚</div>' +
      '<h2>今天学点什么？</h2>' +
      '<p>随时提问，答案来自 DeepSeek，不会打扰你的主会话</p>' +
      '<div class="examples">' +
      EXAMPLES.map(([t, q]) => '<div class="example" data-q="' + escapeHtml(q) + '"><b>' + escapeHtml(t) + '</b><span>' + escapeHtml(q) + '</span></div>').join('') +
      '</div>';
    wrap.querySelectorAll('.example').forEach((el) => el.addEventListener('click', () => ask(el.dataset.q)));
    msgsEl.appendChild(wrap);
  }

  function addMessage(role, text) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + (role === 'user' ? 'user' : role === 'error' ? 'error' : 'bot');

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? '🧑' : role === 'error' ? '⚠️' : '📚';

    const bubbleWrap = document.createElement('div');
    bubbleWrap.className = 'bubble-wrap';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (role === 'user') bubble.textContent = text;
    else { bubble.classList.add('md'); bubble.innerHTML = renderMarkdown(text || ''); }

    const meta = document.createElement('div');
    meta.className = 'meta';
    if (role === 'bot') {
      const copyBtn = document.createElement('button');
      copyBtn.textContent = '📋 复制';
      copyBtn.onclick = async () => {
        try { await navigator.clipboard.writeText(bubble.dataset.raw || text || bubble.textContent); toast('已复制'); }
        catch { toast('复制失败'); }
      };
      meta.appendChild(copyBtn);
    }
    wrap._bubble = bubble;
    wrap._meta = meta;
    wrap._raw = text || '';
    bubbleWrap.append(bubble, meta);
    wrap.append(avatar, bubbleWrap);
    msgsEl.appendChild(wrap);
    return wrap;
  }

  function renderHistory() {
    msgsEl.innerHTML = '';
    if (!history.length) { renderWelcome(); return; }
    for (const m of history) {
      if (m.role === 'user') addMessage('user', m.text);
      else if (m.role === 'error') addMessage('error', m.text);
      else addMessage('bot', m.text);
    }
    scrollToBottom(true);
  }

  function paint(node) {
    node._bubble.innerHTML = renderMarkdown(node._raw || '');
    node._bubble.dataset.raw = node._raw || '';
  }

  function autoGrow() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(132, inputEl.scrollHeight) + 'px';
  }

  function setBusy(v) {
    busy = v;
    sendBtn.classList.toggle('stop', v);
    sendBtn.textContent = v ? '■' : '➤';
    sendBtn.title = v ? '停止生成' : '发送';
    sendBtn.setAttribute('aria-label', v ? '停止生成' : '发送');
  }

  async function loadModels() {
    try {
      const res = await fetch('/study-tutor/models');
      const data = await res.json();
      if (data && data.ok && data.default && data.default.model) {
        model = data.default;
        modelEl.innerHTML = '<span class="dot"></span>' + escapeHtml(model.model);
        modelEl.title = model.provider + ' / ' + model.model;
      } else {
        modelEl.innerHTML = '<span class="dot" style="color:var(--warning)"></span>无可用模型';
      }
    } catch {
      modelEl.innerHTML = '<span class="dot" style="color:var(--danger)"></span>服务不可用';
    }
  }

  async function ask(question) {
    if (busy) return;
    const q = String(question || '').trim();
    const imagesForSend = pendingImages.slice();
    if (!q && !imagesForSend.length) return;
    if (!history.length) msgsEl.innerHTML = '';

    const userNode = addMessage('user', q || '（图片）');
    if (imagesForSend.length) {
      const row = document.createElement('div');
      row.className = 'attach-row';
      for (const img of imagesForSend) {
        const el = document.createElement('img');
        el.src = img.thumb;
        el.alt = img.name;
        row.appendChild(el);
      }
      userNode.querySelector('.bubble').appendChild(row);
    }
    history.push({ role: 'user', text: q });
    saveChat();
    pendingImages = [];
    renderAttachBar();

    const node = addMessage('bot', '');
    node._raw = '';
    const bubble = node._bubble;
    bubble.classList.add('cursor');

    const timer = setInterval(() => {
      if (!node._raw) { bubble.textContent = '思考中…'; return; }
      paint(node);
      scrollToBottom(false);
    }, 80);

    controller = new AbortController();
    setBusy(true);
    let acc = '';
    let failed = null;

    // 资料检索（可选）：把课程资料片段附加到 context
    let extraContext = ctxEl.value.trim();
    if (libOn) {
      try {
        const sr = await fetch('/study-tutor/search?q=' + encodeURIComponent(q) + '&k=3');
        const sj = await sr.json();
        if (sj && sj.ok && sj.results && sj.results.length) {
          const refs = sj.results.map((x, i) => '[资料' + (i + 1) + '] ' + x.document + '\n' + x.text).join('\n\n');
          extraContext = (extraContext ? extraContext + '\n\n' : '') + '【检索到的课程资料】\n' + refs;
          toast('已附加 ' + sj.results.length + ' 条课程资料');
        }
      } catch { /* 检索失败不阻塞提问 */ }
    }

    try {
      const res = await fetch('/study-tutor/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: q,
          context: extraContext,
          images: imagesForSend.map((img) => ({ mediaType: img.mediaType, data: img.data, name: img.name })),
          history: history.slice(-9, -1).map((m) => ({ role: m.role, text: m.text })),
          provider: model && model.provider,
          model: model && model.model,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '');
        throw new Error('HTTP ' + res.status + (body ? ' — ' + body.slice(0, 160) : ''));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!chunk.startsWith('data:')) continue;
          let evt;
          try { evt = JSON.parse(chunk.slice(5).trim()); } catch { continue; }
          if (evt.type === 'delta') acc += evt.text;
          else if (evt.type === 'error') failed = evt.message || '未知错误';
          if (acc && !failed) node._raw = acc;
        }
      }
    } catch (error) {
      if (error && error.name !== 'AbortError') failed = (error && error.message) || String(error);
    } finally {
      clearInterval(timer);
      setBusy(false);
      controller = null;
      bubble.classList.remove('cursor');
    }

    if (failed) {
      node.className = 'msg error';
      bubble.textContent = '出错了：' + failed;
      history.push({ role: 'error', text: '出错了：' + failed });
      saveChat();
      scrollToBottom(true);
      return;
    }

    node._raw = acc;
    paint(node);
    node._meta.classList.add('show');
    if (!acc) bubble.textContent = '（没有返回内容，请重试）';
    else { history.push({ role: 'assistant', text: acc }); saveChat(); }
    scrollToBottom(true);
  }

  function sendNow() {
    if (busy) return;
    const text = inputEl.value.trim();
    if (!text && !pendingImages.length) return;
    inputEl.value = '';
    autoGrow();
    ask(text || '请看看这张图片，帮我分析一下');
  }

  function formatDate(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function renderNotes() {
    const list = getNotes();
    noteCount.textContent = list.length + ' 条记录';
    notesEl.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;color:var(--text-tertiary);font-size:12px;padding:40px 10px;line-height:2';
      empty.innerHTML = '📭 还没有错题<br>把 AI 的回答「存到错题本」就会出现在这里';
      notesEl.appendChild(empty);
      return;
    }
    list.forEach((n, i) => {
      const card = document.createElement('div');
      card.className = 'note';
      const q = document.createElement('div'); q.className = 'note-q'; q.textContent = 'Q · ' + n.q;
      const a = document.createElement('div'); a.className = 'note-a'; a.textContent = n.a;
      const bar = document.createElement('div'); bar.className = 'note-bar';
      const again = document.createElement('button'); again.textContent = '↻ 再问一次';
      again.onclick = () => { closeDrawer(); ask('再讲解一次：' + n.q); };
      const del = document.createElement('button'); del.textContent = '删除';
      del.onclick = () => { const cur = getNotes(); cur.splice(i, 1); putNotes(cur); renderNotes(); toast('已删除'); };
      const date = document.createElement('span'); date.className = 'date'; date.textContent = formatDate(n.ts || Date.now());
      bar.append(again, del, date);
      card.append(q, a, bar);
      notesEl.appendChild(card);
    });
  }

  function openDrawer() { renderNotes(); drawer.classList.add('open'); overlay.classList.add('show'); }
  function closeDrawer() { drawer.classList.remove('open'); overlay.classList.remove('show'); }

  sendBtn.addEventListener('click', () => {
    if (busy && controller) controller.abort();
    else sendNow();
  });

  /* ---------- 图片附件 ---------- */
  const MAX_IMAGE_MB = 8;
  const MAX_IMAGES = 4;

  function renderAttachBar() {
    const bar = $('attachBar');
    bar.innerHTML = '';
    pendingImages.forEach((img, i) => {
      const box = document.createElement('div');
      box.className = 'thumb';
      const el = document.createElement('img');
      el.src = img.thumb;
      el.alt = img.name;
      const del = document.createElement('button');
      del.textContent = '×';
      del.title = '移除';
      del.onclick = () => { pendingImages.splice(i, 1); renderAttachBar(); };
      box.append(el, del);
      bar.appendChild(box);
    });
  }

  function addImageFiles(files) {
    const list = Array.from(files || []).filter((f) => f.type && f.type.startsWith('image/'));
    if (!list.length) return;
    if (pendingImages.length >= MAX_IMAGES) { toast('最多 ' + MAX_IMAGES + ' 张图片'); return; }
    list.slice(0, MAX_IMAGES - pendingImages.length).forEach((file) => {
      if (file.size > MAX_IMAGE_MB * 1024 * 1024) { toast(file.name + ' 超过 ' + MAX_IMAGE_MB + 'MB，换小一点的吧'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const comma = dataUrl.indexOf(',');
        if (comma < 0) return;
        pendingImages.push({
          mediaType: file.type || 'image/png',
          data: dataUrl.slice(comma + 1),
          name: file.name || 'image.png',
          thumb: dataUrl,
        });
        renderAttachBar();
      };
      reader.readAsDataURL(file);
    });
  }


  async function captureScreenshot() {
    if (busy) { toast('正在回答，稍后再截'); return; }
    toast('请拖拽选择截图区域…');
    try {
      const r = await fetch('/study-tutor/screenshot', { method: 'POST' });
      const j = await r.json();
      if (!j || !j.ok || !j.data) { toast(j && j.cancel ? '已取消截图' : '截图失败'); return; }
      const mediaType = j.mediaType || 'image/png';
      pendingImages.push({
        mediaType,
        data: j.data,
        name: '截图.png',
        thumb: 'data:' + mediaType + ';base64,' + j.data,
      });
      renderAttachBar();
      ask('请看看我截的这张图，帮我分析一下');
    } catch {
      toast('截图失败');
    }
  }





  $('shotBtn').addEventListener('click', () => captureScreenshot());

  $('attachBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => { addImageFiles(e.target.files); e.target.value = ''; });
  inputEl.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    const files = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) { e.preventDefault(); addImageFiles(files); }
  });
  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault();
  });
  document.addEventListener('drop', (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    addImageFiles(e.dataTransfer.files);
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    const enterSends = settings.sendKey !== 'ctrl';
    const wantSend = enterSends
      ? (e.key === 'Enter' && !e.shiftKey)
      : (e.key === 'Enter' && (e.ctrlKey || e.metaKey));
    if (wantSend) { e.preventDefault(); sendNow(); }
  });
  inputEl.addEventListener('input', autoGrow);

  document.querySelectorAll('#chips .chip:not(#libToggle):not(#shotBtn)').forEach((chip) => {
    chip.addEventListener('click', () => {
      inputEl.value = PRESETS[chip.dataset.act] || '';
      inputEl.focus();
      autoGrow();
      if (!ctxEl.value.trim()) {
        ctxWrap.classList.add('open');
        ctxToggle.setAttribute('aria-expanded', 'true');
      }
      const end = inputEl.value.length;
      inputEl.setSelectionRange(end, end);
    });
  });

  function syncLibToggle() {
    const btn = $('libToggle');
    btn.classList.toggle('active', libOn);
    btn.innerHTML = '<span>📚</span>' + (libOn ? '查资料：开' : '查资料');
    btn.title = libOn ? '提问时会自动检索课程资料库' : '点击开启资料检索';
  }
  $('libToggle').addEventListener('click', () => {
    libOn = !libOn;
    try { localStorage.setItem(STORE_LIB, libOn ? '1' : '0') } catch {}
    syncLibToggle();
    toast(libOn ? '资料检索已开启' : '资料检索已关闭');
  });
  syncLibToggle();

  ctxToggle.addEventListener('click', () => {
    const open = ctxWrap.classList.toggle('open');
    ctxToggle.setAttribute('aria-expanded', String(open));
    if (open) ctxEl.focus();
  });

  $('notesBtn').addEventListener('click', openDrawer);
  $('closeDrawer').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);

  $('clearBtn').addEventListener('click', () => {
    if (!history.length) { renderWelcome(); return; }
    history = [];
    saveChat();
    renderWelcome();
    toast('对话已清空');
  });

  msgsEl.addEventListener('scroll', () => jumpBtn.classList.toggle('show', !nearBottom()));
  jumpBtn.addEventListener('click', () => scrollToBottom(true));

  document.addEventListener('keydown', (e) => {
    // Esc：生成中先停止，否则关闭面板
    if (e.key === 'Escape') {
      if (busy && controller) { controller.abort(); toast('已停止生成'); return; }
      closeDrawer();
      closeSettings();
      return;
    }
    // Ctrl+Alt+S 截图并发送（避开 Edge 自带的 Ctrl+Shift+S 网页捕获）
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      captureScreenshot();
      return;
    }
    // Ctrl+L 错题本
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      if (drawer.classList.contains('open')) closeDrawer(); else openDrawer();
      return;
    }
    // Ctrl+K 新对话
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      history = [];
      saveChat();
      renderWelcome();
      toast('已开始新对话');
      return;
    }
    // Ctrl+, 设置
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      if ($('settings').classList.contains('open')) closeSettings(); else openSettings();
      return;
    }
    // Ctrl+/ 聚焦输入框
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      inputEl.focus();
      return;
    }
    // Alt+1..5 快捷指令
    if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-5]$/.test(e.key)) {
      const chips = document.querySelectorAll('#chips .chip:not(#libToggle)');
      const chip = chips[Number(e.key) - 1];
      if (chip) { e.preventDefault(); chip.click(); }
    }
  });

  /* ================= settings ================= */
  const STORE_SETTINGS = 'study-tutor:settings:v1';
  const DEFAULT_SETTINGS = { theme: 'auto', opacity: 1, fontSize: 14, compact: false, avatar: true, anim: true, sendKey: 'enter' };
  let settings = Object.assign({}, DEFAULT_SETTINGS, (() => {
    try { return JSON.parse(localStorage.getItem(STORE_SETTINGS) || 'null') || {} } catch { return {} }
  })());
  // 文字始终不透明：启动时强制 100%，忽略历史保存的透明度
  settings.opacity = 1;
  let opacityTimer = null;

  const saveSettings = () => { try { localStorage.setItem(STORE_SETTINGS, JSON.stringify(settings)) } catch {} };

  function applySettings() {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    root.style.setProperty('--font-size', settings.fontSize + 'px');
    document.body.classList.toggle('compact', !!settings.compact);
    document.body.classList.toggle('no-avatar', !settings.avatar);
    document.body.classList.toggle('no-anim', !settings.anim);
    document.body.classList.toggle('dim', settings.opacity < 0.85);
  }

  function syncSettingsUI() {
    document.querySelectorAll('#themeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.v === settings.theme));
    document.querySelectorAll('#sendSeg button').forEach((b) => b.classList.toggle('active', b.dataset.v === settings.sendKey));
    $('opacityRange').value = Math.round(settings.opacity * 100);
    $('opacityVal').textContent = Math.round(settings.opacity * 100) + '%';
    $('fontRange').value = settings.fontSize;
    $('fontVal').textContent = settings.fontSize + 'px';
    $('compactChk').checked = !!settings.compact;
    $('avatarChk').checked = !!settings.avatar;
    $('animChk').checked = !!settings.anim;
    const hint = document.querySelector('.hint-row');
    if (hint && hint.firstElementChild) {
      hint.firstElementChild.innerHTML = settings.sendKey === 'enter'
        ? '<kbd>Enter</kbd> 发送 · <kbd>Shift</kbd>+<kbd>Enter</kbd> 换行'
        : '<kbd>Ctrl</kbd>+<kbd>Enter</kbd> 发送 · <kbd>Enter</kbd> 换行';
    }
  }

  function pushWindowOpacity() {
    clearTimeout(opacityTimer);
    opacityTimer = setTimeout(() => {
      fetch('/study-tutor/window', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ opacity: settings.opacity }),
      }).catch(() => {});
    }, 350);
  }

  function updateSetting(key, value) {
    settings[key] = value;
    saveSettings();
    applySettings();
    syncSettingsUI();
    if (key === 'opacity') pushWindowOpacity();
  }

  function openSettings() {
    syncSettingsUI();
    $('sheetWrap').classList.add('show');
    $('settings').classList.add('open');
  }
  function closeSettings() {
    $('sheetWrap').classList.remove('show');
    $('settings').classList.remove('open');
  }

  $('settingsBtn').addEventListener('click', openSettings);
  $('closeSettings').addEventListener('click', closeSettings);
  $('sheetWrap').addEventListener('click', closeSettings);

  document.querySelectorAll('#themeSeg button').forEach((b) => b.addEventListener('click', () => updateSetting('theme', b.dataset.v)));
  document.querySelectorAll('#sendSeg button').forEach((b) => b.addEventListener('click', () => updateSetting('sendKey', b.dataset.v)));
  // 拖动时只做即时视觉预览（CSS），松手（change）才真正设置窗口 alpha
  $('opacityRange').addEventListener('input', (e) => {
    const v = Number(e.target.value) / 100;
    settings.opacity = v;
    $('opacityVal').textContent = Math.round(v * 100) + '%';
    document.documentElement.style.setProperty('--preview-alpha', String(v));
    document.body.classList.toggle('dim-preview', v < 0.85);
  });
  $('opacityRange').addEventListener('change', (e) => {
    const v = Number(e.target.value) / 100;
    document.documentElement.style.removeProperty('--preview-alpha');
    document.body.classList.remove('dim-preview');
    updateSetting('opacity', v);
    toast('窗口透明度 ' + Math.round(v * 100) + '%');
  });
  $('fontRange').addEventListener('input', (e) => updateSetting('fontSize', Number(e.target.value)));
  $('compactChk').addEventListener('change', (e) => updateSetting('compact', e.target.checked));
  $('avatarChk').addEventListener('change', (e) => updateSetting('avatar', e.target.checked));
  $('animChk').addEventListener('change', (e) => updateSetting('anim', e.target.checked));

  // 窗口大小（仅 Electron 桌面窗口可用）
  document.querySelectorAll('#sizeSeg button').forEach((b) => {
    b.addEventListener('click', () => {
      if (!window.studyTutorDesktop || !window.studyTutorDesktop.setSize) {
        toast('当前窗口不支持调整大小（非 Electron 模式）');
        return;
      }
      window.studyTutorDesktop.setSize(Number(b.dataset.w), Number(b.dataset.h));
      document.querySelectorAll('#sizeSeg button').forEach((x) => x.classList.toggle('active', x === b));
      toast('窗口已调整为 ' + b.dataset.w + '×' + b.dataset.h);
    });
  });

  // 拖拽边缘自由缩放（8 方向手柄，仅 Electron 透明窗口）
  if (IS_ELECTRON && window.studyTutorDesktop && window.studyTutorDesktop.setBounds) {
    let resizeState = null;
    const setBounds = window.studyTutorDesktop.setBounds;
    document.querySelectorAll('.resize-handle').forEach((handle) => {
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        resizeState = {
          dir: handle.dataset.dir,
          sx: e.screenX,
          sy: e.screenY,
          x: window.screenX,
          y: window.screenY,
          w: window.innerWidth,
          h: window.innerHeight,
        };
        document.body.classList.add('resizing');
      });
    });
    document.addEventListener('mousemove', (e) => {
      if (!resizeState) return;
      const dx = e.screenX - resizeState.sx;
      const dy = e.screenY - resizeState.sy;
      const dir = resizeState.dir;
      let w = resizeState.w;
      let h = resizeState.h;
      let x = resizeState.x;
      let y = resizeState.y;
      if (dir.includes('e')) w = resizeState.w + dx;
      if (dir.includes('s')) h = resizeState.h + dy;
      if (dir.includes('w')) { w = resizeState.w - dx; x = resizeState.x + dx; }
      if (dir.includes('n')) { h = resizeState.h - dy; y = resizeState.y + dy; }
      setBounds({ x, y, width: w, height: h });
    });
    document.addEventListener('mouseup', () => {
      if (!resizeState) return;
      resizeState = null;
      document.body.classList.remove('resizing');
    });
  }

  $('resetSettings').addEventListener('click', () => {
    settings = Object.assign({}, DEFAULT_SETTINGS);
    saveSettings();
    applySettings();
    syncSettingsUI();
    pushWindowOpacity();
    toast('已恢复默认设置');
  });

  applySettings();
  syncSettingsUI();

  // 文字始终不透明：不读取历史透明度，打开时主动固定为 100%
  settings.opacity = 1;
  syncSettingsUI();
  fetch('/study-tutor/window', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ opacity: 1 }),
  }).catch(() => {})

  loadChat();
  renderHistory();
  if (new URLSearchParams(location.search).has('settings')) openSettings();
  loadModels();
  autoGrow();
  setBusy(false);
})();
