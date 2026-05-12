(function(){
  const $ = id => document.getElementById(id);
  const state = { entries:[], pcNames:new Set(), pages:[], currentPage:0 };
  const sampleUrl = 'samples/sample-log.html';
  const els = {
    fileInput:$('fileInput'), status:$('status'), editor:$('editor'), pagePreview:$('pagePreview'), pageInfo:$('pageInfo'),
    findText:$('findText'), replaceText:$('replaceText'), findInfo:$('findInfo'), findResults:$('findResults')
  };
  function settings(){
    return {
      paperSize:$('paperSize').value,
      maxCols:Number($('maxCols').value),
      narrChars:Number($('narrChars').value),
      speechChars:Number($('speechChars').value),
      diceChars:Number($('diceChars').value),
      fontPt:Number($('fontPt').value),
      mergeSameSpeaker:$('mergeSameSpeaker').checked,
      fullwidthAscii:$('fullwidthAscii').checked,
      skipEmpty:$('skipEmpty').checked
    };
  }
  function loadHtmlString(html, label){
    const opts = settings();
    state.entries = CCLParser.parseCcfoliaHtml(html, opts);
    state.pcNames = CCLParser.defaultPcNames(state.entries);
    els.editor.value = CCLParser.entriesToEditableText(state.entries, state.pcNames, opts);
    els.status.textContent = `${label}：${state.entries.length}件読み込みました。`;
    buildPreview();
  }
  async function handleFile(){
    const file = els.fileInput.files?.[0];
    if (!file) return;
    const html = await file.text();
    loadHtmlString(html, file.name);
  }
  async function loadSample(){
    const res = await fetch(sampleUrl);
    if (!res.ok) throw new Error('サンプルを読み込めませんでした。');
    const html = await res.text();
    loadHtmlString(html, 'サンプル');
  }
  function buildPreview(){
    const blocks = CCLParser.parseEditableBlocks(els.editor.value);
    state.pages = CCLLayout.paginate(blocks, settings());
    state.currentPage = Math.min(state.currentPage, Math.max(0, state.pages.length - 1));
    renderCurrentPage();
  }
  function renderCurrentPage(){
    if (!state.pages.length){
      els.pagePreview.innerHTML = '';
      els.pageInfo.textContent = '0 / 0';
      return;
    }
    const one = [state.pages[state.currentPage]];
    els.pagePreview.innerHTML = CCLLayout.renderPages(one, settings());
    els.pageInfo.textContent = `${state.currentPage + 1} / ${state.pages.length}`;
  }
  function printAll(){
    buildPreview();
    $('printRoot').innerHTML = CCLLayout.renderPages(state.pages, settings());
    window.print();
  }
  function runFind(){
    const hits = CCLSearch.searchInTextarea(els.editor, els.findText.value);
    els.findInfo.textContent = hits.length ? `${hits.length}件ヒット` : '検索結果なし';
    els.findResults.innerHTML = hits.slice(0, 40).map((h, i) => `<button class="find-hit" data-index="${h.index}">${i+1}. ${CCLNormalize.escapeHtml(h.context)}</button>`).join('');
    els.findResults.querySelectorAll('.find-hit').forEach(btn => btn.addEventListener('click', () => {
      const start = Number(btn.dataset.index);
      const end = start + els.findText.value.length;
      els.editor.focus();
      els.editor.setSelectionRange(start, end);
      const lineHeight = 24;
      const before = els.editor.value.slice(0, start).split('\n').length;
      els.editor.scrollTop = Math.max(0, (before - 6) * lineHeight);
    }));
  }
  function replaceAll(){
    const q = els.findText.value;
    if (!q) return;
    els.editor.value = els.editor.value.split(q).join(els.replaceText.value || '');
    runFind(); buildPreview();
  }
  $('fileInput').addEventListener('change', handleFile);
  $('loadSampleBtn').addEventListener('click', () => loadSample().catch(err => els.status.textContent = err.message));
  $('clearBtn').addEventListener('click', () => { state.entries=[]; state.pages=[]; els.editor.value=''; els.pagePreview.innerHTML=''; els.status.textContent='クリアしました。'; renderCurrentPage(); });
  $('applyBtn').addEventListener('click', buildPreview);
  $('printBtn').addEventListener('click', printAll);
  $('prevPageBtn').addEventListener('click', () => { if (state.currentPage > 0){ state.currentPage--; renderCurrentPage(); } });
  $('nextPageBtn').addEventListener('click', () => { if (state.currentPage < state.pages.length - 1){ state.currentPage++; renderCurrentPage(); } });
  $('findBtn').addEventListener('click', runFind);
  $('replaceAllBtn').addEventListener('click', replaceAll);
  ['paperSize','maxCols','narrChars','speechChars','diceChars','fontPt','mergeSameSpeaker','fullwidthAscii','skipEmpty'].forEach(id => $(id).addEventListener('change', buildPreview));
  window.addEventListener('error', ev => { els.status.textContent = `エラー：${ev.message}`; });
})();
