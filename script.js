// script.js - manage participants with image upload and localStorage persistence
(function(){
  const form = document.getElementById('regForm');
  const participantsListEl = document.getElementById('participantsList');
  const totalCountEl = document.getElementById('totalCount');
  const maleCountEl = document.getElementById('maleCount');
  const femaleCountEl = document.getElementById('femaleCount');
  const searchEl = document.getElementById('search');

  const STORAGE_KEY = 'participants_v1';

  let participants = loadParticipants();

  function loadParticipants(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){
      console.error('Failed to parse participants', e);
      return [];
    }
  }

  function saveParticipants(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(participants));
  }

  function formatDate(ts){
    const d = new Date(ts);
    return d.toLocaleString();
  }

  function renderParticipants(filter){
    const term = (filter||'').toLowerCase().trim();
    participantsListEl.innerHTML = '';

    let male = 0, female = 0;

    const filtered = participants.filter(p=>{
      if(!term) return true;
      return (p.fullName||'').toLowerCase().includes(term)
        || (p.event||'').toLowerCase().includes(term)
        || (p.batch||'').toLowerCase().includes(term)
        || (p.email||'').toLowerCase().includes(term);
    });

    filtered.forEach(p=>{
      if(p.gender==='male') male++;
      if(p.gender==='female') female++;

      const card = document.createElement('div');
      card.className = 'participant-card';

      const info = document.createElement('div');
      info.className = 'participant-info';

      const name = document.createElement('div');
      name.className = 'participant-name';
      name.textContent = p.fullName + (p.age ? ('  ' + p.age + ' y/o') : '');

      const meta = document.createElement('div');
      meta.className = 'participant-meta';
      meta.innerHTML = `
        <div>Email: ${escapeHtml(p.email||'')}</div>
        <div>Contact: ${escapeHtml(p.contact||'')}</div>
        <div>Gender: ${escapeHtml(p.gender||'')}</div>
        <div>Event: ${escapeHtml(p.event||'')}</div>
        <div>Batch: ${escapeHtml(p.batchName? p.batch + ' - ' + p.batchName : p.batch||'')}</div>
        <div>Address: ${escapeHtml(p.address||'')}</div>
        <div class="registered">Registered: ${formatDate(p.createdAt)}</div>
      `;

      info.appendChild(name);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'participant-actions';
      const del = document.createElement('button');
      del.className = 'btn-delete';
      del.textContent = 'Delete';
      del.addEventListener('click', ()=>{ if(confirm('Delete this participant?')) removeParticipant(p.id); });
      actions.appendChild(del);

      card.appendChild(info);
      card.appendChild(actions);

      if(p.photoData){
        const img = document.createElement('img');
        img.className = 'participant-photo';
        img.src = p.photoData;
        card.appendChild(img);
      }

      participantsListEl.appendChild(card);
    });

    totalCountEl.textContent = participants.length;
    maleCountEl.textContent = male;
    femaleCountEl.textContent = female;
  }

  function escapeHtml(str){
    return (str||'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function removeParticipant(id){
    participants = participants.filter(p=>p.id!==id);
    saveParticipants();
    renderParticipants(searchEl.value);
  }

  function addParticipantFromForm(data){
    const id = Date.now().toString();
    const p = Object.assign({}, data, {id, createdAt: Date.now()});
    participants.unshift(p);
    saveParticipants();
    renderParticipants(searchEl.value);
  }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    const data = {
      fullName: document.getElementById('fullName').value.trim(),
      age: document.getElementById('age').value.trim(),
      gender: document.getElementById('gender').value,
      email: document.getElementById('email').value.trim(),
      contact: document.getElementById('contact').value.trim(),
      address: document.getElementById('address').value.trim(),
      batch: document.getElementById('batch').value.trim(),
      batchName: document.getElementById('batchName').value.trim(),
      event: document.getElementById('event').value.trim()
    };

    const fileInput = document.getElementById('photo');
    const file = fileInput.files && fileInput.files[0];

    if(file){
      const reader = new FileReader();
      reader.onload = function(evt){
        data.photoData = evt.target.result;
        addParticipantFromForm(data);
        form.reset();
      };
      reader.readAsDataURL(file);
    }else{
      addParticipantFromForm(data);
      form.reset();
    }
  });

  searchEl.addEventListener('input', function(){
    renderParticipants(this.value);
  });

  // initial render
  renderParticipants();

})();
