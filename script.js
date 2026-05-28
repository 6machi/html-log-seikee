'use strict';
let entries=[];let excludedNames=new Set();let bodyOnlyNames=new Set();let pcNames=new Set();let displayNames=new Map();let nameAliases=new Map();let isHorizontal=false;let updateTimer=null;let previewBlocks=[];
const $=id=>document.getElementById(id);
const els={fileInput:$('fileInput'),nameList:$('nameList'),textEditor:$('textEditor'),verticalPage:$('verticalPage'),previewShell:$('previewShell'),rawPreview:$('rawPreview')};
function escapeHtml(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function cleanText(v){return String(v??'').replace(/\u00a0/g,' ').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim()}
function htmlToText(html){const d=document.createElement('div');d.innerHTML=String(html).replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/p>/gi,'\n');return cleanText(d.textContent||'')}
function colorFromStyle(style){const m=String(style||'').match(/color\s*:\s*([^;]+)/i);return m?m[1].trim():'#888888'}
function isDiceText(text){const t=String(text||'').trim();if(!t)return false;const formula=/\b(CCB|CC|C)\s*[<＜=≦]/i.test(t)||/\b\d+\s*[dD]\s*\d+\b/.test(t)||/正気度ロール|SAN\s*(チェック|ck|値|減少|ロール)/i.test(t);if(!formula)return false;return /成功|失敗|スペシャル|クリティカル|ファンブル|決定的成功|致命的失敗/.test(t)||/[＞>]\s*\d+|[＜<]\s*\d+|=\s*\d+/.test(t)||/→|⇒/.test(t)||formula}
function processBody(body){let t=toFullWidthAsciiExceptLetters(cleanText(body));if($('fullWidthPunctuation').checked){t=t.replace(/\.{3,}/g,'……').replace(/…{3,}/g,'……').replace(/!/g,'！').replace(/\?/g,'？').replace(/:/g,'：')}return t}
function parseCcfoliaHtml(html){const doc=new DOMParser().parseFromString(html,'text/html');const ps=[...doc.querySelectorAll('p')];return ps.map((p,i)=>{const spans=[...p.querySelectorAll(':scope > span')];const tab=cleanText(spans[0]?.textContent||'').replace(/^\[|\]$/g,'');const name=cleanText(spans[1]?.textContent||'');const bodySpan=spans[2]||p;const body=htmlToText(bodySpan.innerHTML);const color=colorFromStyle(p.getAttribute('style')||'');return {id:i,tab,name,body,color,isDice:isDiceText(body),isSystem:name.toLowerCase()==='system',isEmpty:body.trim().length===0}}).filter(e=>e.name||e.body)}
async function parseSelectedFile(){const file=els.fileInput.files?.[0];if(!file){alert('HTMLファイルを選んでください');return}const html=await file.text();entries=parseCcfoliaHtml(html);excludedNames=new Set();bodyOnlyNames=new Set();displayNames=new Map([...new Set(entries.map(e=>e.name).filter(Boolean))].map(n=>[n,n]));nameAliases=new Map([...displayNames.keys()].map(n=>[n,new Set([n])]));pcNames=new Set(entries.filter(e=>e.name&&!e.isSystem&&e.color.toLowerCase()!=='#888888').map(e=>e.name));renderNameList();renderAll(false)}


