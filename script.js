// script.js - manage participants with Supabase shared storage
(function(){
  const SUPABASE_URL = 'https://mwtnmxndiztohyrsazuu.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_XlQscf-zNEDHg1ekBaYLRg_VIVCeCBN';
  const TABLE_NAME = 'participants';

  const form = document.getElementById('regForm');
  const participantsListEl = document.getElementById('participantsList');
  const totalCountEl = document.getElementById('totalCount');
  const maleCountEl = document.getElementById('maleCount');
  const femaleCountEl = document.getElementById('femaleCount');
  const searchEl = document.getElementById('search');

  const isConfigured = !SUPABASE_URL.includes('PASTE_') && !SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
  const db = isConfigured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;

  let participants = [];

  function formatDate(value){
    const d = new Date(value);
    return d.toLocaleString();
  }

  function toAppParticipant(row){
    return {
      id: row.id,
      fullName: row.full_name,
      age: row.age,
      gender: row.gender,
      email: row.email,
      contact: row.contact,
      address: row.address,
      batch: row.batch,
      batchName: row.batch_name,
      event: row.event,
      photoData: row.photo_data,
      createdAt: row.created_at
    };
  }

  function toDbParticipant(data){
    return {
      full_name: data.fullName,
      age: data.age ? Number(data.age) : null,
      gender: data.gender,
      email: data.email,
      contact: data.contact,
      address: data.address,
      batch: data.batch,
      batch_name: data.batchName,
      event: data.event,
      photo_data: data.photoData || null
    };
  }

  async function loadParticipants(){
    if(!db){
      showMessage('Add your Supabase URL and anon key in script.js first.');
      return;
    }

    const { data, error } = await db
      .from(TABLE_NAME)
      .select('*')
      .order('created_at', { ascending: false });

    if(error){
      console.error(error);
      showMessage('Unable to load participants from Supabase: ' + (error.message || 'Unknown error'));
      return;
    }

    participants = data.map(toAppParticipant);
    renderParticipants(searchEl.value);
  }

  function showMessage(message){
    participantsListEl.innerHTML = '<p class="empty-message">' + escapeHtml(message) + '</p>';
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

    if(filtered.length === 0){
      showMessage(term ? 'No matching participants found.' : 'No participants registered yet.');
    }

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
    return String(str||'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  async function removeParticipant(id){
    if(!db) return;

    const { error } = await db
      .from(TABLE_NAME)
      .delete()
      .eq('id', id);

    if(error){
      console.error(error);
      alert('Unable to delete participant: ' + (error.message || 'Unknown error'));
      return;
    }

    participants = participants.filter(p=>p.id!==id);
    renderParticipants(searchEl.value);
  }

  async function addParticipantFromForm(data){
    if(!db){
      alert('Add your Supabase URL and anon key in script.js first.');
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';

    const { error } = await db
      .from(TABLE_NAME)
      .insert(toDbParticipant(data));

    submitButton.disabled = false;
    submitButton.textContent = 'Register Participant';

    if(error){
      console.error(error);
      alert('Unable to save participant: ' + (error.message || 'Unknown error'));
      return;
    }

    form.reset();
    loadParticipants();
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
      };
      reader.readAsDataURL(file);
    }else{
      addParticipantFromForm(data);
    }
  });

  searchEl.addEventListener('input', function(){
    renderParticipants(this.value);
  });

  function subscribeToRealtime(){
    if(!db) return;

    db.channel('participants-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE_NAME },
        function(){
          loadParticipants();
        }
      )
      .subscribe(function(status){
        if(status === 'CHANNEL_ERROR'){
          console.error('Supabase realtime channel error');
        }
      });
  }

  loadParticipants();
  subscribeToRealtime();
})();
