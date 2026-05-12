(function(){
  const ASCII_START = 0x21;
  const ASCII_END = 0x7e;
  function toFullWidthAscii(input){
    return String(input ?? '').replace(/[!-~]/g, ch => {
      if (ch === ' ') return ch;
      return String.fromCharCode(ch.charCodeAt(0) + 0xFEE0);
    });
  }
  function cleanText(input){
    return String(input ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  function normalizeText(input, options={}){
    let text = cleanText(input);
    text = text.replace(/\.\.\.+/g, '……').replace(/…{3,}/g, '……');
    if (options.fullwidthAscii !== false) text = toFullWidthAscii(text);
    return text;
  }
  function escapeHtml(input){
    return String(input ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }
  window.CCLNormalize = { toFullWidthAscii, cleanText, normalizeText, escapeHtml };
})();