function speakerMatchKey(value){
  // 話者照合専用キー。
  // 表示上の縦書き変換で「###2-1」→「＃＃＃２－１」になっても一致するよう、
  // Unicode正規化で半角/全角・記号差を吸収してから比較する。
  return cleanText(value||'')
    .normalize('NFKC')
    .replace(/[\s　]+/g,'')
    .toLocaleLowerCase('ja-JP');
}
function speakerAliasVariants(value){
  const raw=cleanText(value||'');
  if(!raw)return [];
  const vals=new Set([raw, normalizeSpeakerName(raw), raw.normalize('NFKC')]);
  // 「###2-1 導入」系は、編集テキストでは「###2-1」だけ残ることがある。
  const tokens=raw.split(/[\s　]+/).filter(Boolean);
  if(tokens.length>1){
    vals.add(tokens[0]);
    vals.add(normalizeSpeakerName(tokens[0]));
    vals.add(tokens[0].normalize('NFKC'));
  }
  // 「かぐや（竹宮月子）」系は、表示名で「かぐや」だけにする運用がある。
  const beforeParen=raw.split(/[（(]/)[0].trim();
  if(beforeParen && beforeParen!==raw){
    vals.add(beforeParen);
    vals.add(normalizeSpeakerName(beforeParen));
    vals.add(beforeParen.normalize('NFKC'));
  }
  return [...vals].filter(Boolean);
}
function rememberNameAlias(original,value){
  if(!original)return;
  if(!nameAliases.has(original)) nameAliases.set(original,new Set());
  speakerAliasVariants(original).forEach(v=>nameAliases.get(original).add(v));
  speakerAliasVariants(value).forEach(v=>nameAliases.get(original).add(v));
}
function speakerCodeLikeKey(key){
  return /^#+[0-9]/.test(key) || /^scene[0-9]/i.test(key) || /^[0-9]+[-_]/.test(key);
}
function canonicalSpeakerName(raw){
  const name=cleanText(raw||'');
  if(!name)return '';
  if(displayNames.has(name)||pcNames.has(name)||bodyOnlyNames.has(name)||excludedNames.has(name)) return name;
  const key=speakerMatchKey(name);
  const tryMatch=(orig, val)=>{
    const k=speakerMatchKey(val);
    if(!k)return false;
    if(k===key)return true;
    // タイトル系「###2-1 導入」と「###2-1」は同一視する。
    if((speakerCodeLikeKey(k)||speakerCodeLikeKey(key)) && (k.startsWith(key)||key.startsWith(k))) return true;
    return false;
  };
  for(const [orig,set] of nameAliases.entries()){
    if(tryMatch(orig,orig))return orig;
    if(set){for(const alias of set){if(tryMatch(orig,alias))return orig;}}
  }
  for(const [orig,disp] of displayNames.entries()){
    if(tryMatch(orig,orig)||tryMatch(orig,disp)) return orig;
    for(const alias of speakerAliasVariants(orig)){ if(tryMatch(orig,alias)) return orig; }
    for(const alias of speakerAliasVariants(disp)){ if(tryMatch(orig,alias)) return orig; }
  }
  return name;
}
function displayForSpeaker(raw){
  const canon=canonicalSpeakerName(raw);
  return displayNames.get(canon)||raw||canon;
}
function isPcName(raw){return pcNames.has(canonicalSpeakerName(raw))}
function isBodyOnlyName(raw){return bodyOnlyNames.has(canonicalSpeakerName(raw))}
function isExcludedName(raw){return excludedNames.has(canonicalSpeakerName(raw))}

function selectedEditorText(){
  const el=els.textEditor;
  return {el,start:el.selectionStart??0,end:el.selectionEnd??0,text:el.value.slice(el.selectionStart??0,el.selectionEnd??0)};
}
function replaceEditorSelection(next,selectInner=false,innerOffset=0){
  const el=els.textEditor;
  const start=el.selectionStart??0;
  const end=el.selectionEnd??0;
  el.setRangeText(next,start,end,'end');
  if(selectInner){
    el.selectionStart=start+innerOffset;
    el.selectionEnd=start+next.length-innerOffset;
  }
  el.focus();
  findMatches=[];findIndex=-1;$('findCounter').textContent='0 / 0';
}
function wrapEditorSelection(open,close,placeholder){
  const el=els.textEditor;
  const raw=el.value||'';
  let start=el.selectionStart??0;
  let end=el.selectionEnd??start;
  const hasSelection=end>start;
  let body='';
  if(hasSelection){
    body=raw.slice(start,end).trim();
  }else{
    const lineStart=raw.lastIndexOf('\n',Math.max(0,start-1))+1;
    const nextNl=raw.indexOf('\n',start);
    const lineEnd=nextNl<0?raw.length:nextNl;
    const line=raw.slice(lineStart,lineEnd).trim();
    if(line){start=lineStart;end=lineEnd;body=line;}
  }
  if(!body) body=placeholder;
  const before=raw.slice(0,start);
  const after=raw.slice(end);
  const prefix=before && !/\n\n$/.test(before) ? (before.endsWith('\n')?'\n':'\n\n') : '';
  const suffix=after && !/^\n\n/.test(after) ? (after.startsWith('\n')?'\n':'\n\n') : '';
  const next=`${prefix}${open}\n${body}\n${close}${suffix}`;
  el.setRangeText(next,start,end,'end');
  if(!hasSelection && body===placeholder){
    const innerStart=start+prefix.length+open.length+1;
    el.selectionStart=innerStart;
    el.selectionEnd=innerStart+placeholder.length;
  }
  el.focus();
  findMatches=[];findIndex=-1;$('findCounter').textContent='0 / 0';
}
function insertEditorBlock(text){
  const el=els.textEditor;
  const start=el.selectionStart??0;
  const before=el.value.slice(0,start);
  const after=el.value.slice(el.selectionEnd??start);
  const prefix=before && !/\n\n$/.test(before) ? (before.endsWith('\n')?'\n':'\n\n') : '';
  const suffix=after && !/^\n\n/.test(after) ? (after.startsWith('\n')?'\n':'\n\n') : '';
  el.setRangeText(prefix+text+suffix, start, el.selectionEnd??start, 'end');
  el.focus();
  findMatches=[];findIndex=-1;$('findCounter').textContent='0 / 0';
}
function markTitlePage(){wrapEditorSelection('［タイトルページ］','［／タイトルページ］','タイトルを入力');}
function markSystemBox(){wrapEditorSelection('［システム枠］','［／システム枠］','ここにシステム枠にしたい文章');}
function markInfoBox(){wrapEditorSelection('［情報枠］','［／情報枠］','ここに長文情報枠にしたい文章');}
function insertRecallLine(){insertEditorBlock('————————————');}
function insertTimeDots(){insertEditorBlock('・・・・・・\n・・・・・\n・・・・\n・・・\n・・\n・');}
function applySpeakerSettingsToEditor(){
  const originalText=els.textEditor.value||'';
  if(!originalText.trim()){alert('編集テキストが空です');return}

  const nameRows=[...displayNames.keys()].map(orig=>{
    rememberNameAlias(orig, displayNames.get(orig)||orig);
    const aliases=new Set();
    speakerAliasVariants(orig).forEach(v=>aliases.add(v));
    speakerAliasVariants(displayNames.get(orig)||orig).forEach(v=>aliases.add(v));
    const saved=nameAliases.get(orig);
    if(saved) saved.forEach(v=>speakerAliasVariants(v).forEach(x=>aliases.add(x)));
    const cleanAliases=[...aliases].map(v=>cleanText(v)).filter(Boolean);
    const aliasKeys=new Set(cleanAliases.map(v=>speakerMatchKey(v)));
    const role=isExcludedName(orig)?'off':isBodyOnlyName(orig)?'body':isPcName(orig)?'pc':'kp';
    return {orig, display:cleanText(displayNames.get(orig)||orig), role, aliases:cleanAliases, aliasKeys};
  });
  const aliasToRow=[];
  nameRows.forEach(row=>row.aliases.forEach(a=>aliasToRow.push([a,row])));
  aliasToRow.sort((a,b)=>b[0].length-a[0].length);

  function rowForName(name){
    const n=cleanText(name||'');
    if(!n)return null;
    const key=speakerMatchKey(n);
    const canon=canonicalSpeakerName(n);
    let direct=nameRows.find(r=>r.orig===canon || r.aliasKeys.has(key) || r.aliases.some(a=>speakerMatchKey(a)===key));
    if(direct)return direct;
    // 「###2-1 導入」⇔「###2-1」など、タイトルコードの部分一致。
    direct=nameRows.find(r=>[...r.aliasKeys].some(k=>(speakerCodeLikeKey(k)||speakerCodeLikeKey(key))&&(k.startsWith(key)||key.startsWith(k))));
    return direct||null;
  }
  function escReg(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
  function normalizeBlockNewlines(s){return String(s||'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim()}

  function transformCalloutLine(line){
    const m=String(line).match(/^([ \t]*)【([^】]+)】([\s\S]*)$/);
    if(!m)return {text:line, changed:false, touched:false};
    const row=rowForName(m[2]);
    if(!row)return {text:line, changed:false, touched:false};
    const indent=m[1]||'';
    const body=cleanText(m[3]||'');
    let next=line;
    if(row.role==='off') next='';
    else if(row.role==='body') next=body;
    else if(row.role==='pc') next=body ? `${row.display}\n${body}` : row.display;
    else next=body ? `■ ${row.display}\n${body}` : `■ ${row.display}`;
    return {text:next, changed:next!==line, touched:true};
  }

  function transformSingleSpeakerLine(line){
    const raw=String(line||'');
    const clean=cleanText(raw);
    if(!clean)return {text:line, changed:false, touched:false, removeFollowing:false};

    // ■/◆ 話者名
    const heading=clean.match(/^([■◆])\s*(.+)$/);
    if(heading){
      const row=rowForName(heading[2]);
      if(!row)return {text:line, changed:false, touched:false, removeFollowing:false};
      let next=line;
      if(row.role==='off') next='';
      else if(row.role==='body') next='';
      else if(row.role==='pc') next=row.display;
      else next=`${heading[1]} ${row.display}`;
      return {text:next, changed:next!==line, touched:true, removeFollowing:row.role==='off'};
    }

    // 話者名：本文
    for(const [alias,row] of aliasToRow){
      const re=new RegExp(`^${escReg(alias)}\\s*[：:]\\s*([\\s\\S]*)$`);
      const m=clean.match(re);
      if(m){
        const body=cleanText(m[1]||'');
        let next=line;
        if(row.role==='off') next='';
        else if(row.role==='body') next=body;
        else if(row.role==='pc') next=body ? `${row.display}\n${body}` : row.display;
        else next=body ? `■ ${row.display}\n${body}` : `■ ${row.display}`;
        return {text:next, changed:next!==line, touched:true, removeFollowing:row.role==='off'};
      }
    }

    // 話者名だけの行。完全一致またはタイトルコード一致だけにする。
    const row=rowForName(clean);
    if(row){
      let next=line;
      if(row.role==='off') next='';
      else if(row.role==='body') next='';
      else if(row.role==='pc') next=row.display;
      else next=`■ ${row.display}`;
      return {text:next, changed:next!==line, touched:true, removeFollowing:row.role==='off'};
    }
    return {text:line, changed:false, touched:false, removeFollowing:false};
  }

  function lineLooksLikeAnySpeaker(line){
    const clean=cleanText(line||'');
    if(!clean)return false;
    if(/^【([^】]+)】/.test(clean)) return !!rowForName(clean.match(/^【([^】]+)】/)[1]);
    const h=clean.match(/^([■◆])\s*(.+)$/);
    if(h && rowForName(h[2]))return true;
    if(rowForName(clean))return true;
    return false;
  }

  function transformSpeakerBlock(block){
    if(!block.trim())return {text:block, changed:false, touched:false};
    const lines=block.split('\n');
    let touched=false, changed=false;
    let out=[];
    let skipUntilBoundary=false;

    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(skipUntilBoundary){
        if(!cleanText(line)) { out.push(line); skipUntilBoundary=false; continue; }
        if(lineLooksLikeAnySpeaker(line)){ skipUntilBoundary=false; }
        else { changed=true; continue; }
      }
      const call=transformCalloutLine(line);
      if(call.touched){
        touched=true; if(call.changed)changed=true;
        if(call.text) out.push(...call.text.split('\n'));
        continue;
      }
      const sp=transformSingleSpeakerLine(line);
      if(sp.touched){
        touched=true; if(sp.changed)changed=true;
        if(sp.text) out.push(...sp.text.split('\n'));
        if(sp.removeFollowing) skipUntilBoundary=true;
        continue;
      }
      out.push(line);
    }
    return {text:normalizeBlockNewlines(out.join('\n')), changed, touched};
  }

  const tokens=originalText.split(/(\n{2,})/);
  let changed=0;
  let touched=0;
  const out=tokens.map(tok=>{
    if(/^\n{2,}$/.test(tok))return tok;
    const r=transformSpeakerBlock(tok);
    if(r.touched)touched++;
    if(r.changed)changed++;
    return r.text;
  }).join('').replace(/\n{3,}/g,'\n\n').trim();

  if(changed){
    els.textEditor.value=out;
    schedulePreview();
    findMatches=[];findIndex=-1;
    const counter=$('findCounter'); if(counter)counter.textContent='0 / 0';
    alert(`${changed}ブロックの話者設定を編集テキストへ反映しました。`);
  }else if(touched){
    alert('話者設定は見つかりましたが、編集テキスト上で変更が必要な箇所はありませんでした。');
  }else{
    alert('編集テキスト内に、話者設定と一致する話者名が見つかりませんでした。\n半角/全角や「###2-1」形式も吸収しますが、該当名が本文中だけにある場合は反映対象になりません。');
  }
}


function scenarioKeys(){return $('scenarioNames').value.split(',').map(s=>s.trim()).filter(Boolean)}
function isScenarioEntry(e){if(e.isSystem)return false;if(!$('scenarioAsNarration').checked)return false;const low=String(e.color||'').toLowerCase();return low==='#888888'&&scenarioKeys().some(k=>e.name.startsWith(k)||e.name.includes(k))}
function filteredEntries(){let list=entries.filter(e=>{if($('skipEmpty').checked&&e.isEmpty)return false;if($('skipDice').checked&&e.isDice)return false;if($('skipSystem').checked&&e.isSystem)return false;if(isExcludedName(e.name))return false;return true});if($('mergeSameSpeaker').checked)list=mergeEntries(list);return list}
function mergeEntries(list){const out=[];for(const e of list){const p=out[out.length-1];const same=p&&p.name===e.name&&p.isDice===e.isDice&&isScenarioEntry(p)===isScenarioEntry(e);if(same&&!e.isDice&&!e.isSystem){p.body=[p.body,e.body].filter(Boolean).join('\n')}else out.push({...e})}return out}
function entryToText(e){const body=processBody(e.body);if(isBodyOnlyName(e.name))return body;const shown=normalizeSpeakerName(displayForSpeaker(e.name));if(isScenarioEntry(e))return `■ ${shown}\n${body}`;if(e.isSystem||e.isDice)return `【${shown||e.name||'system'}】${body}`;return `${shown}\n${body}`}
function renderAll(keep=true){const list=filteredEntries();els.textEditor.value=normalizeStoryVerticalText(list.map(entryToText).join('\n\n')).trim();renderRaw(list);renderStats(list)}
function renderStats(list){$('statTotal').textContent=entries.length;$('statShown').textContent=list.length;$('statDice').textContent=entries.filter(e=>e.isDice).length;$('statNames').textContent=new Set(entries.map(e=>e.name).filter(Boolean)).size}
function renderRaw(list){els.rawPreview.innerHTML=`<div class="raw-item"><div class="raw-meta"><b>抽出ログ</b></div><div class="raw-body">軽量化のため、抽出ログの全件プレビューは表示していません。抽出件数：${list.length}件</div></div>`}
function renderNameList(){const counts=new Map();const colors=new Map();for(const e of entries){if(!e.name)continue;counts.set(e.name,(counts.get(e.name)||0)+1);if(!colors.has(e.name))colors.set(e.name,e.color)}els.nameList.innerHTML='';[...counts.keys()].sort((a,b)=>a.localeCompare(b,'ja')).forEach(name=>{const role=excludedNames.has(name)?'off':bodyOnlyNames.has(name)?'body':pcNames.has(name)?'pc':'kp';const label=role==='pc'?'PC会話':role==='kp'?'KP/描写':role==='body'?'本文だけ':'非表示';const chip=document.createElement('div');chip.className='chip';chip.innerHTML=`<div><div class="chip-title"><span class="dot" style="--c:${escapeHtml(colors.get(name)||'#888')}"></span><b title="${escapeHtml(name)}">${escapeHtml(name)}</b></div><small>${counts.get(name)}件 / <span class="role ${role}">${label}</span></small><label class="display-name-label">表示名<input type="text" value="${escapeHtml(displayNames.get(name)||name)}" aria-label="PDF/編集表示名"></label></div><div class="role-buttons"><button class="secondary small" data-role="pc">PC</button><button class="secondary small" data-role="kp">KP</button><button class="secondary small" data-role="body">本文だけ</button><button class="secondary small" data-role="off">非表示</button></div>`;chip.querySelector('input').addEventListener('input',ev=>{rememberNameAlias(name,displayNames.get(name)||name);displayNames.set(name,ev.target.value||name);rememberNameAlias(name,ev.target.value||name);});chip.querySelectorAll('button[data-role]').forEach(btn=>btn.addEventListener('click',()=>setRole(name,btn.dataset.role)));els.nameList.appendChild(chip)})}
function setRole(name,role){name=canonicalSpeakerName(name);pcNames.delete(name);excludedNames.delete(name);bodyOnlyNames.delete(name);if(role==='pc')pcNames.add(name);else if(role==='body')bodyOnlyNames.add(name);else if(role==='off')excludedNames.add(name);renderNameList();renderStats(filteredEntries())}
function splitEditableBlocks(text){
  // beta7: タイトルページ・システム枠・情報枠の中に空行があると、
  // 以前の split(/\n{2,}/) では途中で分断され、PDF側で特殊ブロックとして認識できなかった。
  // ここではマーカー内だけは空行ごと丸ごと保持する。
  const lines=String(text||'').replace(/\r/g,'').split('\n');
  const blocks=[];
  let buf=[];
  const flush=()=>{
    const t=buf.join('\n').trim();
    if(t) blocks.push(t);
    buf=[];
  };
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    const open=line.trim().match(/^［(タイトルページ|システム枠|情報枠)］$/);
    if(open){
      flush();
      const kind=open[1];
      const marker=[line];
      const closeRe=new RegExp('^［[／\\/](?:'+kind+')］$');
      i++;
      for(;i<lines.length;i++){
        marker.push(lines[i]);
        if(closeRe.test(lines[i].trim())) break;
      }
      blocks.push(marker.join('\n').trim());
      continue;
    }
    if(line.trim()===''){
      flush();
    }else{
      buf.push(line);
    }
  }
  flush();
  return blocks;
}
function parseEditableBlocks(text){return splitEditableBlocks(text).map(block=>{
  const marked=block.match(/^［(タイトルページ|システム枠|情報枠)］\n?([\s\S]*?)\n?［[／\/](?:タイトルページ|システム枠|情報枠)］$/);
  if(marked){
    const kind=marked[1];
    const body=normalizeStoryVerticalText(marked[2].trim());
    if(kind==='タイトルページ')return {type:'titlepage',body};
    if(kind==='システム枠')return {type:'dicebox',body};
    return {type:'infobox',body};
  }
  const plain=block.replace(/[\s　\n]/g,'');
  if(/^[-—―─━ー]+$/.test(plain))return {type:'divider',body:'————————————'};
  if(/^(・+)+$/.test(plain) && block.includes('\n'))return {type:'dots',body:normalizeStoryVerticalText(block)};
  const lines=block.split('\n');
  const first=lines[0]||'';
  if(first.startsWith('■ '))return {type:'heading',title:normalizeStoryVerticalText(first.replace(/^■\s*/,'')),body:normalizeStoryVerticalText(lines.slice(1).join('\n').trim())};
  const callout=block.match(/^【([^】]+)】([\s\S]*)$/);
  if(callout)return {type:'callout',name:callout[1].trim(),body:normalizeStoryVerticalText(callout[2].trim())};
  return {type:'speech',name:first.trim(),body:normalizeStoryVerticalText(lines.slice(1).join('\n').trim())}
})}
function isPcBlock(b){return b.type==='speech'&&isPcName(b.name)}
function isNarrationBlock(b){return b.type==='heading'||(b.type==='speech'&&!isPcName(b.name))}
function mergeEditableBlocks(blocks){
  if(!$('mergeSameSpeaker') || !$('mergeSameSpeaker').checked) return blocks;
  const out=[];
  for(const b of blocks){
    const p=out[out.length-1];
    const same=p && b && p.type===b.type && p.type==='speech' && canonicalSpeakerName(p.name)===canonicalSpeakerName(b.name);
    if(same){
      p.body=[p.body,b.body].filter(Boolean).join('\n');
    }else{
      out.push({...b});
    }
  }
  return out;
}
function renderBlocks(blocks){
  blocks.forEach((b,i)=>b.__idx=i);
  const out=[];let i=0;
  while(i<blocks.length){
    const b=blocks[i];
    if(isPcBlock(b)){
      const group=[];
      while(i<blocks.length&&isPcBlock(blocks[i]))group.push(blocks[i++]);
      out.push(renderPcGroup(group));
      continue;
    }
    if(isNarrationBlock(b)){out.push(renderNarrationBlock(b));i++;continue;}
    out.push(renderCallout(b));i++;
  }
  return out.join('')
}
function renderPcGroup(group){return `<section class="pc-group">${group.map((b,i)=>{const prev=group[i-1];const next=group[i+1];const samePrev=prev&&canonicalSpeakerName(prev.name)===canonicalSpeakerName(b.name);const sameNext=next&&canonicalSpeakerName(next.name)===canonicalSpeakerName(b.name);const cls=['pc-turn'];if(samePrev)cls.push('speaker-continued');if(prev&&canonicalSpeakerName(prev.name)!==canonicalSpeakerName(b.name))cls.push('speaker-change');if(next)cls.push('dialogue-connect');return `<div class="${cls.join(' ')}" data-block="${b.__idx}"><span class="pc-speaker">${escapeHtml(samePrev?'':normalizeSpeakerName(displayForSpeaker(b.name)))}</span><span class="pc-body preview-editable" contenteditable="true" spellcheck="false" data-block="${b.__idx}" data-field="body">${escapeHtml(b.body||'　')}</span></div>`}).join('')}</section>`}
function renderCallout(b){
  const label=`【${b.name||'system'}】`;
  const raw=cleanText(b.body||'');
  const full=b.type==='callout' ? (label+raw) : raw;
  return `<section class="dice preview-editable" contenteditable="true" spellcheck="false" data-block="${b.__idx}" data-field="body"><span class="dice-text">${escapeHtml(full||'　')}</span></section>`;
}
function renderNarrationBlock(b){
  let text='';
  if(b.type==='heading'){
    const title=normalizeStoryVerticalText(cleanText(b.title));
    const body=normalizeStoryVerticalText(cleanText(b.body));
    text=[title?`◆ ${title}`:'',body].filter(Boolean).join('\n');
  }else{
    text=normalizeStoryVerticalText(cleanText(b.body));
  }
  if(!text)return '';
  const html=escapeHtml(text).replace(/^◆\s*([^\n]+)/,'<span class="mark">◆</span> <strong>$1</strong>');
  return `<section class="narration preview-editable" contenteditable="true" spellcheck="false" data-block="${b.__idx}" data-field="${b.type==='heading'?'heading':'body'}">${html}</section>`;
}
function applySettings(){const root=els.verticalPage;root.style.setProperty('--preview-font',$('fontSize').value);root.style.setProperty('--speaker-height',$('speakerHeight').value);root.style.setProperty('--speaker-font',$('speakerFont').value);const h=$('bodyHeight').value;root.style.setProperty('--body-height',h==='auto'?'auto':h);root.style.setProperty('--turn-gap',$('turnGap').value);root.classList.toggle('horizontal',isHorizontal)}
function updatePreview(keep=true){const shell=els.previewShell;const nearStart=shell.scrollLeft>shell.scrollWidth-shell.clientWidth-120;previewBlocks=mergeEditableBlocks(parseEditableBlocks(els.textEditor.value));els.verticalPage.innerHTML=renderBlocks(previewBlocks);applySettings();if(!keep||nearStart)requestAnimationFrame(scrollStart)}
function schedulePreview(){/* beta4: 入力中の自動縦書きプレビュー生成は重いため停止 */}
function scrollStart(){els.previewShell.scrollTop=0;els.previewShell.scrollLeft=els.previewShell.scrollWidth;requestAnimationFrame(()=>{els.previewShell.scrollLeft=els.previewShell.scrollWidth})}
function blockToEditableText(b){
  if(!b)return '';
  if(b.type==='titlepage') return `［タイトルページ］\n${b.body||''}\n［／タイトルページ］`;
  if(b.type==='dicebox') return `［システム枠］\n${b.body||''}\n［／システム枠］`;
  if(b.type==='infobox') return `［情報枠］\n${b.body||''}\n［／情報枠］`;
  if(b.type==='divider') return b.body||'————————————';
  if(b.type==='dots') return b.body||'・・・・・・\n・・・・・\n・・・・\n・・・\n・・\n・';
  if(b.type==='heading') return [`■ ${b.title||''}`, b.body||''].filter(Boolean).join('\n');
  if(b.type==='callout'||b.type==='dice') return `【${b.name||'system'}】${b.body||''}`;
  return [b.name||'', b.body||''].filter(Boolean).join('\n');
}
function blocksToEditableText(blocks){return blocks.map(blockToEditableText).filter(Boolean).join('\n\n').trim()}
function plainTextFromEditable(el){return String(el.innerText||el.textContent||'').replace(/\u00a0/g,' ').replace(/\r/g,'').trim()}
function applyPreviewEdit(el){
  const idx=parseInt(el.dataset.block||'-1',10);
  const field=el.dataset.field||'body';
  const b=previewBlocks[idx];
  if(!b)return;
  let t=normalizeStoryVerticalText(plainTextFromEditable(el));
  if(b.type==='heading' && field==='heading'){
    t=t.replace(/^◆\s*/, '');
    const parts=t.split(/\n/);
    b.title=(parts.shift()||b.title||'').trim();
    b.body=parts.join('\n').trim();
  }else if((b.type==='callout'||b.type==='dice') && /^【[^】]+】/.test(t)){
    const m=t.match(/^【([^】]+)】([\s\S]*)$/);
    b.name=(m[1]||b.name||'').trim();
    b.body=(m[2]||'').trim();
  }else{
    b.body=t;
  }
  els.textEditor.value=blocksToEditableText(previewBlocks);
  findMatches=[];findIndex=-1;$('findCounter').textContent='0 / 0';
  updatePreview(true);
}
els.verticalPage.addEventListener('keydown',e=>{
  if(e.target.closest('.preview-editable') && (e.metaKey||e.ctrlKey) && e.key==='Enter'){
    e.preventDefault(); e.target.blur();
  }
});
els.verticalPage.addEventListener('blur',e=>{const el=e.target.closest&&e.target.closest('.preview-editable');if(el)applyPreviewEdit(el)},true);
function showDemo(){entries=[];excludedNames=new Set();bodyOnlyNames=new Set();pcNames=new Set(['皇 政宗','烏丸 かがみ']);displayNames=new Map([['皇 政宗','皇 政宗'],['烏丸 かがみ','烏丸 かがみ'],['KP','KP']]);nameAliases=new Map([...displayNames.keys()].map(n=>[n,new Set([n])]));els.textEditor.value=`■ 使い方\n1. ココフォリアから書き出したHTMLログを選びます。\n2. 「読み込む」を押します。\n3. 話者設定でPC/KP/除外を選びます。\n4. 必要なら編集テキストを直します。\n5. 印刷/PDFで保存します。\n\n皇 政宗\n「これは発言の例です」\n\n烏丸 かがみ\nト書きや行動描写もそのまま入れられます。\n「セリフも混ぜられます」\n\n【system】SAN : 65 → 64`;renderNameList();renderStats([]);renderRaw([])}
function downloadBlob(content,filename,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)}
async function copyEditor(){await navigator.clipboard.writeText(els.textEditor.value);alert('コピーしました')}
function downloadText(){downloadBlob(els.textEditor.value,'ccfolia_vertical_edit.txt','text/plain;charset=utf-8')}
function downloadHtml(){const css=[...document.querySelectorAll('style')].map(s=>s.textContent).join('\n');const html=`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>縦書きログ</title><style>${css}\nbody{background:#fff}.page{height:240mm}
.preset-card{border:1px solid var(--line);border-radius:18px;background:#fffaf0;padding:14px 15px;margin-bottom:12px;line-height:1.8;color:#5b4b2b}.preset-card b{display:block;color:#1f2937;font-size:16px;margin-bottom:4px}.preset-card p{margin:0 0 6px}.preset-card .mini{font-size:12px;color:#88724b}.settings-simple .buttons{margin-top:12px}.save-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.save-actions button{min-height:40px}.editor-actions-note{font-size:12px;color:#7a6b5c;line-height:1.6;margin:0 0 8px}.danger-note{background:#fff1f1;border:1px solid #f2c4c4;color:#7a2525;border-radius:14px;padding:9px 11px;font-size:12px;line-height:1.6;margin-bottom:10px}
</style></head><body><main><section class="preview-shell"><div class="page">${els.verticalPage.innerHTML}</div></section></main></body></html>`;downloadBlob(html,'ccfolia_vertical_book.html','text/html;charset=utf-8')}



function getPdfSpec(){
  const key=($('pdfSize')&&$('pdfSize').value)||'A5';
  const map={
    A5:{key:'A5',name:'A5',w:148,h:210,pt:10.2,line:1.72,pad:{t:12,r:12,b:18,l:12},speakerEm:6.2,dicePt:8.6},
    B5:{key:'B5',name:'B5',w:182,h:257,pt:10.8,line:1.76,pad:{t:14,r:14,b:20,l:14},speakerEm:6.4,dicePt:9.0},
    B6:{key:'B6',name:'B6',w:128,h:182,pt:9.4,line:1.66,pad:{t:11,r:10,b:17,l:10},speakerEm:5.8,dicePt:8.0},
    BUNKO:{key:'BUNKO',name:'文庫本',w:105,h:148,pt:8.6,line:1.58,pad:{t:10,r:9,b:16,l:9},speakerEm:5.4,dicePt:7.5},
    A6:{key:'A6',name:'A6',w:105,h:148,pt:8.6,line:1.58,pad:{t:10,r:9,b:16,l:9},speakerEm:5.4,dicePt:7.5}
  };
  const spec=map[key]||map.A5;
  const lineMode=($('pdfLines')&&$('pdfLines').value)||'normal';
  // v35: v34で少しだけ横切れしたため、A5の初期列数を1列だけ減らし、左側に微小安全域を戻す。
  // 左余白が気になる場合は最大列数を+1、切れる場合は-1で調整する。
  const numVal=(id, fallback)=>{ const el=$(id); const n=parseFloat(el&&el.value); return Number.isFinite(n)?n:fallback; };
  const safeRight=numVal('pdfSafeRight',2.0);
  const safeLeft=numVal('pdfSafeLeft',2.5);
  const safeBottom=numVal('pdfSafeBottom',4.0);
  const contentW=spec.w-spec.pad.r-spec.pad.l-safeRight-safeLeft;
  const contentH=spec.h-spec.pad.t-spec.pad.b-safeBottom;
  const mmPerPt=.35278;
  const charMm=spec.pt*mmPerPt*1.02;
  const colMm=spec.pt*mmPerPt*spec.line*1.03;
  spec.contentW=Math.max(10,contentW);
  spec.contentH=Math.max(20,contentH);
  spec.safeRight=safeRight;
  spec.safeLeft=safeLeft;
  spec.safeBottom=safeBottom;
  let chars=Math.max(18, Math.floor(spec.contentH/charMm)-4);
  if(lineMode==='tight') chars += 8;
  if(lineMode==='safe') chars -= 2;
  if(lineMode==='safer') chars -= 6;
  spec.charsPerCol=Math.max(14, chars);
  const physicalCols=Math.max(3, Math.floor(spec.contentW/colMm)-1);
  spec.colsPerPage=physicalCols;
  const manualPc=parseInt(($('pdfPcChars')&&$('pdfPcChars').value)||'',10);
  spec.pcChars=Number.isFinite(manualPc) && manualPc>0 ? Math.min(48, Math.max(10, manualPc)) : 30;
  spec.diceChars=Math.max(10, Math.floor(spec.charsPerCol*.60));
  const defaultCaps={A5:14,B5:18,B6:11,BUNKO:8,A6:8};
  const manualCap=parseInt(($('pdfMaxCols')&&$('pdfMaxCols').value)||'',10);
  const wanted=Number.isFinite(manualCap)&&manualCap>0 ? manualCap : (defaultCaps[spec.key]||physicalCols);
  spec.pageColCap=Math.max(3, Math.min(physicalCols, wanted));
  return spec;
}
function cloneBlock(b){return JSON.parse(JSON.stringify(b));}
function normalizeVerticalText(text){
  return String(text||'')
    .replace(/\r/g,'')
    .replace(/[ \t]+\n/g,'\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}
function toFullWidthAscii(str){
  // ダイスなど、英数字も含めて完全に全角へ寄せたい場面用。
  return String(str||'').replace(/[!-~]/g,function(ch){return String.fromCharCode(ch.charCodeAt(0)+0xFEE0);});
}
function toFullWidthAsciiExceptLetters(str){
  // ver18: 未使用。本文・セリフは normalizeStoryVerticalText で全角化します。
  // 縦書きCSS上で英字語句が横倒しのまとまりとして出やすくなり、
  // Call of Cthulhu などが C / . / all... のように割れるのを防ぐ。
  return String(str||'').replace(/[!-~]/g,function(ch){
    return /[A-Za-z]/.test(ch) ? ch : String.fromCharCode(ch.charCodeAt(0)+0xFEE0);
  });
}
function halfWidthLatinLetters(str){
  // 旧版で全角化済みの編集テキストを読み込んでも、英字だけ半角へ戻す。
  return String(str||'').replace(/[Ａ-Ｚａ-ｚ]/g,function(ch){return String.fromCharCode(ch.charCodeAt(0)-0xFEE0);});
}
function toFullWidthDigits(str){
  return String(str||'').replace(/[0-9]/g,function(d){return String.fromCharCode(d.charCodeAt(0)+0xFEE0);});
}
function toVerticalSafeSymbols(str){
  return String(str||'')
    .replace(/</g,'＜').replace(/>/g,'＞')
    .replace(/\(/g,'（').replace(/\)/g,'）')
    .replace(/\[/g,'［').replace(/\]/g,'］')
    .replace(/\{/g,'｛').replace(/\}/g,'｝');
}
function normalizeStoryVerticalText(text){
  // ver18: 英字も数字も記号も全角へ寄せる。
  // 1d10 の d だけ半角で横倒しになる事故を避け、全体を縦書きで統一する。
  return toVerticalSafeSymbols(toFullWidthAscii(normalizeVerticalText(text)));
}
function normalizeSpeakerName(text){
  // ver19: 話者名は本文分割に巻き込まず、縦書き名札として安全に出す。
  // 半角記号は全角へ、半角スペースは全角スペースへ寄せる。
  return normalizeStoryVerticalText(text).replace(/[ \t]+/g,'　');
}
function speakerNameUnits(text){
  const s=normalizeSpeakerName(text);
  let n=0;
  for(const ch of s){
    if(/[ 　]/.test(ch)) n+=.55;
    else if(/[、。，．・：；！？!?,.]/.test(ch)) n+=.82;
    else n+=1;
  }
  return n;
}
function currentMaxSpeakerUnits(){
  let max=0;
  for(const name of pcNames){
    const shown=displayNames.get(name)||name;
    max=Math.max(max,speakerNameUnits(shown));
  }
  return max;
}
function normalizeDiceVerticalText(text){
  return toVerticalSafeSymbols(toFullWidthAscii(String(text||'')))
    .replace(/=/g,'＝')
    .replace(/\+/g,'＋').replace(/\-/g,'－')
    .replace(/\*/g,'＊');
}
function splitByVerticalCapacity(text,maxChars){
  const chunks=[];
  let rest=normalizeVerticalText(text);
  if(!rest) return [''];
  while(rest.length>maxChars){
    let cut=rest.lastIndexOf('\n\n',maxChars);
    if(cut<Math.floor(maxChars*.55)) cut=rest.lastIndexOf('\n',maxChars);
    if(cut<Math.floor(maxChars*.55)) cut=rest.lastIndexOf('。',maxChars);
    if(cut<Math.floor(maxChars*.55)) cut=rest.lastIndexOf('」',maxChars);
    if(cut<Math.floor(maxChars*.55)) cut=rest.lastIndexOf('、',maxChars);
    if(cut<Math.floor(maxChars*.55)) cut=maxChars-1;
    chunks.push(rest.slice(0,cut+1).trim());
    rest=rest.slice(cut+1).trim();
  }
  if(rest) chunks.push(rest);
  return chunks;
}
function printUnitWeight(u){
  if(u.type==='pcRun') return Math.max(1.8,(u.bodies?.length||1)*1.65+.65);
  if(u.type==='pc') return 1.48;
  if(u.type==='dice') return 1.55;
  if(u.type==='spacer') return 1.15;
  return 1;
}
function pushNarrationUnits(units,text,spec,opts={}){
  const clean=normalizeStoryVerticalText(text);
  if(!clean) return;
  const chunks=splitByVerticalCapacity(clean,spec.charsPerCol);
  // 同じ文章が折り返された続きの列は、別ブロックより少し近づける。
  chunks.forEach((chunk,i)=>units.push({type:'narration',text:chunk,heading:opts.heading&&i===0,continued:i>0}));
}
function pushPcUnits(units,b,spec){
  const name=normalizeSpeakerName(displayForSpeaker(b.name)||'');
  const chunks=splitByVerticalCapacity(normalizeStoryVerticalText(b.body||'　'),spec.pcChars).filter(Boolean);
  // v26: 1つの会話グループが横に伸びすぎると端切れするため、ページ上限よりかなり少なめで分割。
  const maxCols=Math.max(1, Math.floor(spec.pageColCap || spec.colsPerPage));
  for(let i=0;i<chunks.length;i+=maxCols){
    const bodies=chunks.slice(i,i+maxCols);
    // ページをまたいだ続きでも、読みにくくなるので話者名を再表示する。
    units.push({type:'pcRun',name,bodies,continued:i>0});
  }
}
function isRollLikeText(text){
  return /(?:CCB|CBB|1D\d+|D100|SAN|正気度|目星|聞き耳|幸運|DEX|POW|APP|<=|＞|→)/i.test(String(text||''));
}
function splitFrameText(text,maxChars){
  const chunks=[];
  let rest=String(text||'').replace(/\s*\n+\s*/g,' ').replace(/\s{2,}/g,' ').trim();
  if(!rest) return [];
  const limit=Math.max(14,maxChars||28);
  while(rest.length>limit){
    let cut=-1;
    const min=Math.floor(limit*.45);
    const candidates=[') ＞','） ＞',' ＞',' →','】 ','》 ','。','、',' '];
    for(const mark of candidates){
      const idx=rest.lastIndexOf(mark,limit);
      if(idx>=min){cut=idx+mark.length-1;break;}
    }
    if(cut<min) cut=limit-1;
    chunks.push(rest.slice(0,cut+1).trim());
    rest=rest.slice(cut+1).trim();
  }
  if(rest) chunks.push(rest);
  return chunks;
}
function splitRollFrameText(text,spec){
  const full=String(text||'').replace(/\s*\n+\s*/g,' ').replace(/\s{2,}/g,' ').trim();
  if(!full) return [];
  // ダイス結果は「式」「(1D100...)」「成功/失敗」を別枠に分けると読みにくいので、
  // A5でも収まる長さまでは必ず1本の枠に入れる。
  const keepLimit=Math.max(92, Math.floor((spec.charsPerCol||60)*1.55));
  if(full.length<=keepLimit) return [full];
  // かなり長い特殊ダイスだけ分割する。ただし「＞ 成功/失敗」直前では切らない。
  const protectedText=full.replace(/＞\s*(成功|失敗|スペシャル|クリティカル|ファンブル|決定的成功|致命的失敗)/g,'＞\u00a0$1');
  return splitFrameText(protectedText,keepLimit).map(x=>x.replace(/\u00a0/g,' '));
}
function pushCalloutUnits(units,b,spec){
  const label=`【${b.name||'system'}】`;
  const raw=normalizeVerticalText(b.body||'');
  const source=(label + (raw?(' '+raw):'')).replace(/\s*\n+\s*/g,' ').replace(/\s{2,}/g,' ').trim();
  const roll=isRollLikeText(source);
  const full=roll ? normalizeDiceVerticalText(source) : source;
  // ダイス結果は基本的に1本。パネル文・長文calloutだけ分割。
  const chunks=roll ? splitRollFrameText(full,spec) : splitFrameText(full, Math.max(22, spec.diceChars||22));
  chunks.forEach((chunk,i)=>units.push({type:'dice',text:chunk,continued:i>0,roll}));
}
function pushPcRunFromBodies(units,name,bodyList,spec,meta={}){
  const display=normalizeSpeakerName(displayForSpeaker(name)||'');
  const joined=bodyList.map(x=>normalizeStoryVerticalText(x||'　')).filter(Boolean).join('\n');
  const chunks=splitByVerticalCapacity(joined||'　',spec.pcChars).filter(Boolean);
  const maxCols=Math.max(1, Math.floor(spec.pageColCap || spec.colsPerPage));
  for(let i=0;i<chunks.length;i+=maxCols){
    const bodies=chunks.slice(i,i+maxCols);
    units.push({
      type:'pcRun',
      name:display,
      bodies,
      continued:i>0,
      dialogue:!!meta.dialogue,
      dialogueStart:!!meta.dialogueStart && i===0,
      dialogueEnd:!!meta.dialogueEnd && i+maxCols>=chunks.length,
      speakerChange:!!meta.speakerChange && i===0
    });
  }
}
function flushPcDialogue(units,dialogue,spec){
  if(!dialogue.length) return;
  const runs=[];
  for(const b of dialogue){
    const last=runs[runs.length-1];
    if(last && last.name===b.name){
      last.bodies.push(b.body||'　');
    }else{
      runs.push({name:b.name,bodies:[b.body||'　']});
    }
  }
  runs.forEach((r,i)=>pushPcRunFromBodies(units,r.name,r.bodies,spec,{
    dialogue:true,
    dialogueStart:i===0,
    dialogueEnd:i===runs.length-1,
    speakerChange:i>0
  }));
}
function blocksToPrintUnits(blocks,spec){
  const units=[];
  let dialogue=[];
  const flush=()=>{flushPcDialogue(units,dialogue,spec);dialogue=[];};
  for(const b of blocks){
    if(b.type==='speech'&&isExcludedName(b.name)){continue;}
    if(b.type==='speech'&&isPcName(b.name)){
      dialogue.push(b);
      continue;
    }
    flush();
    if(b.type==='heading'){
      const title=normalizeStoryVerticalText(b.title);
      const body=normalizeStoryVerticalText(b.body);
      pushNarrationUnits(units,[title?`◆ ${title}`:'',body].filter(Boolean).join('\n'),spec,{heading:true});
    }else if(b.type==='callout'||b.type==='dice'){
      pushCalloutUnits(units,b,spec);
    }else if(b.type==='speech'){
      if(isExcludedName(b.name)) continue;
      const body=normalizeStoryVerticalText(b.body||'');
      if(isBodyOnlyName(b.name)) pushNarrationUnits(units,body,spec);
      else pushNarrationUnits(units,b.name ? `${normalizeSpeakerName(displayForSpeaker(b.name))}\n${body}` : body,spec);
    }
  }
  flush();
  return units;
}
function unitColumnWidth(u){
  if(u.type==='pcRun') return Math.max(1, (u.bodies||[]).length);
  if(u.type==='pc') return 1;
  if(u.type==='dice') return 1.25;
  if(u.type==='spacer') return .65;
  return 1;
}
function pushPageIfNeeded(pages,cur){
  if(cur.length) pages.push(cur.slice());
}
function ensureMeasureCss(spec){
  let iframe=document.getElementById('measureFrame');
  if(!iframe){
    iframe=document.createElement('iframe');
    iframe.id='measureFrame';
    iframe.style.position='fixed';
    iframe.style.left='-100000px';
    iframe.style.top='0';
    iframe.style.width='1px';
    iframe.style.height='1px';
    iframe.style.border='0';
    iframe.setAttribute('aria-hidden','true');
    document.body.appendChild(iframe);
  }
  const doc=iframe.contentDocument||iframe.contentWindow.document;
  const css=printCss(spec).replace(/@page\{[^}]*\}/,'');
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="UTF-8"><style>${css} .print-page{page-break-after:auto!important;break-after:auto!important;}
.preset-card{border:1px solid var(--line);border-radius:18px;background:#fffaf0;padding:14px 15px;margin-bottom:12px;line-height:1.8;color:#5b4b2b}.preset-card b{display:block;color:#1f2937;font-size:16px;margin-bottom:4px}.preset-card p{margin:0 0 6px}.preset-card .mini{font-size:12px;color:#88724b}.settings-simple .buttons{margin-top:12px}.save-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.save-actions button{min-height:40px}.editor-actions-note{font-size:12px;color:#7a6b5c;line-height:1.6;margin:0 0 8px}.danger-note{background:#fff1f1;border:1px solid #f2c4c4;color:#7a2525;border-radius:14px;padding:9px 11px;font-size:12px;line-height:1.6;margin-bottom:10px}
</style></head><body></body></html>`);
  doc.close();
}
function makeMeasurePage(units,spec){
  const iframe=document.getElementById('measureFrame');
  const doc=iframe.contentDocument||iframe.contentWindow.document;
  doc.body.innerHTML=`<section class="print-page"><div class="print-content">${units.map(renderPrintUnit).join('')}</div><div class="page-mark">-0P-</div></section>`;
  return doc.querySelector('.print-page');
}
function pageFitsUnits(units,spec){
  if(!units.length) return true;
  const pg=makeMeasurePage(units,spec);
  const pr=pg.getBoundingClientRect();
  const nodes=[...pg.querySelectorAll('.print-content > *')];
  const rects=nodes.map(n=>n.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0);
  if(!rects.length) return true;
  let left=Infinity,right=-Infinity;
  for(const r of rects){left=Math.min(left,r.left);right=Math.max(right,r.right);}
  // 左端の切れを防ぐ。右側は縦書きの開始側なので接しても許容する。
  const safe=2;
  return left >= pr.left + safe;
}
function splitPcRunToFit(u,cur,pages,spec){
  const bodies=(u.bodies||[]).filter(Boolean);
  let idx=0;
  while(idx<bodies.length){
    let maxTake=bodies.length-idx;
    let chosen=null;
    for(let take=maxTake; take>=1; take--){
      const seg={...u,bodies:bodies.slice(idx,idx+take),continued:!!(u.continued||idx>0)};
      // ページをまたぐ続きでも話者名は再表示する。
      seg.name=u.name||seg.name||'';
      if(idx>0) seg.dialogueStart=true;
      if(idx+take<bodies.length) seg.dialogueEnd=false;
      if(pageFitsUnits(cur.concat([seg]),spec)){chosen=seg;break;}
    }
    if(chosen){cur.push(chosen); idx+=chosen.bodies.length; continue;}
    if(cur.length){pages.push(cur.slice()); cur.length=0; continue;}
    // 1列でも入らない場合は、無限ループ回避のため1列だけ置く。
    const forced={...u,bodies:bodies.slice(idx,idx+1),continued:!!(u.continued||idx>0),name:u.name||'',dialogueStart:idx>0?true:u.dialogueStart,dialogueEnd:idx+1>=bodies.length?u.dialogueEnd:false};
    cur.push(forced); idx+=1;
  }
}
function paginatePrintUnits(units,spec){
  // v42: 決め打ち列数ではなく、実際の印刷ページDOMに置いて「切れる直前」で改ページする。
  ensureMeasureCss(spec);
  const pages=[];
  let cur=[];
  for(const u of units){
    if(u.type==='spacer' && !cur.length) continue;
    if(u.type==='pcRun'){
      splitPcRunToFit(u,cur,pages,spec);
      continue;
    }
    if(pageFitsUnits(cur.concat([u]),spec)){
      cur.push(u);
    }else{
      if(cur.length){pages.push(cur.slice());cur=[];}
      if(u.type==='spacer') continue;
      cur.push(u);
      // 単体でもはみ出す場合はそのまま置く。次の要素は次ページで再判定する。
    }
  }
  if(cur.length) pages.push(cur.slice());
  const host=document.getElementById('measureHost');
  if(host) host.innerHTML='';
  return pages.length?pages:[[]];
}
function paginateBlocksByEstimate(blocks){
  const spec=getPdfSpec();
  return paginatePrintUnits(blocksToPrintUnits(blocks,spec),spec);
}
function renderPrintUnit(u){
  if(u.type==='spacer') return `<section class="print-spacer"></section>`;
  if(u.type==='pcRun'){
    const classes=['print-pc-run'];
    if(u.continued) classes.push('continued');
    if(u.dialogue) classes.push('dialogue');
    if(u.dialogueStart) classes.push('dialogue-start');
    if(u.dialogueEnd) classes.push('dialogue-end');
    if(u.speakerChange) classes.push('speaker-change');
    const bodies=(u.bodies||[]).map(body=>`<span class="print-pc-col"><span class="print-body-col">${escapeHtml(normalizeStoryVerticalText(body||'　'))}</span></span>`).join('');
    return `<section class="${classes.join(' ')}"><span class="print-speaker print-speaker-run">${escapeHtml(u.name||'　')}</span><span class="print-run-rule"></span><span class="print-bodies">${bodies}</span></section>`;
  }
  if(u.type==='pc'){
    const empty=u.name?'':' empty';
    const cont=u.continued?' continued':'';
    return `<section class="print-pc${cont}"><span class="print-speaker${empty}">${escapeHtml(u.name||'　')}</span><span class="print-body">${escapeHtml(normalizeStoryVerticalText(u.body))}</span></section>`;
  }
  if(u.type==='dice'){
    const cls=`print-dice${u.continued?' continued':''}${u.roll?' roll':''}`;
    return `<section class="${cls}"><span>${escapeHtml(u.roll?normalizeDiceVerticalText(u.text):normalizeStoryVerticalText(u.text))}</span></section>`;
  }
  const html=escapeHtml(u.text).replace(/^◆\s*([^\n]+)/,'<span class="print-mark">◆</span><strong>$1</strong>');
  const cls = `print-narration${u.heading?' heading':''}${u.continued?' continued':''}`;
  return `<section class="${cls}">${html}</section>`;
}
function printCss(spec){
  const p=spec.pad;
  return `
@page{size:${spec.w}mm ${spec.h}mm;margin:0;}
html,body{margin:0;padding:0;background:#fff;color:#171410;}
body{font-family:"Yu Mincho","Hiragino Mincho ProN","YuMincho",serif;}
.print-page{width:${spec.w}mm;height:${spec.h}mm;padding:${p.t}mm ${p.r}mm ${p.b}mm ${p.l}mm;margin:0;position:relative;overflow:hidden;background:#fff;box-sizing:border-box;page-break-after:always;break-after:page;}
.print-page:last-child{page-break-after:auto;break-after:auto;}
.print-content{width:100%;height:100%;display:flex;flex-direction:row-reverse;align-items:flex-start;justify-content:flex-start;gap:.52em;overflow:hidden;background:#fff;box-sizing:border-box;color:#171410;font-size:${spec.pt}pt;line-height:${spec.line};letter-spacing:.015em;padding-left:${spec.safeLeft}mm;padding-right:${spec.safeRight}mm;padding-bottom:${spec.safeBottom}mm;}
.print-narration{height:100%;writing-mode:vertical-rl;text-orientation:mixed;white-space:pre-wrap;line-height:${spec.line};font-size:${spec.pt}pt;box-sizing:border-box;flex:0 0 auto;overflow:hidden;}
.print-narration.continued{margin-right:-.72em;}
.print-narration strong{font-weight:900;}
.print-mark{color:#8d7444;font-size:.72em;font-weight:900;}
.print-spacer{height:100%;width:1.45em;flex:0 0 1.45em;}
.print-pc{height:100%;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;writing-mode:horizontal-tb;flex:0 0 auto;box-sizing:border-box;break-inside:avoid;page-break-inside:avoid;position:relative;}
.print-pc::after{content:"";position:absolute;left:0;right:0;top:${spec.speakerEm+.18}em;border-top:1.35px solid rgba(35,31,27,.55);}
.print-pc-run{height:100%;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;writing-mode:horizontal-tb;flex:0 0 auto;box-sizing:border-box;break-inside:avoid;page-break-inside:avoid;margin-left:.18em;position:relative;width:max-content;max-width:100%;}
.print-pc-run.continued{margin-right:0;}
.print-pc-run.speaker-change{margin-left:.54em;}
.print-speaker-run{align-self:flex-end;}
.print-run-rule{display:block;align-self:stretch;width:100%;height:0;border-top:1.35px solid rgba(35,31,27,.55);margin:.16em 0 .34em;box-sizing:border-box;}
.print-pc-run.dialogue:not(.dialogue-start) .print-run-rule{margin-right:-.58em;width:calc(100% + .58em);}
.print-pc-run.dialogue:not(.dialogue-end) .print-run-rule{margin-left:-.58em;width:calc(100% + .58em);}
.print-pc-run.dialogue:not(.dialogue-start):not(.dialogue-end) .print-run-rule{width:calc(100% + 1.16em);}
.print-pc-run.speaker-change .print-run-rule{margin-right:-1.05em;}
.print-bodies{display:flex;flex-direction:row-reverse;align-items:flex-start;justify-content:flex-start;gap:0;writing-mode:horizontal-tb;width:max-content;}
.print-pc-col{height:100%;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;writing-mode:horizontal-tb;flex:0 0 auto;box-sizing:border-box;margin:0;}
.print-body-col{display:block;writing-mode:vertical-rl;text-orientation:mixed;white-space:pre-wrap;line-height:1.62;font-size:${spec.pt}pt;width:1.75em;min-width:1.75em;height:calc(100% - ${spec.speakerEm+1.25}em);max-height:calc(100% - ${spec.speakerEm+1.25}em);margin:0;padding:.16em 0 0;box-sizing:border-box;border-top:0;overflow:hidden;overflow-wrap:anywhere;word-break:normal;}
.print-speaker{display:block;writing-mode:vertical-rl;text-orientation:mixed;font-weight:900;font-size:.78em;line-height:1.28;letter-spacing:.045em;min-height:${spec.speakerEm}em;min-width:1.75em;width:1.75em;margin:0;padding:0;text-align:start;box-sizing:border-box;white-space:pre;word-break:keep-all;overflow-wrap:normal;overflow:visible;}
.print-body{display:block;writing-mode:vertical-rl;text-orientation:mixed;white-space:pre-wrap;line-height:1.70;font-size:${spec.pt}pt;min-width:1.75em;width:1.75em;height:calc(100% - ${spec.speakerEm+.75}em);max-height:calc(100% - ${spec.speakerEm+.75}em);margin:0;padding:.54em 0 0;box-sizing:border-box;border-top:0;overflow:hidden;overflow-wrap:anywhere;word-break:normal;}

.print-speaker.empty{visibility:hidden!important;}
.print-pc.continued{margin-right:-.15em;}
.print-dice{height:auto;max-height:100%;writing-mode:vertical-rl;text-orientation:mixed;white-space:pre-wrap;font-size:${spec.dicePt}pt;line-height:1.48;font-weight:700;color:#4f463c;border:1.15px solid rgba(95,86,74,.74);border-radius:7px;background:#fff;padding:.42em .32em;box-sizing:border-box;flex:0 0 auto;overflow:visible;overflow-wrap:normal;word-break:keep-all;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.print-dice.continued{margin-right:-.45em;}
.print-dice.roll{font-size:${Math.max(6.7,spec.dicePt-.75)}pt;line-height:1.24;overflow-wrap:normal;word-break:keep-all;white-space:nowrap;max-height:none!important;overflow:visible!important;}
.page-mark{position:absolute;left:50%;bottom:5mm;transform:translateX(-50%);width:max-content;text-align:center;font-size:9pt;letter-spacing:.08em;color:#171410;writing-mode:horizontal-tb;}
`;
}
function buildPrintPagesHtml(pages){
  return pages.map((page,i)=>`<section class="print-page" data-page="${i+1}"><div class="print-content">${page.map(renderPrintUnit).join('')}</div><div class="page-mark">-${i+1}P-</div></section>`).join('');
}
function preparePrintHost(){
  updatePreview(true);
  const blocks=mergeEditableBlocks(parseEditableBlocks(els.textEditor.value));
  const spec=getPdfSpec();
  const pages=paginatePrintUnits(blocksToPrintUnits(blocks,spec),spec);
  const host=document.getElementById('printHost');
  host.innerHTML=buildPrintPagesHtml(pages);
  let style=document.getElementById('dynamicPrintPageStyle');
  if(!style){style=document.createElement('style');style.id='dynamicPrintPageStyle';document.head.appendChild(style);}
  style.textContent=`@media print{${printCss(spec)} body>*:not(#printHost){display:none!important;} #printHost{display:block!important;margin:0!important;padding:0!important;background:#fff!important;} }`;
  return {pages,spec};
}
function makePrintDocument(pages,spec,mode='print'){
  const screenCss = mode==='preview' ? `
html,body{background:#d9d9d9!important;}
body{padding:18px!important;box-sizing:border-box;}
.print-page{margin:0 auto 18px!important;box-shadow:0 6px 22px rgba(0,0,0,.18);page-break-after:auto!important;break-after:auto!important;}
` : '';
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title></title><style>${printCss(spec)}${screenCss}
.preset-card{border:1px solid var(--line);border-radius:18px;background:#fffaf0;padding:14px 15px;margin-bottom:12px;line-height:1.8;color:#5b4b2b}.preset-card b{display:block;color:#1f2937;font-size:16px;margin-bottom:4px}.preset-card p{margin:0 0 6px}.preset-card .mini{font-size:12px;color:#88724b}.settings-simple .buttons{margin-top:12px}.save-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.save-actions button{min-height:40px}.editor-actions-note{font-size:12px;color:#7a6b5c;line-height:1.6;margin:0 0 8px}.danger-note{background:#fff1f1;border:1px solid #f2c4c4;color:#7a2525;border-radius:14px;padding:9px 11px;font-size:12px;line-height:1.6;margin-bottom:10px}
</style></head><body>${buildPrintPagesHtml(pages)}</body></html>`;
}
function printPdf(){
  const {pages,spec}=preparePrintHost();
  const old=document.getElementById('printFrame');
  if(old) old.remove();
  const iframe=document.createElement('iframe');
  iframe.id='printFrame';
  iframe.style.position='fixed';
  iframe.style.right='0';
  iframe.style.bottom='0';
  iframe.style.width='0';
  iframe.style.height='0';
  iframe.style.border='0';
  document.body.appendChild(iframe);
  const doc=iframe.contentDocument||iframe.contentWindow.document;
  doc.open();
  doc.write(makePrintDocument(pages,spec));
  doc.close();
  setTimeout(()=>{iframe.contentWindow.focus();iframe.contentWindow.print();},250);
}
function downloadPrintHtml(){
  const blocks=mergeEditableBlocks(parseEditableBlocks(els.textEditor.value));
  const spec=getPdfSpec();
  const pages=paginatePrintUnits(blocksToPrintUnits(blocks,spec),spec);
  downloadBlob(makePrintDocument(pages,spec),'ccfolia_vertical_print_only_v41.html','text/html;charset=utf-8');
}
let currentPrintPreviewPage=1;
function buildPrintPreview(){
  const blocks=mergeEditableBlocks(parseEditableBlocks(els.textEditor.value));
  const spec=getPdfSpec();
  const pages=paginatePrintUnits(blocksToPrintUnits(blocks,spec),spec);
  const frame=$('printPreviewFrame');
  if(frame){ frame.srcdoc=makePrintDocument(pages,spec,'preview'); }
  currentPrintPreviewPage=1;
  const status=$('printPreviewStatus');
  if(status){ status.textContent=`${spec.name} / ${pages.length}P / 最大${spec.pageColCap}列`; }
  return {pages,spec};
}
function scrollPrintPreviewPage(delta){
  const frame=$('printPreviewFrame');
  if(!frame || !frame.contentWindow) return;
  const doc=frame.contentDocument;
  const pages=[...doc.querySelectorAll('.print-page')];
  if(!pages.length) return;
  currentPrintPreviewPage=Math.max(1,Math.min(pages.length,currentPrintPreviewPage+delta));
  pages[currentPrintPreviewPage-1].scrollIntoView({block:'start',inline:'nearest'});
  const status=$('printPreviewStatus');
  if(status){
    const base=status.textContent.replace(/\s*\/\s*表示:.*/, '');
    status.textContent=`${base} / 表示:${currentPrintPreviewPage}P`;
  }
}
function schedulePrintPreview(){
  clearTimeout(window.__printPreviewTimer);
  window.__printPreviewTimer=setTimeout(()=>{
    if($('printPreviewFrame')) buildPrintPreview();
  },350);
}
let findMatches=[];
let findIndex=-1;
function refreshFindResults(reset=true){
  const q=$('findText').value;
  const box=$('findResults');
  findMatches=[];
  findIndex=-1;
  if(!q){
    $('findCounter').textContent='0 / 0';
    $('findNote').textContent='検索する言葉を入れてください。';
    box.innerHTML='';
    return;
  }
  const text=els.textEditor.value;
  let pos=0;
  while(true){
    const idx=text.indexOf(q,pos);
    if(idx<0)break;
    findMatches.push({start:idx,end:idx+q.length});
    pos=idx+Math.max(q.length,1);
  }
  if(!findMatches.length){
    $('findCounter').textContent='0 / 0';
    $('findNote').textContent=`「${q}」は見つかりませんでした。`;
    box.innerHTML='';
    return;
  }
  const caret=els.textEditor.selectionStart||0;
  let nearest=findMatches.findIndex(m=>m.start>=caret);
  if(nearest<0)nearest=0;
  findIndex=reset?nearest:Math.max(0,Math.min(findIndex,findMatches.length-1));
  renderFindResultList();
  selectFindMatch(findIndex,false);
}
function makeFindSnippet(m){
  const text=els.textEditor.value;
  const q=$('findText').value;
  const s=Math.max(0,m.start-32);
  const e=Math.min(text.length,m.end+48);
  return `${s>0?'…':''}${text.slice(s,m.start)}【${text.slice(m.start,m.end)}】${text.slice(m.end,e)}${e<text.length?'…':''}`.replace(/\n/g,' / ');
}
function renderFindResultList(){
  const q=$('findText').value;
  $('findCounter').textContent=findMatches.length?`${findIndex+1} / ${findMatches.length}`:'0 / 0';
  const box=$('findResults');
  box.innerHTML='';
  if(findMatches.length){
    const around=[];
    const start=Math.max(0,findIndex-3);
    const end=Math.min(findMatches.length,start+9);
    for(let n=start;n<end;n++){
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='find-hit'+(n===findIndex?' active':'');
      btn.innerHTML=`<span class="find-context">${n+1}.</span> ${escapeHtml(makeFindSnippet(findMatches[n]))}`;
      btn.addEventListener('click',()=>selectFindMatch(n));
      box.appendChild(btn);
    }
  }
  $('findNote').textContent=findMatches.length
    ? `「${q}」が${findMatches.length}件見つかりました。上の候補クリック、前/次ボタン、Enterで移動できます。`
    : '検索する言葉を入れてください。';
}
function selectFindMatch(i,focus=true){
  if(!findMatches.length)return;
  findIndex=(i+findMatches.length)%findMatches.length;
  const m=findMatches[findIndex];
  const ta=els.textEditor;
  if(focus) ta.focus({preventScroll:true});
  ta.setSelectionRange(m.start,m.end);
  // textarea内の候補が見えない時でも、近くの検索結果欄に文脈を表示する。
  // scrollTopは行数ベースで概算。検索結果欄の候補クリックで位置確認できるようにする。
  const before=ta.value.slice(0,m.start);
  const line=before.split('\n').length;
  const lineHeight=parseFloat(getComputedStyle(ta).lineHeight)||24;
  ta.scrollTop=Math.max(0,(line-4)*lineHeight);
  $('findCounter').textContent=`${findIndex+1} / ${findMatches.length}`;
  renderFindResultList();
}
function findInEditor(){refreshFindResults(true)}
function nextFindMatch(){if(!findMatches.length)refreshFindResults(true);else selectFindMatch(findIndex+1)}
function prevFindMatch(){if(!findMatches.length)refreshFindResults(true);else selectFindMatch(findIndex-1)}
function replaceNextInEditor(){
  const q=$('findText').value;
  const r=$('replaceText').value;
  if(!q){$('findNote').textContent='検索する言葉を入れてください。';return;}
  if(!findMatches.length)refreshFindResults(true);
  if(!findMatches.length)return;
  const m=findMatches[findIndex];
  const ta=els.textEditor;
  ta.value=ta.value.slice(0,m.start)+r+ta.value.slice(m.end);
  ta.setSelectionRange(m.start,m.start+r.length);
  updatePreview(true);
  refreshFindResults(false);
  $('findNote').textContent='現在の1件を置換しました。';
}
function replaceAllInEditor(deleteMode=false){
  const q=$('findText').value;
  const r=deleteMode?'':$('replaceText').value;
  if(!q){$('findNote').textContent='検索する言葉を入れてください。';return;}
  const count=els.textEditor.value.split(q).length-1;
  if(count<=0){$('findNote').textContent=`「${q}」は見つかりませんでした。`;return;}
  els.textEditor.value=els.textEditor.value.split(q).join(r);
  updatePreview(true);
  refreshFindResults(true);
  $('findNote').textContent=`${count}件${deleteMode?'削除':'置換'}しました。`;
}

/* v43: A5ログ本向け・固定スロット絶対配置PDF
   PDFページ内の横位置をJSで決め、各列を絶対配置する。
   flex/overflow測定に頼らないため、ページ左端の切れと大余白を抑える。 */
function numVal(id, fallback){ const el=$(id); const n=parseFloat(el&&el.value); return Number.isFinite(n)?n:fallback; }
function getAbsSpec(){
  const base=getPdfSpec();
  const safeLeft=numVal('pdfSafeLeft',1.5);
  const safeRight=numVal('pdfSafeRight',1.5);
  const safeBottom=numVal('pdfSafeBottom',2.5);
  const manualMax=parseInt(($('pdfMaxCols')&&$('pdfMaxCols').value)||'',10);
  const defaultMax={A5:14,B5:17,B6:11,BUNKO:8,A6:8}[base.key]||14;
  const maxCols=Math.max(3, Math.min(26, Number.isFinite(manualMax)?manualMax:defaultMax));
  const spec={...base};
  spec.pad={...base.pad};
  spec.safeLeft=safeLeft;
  spec.safeRight=safeRight;
  spec.safeBottom=safeBottom;
  spec.maxCols=maxCols;
  spec.pageColCap=maxCols;
  spec.innerX=spec.pad.l+safeLeft;
  spec.innerY=spec.pad.t;
  spec.innerW=Math.max(40, spec.w-spec.pad.l-spec.pad.r-safeLeft-safeRight);
  spec.innerH=Math.max(40, spec.h-spec.pad.t-spec.pad.b-safeBottom);
  spec.slotPitch=spec.innerW/maxCols;
  spec.colW=Math.max(3.9, Math.min(6.6, spec.slotPitch*.62));
  spec.diceW=Math.max(5.3, Math.min(8.4, spec.slotPitch*.86));
  // v44: 同じ文章が折り返された続き列は詰める。別ブロック同士は適度に離す。
  spec.normalGap=Math.max(1.6, Math.min(3.0, spec.slotPitch-spec.colW));
  spec.continuedGap=Math.max(.15, Math.min(.65, spec.normalGap*.28));
  spec.diceGap=Math.max(1.4, Math.min(2.6, spec.normalGap*.9));
  // ver19: 話者名が「烏丸 かがみ？」程度でも名札内で折れないよう、
  // PC表示名の最長に合わせて話者名エリアを少しだけ伸ばす。
  // フルネーム級はページ効率を守るため上限を設け、表示名の短縮を推奨。
  const maxSpeakerUnits=currentMaxSpeakerUnits();
  spec.speakerEm=Math.max(spec.speakerEm, Math.min(9.2, 1.05 + maxSpeakerUnits*.86));
  spec.speakerH=Math.max(18, Math.min(34, spec.speakerEm*spec.pt*.35278*.78));
  spec.lineGap=2.0;
  spec.bodyTop=spec.innerY+spec.speakerH+spec.lineGap;
  spec.bodyH=Math.max(30, spec.innerH-spec.speakerH-Math.max(.6,spec.lineGap*.45));
  const pcManual=parseInt(($('pdfPcChars')&&$('pdfPcChars').value)||'',10);
  const mmPerPt=.35278;
  const charMm=spec.pt*mmPerPt*1.02;
  const maxByHeight=Math.max(12, Math.floor(spec.bodyH/charMm)-1);
  const defaultPc=Math.min(maxByHeight, base.key==='A5'?42:Math.max(22,maxByHeight-1));
  spec.pcChars=Number.isFinite(pcManual)&&pcManual>0 ? Math.max(8,Math.min(maxByHeight,pcManual)) : defaultPc;
  // v70: 本文・見出し列の文字欠け防止。
  // 縦書きの記号・URL・箇条書きは実際の描画高さが単純な文字数より大きくなるため、
  // 文字数上限を安全側に下げる。ここを攻めすぎると overflow:hidden で文章が飛んで見える。
  const lineModeForNarr=($('pdfLines')&&$('pdfLines').value)||'safe';
  const narrSafety={tight:1.08,normal:1.18,safe:1.30,safer:1.42}[lineModeForNarr]||1.30;
  spec.narrChars=Math.max(12, Math.floor(spec.innerH/(charMm*narrSafety))-2);
  // v45: 枠付き表示は余裕を持って分割する。枠の上下余白・罫線ぶんを差し引く。
  spec.diceChars=Math.max(18, Math.floor(spec.innerH/(spec.dicePt*mmPerPt*1.48))-2);
  spec.infoChars=Math.max(16, Math.floor(spec.innerH/(spec.dicePt*mmPerPt*1.36))-2);
  // v49: ダイス結果は「数値 ＞ 成功/失敗」を分離させないため、通常枠より小さめの文字で多めに入れる。
  const rollPt=Math.max(6.8, spec.dicePt-.9);
  spec.rollDiceChars=Math.max(96, spec.diceChars+18, Math.floor(spec.innerH/(rollPt*mmPerPt*1.05))-1);
  return spec;
}
function visualColumnUnits(text){
  let n=0;
  const s=String(text||'');
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(ch==='\r') continue;
    if(ch==='\n') { n+=2.65; continue; }
    if(/[ 　\t]/.test(ch)) { n+=.55; continue; }
    if(/[、。，．・：；！？!?,.]/.test(ch)) { n+=.82; continue; }
    if(/[「」『』（）［］【】＜＞《》〈〉“”\[\]()]/.test(ch)) { n+=.92; continue; }
    n+=1;
  }
  return n;
}
function splitSingleLineForColumns(line,maxChars){
  const chunks=[];
  let rest=String(line||'').trim();
  const limit=Math.max(10, maxChars|0);
  if(!rest) return [];
  while(visualColumnUnits(rest)>limit){
    let units=0;
    let hard=0;
    let best=-1;
    let bestScore=-1;
    for(let i=0;i<rest.length;i++){
      const ch=rest[i];
      units += (/[ 　\t]/.test(ch) ? .55 : (/[、。，．・：；！？!?,.]/.test(ch) ? .82 : (/[「」『』（）［］【】＜＞《》〈〉“”\[\]()]/.test(ch) ? .92 : 1)));
      if(units<=limit) hard=i;
      if(units<=limit && units>=limit*.42){
        let score=0;
        if(/[。！？]/.test(ch)) score=62;
        else if(/[」』）］】＞》〉]/.test(ch)) score=58;
        else if(/[、，・：；]/.test(ch)) score=42;
        else if(/[ 　]/.test(ch)) score=30;
        if(score>bestScore){ best=i; bestScore=score; }
      }
      if(units>limit) break;
    }
    let cut=best>=0 ? best : hard;
    if(cut<0) cut=Math.max(0,Math.min(rest.length-1,limit-1));
    const head=rest.slice(0,cut+1).trim();
    if(head) chunks.push(head);
    rest=rest.slice(cut+1).trim();
    if(chunks.length>10000) break;
  }
  if(rest) chunks.push(rest);
  return chunks;
}
function splitTextForColumns(text,maxChars){
  // v16: 縦書きPDFでは、1つの絶対配置カラム内に改行を残すと、
  // ブラウザがカラム内部でさらに縦書き列を作り、右端・文頭が隠れる。
  // そのため改行はCSSに任せず、事前に行ごとへ分解してから各行をカラム化する。
  const chunks=[];
  const normalized=normalizeVerticalText(text);
  const limit=Math.max(10, maxChars|0);
  if(!normalized) return [];
  const lines=normalized.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  for(const line of lines){
    const parts=splitSingleLineForColumns(line,limit);
    for(const part of parts) chunks.push(part);
  }
  return chunks;
}
function splitDiceTextForColumns(text,maxChars,roll=false){
  const src=normalizeVerticalText(text).replace(/\s*\n+\s*/g,' ').replace(/\s{2,}/g,' ').trim();
  if(!src) return [];
  const limit=Math.max(18, maxChars|0);
  // ダイス結果は「＞ 成功／失敗」だけが別枠へ逃げると読みにくいので、基本は1本に保持。
  if(roll && src.length<=limit) return [src];
  if(roll){
    const protectedText=src.replace(/＞\s*(成功|失敗|スペシャル|クリティカル|ファンブル|決定的成功|致命的失敗)/g,'＞ $1');
    return splitTextForColumns(protectedText,limit).map(x=>x.replace(/ /g,' '));
  }
  return splitTextForColumns(src,limit);
}
function isDiceTextForAbs(name,body){
  const t=normalizeVerticalText(body||'');
  if(name==='system') return true;
  return /^(?:CCB|CBR|CC|RES|SANC|SAN|1d|\d+d|\d+D|\(1D|\[\s*[^\]]+\s*\]|choice|CHOICE)/i.test(t) || /＞\s*(?:成功|失敗|スペシャル|決定的成功|致命的失敗|ファンブル|クリティカル)/.test(t);
}
function buildAbsColumns(blocks,spec){
  const cols=[];
  let run=0;
  const addNarr=(text,heading=false)=>{
    const chunks=splitTextForColumns(text,spec.narrChars);
    chunks.forEach((ch,i)=>cols.push({type:'narr',text:ch,heading:heading&&i===0,continued:i>0}));
  };
  for(let bi=0; bi<blocks.length; bi++){
    const b=blocks[bi];
    if(b.type==='titlepage'){
      cols.push({type:'titlepage',text:normalizeStoryVerticalText(b.body||'タイトル')});
      continue;
    }
    if(b.type==='divider'){
      cols.push({type:'divider',text:normalizeStoryVerticalText(b.body||'————————————')});
      continue;
    }
    if(b.type==='dots'){
      cols.push({type:'dots',text:normalizeStoryVerticalText(b.body||'・・・・・・\n・・・・・\n・・・・\n・・・\n・・\n・')});
      continue;
    }
    if(b.type==='dicebox'||b.type==='infobox'){
      const raw=normalizeVerticalText(b.body||'');
      if(b.type==='infobox'){
        // beta9: 長文情報枠は、ダイスのように列ごとのカプセル枠にしない。
        // 本文列として分割し、ページ上では連続列を1つの大きな情報枠で囲む。
        const chunks=splitTextForColumns(raw, spec.narrChars);
        chunks.forEach((ch,i)=>cols.push({type:'info',text:ch,continued:i>0,manual:true}));
      }else{
        const chunks=splitDiceTextForColumns(raw, spec.diceChars, false);
        chunks.forEach((ch,i)=>cols.push({type:'dice',text:ch,continued:i>0,roll:false,manual:true}));
      }
      continue;
    }
    if(b.type==='heading'){
      const text=[b.title?`◆ ${normalizeStoryVerticalText(b.title)}`:'', normalizeStoryVerticalText(b.body)].filter(Boolean).join('\n');
      addNarr(text,true);
      continue;
    }
    if(b.type==='callout'||b.type==='dice'||isDiceTextForAbs(b.name,b.body)){
      const label=`【${b.name||'system'}】`;
      const raw=normalizeVerticalText(b.body||'');
      const source=(b.type==='callout'||b.name==='system'||isDiceTextForAbs(b.name,b.body)) ? `${label} ${raw}`.trim() : raw;
      const roll=isDiceTextForAbs(b.name,b.body);
      const text=roll ? normalizeDiceVerticalText(source) : source;
      const chunks=splitDiceTextForColumns(text, roll ? spec.rollDiceChars : spec.diceChars, roll);
      chunks.forEach((ch,i)=>cols.push({type:'dice',text:ch,continued:i>0,roll}));
      continue;
    }
    if(b.type==='speech'&&isPcName(b.name)){
      // ここが今回の本丸：連続した同一話者を先に1つの「発言ラン」にまとめる。
      // その後に列分割することで、列が分かれても同じrun番号になり、罫線を接続できる。
      const sameSpeakerBlocks=[b];
      while(bi+1<blocks.length && blocks[bi+1].type==='speech' && isPcName(blocks[bi+1].name) && canonicalSpeakerName(blocks[bi+1].name)===canonicalSpeakerName(b.name)){
        sameSpeakerBlocks.push(blocks[++bi]);
      }
      const speaker=normalizeSpeakerName(displayForSpeaker(b.name)||'');
      const body=sameSpeakerBlocks.map(x=>normalizeStoryVerticalText(x.body||'')).filter(Boolean).join('\n');
      const chunks=splitTextForColumns(body||'　',spec.pcChars);
      run++;
      chunks.forEach((ch,i)=>cols.push({type:'pc',speaker,text:ch,run,first:i===0,continued:i>0}));
      continue;
    }
    if(b.type==='speech'){
      const speaker=normalizeSpeakerName(displayForSpeaker(b.name)||'');
      const body=normalizeStoryVerticalText(b.body||'');
      if(isBodyOnlyName(b.name)) addNarr(body,false);
      else addNarr(speaker?`${speaker}\n${body}`:body,false);
      continue;
    }
    if(b.body) addNarr(normalizeStoryVerticalText(b.body),false);
  }
  return cols;
}

function absColWidth(c,spec){
  if(c.type==='dice') return spec.diceW;
  if(c.type==='info') return spec.colW;
  if(c.type==='divider') return Math.max(spec.colW*.85, 4.2);
  if(c.type==='dots') return Math.max(spec.colW*3.2, 18);
  return spec.colW;
}
function absGapBefore(c,prev,spec){
  if(!prev) return 0;
  if(c.type==='dice' || prev.type==='dice'){
    if(c.continued && prev && prev.type==='dice') return spec.continuedGap;
    return spec.diceGap;
  }
  if(c.type==='info' || prev.type==='info'){
    if(c.continued && prev && prev.type==='info') return spec.continuedGap;
    return spec.normalGap;
  }
  if(c.continued && prev && c.type===prev.type){
    if(c.type==='pc' && c.run===prev.run) return spec.continuedGap;
    if(c.type==='narr') return spec.continuedGap;
  }
  return spec.normalGap;
}
function paginateAbsColumns(cols,spec){
  const pages=[];
  let cur=[];
  let used=0;
  const limit=spec.innerW;
  for(const c of cols){
    if(c.type==='titlepage'){
      if(cur.length){pages.push(cur);cur=[];used=0;}
      pages.push([c]);
      continue;
    }
    const gap=absGapBefore(c,cur[cur.length-1],spec);
    const w=absColWidth(c,spec);
    if(cur.length && used + gap + w > limit){
      pages.push(cur);
      cur=[];
      used=0;
    }
    const gap2=absGapBefore(c,cur[cur.length-1],spec);
    cur.push(c);
    used += (cur.length===1 ? w : gap2 + w);
  }
  if(cur.length) pages.push(cur);
  return pages.length?pages:[[]];
}
function absRightMm(i,page,spec){
  let right=spec.pad.r+spec.safeRight;
  for(let n=0;n<i;n++){
    right += absColWidth(page[n],spec) + absGapBefore(page[n+1],page[n],spec);
  }
  return right;
}
function absPrintCss(spec){
  return `
@page{size:${spec.w}mm ${spec.h}mm;margin:0;}
html,body{margin:0;padding:0;background:#fff;color:#171410;}
body{font-family:"Yu Mincho","Hiragino Mincho ProN","YuMincho",serif;}
.print-page{width:${spec.w}mm;height:${spec.h}mm;margin:0;padding:0;position:relative;overflow:hidden;background:#fff;box-sizing:border-box;page-break-after:always;break-after:page;}
.print-page:last-child{page-break-after:auto;break-after:auto;}
.abs-col{position:absolute;top:${spec.innerY}mm;width:${spec.colW}mm;height:${spec.innerH}mm;box-sizing:border-box;writing-mode:vertical-rl;text-orientation:mixed;white-space:pre-wrap;font-size:${spec.pt}pt;line-height:${spec.line};letter-spacing:.015em;color:#171410;overflow:hidden;}
.abs-col.continued{opacity:.99;}
.abs-col strong{font-weight:900;}
.abs-mark{color:#8d7444;font-size:.72em;font-weight:900;}
.abs-pc{position:absolute;top:${spec.innerY}mm;width:${spec.colW}mm;height:${spec.innerH}mm;box-sizing:border-box;color:#171410;overflow:visible;}
.abs-pc.continued .abs-rule{border-top-color:rgba(35,31,27,.42);}
.abs-speaker{position:absolute;top:0;right:0;width:${spec.colW}mm;height:${spec.speakerH}mm;writing-mode:vertical-rl;text-orientation:mixed;font-size:${Math.max(7.8,spec.pt*.78)}pt;line-height:1.26;font-weight:900;letter-spacing:.045em;overflow:visible;white-space:pre;word-break:keep-all;overflow-wrap:normal;}
.abs-rule{display:none;}
.abs-run-rule{position:absolute;top:${spec.innerY+spec.speakerH}mm;height:0;border-top:1.1px solid rgba(35,31,27,.58);z-index:6;pointer-events:none;box-sizing:border-box;}
.abs-body{position:absolute;top:${spec.speakerH+spec.lineGap}mm;right:0;width:${spec.colW}mm;height:${spec.bodyH}mm;writing-mode:vertical-rl;text-orientation:mixed;white-space:pre-wrap;font-size:${spec.pt}pt;line-height:${spec.line};letter-spacing:.015em;overflow:hidden;z-index:1;}
.abs-dice{position:absolute;top:${spec.innerY}mm;width:${spec.diceW}mm;max-height:${spec.innerH}mm;box-sizing:border-box;writing-mode:vertical-rl;text-orientation:mixed;white-space:pre-wrap;font-size:${spec.dicePt}pt;line-height:1.38;font-weight:700;color:#4f463c;border:1.1px solid rgba(95,86,74,.75);border-radius:7px;background:#fff;padding:.34em .28em;overflow:hidden;overflow-wrap:anywhere;word-break:normal;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.abs-dice.roll{font-size:${Math.max(6.8,spec.dicePt-.9)}pt;line-height:1.20;letter-spacing:.01em;overflow-wrap:normal;word-break:keep-all;}
.abs-dice.continued{border-color:rgba(95,86,74,.55);}
.abs-dice.info{font-weight:600;border:1.25px solid rgba(65,58,50,.72);background:#fffdf7;}
.abs-info-col{position:absolute;top:${spec.innerY+2.2}mm;width:${spec.colW}mm;height:${Math.max(30,spec.innerH-4.4)}mm;box-sizing:border-box;writing-mode:vertical-rl;text-orientation:mixed;white-space:pre-wrap;font-size:${spec.pt}pt;line-height:${spec.line};letter-spacing:.015em;color:#171410;overflow:hidden;z-index:2;}
.abs-info-frame{position:absolute;top:${spec.innerY}mm;height:${spec.innerH}mm;border:1.1px solid rgba(95,86,74,.70);border-radius:3.2mm;box-sizing:border-box;background:#fffdf7;z-index:1;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.abs-titlepage{position:absolute;inset:${spec.pad.t}mm ${spec.pad.r}mm ${spec.pad.b}mm ${spec.pad.l}mm;display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;text-orientation:mixed;text-align:center;font-size:${Math.max(13,spec.pt*1.12)}pt;line-height:1.55;font-weight:900;letter-spacing:.06em;color:#171410;}
.abs-titlepage .abs-title-inner{border-inline-start:1.4px solid rgba(35,31,27,.55);border-inline-end:1.4px solid rgba(35,31,27,.55);padding:6mm 2.5mm;max-height:145mm;}
.abs-divider,.abs-dots{position:absolute;top:${spec.innerY}mm;height:${spec.innerH}mm;box-sizing:border-box;color:#6a5b4b;overflow:visible;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.abs-divider{display:flex;align-items:flex-start;justify-content:center;writing-mode:horizontal-tb;padding-top:0;}
.abs-divider .divider-line{display:block;width:0;height:38mm;border-left:1.2px solid rgba(106,91,75,.78);}
.abs-dots{display:flex;align-items:flex-start;justify-content:flex-start;writing-mode:horizontal-tb;padding-top:0;}
.abs-dots-inner{display:flex;flex-direction:row-reverse;align-items:flex-start;justify-content:flex-start;gap:1.15mm;}
.abs-dot-col{display:block;writing-mode:vertical-rl;text-orientation:upright;white-space:nowrap;font-size:${Math.max(9,spec.pt*.92)}pt;line-height:1;letter-spacing:.17em;font-weight:700;color:#6a5b4b;}
.page-mark{position:absolute;left:50%;bottom:5mm;transform:translateX(-50%);width:max-content;text-align:center;font-size:9pt;letter-spacing:.08em;color:#171410;writing-mode:horizontal-tb;}
`;
}
function renderAbsCol(c,i,page,spec){
  const isPageStart=i===0;
  if(c.type==='titlepage'){
    return `<section class="abs-titlepage"><div class="abs-title-inner">${escapeHtml(c.text||'タイトル')}</div></section>`;
  }
  const right=absRightMm(i,page,spec).toFixed(3);
  if(c.type==='divider'){
    const w=absColWidth(c,spec).toFixed(3);
    return `<section class="abs-divider" style="right:${right}mm;width:${w}mm" aria-label="回想線"><span class="divider-line"></span></section>`;
  }
  if(c.type==='dots'){
    const w=absColWidth(c,spec).toFixed(3);
    const raw=String(c.text||'・・・・・・\n・・・・・\n・・・・\n・・・\n・・\n・');
    const lines=raw.split(/\n+/).map(x=>x.trim()).filter(Boolean);
    const inner=lines.map(x=>`<span class="abs-dot-col">${escapeHtml(x)}</span>`).join('');
    return `<section class="abs-dots" style="right:${right}mm;width:${w}mm" aria-label="時間経過"><div class="abs-dots-inner">${inner}</div></section>`;
  }
  if(c.type==='pc'){
    const showSpeaker=c.first || isPageStart || (page[i-1]&&page[i-1].run!==c.run);
    const sameNext=page[i+1] && page[i+1].type==='pc' && page[i+1].run===c.run;
    const cont=c.continued && !showSpeaker ? ' continued' : '';
    const join=sameNext ? ' same-next' : '';
    return `<section class="abs-pc${cont}${join}" style="right:${right}mm"><div class="abs-speaker">${showSpeaker?escapeHtml(c.speaker):'　'}</div><div class="abs-rule"></div><div class="abs-body">${escapeHtml(c.text||'　')}</div></section>`;
  }
  if(c.type==='info'){
    const cont=c.continued?' continued':'';
    return `<section class="abs-info-col${cont}" style="right:${right}mm">${escapeHtml(c.text||'　')}</section>`;
  }
  if(c.type==='dice'){
    const cont=c.continued?' continued':'';
    const roll=c.roll?' roll':'';
    return `<section class="abs-dice${cont}${roll}" style="right:${right}mm">${escapeHtml(c.text||'　')}</section>`;
  }
  const html=escapeHtml(c.text||'　').replace(/^◆\s*([^\n]+)/,'<span class="abs-mark">◆</span><strong>$1</strong>');
  const cont=c.continued?' continued':'';
  return `<section class="abs-col${cont}" style="right:${right}mm">${html}</section>`;
}
function renderAbsRunRules(page,spec){
  const rules=[];
  let i=0;
  while(i<page.length){
    const c=page[i];
    if(c.type!=='pc') { i++; continue; }

    // ver10: 「PC会話が連続している区間」全体に1本の罫線を引く。
    // 同じ話者ランだけではなく、皇政宗→烏丸かがみ→皇政宗のように
    // 話者が切り替わっても、間に本文/ダイスが入らない限り会話区間としてつなげる。
    let j=i;
    while(j+1<page.length && page[j+1].type==='pc') j++;

    const rightStart=absRightMm(i,page,spec);
    const rightEnd=absRightMm(j,page,spec);
    const width=(rightEnd-rightStart+absColWidth(page[j],spec));
    rules.push(`<div class="abs-run-rule abs-dialogue-rule" style="right:${rightStart.toFixed(3)}mm;width:${width.toFixed(3)}mm"></div>`);
    i=j+1;
  }
  return rules.join('');
}
function renderAbsInfoFrames(page,spec){
  const frames=[];
  let i=0;
  while(i<page.length){
    const c=page[i];
    if(c.type!=='info'){ i++; continue; }
    let j=i;
    while(j+1<page.length && page[j+1].type==='info') j++;
    const rightStart=absRightMm(i,page,spec)-1.0;
    const rightEnd=absRightMm(j,page,spec);
    const width=(rightEnd-rightStart+absColWidth(page[j],spec)+2.0);
    frames.push(`<div class="abs-info-frame" style="right:${rightStart.toFixed(3)}mm;width:${width.toFixed(3)}mm"></div>`);
    i=j+1;
  }
  return frames.join('');
}
function buildAbsPagesHtml(pages,spec){
  return pages.map((page,pi)=>{
    const isTitlePage=page.length===1 && page[0].type==='titlepage';
    const mark=isTitlePage?'':`<div class="page-mark">-${pi+1}P-</div>`;
    return `<section class="print-page" data-page="${pi+1}">${renderAbsInfoFrames(page,spec)}${renderAbsRunRules(page,spec)}${page.map((c,i)=>renderAbsCol(c,i,page,spec)).join('')}${mark}</section>`;
  }).join('');
}
function makeAbsPages(){
  const blocks=mergeEditableBlocks(parseEditableBlocks(els.textEditor.value));
  const spec=getAbsSpec();
  const cols=buildAbsColumns(blocks,spec);
  const pages=paginateAbsColumns(cols,spec);
  return {pages,spec};
}
function makePrintDocument(pages,spec){
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title></title><style>${absPrintCss(spec)}
.preset-card{border:1px solid var(--line);border-radius:18px;background:#fffaf0;padding:14px 15px;margin-bottom:12px;line-height:1.8;color:#5b4b2b}.preset-card b{display:block;color:#1f2937;font-size:16px;margin-bottom:4px}.preset-card p{margin:0 0 6px}.preset-card .mini{font-size:12px;color:#88724b}.settings-simple .buttons{margin-top:12px}.save-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.save-actions button{min-height:40px}.editor-actions-note{font-size:12px;color:#7a6b5c;line-height:1.6;margin:0 0 8px}.danger-note{background:#fff1f1;border:1px solid #f2c4c4;color:#7a2525;border-radius:14px;padding:9px 11px;font-size:12px;line-height:1.6;margin-bottom:10px}
</style></head><body>${buildAbsPagesHtml(pages,spec)}</body></html>`;
}
function preparePrintHost(){
  const {pages,spec}=makeAbsPages();
  const host=document.getElementById('printHost');
  host.innerHTML=buildAbsPagesHtml(pages,spec);
  let style=document.getElementById('dynamicPrintPageStyle');
  if(!style){style=document.createElement('style');style.id='dynamicPrintPageStyle';document.head.appendChild(style);}
  style.textContent=`@media print{${absPrintCss(spec)} body>*:not(#printHost){display:none!important;} #printHost{display:block!important;margin:0!important;padding:0!important;background:#fff!important;} }`;
  return {pages,spec};
}
function buildPrintPreview(){
  const {pages,spec}=makeAbsPages();
  const frame=$('printPreviewFrame');
  if(frame){ frame.srcdoc=makePrintDocument(pages,spec); }
  currentPrintPreviewPage=1;
  const status=$('printPreviewStatus');
  if(status){ status.textContent=`${spec.name} / ${pages.length}P / 最大${spec.maxCols}列 / 1列${spec.pcChars}字 / 続き列は詰め`; }
  return {pages,spec};
}
function printPdf(){
  const {pages,spec}=makeAbsPages();
  const old=document.getElementById('printFrame');
  if(old) old.remove();
  const iframe=document.createElement('iframe');
  iframe.id='printFrame';
  iframe.style.position='fixed';
  iframe.style.right='0';
  iframe.style.bottom='0';
  iframe.style.width='0';
  iframe.style.height='0';
  iframe.style.border='0';
  document.body.appendChild(iframe);
  const doc=iframe.contentDocument||iframe.contentWindow.document;
  doc.open();
  doc.write(makePrintDocument(pages,spec));
  doc.close();
  setTimeout(()=>{iframe.contentWindow.focus();iframe.contentWindow.print();},250);
}
function downloadPrintHtml(){
  const {pages,spec}=makeAbsPages();
  downloadBlob(makePrintDocument(pages,spec),'loggene_vertical_print_beta9.html','text/html;charset=utf-8');
}


function on(id,event,fn){const el=$(id);if(el)el.addEventListener(event,fn)}
on('loadBtn','click',parseSelectedFile);on('demoBtn','click',showDemo);on('findBtn','click',findInEditor);on('prevHitBtn','click',prevFindMatch);on('nextHitBtn','click',nextFindMatch);on('findText','input',()=>{findMatches=[];findIndex=-1;$('findCounter').textContent='0 / 0';$('findResults').innerHTML='';$('findNote').textContent='検索ボタンかEnterで検索します。';});on('findText','keydown',e=>{if(e.isComposing)return;if(e.key==='Enter'){e.preventDefault();if(!findMatches.length)refreshFindResults(true);else e.shiftKey?prevFindMatch():nextFindMatch();}});on('replaceOneBtn','click',replaceNextInEditor);on('replaceAllBtn','click',()=>replaceAllInEditor(false));on('deleteAllBtn','click',()=>replaceAllInEditor(true));on('rerenderBtn','click',()=>renderAll(true));on('fromLogBtn','click',()=>{if(!entries.length){alert('先にHTMLログを読み込んでください');return}if(confirm('現在の編集テキストを、元ログから作り直します。手で直した内容は上書きされます。よろしいですか？'))renderAll(true)});on('previewBtn','click',()=>updatePreview(true));on('copyBtn','click',copyEditor);on('txtBtn','click',downloadText);on('htmlBtn','click',downloadHtml);on('printHtmlBtn','click',downloadPrintHtml);on('printBtn','click',printPdf);on('startBtn','click',scrollStart);on('directionBtn','click',e=>{isHorizontal=!isHorizontal;applySettings();e.target.textContent=isHorizontal?'縦書き確認':'横書き確認'});['skipEmpty','skipDice','skipSystem','mergeSameSpeaker','scenarioAsNarration','fullWidthPunctuation'].forEach(id=>on(id,'change',()=>renderAll(true)));['fontSize','speakerHeight','speakerFont','bodyHeight','turnGap'].forEach(id=>on(id,'change',()=>{applySettings();scrollStart()}));on('pdfSize','change',()=>{applySettings();});on('scenarioNames','input',()=>renderAll(true));els.textEditor.addEventListener('input',()=>{findMatches=[];findIndex=-1;$('findCounter').textContent='0 / 0';});on('applySpeakerSettingsBtn','click',applySpeakerSettingsToEditor);on('markTitlePageBtn','click',markTitlePage);on('markSystemBoxBtn','click',markSystemBox);on('markInfoBoxBtn','click',markInfoBox);on('insertRecallLineBtn','click',insertRecallLine);on('insertTimeDotsBtn','click',insertTimeDots);

showDemo();
