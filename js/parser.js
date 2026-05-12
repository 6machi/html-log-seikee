(function(){
  const { cleanText, normalizeText } = window.CCLNormalize;

  function htmlToText(html){
    const div = document.createElement('div');
    div.innerHTML = String(html ?? '')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>/gi, '\n');
    return cleanText(div.textContent || '');
  }
  function colorFromStyle(style){
    const m = String(style || '').match(/color\s*:\s*([^;]+)/i);
    return m ? m[1].trim() : '#888888';
  }
  function isDiceText(text){
    const t = String(text || '').trim();
    if (!t) return false;
    return /\b(CCB|CBR|CC|SANC|SAN)\b/i.test(t)
      || /\b\d+\s*[dD]\s*\d+\b/.test(t)
      || /正気度ロール|SAN\s*(チェック|ck|値|減少|ロール)/i.test(t)
      || /[＞>]\s*(成功|失敗|スペシャル|クリティカル|ファンブル|決定的成功|致命的失敗)/.test(t);
  }
  function parseCcfoliaHtml(html, options){
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ps = Array.from(doc.querySelectorAll('p'));
    return ps.map((p, index) => {
      const spans = Array.from(p.querySelectorAll(':scope > span'));
      const tab = cleanText(spans[0]?.textContent || '').replace(/^\[|\]$/g, '');
      const name = cleanText(spans[1]?.textContent || '');
      const bodySpan = spans[2] || p;
      const rawBody = htmlToText(bodySpan.innerHTML);
      const body = normalizeText(rawBody, options);
      const color = colorFromStyle(p.getAttribute('style') || '');
      return {
        id:index,
        tab,
        name: normalizeText(name, options),
        rawName: name,
        body,
        color,
        isSystem: name.toLowerCase() === 'system',
        isDice: isDiceText(rawBody),
        isEmpty: body.trim().length === 0
      };
    }).filter(e => e.name || e.body);
  }
  function defaultPcNames(entries){
    return new Set(entries.filter(e => e.name && !e.isSystem && String(e.color).toLowerCase() !== '#888888').map(e => e.name));
  }
  function entriesToEditableText(entries, pcNames, options){
    const blocks = [];
    for (const e of entries){
      if (options.skipEmpty && e.isEmpty) continue;
      const isScenario = !pcNames.has(e.name) && !e.isDice && !e.isSystem;
      if (isScenario){
        blocks.push(`■ ${e.name}\n${e.body}`.trim());
      } else if (e.isDice || e.isSystem){
        blocks.push(`【${e.name || 'system'}】${e.body}`.trim());
      } else {
        blocks.push(`${e.name}\n${e.body}`.trim());
      }
    }
    return blocks.filter(Boolean).join('\n\n');
  }
  function parseEditableBlocks(text){
    return String(text || '').split(/\n{2,}/).map(b => b.trim()).filter(Boolean).map(block => {
      const lines = block.split('\n');
      const first = lines[0] || '';
      if (first.startsWith('■ ')) return {type:'narration', title:first.replace(/^■\s*/,''), body:lines.slice(1).join('\n').trim()};
      const callout = block.match(/^【([^】]+)】([\s\S]*)$/);
      if (callout) return {type:'dice', name:callout[1].trim(), body:callout[2].trim()};
      return {type:'speech', name:first.trim(), body:lines.slice(1).join('\n').trim()};
    });
  }
  window.CCLParser = { parseCcfoliaHtml, defaultPcNames, entriesToEditableText, parseEditableBlocks, isDiceText };
})();
