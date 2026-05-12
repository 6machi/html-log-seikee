(function(){
  function searchInTextarea(textarea, query){
    const q = String(query || '');
    if (!q) return [];
    const text = textarea.value;
    const hits = [];
    let idx = 0;
    while ((idx = text.indexOf(q, idx)) !== -1){
      hits.push({index:idx, context:text.slice(Math.max(0, idx-24), Math.min(text.length, idx+q.length+36)).replace(/\n/g, ' / ')});
      idx += Math.max(1, q.length);
      if (hits.length > 200) break;
    }
    return hits;
  }
  window.CCLSearch = { searchInTextarea };
})();
