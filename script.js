(function(){
  "use strict";

  const SCENES = [
    {id:'garden', label:'Garden Morning', class:'scene-garden'},
    {id:'dusk', label:'Dusk Meadow', class:'scene-dusk'},
    {id:'rosewater', label:'Rosewater Clouds', class:'scene-rosewater'}
  ];
  const ACCENTS = ['#4A3550','#C08A2C','#93AF82','#A79BD4','#E8A6B6','#7A6584'];
  const STICKERS = ['🌸','🌷','🌻','🌹','🦋','💌','💕','✨','🕊️','🌿','⭐','🌙'];
  const ANIMS = [
    {id:'bloom', label:'Bloom Open — petals unfurl from the seal'},
    {id:'rise', label:'Gentle Rise — the letter floats up softly'},
    {id:'firefly', label:'Firefly Glow — little lights drift up first'}
  ];

  let profile = null;
  let letters = []; // index metadata: {id,title,scene,status,createdAt,code}
  let current = null; // full letter object being edited
  let draggingSticker = null;
  let selectedStickerId = null;

  function uid(){ return Math.random().toString(36).slice(2,10); }
  function genCode(){ return uid().slice(0,4)+'-'+uid().slice(0,4); }

  function show(screenId){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  }

  // ---------------- SUPABASE ----------------
  const SUPABASE_URL = 'https://yrhduohbeqgjtdooyyew.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyaGR1b2hiZXFnanRkb295eWV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NTY0MDEsImV4cCI6MjA5OTQzMjQwMX0.dW-DkeLKMGmCGbKfvOOx-UOJDT3zsmxpoEDVBghNDsE';
  const REST = SUPABASE_URL + '/rest/v1';

  function sbHeaders(extra){
    return Object.assign({
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    }, extra || {});
  }

  // fetch rows from a table. `query` is a raw querystring, e.g. "id=eq.abc&select=*"
  async function sbSelect(table, query){
    try{
      const res = await fetch(REST + '/' + table + '?' + query, { headers: sbHeaders() });
      if(!res.ok) return null;
      return await res.json(); // always an array
    }catch(e){ console.error('supabase select failed', e); return null; }
  }

  // insert-or-update a single row, matched on conflictCol (usually the primary key)
  async function sbUpsert(table, conflictCol, row){
    try{
      const res = await fetch(REST + '/' + table + '?on_conflict=' + conflictCol, {
        method:'POST',
        headers: sbHeaders({ 'Prefer':'resolution=merge-duplicates,return=representation' }),
        body: JSON.stringify([row])
      });
      return res.ok;
    }catch(e){ console.error('supabase upsert failed', e); return false; }
  }

  // ---------------- LOCAL IDENTITY ----------------
  // Who you are on this device. This is intentionally simple (no passwords yet) —
  // it just ties your letters to a private id saved in this browser.
  function loadLocalProfile(){
    try{
      const raw = localStorage.getItem('petalink_profile');
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }
  function saveLocalProfile(p){
    try{ localStorage.setItem('petalink_profile', JSON.stringify(p)); }catch(e){}
  }

  // ---------------- INIT ----------------
  async function init(){
    profile = loadLocalProfile();
    if(profile){
      await loadIndex();
      renderDashboard();
      show('screen-dashboard');
    } else {
      show('screen-landing');
    }
  }

  async function loadIndex(){
    const rows = await sbSelect('letters', 'owner=eq.' + encodeURIComponent(profile.uid) + '&select=id,data,status,created_at&order=created_at.desc');
    letters = (rows || []).map(r=>{
      const d = r.data || {};
      return {id:r.id, title:d.title, scene:d.scene, status:r.status, createdAt: new Date(r.created_at).getTime(), code:d.code};
    });
  }

  // ---------------- LANDING ----------------
  document.getElementById('begin-btn').addEventListener('click', async ()=>{
    const val = document.getElementById('name-input').value.trim();
    if(!val) return;
    profile = {name: val, uid: uid() + uid()};
    saveLocalProfile(profile);
    await loadIndex();
    renderDashboard();
    show('screen-dashboard');
  });
  document.getElementById('name-input').addEventListener('keydown', e=>{
    if(e.key==='Enter') document.getElementById('begin-btn').click();
  });
  document.getElementById('have-code-btn').addEventListener('click', ()=> show('screen-viewer-entry'));
  document.getElementById('back-to-landing-btn').addEventListener('click', ()=> show(profile? 'screen-dashboard':'screen-landing'));
  document.getElementById('open-code-from-dash-btn').addEventListener('click', ()=> show('screen-viewer-entry'));

  document.getElementById('open-code-btn').addEventListener('click', openByCode);
  document.getElementById('code-input').addEventListener('keydown', e=>{ if(e.key==='Enter') openByCode(); });

  async function openByCode(){
    const code = document.getElementById('code-input').value.trim().toLowerCase();
    if(!code) return;
    const rows = await sbSelect('shared_letters', 'code=eq.' + encodeURIComponent(code) + '&select=data');
    if(!rows || rows.length===0){
      alert("Hmm, that code didn't match a letter. Double check it and try again.");
      return;
    }
    const letter = rows[0].data;
    show('screen-viewer');
    setupViewer(letter);
  }

  // ---------------- DASHBOARD ----------------
  function renderDashboard(){
    document.getElementById('dash-greeting').textContent = profile.name ? ('Hi ' + profile.name + ', your letters') : 'Your letters';
    const grid = document.getElementById('letters-grid');
    grid.innerHTML = '';
    if(letters.length===0){
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
        <div style="font-size:40px;">🌸</div>
        <p>Nothing here yet — write someone something beautiful.</p>
      </div>`;
      return;
    }
    letters.slice().reverse().forEach(l=>{
      const scene = SCENES.find(s=>s.id===l.scene) || SCENES[0];
      const card = document.createElement('button');
      card.className = 'letter-card';
      card.innerHTML = `
        <div class="letter-thumb ${scene.class}"></div>
        <div class="letter-body-pad">
          <h3>${escapeHtml(l.title || 'Untitled letter')}</h3>
          <div class="letter-meta">
            <span>${new Date(l.createdAt).toLocaleDateString()}</span>
            <span class="status-pill ${l.status==='sent'?'status-sent':'status-draft'}">${l.status==='sent'?'Sent':'Draft'}</span>
          </div>
        </div>`;
      card.addEventListener('click', ()=> openEditor(l.id));
      grid.appendChild(card);
    });
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  document.getElementById('new-letter-btn').addEventListener('click', ()=> openEditor(null));
  document.getElementById('back-to-dash-btn').addEventListener('click', async ()=>{
    await loadIndex();
    renderDashboard();
    show('screen-dashboard');
  });

  // ---------------- EDITOR ----------------
  function newLetter(){
    return {
      id: uid(),
      title:'',
      body:'',
      scene:'garden',
      accent: ACCENTS[0],
      stickers: [],
      animation:'bloom',
      status:'draft',
      code:null,
      createdAt: Date.now()
    };
  }

  async function openEditor(id){
    if(id){
      const rows = await sbSelect('letters', 'id=eq.' + encodeURIComponent(id) + '&select=data');
      current = (rows && rows[0]) ? rows[0].data : newLetter();
    } else {
      current = newLetter();
    }
    buildEditorRail();
    document.getElementById('title-input').value = current.title;
    document.getElementById('body-input').value = current.body;
    renderPreview();
    show('screen-editor');
  }

  function buildEditorRail(){
    // scenes
    const sceneWrap = document.getElementById('scene-options');
    sceneWrap.innerHTML='';
    SCENES.forEach(s=>{
      const el = document.createElement('div');
      el.className = 'scene-swatch ' + s.class + (current.scene===s.id?' selected':'');
      el.title = s.label;
      el.tabIndex = 0;
      el.setAttribute('role','button');
      el.setAttribute('aria-label','Scene: '+s.label);
      el.addEventListener('click', ()=>{ current.scene=s.id; buildEditorRail(); renderPreview(); });
      sceneWrap.appendChild(el);
    });
    // colors
    const colorWrap = document.getElementById('color-options');
    colorWrap.innerHTML='';
    ACCENTS.forEach(c=>{
      const el = document.createElement('div');
      el.className = 'color-dot' + (current.accent===c?' selected':'');
      el.style.background = c;
      el.tabIndex = 0;
      el.setAttribute('role','button');
      el.setAttribute('aria-label','Accent color '+c);
      el.addEventListener('click', ()=>{ current.accent=c; buildEditorRail(); renderPreview(); });
      colorWrap.appendChild(el);
    });
    // stickers
    const stickerWrap = document.getElementById('sticker-grid');
    stickerWrap.innerHTML='';
    STICKERS.forEach(em=>{
      const btn = document.createElement('button');
      btn.className = 'sticker-btn';
      btn.textContent = em;
      btn.setAttribute('aria-label','Add sticker '+em);
      btn.addEventListener('click', ()=>{
        current.stickers.push({id:uid(), emoji:em, x:40+Math.random()*20, y:35+Math.random()*20, rot:(Math.random()*30-15)});
        renderPreview();
      });
      stickerWrap.appendChild(btn);
    });
    // animations
    const animWrap = document.getElementById('anim-options');
    animWrap.innerHTML='';
    ANIMS.forEach(a=>{
      const el = document.createElement('button');
      el.className = 'anim-choice' + (current.animation===a.id?' selected':'');
      el.innerHTML = `<span class="anim-dot"></span><span>${a.label}</span>`;
      el.addEventListener('click', ()=>{ current.animation=a.id; buildEditorRail(); });
      animWrap.appendChild(el);
    });
  }

  function renderPreview(){
    const frame = document.getElementById('preview-frame');
    const scene = SCENES.find(s=>s.id===current.scene) || SCENES[0];
    frame.className = 'preview-frame ' + scene.class;
    document.getElementById('preview-title-txt').textContent = document.getElementById('title-input').value || current.title || 'A little heading…';
    document.getElementById('preview-body-txt').textContent = document.getElementById('body-input').value || current.body || 'Your letter will appear here as you write it.';
    document.getElementById('preview-title-txt').style.color = current.accent;

    // remove old stickers
    document.querySelectorAll('.sticker-el').forEach(e=>e.remove());
    const canvas = document.getElementById('preview-canvas');
    current.stickers.forEach(st=>{
      const el = document.createElement('div');
      el.className = 'sticker-el';
      el.textContent = st.emoji;
      el.style.left = st.x + '%';
      el.style.top = st.y + '%';
      el.style.transform = 'rotate('+st.rot+'deg)';
      el.dataset.id = st.id;
      const rm = document.createElement('div');
      rm.className = 'sticker-remove';
      rm.textContent = '×';
      rm.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        current.stickers = current.stickers.filter(s=>s.id!==st.id);
        renderPreview();
      });
      el.appendChild(rm);
      el.addEventListener('pointerdown', (ev)=> startDrag(ev, st.id));
      el.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        document.querySelectorAll('.sticker-el').forEach(e=>e.classList.remove('selected'));
        el.classList.add('selected');
      });
      canvas.appendChild(el);
    });
  }

  function startDrag(ev, id){
    ev.preventDefault();
    draggingSticker = id;
    const el = ev.currentTarget;
    el.classList.add('dragging');
    const frame = document.getElementById('preview-frame');

    function move(e){
      const rect = frame.getBoundingClientRect();
      const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX);
      const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY);
      let x = ((clientX - rect.left) / rect.width) * 100;
      let y = ((clientY - rect.top) / rect.height) * 100;
      x = Math.max(2, Math.min(92, x));
      y = Math.max(2, Math.min(92, y));
      const st = current.stickers.find(s=>s.id===id);
      if(st){ st.x = x; st.y = y; el.style.left = x+'%'; el.style.top = y+'%'; }
    }
    function up(){
      el.classList.remove('dragging');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  document.getElementById('title-input').addEventListener('input', renderPreview);
  document.getElementById('body-input').addEventListener('input', renderPreview);

  async function persistCurrent(status){
    current.title = document.getElementById('title-input').value;
    current.body = document.getElementById('body-input').value;
    if(status) current.status = status;
    await sbUpsert('letters', 'id', {
      id: current.id,
      owner: profile.uid,
      data: current,
      status: current.status
    });
  }

  document.getElementById('save-draft-btn').addEventListener('click', async ()=>{
    await persistCurrent('draft');
    await loadIndex();
    renderDashboard();
    show('screen-dashboard');
  });

  document.getElementById('get-link-btn').addEventListener('click', async ()=>{
    if(!current.code) current.code = genCode();
    await persistCurrent('sent');
    await sbUpsert('shared_letters', 'code', { code: current.code, data: current });
    const url = location.href.split('#')[0] + '#code=' + current.code;
    document.getElementById('modal-code').textContent = current.code;
    document.getElementById('copy-link-btn').onclick = ()=>{
      navigator.clipboard.writeText(url).then(()=>{
        document.getElementById('copy-link-btn').textContent = 'Copied!';
        setTimeout(()=> document.getElementById('copy-link-btn').textContent='Copy link', 1500);
      }).catch(()=>{});
    };
    document.getElementById('share-modal').classList.add('active');
  });
  document.getElementById('close-modal-btn').addEventListener('click', async ()=>{
    document.getElementById('share-modal').classList.remove('active');
    await loadIndex();
    renderDashboard();
    show('screen-dashboard');
  });

  // ---------------- VIEWER ----------------
  function setupViewer(letter){
    const stage = document.getElementById('viewer-stage');
    const scene = SCENES.find(s=>s.id===letter.scene) || SCENES[0];
    stage.className = 'viewer-stage ' + scene.class;
    stage.style.borderRadius = '20px';

    const envelope = document.getElementById('envelope');
    envelope.className = 'envelope';
    const viewerLetter = document.getElementById('viewer-letter');
    viewerLetter.className = 'viewer-letter';
    document.getElementById('viewer-hint').textContent = 'tap the envelope to open';
    document.getElementById('viewer-hint').style.display = 'block';

    document.getElementById('viewer-title-txt').textContent = letter.title || 'A little heading…';
    document.getElementById('viewer-title-txt').style.color = letter.accent || 'var(--plum)';
    document.getElementById('viewer-body-txt').textContent = letter.body || '';

    // clear old decorations
    stage.querySelectorAll('.bloom-petal, .firefly, .viewer-sticker').forEach(e=>e.remove());

    const clone = envelope.cloneNode(true);
    envelope.parentNode.replaceChild(clone, envelope);
    clone.addEventListener('click', ()=> revealLetter(letter, stage, clone, viewerLetter), {once:true});
  }

  function revealLetter(letter, stage, envelope, viewerLetter){
    document.getElementById('viewer-hint').style.display = 'none';

    if(letter.animation === 'bloom'){
      spawnPetals(stage, 14);
    }
    if(letter.animation === 'firefly'){
      spawnFireflies(stage, 10);
    }

    envelope.classList.add('opening');
    setTimeout(()=>{
      envelope.classList.add('hidden');
      viewerLetter.classList.add('show');
      // place stickers on viewer letter
      (letter.stickers||[]).forEach(st=>{
        const el = document.createElement('div');
        el.className = 'sticker-el viewer-sticker';
        el.style.position='absolute';
        el.style.left = st.x+'%';
        el.style.top = st.y+'%';
        el.style.transform = 'rotate('+st.rot+'deg)';
        el.style.fontSize = '28px';
        el.textContent = st.emoji;
        viewerLetter.appendChild(el);
      });
    }, letter.animation==='rise' ? 300 : 700);
  }

  function spawnPetals(stage, n){
    for(let i=0;i<n;i++){
      const p = document.createElement('div');
      p.className = 'bloom-petal';
      const size = 8 + Math.random()*10;
      p.style.width = size+'px';
      p.style.height = size+'px';
      p.style.left = (30+Math.random()*40)+'%';
      p.style.top = '40%';
      p.style.background = ['#F3C6D0','#E8A6B6','#C9BFE8','#B7CDA8'][i%4];
      p.style.animation = 'fallPetal ' + (1.4+Math.random()*1.2) + 's ease-out ' + (Math.random()*0.4) + 's forwards';
      stage.appendChild(p);
      setTimeout(()=>p.remove(), 3200);
    }
  }
  function spawnFireflies(stage, n){
    for(let i=0;i<n;i++){
      const f = document.createElement('div');
      f.className = 'firefly';
      f.style.left = (20+Math.random()*60)+'%';
      f.style.top = (55+Math.random()*20)+'%';
      f.style.animation = 'floatFly ' + (1.6+Math.random()*1.2) + 's ease-out ' + (Math.random()*0.5) + 's forwards';
      stage.appendChild(f);
      setTimeout(()=>f.remove(), 3400);
    }
  }

  // handle direct link with #code=
  async function checkHashCode(){
    const m = location.hash.match(/code=([a-z0-9-]+)/i);
    if(m){
      const code = m[1];
      const rows = await sbSelect('shared_letters', 'code=eq.' + encodeURIComponent(code) + '&select=data');
      if(rows && rows.length){
        show('screen-viewer');
        setupViewer(rows[0].data);
        return true;
      }
    }
    return false;
  }

  (async function boot(){
    const handled = await checkHashCode();
    if(!handled){
      await init();
    }
  })();

})();
