// script.js - public registration form and admin participant list
(function(){
  const SUPABASE_URL = 'https://mwtnmxndiztohyrsazuu.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_XlQscf-zNEDHg1ekBaYLRg_VIVCeCBN';
  const TABLE_NAME = 'participants';

  const form = document.getElementById('regForm');
  const formStatusEl = document.getElementById('formStatus');
  const doneRegisteredEl = document.getElementById('doneRegistered');
  const registerAnotherEl = document.getElementById('registerAnother');
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
    const row = {
      full_name: data.fullName,
      age: data.age ? Number(data.age) : null,
      gender: data.gender,
      email: data.email,
      contact: data.contact,
      address: data.address,
      batch: data.batch,
      batch_name: data.batchName || '',
      event: data.event
    };

    if(Object.prototype.hasOwnProperty.call(data, 'photoData')){
      row.photo_data = data.photoData || null;
    }

    return row;
  }

  function escapeHtml(str){
    return String(str||'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function showFormStatus(message, type){
    if(!formStatusEl) return;
    formStatusEl.textContent = message;
    formStatusEl.className = 'status-message ' + (type || '');
  }

  function showDoneRegistered(){
    if(!form || !doneRegisteredEl) return;
    form.hidden = true;
    doneRegisteredEl.hidden = false;
    showFormStatus('', '');
  }

  function showRegistrationForm(){
    if(!form || !doneRegisteredEl) return;
    doneRegisteredEl.hidden = true;
    form.hidden = false;
    showFormStatus('', '');
    const firstInput = document.getElementById('fullName');
    if(firstInput) firstInput.focus();
  }

  function showListMessage(message){
    if(!participantsListEl) return;
    participantsListEl.innerHTML = '<p class="empty-message">' + escapeHtml(message) + '</p>';
  }

  async function loadParticipants(){
    if(!participantsListEl) return;

    if(!db){
      showListMessage('Add your Supabase URL and publishable key in script.js first.');
      return;
    }

    const { data, error } = await db
      .from(TABLE_NAME)
      .select('*')
      .order('created_at', { ascending: false });

    if(error){
      console.error(error);
      showListMessage('Unable to load participants from Supabase: ' + (error.message || 'Unknown error'));
      return;
    }

    participants = data.map(toAppParticipant);
    renderParticipants(searchEl ? searchEl.value : '');
  }

  function renderParticipants(filter){
    if(!participantsListEl) return;

    const term = (filter||'').toLowerCase().trim();
    participantsListEl.innerHTML = '';

    let male = 0, female = 0;

    const filtered = participants.filter(p=>{
      if(!term) return true;
      return (p.fullName||'').toLowerCase().includes(term)
        || (p.event||'').toLowerCase().includes(term)
        || (p.batch||'').toLowerCase().includes(term)
        || (p.email||'').toLowerCase().includes(term)
        || (p.contact||'').toLowerCase().includes(term);
    });

    if(filtered.length === 0){
      showListMessage(term ? 'No matching participants found.' : 'No participants registered yet.');
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
      const edit = document.createElement('button');
      edit.className = 'btn-edit';
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', ()=>showEditForm(p));
      const del = document.createElement('button');
      del.className = 'btn-delete';
      del.type = 'button';
      del.textContent = 'Delete';
      del.addEventListener('click', ()=>{ if(confirm('Delete this participant?')) removeParticipant(p.id); });
      actions.appendChild(edit);
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

    if(totalCountEl) totalCountEl.textContent = participants.length;
    if(maleCountEl) maleCountEl.textContent = male;
    if(femaleCountEl) femaleCountEl.textContent = female;
  }

  function showEditForm(participant){
    if(!participantsListEl) return;

    participantsListEl.innerHTML = `
      <form id="editParticipantForm" class="edit-form">
        <h3>Edit Participant</h3>
        <label>Full Name *
          <input type="text" id="editFullName" required value="${escapeHtml(participant.fullName||'')}" />
        </label>
        <div class="row">
          <label>Age *
            <input type="number" id="editAge" required value="${escapeHtml(participant.age||'')}" />
          </label>
          <label>Gender *
            <select id="editGender" required>
              <option value="">Select gender</option>
              <option value="male"${participant.gender === 'male' ? ' selected' : ''}>Male</option>
              <option value="female"${participant.gender === 'female' ? ' selected' : ''}>Female</option>
              <option value="other"${participant.gender === 'other' ? ' selected' : ''}>Other</option>
            </select>
          </label>
        </div>
        <label>Email *
          <input type="email" id="editEmail" required value="${escapeHtml(participant.email||'')}" />
        </label>
        <label>Contact Number *
          <input type="tel" id="editContact" required value="${escapeHtml(participant.contact||'')}" autocomplete="tel" />
        </label>
        <label>Address *
          <textarea id="editAddress" required>${escapeHtml(participant.address||'')}</textarea>
        </label>
        <div class="row">
          <label>Batch *
            <input type="text" id="editBatch" required value="${escapeHtml(participant.batch||'')}" />
          </label>
          <label>Batch Name
            <input type="text" id="editBatchName" value="${escapeHtml(participant.batchName||'')}" />
          </label>
        </div>
        <label>Event *
          <input type="text" id="editEvent" required value="${escapeHtml(participant.event||'')}" />
        </label>
        <div class="edit-actions">
          <button type="submit" class="btn-primary">Save Changes</button>
          <button type="button" id="cancelEdit" class="btn-secondary">Cancel</button>
        </div>
      </form>
    `;

    const editForm = document.getElementById('editParticipantForm');
    const cancelEdit = document.getElementById('cancelEdit');

    cancelEdit.addEventListener('click', ()=>{
      renderParticipants(searchEl ? searchEl.value : '');
    });

    editForm.addEventListener('submit', function(e){
      e.preventDefault();
      updateParticipant(participant.id, {
        fullName: document.getElementById('editFullName').value.trim(),
        age: document.getElementById('editAge').value.trim(),
        gender: document.getElementById('editGender').value,
        email: document.getElementById('editEmail').value.trim(),
        contact: document.getElementById('editContact').value.trim(),
        address: document.getElementById('editAddress').value.trim(),
        batch: document.getElementById('editBatch').value.trim(),
        batchName: document.getElementById('editBatchName').value.trim(),
        event: document.getElementById('editEvent').value.trim()
      });
    });
  }

  async function updateParticipant(id, data){
    if(!db) return;

    const editForm = document.getElementById('editParticipantForm');
    const submitButton = editForm ? editForm.querySelector('button[type="submit"]') : null;

    if(submitButton){
      submitButton.disabled = true;
      submitButton.textContent = 'Saving...';
    }

    const { error } = await db
      .from(TABLE_NAME)
      .update(toDbParticipant(data))
      .eq('id', id);

    if(error){
      console.error(error);
      alert('Unable to update participant: ' + (error.message || 'Unknown error'));
      if(submitButton){
        submitButton.disabled = false;
        submitButton.textContent = 'Save Changes';
      }
      return;
    }

    participants = participants.map(p=>p.id === id ? { ...p, ...data } : p);
    renderParticipants(searchEl ? searchEl.value : '');
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
    renderParticipants(searchEl ? searchEl.value : '');
  }

  async function addParticipantFromForm(data){
    if(!db){
      showFormStatus('Unable to connect to registration database.', 'error');
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';
    showFormStatus('', '');

    const { error } = await db
      .from(TABLE_NAME)
      .insert(toDbParticipant(data));

    submitButton.disabled = false;
    submitButton.textContent = 'Register Participant';

    if(error){
      console.error(error);
      showFormStatus('Unable to save registration: ' + (error.message || 'Unknown error'), 'error');
      return;
    }

    form.reset();
    showDoneRegistered();
  }

  function setupForm(){
    if(!form) return;

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
  }

  function subscribeToRealtime(){
    if(!db || !participantsListEl) return;

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

  setupForm();

  if(searchEl){
    searchEl.addEventListener('input', function(){
      renderParticipants(this.value);
    });
  }

  if(registerAnotherEl){
    registerAnotherEl.addEventListener('click', showRegistrationForm);
  }

  loadParticipants();
  subscribeToRealtime();
})();
