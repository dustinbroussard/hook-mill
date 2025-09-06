// app.js
(() => {
  const { DEFAULTS, CAPS, buildSystem, REFINE } = window.HOOK_MILL_PRESETS;

  // Theme toggle with persistence and system preference
  (function(){
    const root = document.documentElement;
    const THEME_KEY = 'HM_THEME';
    const btn = document.getElementById('btn-theme');
    const stored = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = stored || (prefersDark ? 'dark' : 'light');
    if(!btn) return;
    const meta = document.querySelector('meta[name="theme-color"]');
    const setIcon = () => { btn.textContent = root.dataset.theme === 'dark' ? '☀️' : '🌙'; };
    const applyThemeColor = () => {
      if(meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
    };
    setIcon();
    applyThemeColor();
    btn.addEventListener('click', ()=>{
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, root.dataset.theme);
      setIcon();
      applyThemeColor();
    });
  })();

  // ===== Utilities =====
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const toast = (msg, type='') => {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(()=>t.remove(), 3500);
  };
  const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
  const fmtDate = (ms) => new Date(ms).toLocaleString();
  const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,40)||'untitled';
  const approxTokens = (str) => Math.max(1, Math.round(str.length/4));
  const wordCount = (s) => (s.trim().match(/\b[\w’']+\b/g)||[]).length;

// ===== PWA Setup =====
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js');
    });
  }
  let deferredPrompt;
  let installDismissed = false;
  const installBanner = $('#install-banner');
  const btnInstall = $('#btn-install');
  const btnDismissInstall = $('#btn-dismiss-install');
  if (installBanner && btnInstall && btnDismissInstall) {
    const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (!isStandalone() && !installDismissed) installBanner.hidden = false;
    });
    btnInstall.addEventListener('click', async () => {
      installBanner.hidden = true;
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    });
    btnDismissInstall.addEventListener('click', () => {
      installBanner.hidden = true;
      installDismissed = true;
      deferredPrompt = null;
    });
  }
  
  // ULID-ish
  function ulid(){
    const t = Date.now().toString(36).padStart(10,'0');
    const r = Array.from(crypto.getRandomValues(new Uint8Array(10))).map(b=>b.toString(36).padStart(2,'0')).join('').slice(0,12);
    return `${t}${r}`;
  }

  async function sha256(str){
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  function copyText(text){
    navigator.clipboard.writeText(text).then(()=>toast('Copied', 'good'), ()=>toast('Copy failed','bad'));
  }

  function saveFile(name, content){
    const a = document.createElement('a');
    const blob = new Blob([content], {type:'text/plain;charset=utf-8'});
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  }

  // Settings store
  const SKEY = 'HM_SETTINGS_V1';
  const Settings = {
    load(){
      const raw = localStorage.getItem(SKEY);
      let s = raw ? JSON.parse(raw) : {};
      s = { ...DEFAULTS, ...s };
      // init UI
      $('#api-key').value = s.apiKey || '';
      $('#model').value = s.model;
      $('#temperature').value = s.temperature;
      $('#top_p').value = s.top_p;
      $('#max_tokens').value = s.max_tokens;
      $('#stop_tokens').value = (s.stop||[]).join(',');
      $('#val-temperature').textContent = s.temperature;
      $('#val-top_p').textContent = s.top_p;
      $('#val-max_tokens').textContent = s.max_tokens;
      $$('input[name="default-preset"]').forEach(r=>r.checked = r.value===s.preset);
      $$('input[name="default-lens"]').forEach(r=>r.checked = r.value===s.lens);
      $('#nsfw_lean').checked = !!s.nsfw;
      $('#char_cap').checked = !!s.charCapOn;
      // header badges
      updateModelBadge();
      updateConnDot();
      // apply compose defaults
      selectPresetTab(s.preset);
      $$('input[name="lens"]').forEach(r=>r.checked = (r.value===s.lens));
      return s;
    },
    readFromUI(){
      const stop = $('#stop_tokens').value.split(',').map(s=>s.trim()).filter(Boolean);
      return {
        apiKey: $('#api-key').value.trim(),
        model: $('#model').value.trim() || DEFAULTS.model,
        temperature: +$('#temperature').value,
        top_p: +$('#top_p').value,
        max_tokens: +$('#max_tokens').value,
        stop,
        preset: $('input[name="default-preset"]:checked')?.value || DEFAULTS.preset,
        lens: $('input[name="default-lens"]:checked')?.value || DEFAULTS.lens,
        nsfw: $('#nsfw_lean').checked,
        charCapOn: $('#char_cap').checked,
      };
    },
    save(){
      const s = Settings.readFromUI();
      localStorage.setItem(SKEY, JSON.stringify(s));
      toast('Settings saved','good');
      updateModelBadge();
      updateConnDot();
      return s;
    },
    get(){
      const raw = localStorage.getItem(SKEY);
      return { ...DEFAULTS, ...(raw?JSON.parse(raw):{}) };
    }
  };

  // ===== UI wiring =====
  const state = {
    running: false,
    aborter: null,
    currentPreset: DEFAULTS.preset,
    currentLens: DEFAULTS.lens,
    lastOutput: '',
    lastSystem: '',
    lastPrompt: '',
    lastParams: {},
    selectedItemId: null, // for refine/add modals
    timerStart: 0,
    elapsedTimer: null
  };

  function updateModelBadge(){
    $('#model-badge').textContent = Settings.get().model;
  }
  function updateConnDot(kind){
    const dot = $('#conn-dot');
    dot.classList.remove('conn-ok','conn-warn','conn-bad');
    const hasKey = !!Settings.get().apiKey;
    if (kind==='bad') dot.classList.add('conn-bad');
    else if (kind==='ok' || hasKey) dot.classList.add('conn-ok');
    else dot.classList.add('conn-warn');
  }

  // Preset & Lens
  function selectPresetTab(preset){
    state.currentPreset = preset;
    $$('.preset-tabs button').forEach(b=>{
      b.setAttribute('aria-selected', b.dataset.preset===preset ? 'true' : 'false');
    });
  }
  function selectSubView(view){
    $$('.subtabs button').forEach(b=>b.setAttribute('aria-selected', b.dataset.view===view?'true':'false'));
    $('#out-formatted').hidden = view!=='formatted';
    $('#out-plain').hidden = view!=='plain';
    $('#out-captions').hidden = view!=='captions';
  }

  // Status
  function startElapsed(){
    state.timerStart = performance.now();
    clearInterval(state.elapsedTimer);
    state.elapsedTimer = setInterval(()=>{
      const s = (performance.now()-state.timerStart)/1000;
      $('#status-elapsed').textContent = `${s.toFixed(1)}s`;
    }, 100);
  }
  function stopElapsed(){
    clearInterval(state.elapsedTimer);
  }
  function updateLengthCounters(){
    const text = $('#seed').value;
    const chars = text.length;
    const tokens = approxTokens(text);
    $('#status-length').textContent = `${chars} chars • ~${tokens} tok`;
  }

  // Char caps
  function enforceCapsIfEnabled(text){
    const s = Settings.get();
    if (!s.charCapOn) return text;
    const cap = CAPS[state.currentPreset] || CAPS.FULL;
    // prefer word caps; fallback to chars
    const words = text.trim().split(/\s+/);
    if (words.length > cap.words) {
      return words.slice(0, cap.words).join(' ');
    }
    if (text.length > cap.chars) return text.slice(0, cap.chars);
    return text;
  }

  // Auto-tags (simple heuristics)
  function autoTagsFor(text){
    const t = text.toLowerCase();
    const tags = new Set();
    if (/\b(truck|chevy|beer|boots|county|barstool|whiskey|mud)\b/.test(t)) tags.add('#country');
    if (/\b(vintage|needle|vinyl|spindle|jukebox|cassette|tape)\b/.test(t)) tags.add('#vintage');
    if (/\b(yell|mosh|pit|leather|amp|snare)\b/.test(t)) tags.add('#punk');
    if (/\b(grandma|uncle|neighbor|teacher)\b/.test(t)) tags.add('#character');
    if (/\b(vape|tiktok|meme|wifi|dm)\b/.test(t)) tags.add('#meme');
    return Array.from(tags);
  }

  // Output panel helpers
  function setOutput(text){
    state.lastOutput = text;
    $('#out-formatted').textContent = text;
    $('#out-plain').value = text;
    // captions: first two non-empty lines
    const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const cap = lines.slice(0,2).join('\n');
    $('#out-captions').textContent = cap;
    const hasChorus = !!grabChorus(text);
    const hasHook = !!grabHook(text);
    $('#btn-copy-chorus').disabled = !hasChorus;
    $('#btn-copy-hook').disabled = !hasHook;
  }

  // Override setOutput hook-aware
  let setOutputMini = null;
  const _setOutputReal = setOutput;
  window.__setOutput = undefined;
  function setOutputPatched(text){
    if (window.__setOutput) return window.__setOutput(text);
    return _setOutputReal(text);
  }
  // replace references
  setOutput = setOutputPatched;

  function grabChorus(text){
    const m = text.match(/\[Chorus\][\s\S]*?(?=\n\[[A-Z][^\]]+\]|\s*$)/);
    return m ? m[0].trim() : '';
  }
  function grabHook(text){
    const hook = text.match(/\[Hook\][^\[]+/);
    const chant = text.match(/\[Chant\][^\[]+/);
    if (!hook && !chant) return '';
    return `${hook?hook[0].trim():''}${hook&&chant?'\n':''}${chant?chant[0].trim():''}`.trim();
  }

  // File export names
  function filenameFor(preset, lens, titleSource=''){
    const date = new Date();
    const y = date.getFullYear();
    const mo = String(date.getMonth()+1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    const hh = String(date.getHours()).padStart(2,'0');
    const mm = String(date.getMinutes()).padStart(2,'0');
    const slug = slugify(titleSource || $('#seed').value);
    return `${y}-${mo}-${d}_${hh}${mm}_${preset}_${lens}_${slug}.txt`;
  }

  // ===== OpenRouter Streaming =====
  async function openrouterStream({system, user, params, signal}){
    const { apiKey, model } = Settings.get();
    if (!apiKey) { throw new Error('Missing OpenRouter API Key'); }
    const body = {
      model,
      temperature: params.temperature,
      top_p: params.top_p,
      max_tokens: params.max_tokens,
      stop: params.stop,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    };
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    let res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers, body: JSON.stringify(body), signal
    });
    if (res.status===429 || res.status>=500){
      await new Promise(r=>setTimeout(r, 1000));
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', headers, body: JSON.stringify(body), signal
      });
    }
    if (!res.ok) {
      const text = await res.text().catch(()=>res.statusText);
      throw new Error(text || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let out = '';
    const stopTokens = (params.stop||[]).filter(Boolean);
    const applyStop = () => stopTokens.some(tok=>out.includes(tok));

    while (true){
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, {stream:true});
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const chunk of parts){
        const lines = chunk.split('\n').map(l=>l.trim()).filter(Boolean);
        for (const line of lines){
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') { reader.cancel(); break; }
          try{
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content ?? '';
            if (delta){
              out += delta;
              // char cap enforcement during stream
              const capped = enforceCapsIfEnabled(out);
              out = capped;
              setOutput(out);
              if (applyStop()){
                try{ reader.cancel(); }catch{}
                return out;
              }
            }
          }catch(_){}
        }
      }
    }
    return out;
  }

  async function runGenerate({batch=1}={}){
    if (state.running) return;
    const seed = $('#seed').value.trim();
    if (!seed){ toast('Enter a topic or seed first.','bad'); return; }

    const s = Settings.get();
    state.lastSystem = buildSystem(state.currentPreset, state.currentLens);
    state.lastPrompt = enforceCapsIfEnabled(seed);
    state.lastParams = {
      temperature: s.temperature,
      top_p: s.top_p,
      max_tokens: s.max_tokens,
      stop: s.stop
    };

    $('#btn-stop').disabled = false;
    $('#btn-generate').disabled = true;
    $('#btn-batch').disabled = true;
    state.running = true;
    updateConnDot('ok');
    startElapsed();

    // sequential queue for batch
    const outputs = [];
    for (let i=0;i<batch;i++){
      if (!state.running) break;
      setOutput(''); // clear for each run in UI, still save individually
      const controller = new AbortController();
      state.aborter = controller;
      try{
        const text = await openrouterStream({
          system: state.lastSystem,
          user: state.lastPrompt,
          params: state.lastParams,
          signal: controller.signal
        });
        outputs.push(text);
        await saveCurrentToLibrary(text);
      }catch(err){
        if (controller.signal.aborted){ toast('Stopped','warn'); break; }
        updateConnDot('bad');
        toast(`Error: ${err.message || err}`,'bad');
      }
    }

    state.running = false;
    $('#btn-stop').disabled = true;
    $('#btn-generate').disabled = false;
    $('#btn-batch').disabled = false;
    stopElapsed();
  }

  function stopGeneration(){
    if (state.aborter){
      try{ state.aborter.abort(); }catch{}
    }
    state.running = false;
    $('#btn-stop').disabled = true;
    $('#btn-generate').disabled = false;
    $('#btn-batch').disabled = false;
    stopElapsed();
  }

  // ===== Library =====
  async function saveCurrentToLibrary(output){
    if (!output?.trim()) return;
    const s = Settings.get();
    const preset = state.currentPreset;
    const lens = state.currentLens;
    const createdAt = Date.now();
    const params = { ...state.lastParams };
    const hash = await sha256(output);

    // dedupe
    const same = await HookMillDB.byHash(hash);
    let id = ulid();
    if (same.length){
      toast('Duplicate—saved w/ timestamp v2','warn');
    }
    const item = {
      id, createdAt, model: s.model, preset, lens,
      system: state.lastSystem,
      prompt: state.lastPrompt,
      params, output, hash,
      tags: autoTagsFor(output),
      starred: false, notes: '',
      refinements: []
    };
    await HookMillDB.put(item);
    refreshLibraryFilters();
    if (!$('#library-panel').hidden) {
      renderLibrary();
    }
    // title hint in card will be first line
    return id;
  }

  async function renderLibrary(){
    const list = await HookMillDB.list();
    const q = $('#lib-search').value.trim().toLowerCase();
    const tag = $('#lib-tag-filter').value;
    const model = $('#lib-model-filter').value;
    const starredOnly = $('#lib-starred-only').checked;
    const filtered = list.filter(it=>{
      if (starredOnly && !it.starred) return false;
      if (tag && !(it.tags||[]).includes(tag)) return false;
      if (model && it.model!==model) return false;
      if (!q) return true;
      const blob = [it.output, it.prompt, it.model, it.tags?.join(' ')].join('\n').toLowerCase();
      return blob.includes(q);
    });

    const container = $('#lib-list');
    container.innerHTML = '';
    const tpl = $('#lib-card-template');
    filtered.forEach(it=>{
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = it.id;
      const firstLine = (it.output||'').split(/\r?\n/).find(l=>l.trim()) || '(untitled)';
      $('.lib-title', node).textContent = firstLine.slice(0,120);
      $('.badge.preset', node).textContent = it.preset;
      $('.badge.lens', node).textContent = it.lens;
      $('.badge.model', node).textContent = it.model;
      $('.time', node).textContent = fmtDate(it.createdAt);
      $('.lib-output', node).textContent = it.output;
      $('.tag-editor', node).value = (it.tags||[]).join(', ');

      const starBtn = $('.star', node);
      starBtn.textContent = it.starred ? '★' : '☆';
      starBtn.onclick = async ()=>{
        it.starred = !it.starred;
        starBtn.textContent = it.starred ? '★' : '☆';
        await HookMillDB.put(it);
      };

      $('.copy', node).onclick = ()=>copyText(it.output);
      $('.export', node).onclick = ()=>{
        const name = filenameFor(it.preset, it.lens, firstLine);
        saveFile(name, it.output);
      };
      $('.delete', node).onclick = async ()=>{
        await HookMillDB.delete(it.id);
        renderLibrary();
        toast('Deleted','warn');
      };
      $('.tag-editor', node).addEventListener('change', async (e)=>{
        it.tags = e.target.value.split(/,+/).map(s=>s.trim()).filter(Boolean);
        await HookMillDB.put(it);
        refreshLibraryFilters();
      });

      $('.refine', node).onclick = ()=> openMiniModal('Refine', it, 'REFINE_DEFAULT');
      $('.refine2', node).onclick = ()=> openMiniModal('Refine — Shorter & Louder', it, 'REFINE_SHORTER');
      $('.add-verse', node).onclick = ()=> openMiniModal('Add Verse', it, 'ADD_VERSE');
      $('.add-bridge', node).onclick = ()=> openMiniModal('Add Bridge', it, 'ADD_BRIDGE');

      container.appendChild(node);
    });
  }

  async function refreshLibraryFilters(){
    const list = await HookMillDB.list();
    const tagSel = $('#lib-tag-filter');
    const modelSel = $('#lib-model-filter');
    const tags = new Set(), models = new Set();
    list.forEach(it=>{
      (it.tags||[]).forEach(t=>tags.add(t));
      if (it.model) models.add(it.model);
    });
    const tagVal = tagSel.value, modelVal = modelSel.value;
  
  // Populate tag filter safely to avoid XSS via tag names
    tagSel.innerHTML = '';
    const tagDefault = document.createElement('option');
    tagDefault.value = '';
    tagDefault.textContent = 'All Tags';
    tagSel.appendChild(tagDefault);
    Array.from(tags).sort().forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      tagSel.appendChild(opt);
    });

    // Populate model filter safely
    modelSel.innerHTML = '';
    const modelDefault = document.createElement('option');
    modelDefault.value = '';
    modelDefault.textContent = 'All Models';
    modelSel.appendChild(modelDefault);
    Array.from(models).sort().forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      modelSel.appendChild(opt);
    });

    tagSel.value = tagVal || '';
    modelSel.value = modelVal || '';
  }

  async function exportStarred(){
    const list = await HookMillDB.list();
    const starred = list.filter(x=>x.starred);
    if (!starred.length){ toast('No starred items','warn'); return; }
    const content = starred.map(x=>x.output).join('\n\n---\n\n');
    const name = `starred_${new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')}.txt`;
    saveFile(name, content);
  }

  // Mini modal actions
  function openMiniModal(title, item, kind){
    $('#mini-title').textContent = title;
    $('#mini-stream').textContent = '';
    $('#mini-modal-overlay').hidden = false;
    $('#mini-modal').hidden = false;
    state.selectedItemId = item.id;

    const s = Settings.get();
    let system, user;
    if (kind==='REFINE_DEFAULT'){
      system = REFINE.DEFAULT;
      user = item.output;
    } else if (kind==='REFINE_SHORTER'){
      system = REFINE.SHORTER;
      user = item.output;
    } else if (kind==='ADD_VERSE'){
      system = window.HOOK_MILL_PRESETS.PRESET_SYSTEMS.ADD_VERSE;
      user = item.output;
    } else if (kind==='ADD_BRIDGE'){
      system = window.HOOK_MILL_PRESETS.PRESET_SYSTEMS.ADD_BRIDGE;
      user = item.output;
    } else {
      system = 'You are a helpful editor.';
      user = item.output;
    }

    // stream into mini
    const controller = new AbortController();
    state.aborter = controller;
    $('#mini-save').disabled = true;

    openrouterStream({
      system, user, params: {
        temperature: s.temperature, top_p: s.top_p, max_tokens: s.max_tokens, stop: s.stop
      }, signal: controller.signal
    }).then(async (text)=>{
      $('#mini-save').disabled = false;
      $('#mini-save').onclick = async ()=>{
        const fresh = await HookMillDB.get(item.id);
        const ref = {
          id: ulid(), createdAt: Date.now(),
          model: s.model, system, output: text,
          label: title
        };
        fresh.refinements = fresh.refinements || [];
        fresh.refinements.push(ref);
        // For expansions, append to main output?
        if (kind==='ADD_VERSE' || kind==='ADD_BRIDGE'){
          fresh.output = `${fresh.output.trim()}\n${text.startsWith('[')?'\n':''}${text}`.trim();
        }
        await HookMillDB.put(fresh);
        toast('Saved','good');
        closeMiniModal();
        renderLibrary();
      };
    }).catch(err=>{
      toast(`Error: ${err.message||err}`, 'bad');
    });

    // update live
    const obs = new MutationObserver(()=>{
      const text = $('#mini-stream').textContent;
      // nothing extra; kept to show live text
    });
    obs.observe($('#mini-stream'), { childList:true, characterData:true, subtree:true });

    // hijack stream setter to mini-pre
    setOutputMini = (t)=>{ $('#mini-stream').textContent = t; };
    // patch streaming target for mini only
    window.__setOutput = setOutputMini;
    // restore after 5s of inactivity? not needed; will restore on close
  }

  function closeMiniModal(){
    $('#mini-modal-overlay').hidden = true;
    $('#mini-modal').hidden = true;
    window.__setOutput = undefined;
    $('#mini-save').disabled = false;
    state.aborter = null;
    state.selectedItemId = null;
  }

  // ===== Event binding =====
  // Preset tabs
  $$('.preset-tabs button').forEach(b=>{
    b.addEventListener('click', ()=>{
      selectPresetTab(b.dataset.preset);
      const s = Settings.get();
      s.preset = state.currentPreset;
      localStorage.setItem(SKEY, JSON.stringify(s));
    });
  });
  // Lens radios
  $$('input[name="lens"]').forEach(r=>{
    r.addEventListener('change', ()=>{
      state.currentLens = r.value;
      const s = Settings.get(); s.lens = state.currentLens;
      localStorage.setItem(SKEY, JSON.stringify(s));
    });
  });

  // Settings drawer open/close
  const btnSettings = $('#btn-settings');
  const settingsDrawer = $('#settings-drawer');
  const settingsOverlay = $('#settings-overlay');
  const btnCloseSettings = $('#btn-close-settings');
  
  btnSettings.addEventListener('click', () => {
    const isOpen = btnSettings.getAttribute('aria-expanded') === 'true';
    if (isOpen) {
      closeSettings();
    } else {
      settingsOverlay.hidden = false;
      settingsDrawer.hidden = false;
      // Ensure display is set correctly
      settingsOverlay.style.display = 'block';
      settingsDrawer.style.display = 'flex';
      btnSettings.setAttribute('aria-expanded', 'true');
      Settings.load();
    }
  });

  btnCloseSettings.addEventListener('click', closeSettings);
  settingsOverlay.addEventListener('click', closeSettings);

  function closeSettings(){
    console.log('closeSettings called');
    settingsOverlay.hidden = true;
    settingsDrawer.hidden = true;
    // Also set display to none to ensure it's hidden
    settingsOverlay.style.display = 'none';
    settingsDrawer.style.display = 'none';
    btnSettings.setAttribute('aria-expanded', 'false');
    console.log('Settings should be hidden now');
  }

  $('#btn-save-settings').addEventListener('click', () => {
    Settings.save();
    closeSettings();
  });
  $('#btn-clear-data').onclick = async ()=>{
    if (!confirm('Clear ALL data (settings + library)?')) return;
    await HookMillDB.clearAll();
    Settings.load();
    renderLibrary();
    toast('All data cleared','warn');
  };

  // Library toggle
  $('#btn-library').onclick = async ()=>{
    const panel = $('#library-panel');
    const open = panel.hidden;
    panel.hidden = !open;
    $('#btn-library').setAttribute('aria-expanded', open?'true':'false');
    if (open){
      await refreshLibraryFilters();
      await renderLibrary();
      $('#lib-search').focus();
    }
  };
  $('#btn-close-library').onclick = ()=>{
    $('#library-panel').hidden = true;
    $('#btn-library').setAttribute('aria-expanded','false');
  };
  $('#lib-search').addEventListener('input', renderLibrary);
  $('#lib-tag-filter').addEventListener('change', renderLibrary);
  $('#lib-model-filter').addEventListener('change', renderLibrary);
  $('#lib-starred-only').addEventListener('change', renderLibrary);
  $('#btn-export-starred').onclick = exportStarred;

  // Compose
  $('#seed').addEventListener('input', updateLengthCounters);

  $('#btn-generate').onclick = ()=> runGenerate({batch:1});
  $('#btn-batch').onclick = ()=> runGenerate({batch: clamp(Settings.get().batchSize,1,10)});
  $('#btn-stop').onclick = stopGeneration;
  $('#btn-new').onclick = ()=>{
    if (state.running) stopGeneration();
    $('#seed').value = '';
    setOutput('');
    updateLengthCounters();
    $('#seed').focus();
  };

  // Output actions
  $$('.subtabs button').forEach(b=>{
    b.onclick = ()=> selectSubView(b.dataset.view);
  });

  $('#btn-copy-all').onclick = ()=> copyText(state.lastOutput||'');
  $('#btn-copy-chorus').onclick = ()=> {
    const c = grabChorus(state.lastOutput||'');
    if (!c) return toast('No [Chorus] found','warn');
    copyText(c);
  };
  $('#btn-copy-hook').onclick = ()=> {
    const h = grabHook(state.lastOutput||'');
    if (!h) return toast('No [Hook]/[Chant] found','warn');
    copyText(h);
  };
  $('#btn-copy-captions').onclick = ()=> {
    const t = $('#out-captions').textContent||'';
    if (!t.trim()) return toast('No captions','warn');
    copyText(t);
  };
  $('#btn-export').onclick = ()=>{
    const name = filenameFor(state.currentPreset, state.currentLens, (state.lastOutput||'').split('\n')[0]||'');
    saveFile(name, state.lastOutput||'');
  };
  $('#btn-save-notes').onclick = async ()=>{
    if (!state.lastOutput?.trim()) return toast('Nothing to save','warn');
    const id = await saveCurrentToLibrary(state.lastOutput);
    toast('Saved to Library','good');
  };

  // Keyboard
  document.addEventListener('keydown', (e)=>{
    if ((e.ctrlKey || e.metaKey) && e.key==='Enter'){
      e.preventDefault();
      $('#btn-generate').click();
    } else if (e.key==='Escape'){
      e.preventDefault();
      $('#btn-stop').click();
    } else if (e.key==='/'){
      if (!$('#library-panel').hidden){
        e.preventDefault(); $('#lib-search').focus();
      }
    } else if (e.key==='.' && document.activeElement!==$('#seed')){
      e.preventDefault(); $('#seed').focus();
    }
  });

  // Conn dot on key change
  $('#api-key').addEventListener('input', ()=>updateConnDot());

  // Subtabs default
  selectSubView('formatted');

  // Render initial
  Settings.load();
  updateLengthCounters();
  setOutput('');

  // ===== Status msg heartbeat =====
  let lastLen = 0;
  setInterval(()=>{
    const out = state.lastOutput||'';
    const words = wordCount(out);
    const toks = approxTokens(out);
    $('#status-msg').textContent = `${words} words • ~${toks} tok`;
  }, 500);

})();
