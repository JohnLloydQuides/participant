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
  const LOCAL_ADMIN_EDITS_KEY = 'registration_form_admin_edits';

  let participants = [];
  const photoCache = new Map();
  const photoLoadQueue = [];
  const MAX_PHOTO_LOADS = 2;
  let activePhotoLoads = 0;
  let photoLoadVersion = 0;
  let photoTimeoutLogged = false;
  const PARTICIPANT_LIST_COLUMNS = [
    'id',
    'full_name',
    'age',
    'gender',
    'email',
    'contact',
    'address',
    'batch',
    'batch_name',
    'event',
    'created_at'
  ].join(',');
  const PARTICIPANT_LIST_LIMIT = 100;

  function formatDate(value){
    const d = new Date(value);
    return d.toLocaleString();
  }

  function normalizePhotoData(photoData){
    if(!photoData) return '';
    let src = String(photoData).trim();
    if(!src) return '';

    if(src.startsWith('data:')){
      const commaIndex = src.indexOf(',');
      if(commaIndex < 0) return src;
      const prefix = src.slice(0, commaIndex + 1);
      const payload = src.slice(commaIndex + 1).replace(/\s+/g, '');
      return prefix + payload;
    }

    if(/^https?:\/\//i.test(src) || src.startsWith('/')){
      return src;
    }

    const cleaned = src.replace(/\s+/g, '');
    if(!/^[A-Za-z0-9+/=]+$/.test(cleaned)){
      return src;
    }

    let mime = 'image/jpeg';
    if(cleaned.startsWith('iVBORw0KGgo')){
      mime = 'image/png';
    } else if(cleaned.startsWith('R0lGOD')){
      mime = 'image/gif';
    } else if(cleaned.startsWith('UklGR') || cleaned.startsWith('RIFF')){
      mime = 'image/webp';
    }

    return `data:${mime};base64,${cleaned}`;
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

  function getParticipantEditKey(participant){
    if(participant && participant.id) return 'id:' + participant.id;
    return 'contact:' + String(participant && participant.email || '').toLowerCase() + ':' + String(participant && participant.contact || '');
  }

  function readLocalAdminEdits(){
    try{
      return JSON.parse(localStorage.getItem(LOCAL_ADMIN_EDITS_KEY) || '{}');
    }catch(err){
      return {};
    }
  }

  function writeLocalAdminEdits(edits){
    localStorage.setItem(LOCAL_ADMIN_EDITS_KEY, JSON.stringify(edits));
  }

  function saveLocalAdminEdit(participantId, data){
    const participant = participants.find(function(item){
      return item.id === participantId || (item.email === data.email && item.contact === data.contact);
    }) || { id: participantId, email: data.email, contact: data.contact };
    const edits = readLocalAdminEdits();
    edits[getParticipantEditKey(participant)] = {
      ...data,
      id: participant.id,
      age: data.age ? Number(data.age) : null,
      updatedAt: new Date().toISOString()
    };
    writeLocalAdminEdits(edits);
  }

  function applyLocalAdminEdits(list){
    const edits = readLocalAdminEdits();
    return list.map(function(participant){
      const saved = edits[getParticipantEditKey(participant)];
      if(!saved) return participant;
      return {
        ...participant,
        ...saved,
        id: participant.id,
        createdAt: participant.createdAt,
        photoData: participant.photoData
      };
    });
  }

  function createParticipantPhotoSlot(){
    const slot = document.createElement('div');
    slot.className = 'participant-photo participant-photo-placeholder';
    slot.textContent = 'Loading photo';
    return slot;
  }

  function showParticipantPhoto(slot, photoData, fullName){
    if(!slot) return;

    slot.textContent = '';

    if(!photoData){
      slot.className = 'participant-photo participant-photo-placeholder';
      slot.textContent = 'No photo';
      return;
    }

    const img = document.createElement('img');
    slot.className = 'participant-photo participant-photo-frame';
    img.src = normalizePhotoData(photoData);
    img.alt = fullName ? fullName + ' 2x2 photo' : 'Participant 2x2 photo';
    img.loading = 'lazy';
    img.onerror = function(){
      slot.className = 'participant-photo participant-photo-placeholder';
      slot.textContent = 'Invalid photo';
    };
    slot.appendChild(img);
  }

  function isStatementTimeout(error){
    return Boolean(
      error
      && (error.code === '57014' || /statement timeout/i.test(error.message || ''))
    );
  }

  function queueParticipantPhoto(participant, slot, version){
    photoLoadQueue.push({ participant, slot, version });
    processPhotoLoadQueue();
  }

  function processPhotoLoadQueue(){
    while(activePhotoLoads < MAX_PHOTO_LOADS && photoLoadQueue.length > 0){
      const job = photoLoadQueue.shift();
      if(job.version !== photoLoadVersion) continue;
      activePhotoLoads++;
      loadParticipantPhoto(job.participant, job.slot, job.version)
        .finally(function(){
          activePhotoLoads--;
          processPhotoLoadQueue();
        });
    }
  }

  async function loadParticipantPhoto(participant, slot, version){
    if(!db || !participant || !participant.id) return;

    if(participant.photoData){
      if(version !== photoLoadVersion) return;
      showParticipantPhoto(slot, participant.photoData, participant.fullName);
      return;
    }

    if(photoCache.has(participant.id)){
      if(version !== photoLoadVersion) return;
      showParticipantPhoto(slot, photoCache.get(participant.id), participant.fullName);
      return;
    }

    const { data, error } = await db
      .from(TABLE_NAME)
      .select('photo_data')
      .eq('id', participant.id)
      .maybeSingle();

    if(error){
      if(isStatementTimeout(error)){
        if(!photoTimeoutLogged){
          console.warn('Some participant photos timed out while loading. Showing placeholders to keep the admin list responsive.');
          photoTimeoutLogged = true;
        }
      }else{
        console.error('Unable to load participant photo:', error);
      }
      photoCache.set(participant.id, '');
      if(version !== photoLoadVersion) return;
      showParticipantPhoto(slot, '', participant.fullName);
      return;
    }

    const photoData = data && data.photo_data ? data.photo_data : '';
    photoCache.set(participant.id, photoData);
    if(version !== photoLoadVersion) return;
    showParticipantPhoto(slot, photoData, participant.fullName);
  }

  function needsLegacyEmergencyContactValue(error){
    return Boolean(
      error
      && /emergency_contact/i.test(error.message || '')
      && /null value|not-null|null/i.test(error.message || '')
    );
  }

  function withLegacyEmergencyContact(row){
    return { ...row, emergency_contact: '' };
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

  function showEditStatus(message, type){
    const status = document.getElementById('editStatus');
    if(!status) return;
    status.textContent = message;
    status.className = 'status-message ' + (type || '');
  }

  async function loadParticipants(){
    if(!participantsListEl) return;

    if(!db){
      showListMessage('Add your Supabase URL and publishable key in script.js first.');
      return;
    }

    const { data, error } = await db
      .from(TABLE_NAME)
      .select(PARTICIPANT_LIST_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(PARTICIPANT_LIST_LIMIT);

    if(error){
      console.error(error);
      showListMessage('Unable to load participants from Supabase: ' + (error.message || 'Unknown error'));
      return;
    }

    participants = applyLocalAdminEdits(data.map(toAppParticipant));
    renderParticipants(searchEl ? searchEl.value : '');
  }

  function renderParticipants(filter){
    if(!participantsListEl) return;

    const term = (filter||'').toLowerCase().trim();
    photoLoadVersion++;
    photoLoadQueue.length = 0;
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

      const photoSlot = createParticipantPhotoSlot();
      card.appendChild(photoSlot);
      participantsListEl.appendChild(card);
      queueParticipantPhoto(p, photoSlot, photoLoadVersion);
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
        <p id="editStatus" class="status-message" role="status"></p>
        <input type="hidden" id="editParticipantId" value="${escapeHtml(participant.id||'')}" />
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
        <label>Replace 2x2 Photo
          <input type="file" id="editPhoto" accept="image/*" />
        </label>
        <div class="edit-actions">
          <button type="submit" id="saveEdit" class="btn-primary">Save</button>
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
      const data = {
        fullName: document.getElementById('editFullName').value.trim(),
        age: document.getElementById('editAge').value.trim(),
        gender: document.getElementById('editGender').value,
        email: document.getElementById('editEmail').value.trim(),
        contact: document.getElementById('editContact').value.trim(),
        address: document.getElementById('editAddress').value.trim(),
        batch: document.getElementById('editBatch').value.trim(),
        batchName: document.getElementById('editBatchName').value.trim(),
        event: document.getElementById('editEvent').value.trim()
      };

      const fileInput = document.getElementById('editPhoto');
      const file = fileInput.files && fileInput.files[0];

      if(file){
        const reader = new FileReader();
        reader.onload = function(evt){
          data.photoData = evt.target.result;
          updateParticipant(participant.id, data);
        };
        reader.readAsDataURL(file);
      }else{
        updateParticipant(participant.id, data);
      }
    });
  }

  async function updateParticipant(id, data){
    const editForm = document.getElementById('editParticipantForm');
    const submitButton = editForm ? editForm.querySelector('button[type="submit"]') : null;
    const hiddenId = document.getElementById('editParticipantId');
    const participantId = id || (hiddenId ? hiddenId.value : '');

    if(!db){
      saveLocalAdminEdit(participantId, data);
      participants = applyLocalAdminEdits(participants);
      renderParticipants(searchEl ? searchEl.value : '');
      return;
    }

    if(!participantId){
      saveLocalAdminEdit(participantId, data);
      participants = applyLocalAdminEdits(participants);
      renderParticipants(searchEl ? searchEl.value : '');
      return;
    }

    if(submitButton){
      submitButton.disabled = true;
      submitButton.textContent = 'Saving...';
    }
    showEditStatus('Saving changes...', 'success');

    const row = toDbParticipant(data);
    let { data: updatedParticipant, error } = await db
      .from(TABLE_NAME)
      .update(row)
      .eq('id', participantId)
      .select(PARTICIPANT_LIST_COLUMNS)
      .maybeSingle();

    if(needsLegacyEmergencyContactValue(error)){
      const fallback = await db
        .from(TABLE_NAME)
        .update(withLegacyEmergencyContact(row))
        .eq('id', participantId)
        .select(PARTICIPANT_LIST_COLUMNS)
        .maybeSingle();
      updatedParticipant = fallback.data;
      error = fallback.error;
    }

    if(error){
      console.error(error);
      saveLocalAdminEdit(participantId, data);
      participants = applyLocalAdminEdits(participants);
      renderParticipants(searchEl ? searchEl.value : '');
      return;
    }

    if(!updatedParticipant){
      const fallback = await db
        .from(TABLE_NAME)
        .update(row)
        .eq('email', data.email)
        .eq('contact', data.contact)
        .select(PARTICIPANT_LIST_COLUMNS)
        .maybeSingle();

      if(fallback.error){
        console.error(fallback.error);
        saveLocalAdminEdit(participantId, data);
        participants = applyLocalAdminEdits(participants);
        renderParticipants(searchEl ? searchEl.value : '');
        return;
      }

      updatedParticipant = fallback.data;

      if(!updatedParticipant){
        saveLocalAdminEdit(participantId, data);
        participants = applyLocalAdminEdits(participants);
        renderParticipants(searchEl ? searchEl.value : '');
        return;
      }
    }

    if(Object.prototype.hasOwnProperty.call(data, 'photoData')){
      photoCache.set(id, data.photoData || '');
    }

    saveLocalAdminEdit(participantId, data);
    const savedParticipant = toAppParticipant(updatedParticipant);
    participants = participants.map(function(participant){
      return participant.id === participantId ? savedParticipant : participant;
    });
    showEditStatus('Saved.', 'success');
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

    const row = toDbParticipant(data);
    let { error } = await db
      .from(TABLE_NAME)
      .insert(row);

    if(needsLegacyEmergencyContactValue(error)){
      const fallback = await db
        .from(TABLE_NAME)
        .insert(withLegacyEmergencyContact(row));
      error = fallback.error;
    }

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

      if(!file){
        showFormStatus('Please upload a 2x2 photo before registering.', 'error');
        fileInput.focus();
        return;
      }

      const reader = new FileReader();
      reader.onload = function(evt){
        data.photoData = evt.target.result;
        addParticipantFromForm(data);
      };
      reader.readAsDataURL(file);
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
