function getContinueDialogHtml(meta = {}) {
  const workspace = meta.workspace || {};
  const requestContext = meta.requestContext || {};
  const initialData = JSON.stringify({
    workspace,
    reason: requestContext.reason || '',
    details: requestContext.details || requestContext.reason || '',
    requestWorkspace: requestContext.workspace || '',
    port: meta.port || '',
    autoReply: meta.autoReply || { enabled: false, text: '', delaySec: 0 },
  }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    *{box-sizing:border-box}
    body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:#1f232b;margin:0;padding:18px}
    .wrap{max-width:760px;margin:0 auto}
    .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
    .title{font-size:15px;font-weight:600}
    .skip{background:transparent;border:0;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:12px}
    .panel{background:#2a2e37;border:1px solid #373c47;border-radius:8px;padding:14px;margin-bottom:12px;box-shadow:0 1px 0 rgba(255,255,255,.03) inset}
    .label{font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:8px}
    textarea{width:100%;min-height:118px;resize:vertical;background:#22262e;color:var(--vscode-input-foreground);border:1px solid #4b5563;border-radius:6px;padding:10px;font-family:var(--vscode-font-family);font-size:13px;outline:none}
    textarea:focus{border-color:#5b8cff;box-shadow:0 0 0 1px rgba(91,140,255,.35)}
    button{border:0;border-radius:5px;padding:8px 14px;cursor:pointer;font-size:13px}
    .primary{background:#3b82f6;color:#fff}
    .primary:hover{background:#2563eb}
    .secondary{background:#3a3f4b;color:var(--vscode-foreground)}
    .secondary:hover{background:#454b59}
    .danger{background:#d97706;color:#fff}
    .danger:hover{background:#b45309}
    .drop{border:1px dashed #4b5563;border-radius:7px;padding:18px;text-align:center;background:#252a33;margin:10px 0;color:var(--vscode-descriptionForeground)}
    .row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:8px}
    .actions{display:flex;align-items:center;gap:10px;margin-top:14px}
    .actions .spacer{flex:1}
    .hint{text-align:center;color:var(--vscode-descriptionForeground);font-size:11px;margin-top:12px}
    .status{min-height:18px;margin-top:8px;font-size:12px;color:#93c5fd}
    .status.err{color:#fca5a5}
    .muted{opacity:.72;font-size:12px}
    .context{border-left:3px solid #60a5fa;background:#252a33}
    .kv{font-size:12px;line-height:1.6;color:#d1d5db;word-break:break-all}
    .reason{white-space:pre-wrap;max-height:150px;overflow:auto;background:#20242c;border:1px solid #3b4250;border-radius:6px;padding:10px;font-size:12px;color:#d1d5db}
    .file{display:flex;align-items:center;gap:8px;font-family:monospace;font-size:12px;margin:5px 0;word-break:break-all;color:#cbd5e1}
    .file span{flex:1}
    .mini{padding:2px 7px;font-size:11px;background:#4b5563;color:#fff;border-radius:999px}
    .thumb{display:inline-flex;align-items:center;gap:6px;margin:4px 6px 4px 0;padding:5px 8px;border:1px solid #4b5563;border-radius:999px;background:#22262e;font-size:11px;color:#d1d5db}
    .section-title{font-weight:600;margin-bottom:6px}
    .auto{border-left:3px solid #f59e0b;background:#302a1d}
    .auto-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .auto code{background:#20242c;border:1px solid #4b5563;border-radius:4px;padding:2px 6px}
  </style></head><body>
    <div class="wrap">
    <div class="top">
      <div class="title">是否继续对话？你也可以直接输入下一个指令。</div>
      <button class="skip" onclick="endConversation()">Skip</button>
    </div>
    <div class="panel context">
      <div class="section-title">当前窗口 / 项目</div>
      <div class="kv">名称：<span id="wsName"></span></div>
      <div class="kv">路径：<span id="wsPath"></span></div>
      <div class="kv">端口：<span id="wsPort"></span></div>
    </div>
    <div class="panel">
      <div class="section-title">AI 输出原因 / 上一句内容</div>
      <div id="prevReason" class="reason">暂无上一句内容</div>
    </div>
    <div class="panel">
      <div class="label">Other answer</div>
      <textarea id="inst" placeholder="请输入新指令，或输入“结束/没有/完成/退出/不用/就这样/不需要了”结束对话..."></textarea>
    </div>
    <div id="autoReplyPanel" class="panel auto" style="display:none">
      <div class="section-title">固定短语自动回复</div>
      <div class="auto-line">
        <span class="muted">将在 <span id="autoDelay"></span> 秒后自动回复：</span>
        <code id="autoText"></code>
        <button id="btnCancelAuto" class="secondary">取消自动回复</button>
      </div>
    </div>
    <div class="panel">
      <div class="section-title">上传图片（可选）</div>
      <div class="drop" id="pasteZone">� 可直接粘贴截图/图片，或点击下方按钮选择</div>
      <div class="row">
        <span class="muted">粘贴图片模式：</span>
        <label><input type="radio" name="imageMode" value="base64" checked> 图片内容(Base64)</label>
        <label><input type="radio" name="imageMode" value="path"> 仅路径</label>
      </div>
      <button id="btnPickImages" class="secondary" style="margin-top:10px">📁 选择图片</button>
      <div id="imageFiles" style="margin-top:8px" class="muted">尚未选择图片</div>
      <div id="pastedImages" style="margin-top:8px"></div>
    </div>
    <div class="panel">
      <div class="section-title">上传文件（可选，支持粘贴任意文件）</div>
      <div class="drop">📂 可直接选择文件，路径会写入结构化 JSON</div>
      <div class="row">
        <label><input type="radio" name="mode" value="path" checked> 路径模式</label>
        <label><input type="radio" name="mode" value="content"> 内容模式标记</label>
      </div>
      <button id="btnPickFiles" class="secondary" style="margin-top:10px">📁 选择文件</button>
      <div id="files" style="margin-top:8px" class="muted">尚未选择附件</div>
    </div>
    <div class="actions">
      <button id="btnContinue" class="primary">▶ 继续执行</button>
      <button id="btnCopy" class="danger">📝 总结</button>
      <span class="spacer"></span>
      <button id="btnEnd" class="secondary">结束对话</button>
    </div>
    <div id="status" class="status"></div>
    <div class="hint">快捷键：Enter = 继续｜Esc = 结束｜Ctrl+V = 粘贴图片</div>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      const initialData = ${initialData};
      let attachments = [];
      let pastedImages = [];
      let autoReplyTimer = null;
      function esc(s){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
      function setStatus(text, isError){
        const el = document.getElementById('status');
        if (!el) return;
        el.textContent = text || '';
        el.className = isError ? 'status err' : 'status';
      }
      function post(msg){
        try { vscode.postMessage(msg); }
        catch(e) { setStatus('发送消息失败: ' + (e && e.message ? e.message : e), true); }
      }
      function initContext(){
        const ws = initialData.workspace || {};
        document.getElementById('wsName').textContent = ws.name || '未打开文件夹';
        document.getElementById('wsPath').textContent = ws.path || ws.workspaceFile || '';
        document.getElementById('wsPort').textContent = initialData.port || '';
        const reason = initialData.details || initialData.reason || '';
        document.getElementById('prevReason').textContent = reason.trim() || '暂无上一句内容';
      }
      function pickFiles(kind){ setStatus(kind === 'image' ? '正在选择图片...' : '正在选择附件...'); post({type:'pickFiles', kind}); }
      function mode(){ return document.querySelector('input[name="mode"]:checked')?.value || 'path'; }
      function imageMode(){ return document.querySelector('input[name="imageMode"]:checked')?.value || 'base64'; }
      function endWords(text){ return /(结束|没有|完成|退出|不用|就这样|不需要了)/.test((text || '').trim()); }
      function removeAttachment(index){ attachments.splice(index,1); renderAttachments(); setStatus('已移除附件'); }
      function removePasted(index){ pastedImages.splice(index,1); renderPasted(); setStatus('已移除粘贴图片'); }
      function renderAttachments(){
        const imageEl = document.getElementById('imageFiles');
        const fileEl = document.getElementById('files');
        const images = attachments.map((a,i)=>({...a,i})).filter(a=>a.type==='image');
        const files = attachments.map((a,i)=>({...a,i})).filter(a=>a.type!=='image');
        imageEl.innerHTML = images.length ? images.map(a => '<div class="file"><span>🖼 '+esc(a.path)+'</span><button class="mini" data-remove-attachment="'+a.i+'">移除</button></div>').join('') : '尚未选择图片';
        fileEl.innerHTML = files.length ? files.map(a => '<div class="file"><span>📄 '+esc(a.path)+'</span><button class="mini" data-remove-attachment="'+a.i+'">移除</button></div>').join('') : '尚未选择附件';
      }
      function renderPasted(){
        const el = document.getElementById('pastedImages');
        el.innerHTML = pastedImages.length ? pastedImages.map((x,i) => '<span class="thumb">🖼 粘贴图片 '+(i+1)+' · '+(x.size||0)+' bytes <button class="mini" data-remove-pasted="'+i+'">移除</button></span>').join('') : '';
      }
      function buildPrompt(){
        const inst = document.getElementById('inst').value.trim();
        let text = inst || '继续';
        if (attachments.length) {
          if (mode() === 'path') text += '\\n\\n附件路径：\\n' + attachments.map(a => '- ' + a.path).join('\\n');
          else text += '\\n\\n请读取并分析以下附件；如果当前环境无法直接读取，请根据路径访问：\\n' + attachments.map(a => '- ' + a.path).join('\\n');
        }
        if (pastedImages.length) text += '\\n\\n粘贴图片：\\n' + pastedImages.map(x => '- ' + x.path + (imageMode()==='base64' ? '（Base64 已写入结构化 JSON）' : '')).join('\\n');
        return text;
      }
      function submitContinue(){
        const instruction = document.getElementById('inst').value.trim();
        setStatus('正在写入结构化请求...');
        post({type:'submitContinue', action:endWords(instruction)?'end':'continue', instruction, attachments, mode:mode(), imageMode:imageMode(), pastedImages});
      }
      function cancelAutoReply(){
        if (autoReplyTimer) clearTimeout(autoReplyTimer);
        autoReplyTimer = null;
        const el = document.getElementById('autoReplyPanel');
        if (el) el.style.display = 'none';
        setStatus('已取消固定短语自动回复');
      }
      function initAutoReply(){
        const cfg = initialData.autoReply || {};
        if (!cfg.enabled) return;
        const text = String(cfg.text || '继续').trim() || '继续';
        const delay = Math.max(0, Math.min(60, Number(cfg.delaySec || 0)));
        document.getElementById('inst').value = text;
        document.getElementById('autoText').textContent = text;
        document.getElementById('autoDelay').textContent = String(delay);
        document.getElementById('autoReplyPanel').style.display = '';
        setStatus(delay ? '固定短语自动回复倒计时中，可取消或直接修改内容' : '正在使用固定短语自动回复');
        autoReplyTimer = setTimeout(() => submitContinue(), delay * 1000);
      }
      function endConversation(){
        setStatus('正在结束对话...');
        post({type:'submitContinue', action:'end', instruction:'', attachments:[], mode:mode(), imageMode:imageMode(), pastedImages:[]});
      }
      function copyOnly(){
        const instruction = buildPrompt();
        setStatus('正在生成总结 Prompt...');
        post({type:'submitContinue', action:endWords(instruction)?'end':'continue', instruction, attachments, mode:mode(), imageMode:imageMode(), pastedImages});
      }
      window.addEventListener('paste', ev => {
        const items = ev.clipboardData && ev.clipboardData.items ? Array.from(ev.clipboardData.items) : [];
        for (const item of items) {
          if (!item.type || !item.type.startsWith('image/')) continue;
          const file = item.getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onload = () => { setStatus('正在保存粘贴图片...'); post({type:'pastedImage', dataUrl: reader.result}); };
          reader.readAsDataURL(file);
          ev.preventDefault();
        }
      });
      window.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          endConversation();
        } else if (ev.key === 'Enter' && !ev.shiftKey && !ev.ctrlKey && !ev.altKey && ev.target && ev.target.id === 'inst') {
          ev.preventDefault();
          submitContinue();
        }
      });
      document.addEventListener('click', ev => {
        const ai = ev.target && ev.target.getAttribute ? ev.target.getAttribute('data-remove-attachment') : null;
        const pi = ev.target && ev.target.getAttribute ? ev.target.getAttribute('data-remove-pasted') : null;
        if (ai !== null) removeAttachment(Number(ai));
        if (pi !== null) removePasted(Number(pi));
      });
      window.addEventListener('message', ev => {
        if (ev.data.type === 'pickedFiles') {
          const kind = ev.data.kind || 'file';
          const picked = (ev.data.paths || []).map(p => ({ type: kind === 'image' ? 'image' : (/\\.(png|jpe?g|gif|bmp|webp|svg|ico)$/i.test(p) ? 'image' : 'file'), path: p }));
          attachments = attachments.concat(picked);
          renderAttachments();
          setStatus(picked.length ? '已添加 ' + picked.length + ' 个' + (kind === 'image' ? '图片' : '附件') : '未选择附件');
        } else if (ev.data.type === 'pastedImageSaved') {
          pastedImages.push(ev.data.item);
          renderPasted();
        } else if (ev.data.type === 'status') {
          setStatus(ev.data.text || '');
        } else if (ev.data.type === 'error') {
          setStatus(ev.data.text || '操作失败', true);
        }
      });
      document.addEventListener('DOMContentLoaded', () => {
        initContext();
        document.getElementById('btnContinue')?.addEventListener('click', submitContinue);
        document.getElementById('btnCopy')?.addEventListener('click', copyOnly);
        document.getElementById('btnEnd')?.addEventListener('click', endConversation);
        document.getElementById('btnCancelAuto')?.addEventListener('click', cancelAutoReply);
        document.getElementById('btnPickImages')?.addEventListener('click', () => pickFiles('image'));
        document.getElementById('btnPickFiles')?.addEventListener('click', () => pickFiles('file'));
        initAutoReply();
        post({type:'ready'});
      });
    </script>
  </body></html>`;
}

module.exports = { getContinueDialogHtml };

