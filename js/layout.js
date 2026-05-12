(function(){
  const { escapeHtml } = window.CCLNormalize;
  const PAPER = {
    A5: {w:148, h:210, pad:{t:12,r:12,b:16,l:12}},
    B5: {w:182, h:257, pad:{t:14,r:14,b:18,l:14}},
    B6: {w:128, h:182, pad:{t:10,r:10,b:15,l:10}},
    A6: {w:105, h:148, pad:{t:9,r:9,b:14,l:9}}
  };
  function smartSplit(text, maxChars){
    const src = String(text || '').trim();
    if (!src) return [];
    const out = [];
    let rest = src;
    const limit = Math.max(8, Number(maxChars) || 30);
    while (rest.length > limit){
      let cut = rest.lastIndexOf('\n\n', limit);
      if (cut < limit * .45) cut = rest.lastIndexOf('\n', limit);
      if (cut < limit * .45) cut = rest.lastIndexOf('。', limit);
      if (cut < limit * .45) cut = rest.lastIndexOf('」', limit);
      if (cut < limit * .45) cut = rest.lastIndexOf('、', limit);
      if (cut < limit * .45) cut = limit - 1;
      out.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) out.push(rest);
    return out;
  }
  function mergeSpeechRuns(blocks, options){
    if (!options.mergeSameSpeaker) return blocks;
    const out = [];
    for (const b of blocks){
      const prev = out[out.length - 1];
      if (prev && prev.type === 'speech' && b.type === 'speech' && prev.name === b.name){
        prev.body = [prev.body, b.body].filter(Boolean).join('\n');
      } else {
        out.push({...b});
      }
    }
    return out;
  }
  function blockToUnits(block, settings){
    if (block.type === 'speech'){
      const chunks = smartSplit(block.body, settings.speechChars);
      return [{type:'run', speaker:block.name, chunks}];
    }
    if (block.type === 'dice'){
      const text = `【${block.name}】${block.body}`;
      const chunks = smartSplit(text.replace(/\n+/g, ' '), settings.diceChars);
      return chunks.map((chunk, i) => ({type:'dice', text:chunk, continued:i>0}));
    }
    const text = [block.title ? `◆${block.title}` : '', block.body].filter(Boolean).join('\n');
    return smartSplit(text, settings.narrChars).map((chunk, i) => ({type:'narr', text:chunk, continued:i>0}));
  }
  function unitWidth(unit){
    if (unit.type === 'run') return Math.max(1, unit.chunks.length);
    if (unit.type === 'dice') return 1.25;
    return 1;
  }
  function paginate(blocks, settings){
    const merged = mergeSpeechRuns(blocks, settings);
    const units = merged.flatMap(b => blockToUnits(b, settings));
    const pages = [];
    let cur = [];
    let used = 0;
    const maxCols = Math.max(4, Number(settings.maxCols) || 14);
    function pushPage(){ if (cur.length){ pages.push(cur); cur = []; used = 0; } }
    for (const unit of units){
      if (unit.type === 'run'){
        let chunks = unit.chunks.slice();
        while (chunks.length){
          const remaining = Math.max(1, Math.floor(maxCols - used));
          const take = Math.min(chunks.length, remaining);
          if (used > 0 && take <= 0){ pushPage(); continue; }
          if (used + take > maxCols && used > 0){ pushPage(); continue; }
          const part = {type:'run', speaker:unit.speaker, chunks:chunks.slice(0, take)};
          cur.push(part); used += take; chunks = chunks.slice(take);
          if (chunks.length) pushPage();
        }
      } else {
        const w = unitWidth(unit);
        if (used + w > maxCols && used > 0) pushPage();
        cur.push(unit); used += w;
      }
    }
    pushPage();
    return pages;
  }
  function pageStyle(settings){
    const p = PAPER[settings.paperSize] || PAPER.A5;
    return `width:${p.w}mm;height:${p.h}mm;padding:${p.pad.t}mm ${p.pad.r}mm ${p.pad.b}mm ${p.pad.l}mm;font-size:${settings.fontPt}pt;`;
  }
  function renderUnit(unit){
    if (unit.type === 'run'){
      const cols = unit.chunks.map(c => `<span class="run-col">${escapeHtml(c)}</span>`).join('');
      return `<section class="unit-run"><span class="run-speaker">${escapeHtml(unit.speaker)}</span><span class="run-rule"></span><span class="run-bodies">${cols}</span></section>`;
    }
    if (unit.type === 'dice') return `<section class="unit-dice">${escapeHtml(unit.text)}</section>`;
    const html = escapeHtml(unit.text).replace(/^◆([^\n]+)/, '<strong>◆$1</strong>');
    return `<section class="unit-narr">${html}</section>`;
  }
  function renderPages(pages, settings){
    return pages.map((page, index) => `<section class="print-page" style="${pageStyle(settings)}"><div class="print-content">${page.map(renderUnit).join('')}</div><div class="page-mark">-${index+1}P-</div></section>`).join('');
  }
  window.CCLLayout = { paginate, renderPages, PAPER };
})();
