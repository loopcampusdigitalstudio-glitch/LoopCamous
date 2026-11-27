const API_BASE = 'https://loopcamous.onrender.com';

let isAuthenticated = false;
let unsavedChanges = false;

const screenLogin = document.getElementById('screen-login');
const screenDashboard = document.getElementById('screen-dashboard');
const formLogin = document.getElementById('form-login');
const loginError = document.getElementById('login-error');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const btnPreview = document.getElementById('btn-preview');

async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const config = { ...options, headers, credentials: 'include' };

  const res = await fetch(url, config);

  if (res.status === 401) {
    isAuthenticated = false;
    showScreen('login');
    throw new Error('Authentication required — please sign in again.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function checkAuth() {
  try {
    const data = await api('/api/admin/me');
    isAuthenticated = true;
    return data;
  } catch {
    isAuthenticated = false;
    return null;
  }
}

async function login(username, password) {
  const data = await api('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: username, password }),
  });
  isAuthenticated = true;
  return data;
}

async function logout() {
  try {
    await api('/api/admin/logout', { method: 'POST' });
  } finally {
    isAuthenticated = false;
    showScreen('login');
    unsavedChanges = false;
  }
}

function showScreen(name) {
  screenLogin.classList.toggle('hidden', name !== 'login');
  screenDashboard.classList.toggle('hidden', name !== 'dashboard');
}

const navItems = document.querySelectorAll('.nav-item');
const tabPanels = document.querySelectorAll('.tab-panel');

function showTab(tabId) {
  navItems.forEach((item) => item.classList.toggle('active', item.dataset.tab === tabId));
  tabPanels.forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${tabId}`));
  if (tabId === 'services') loadServices();
  if (tabId === 'packs') loadPacks();
  if (tabId === 'team') loadTeam();
  if (tabId === 'publish') loadPublishStatus();
}

navItems.forEach((item) => item.addEventListener('click', () => showTab(item.dataset.tab)));

function markUnsaved() { unsavedChanges = true; }
window.addEventListener('beforeunload', (e) => {
  if (unsavedChanges) { e.preventDefault(); e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'; }
});
function clearUnsaved() { unsavedChanges = false; }

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  btnLogin.disabled = true;
  btnLogin.textContent = 'Signing in...';
  loginError.textContent = '';

  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    await login(username, password);
    showScreen('dashboard');
    await loadHomeForm();
    loadImageForm();
    loadContactForm();
    loadPublishStatus();
    clearUnsaved();
  } catch (err) {
    loginError.textContent = err.message || 'Login failed. Please try again.';
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = 'Sign in';
  }
});

btnLogout.addEventListener('click', logout);
btnPreview.addEventListener('click', () => window.open('../index.html', '_blank'));

/* ---------- Home Tab ---------- */
const homeFields = ['hero_title', 'hero_sub', 'problem_title', 'problem_intro', 'services_title', 'services_intro', 'steps_title', 'steps_intro', 'packs_title', 'packs_intro', 'team_title', 'team_intro', 'contact_title', 'contact_intro', 'footer_name', 'footer_note', 'footer_year'];
const jsonArrayFields = ['problem_items', 'steps_items'];

async function loadHomeForm() {
  try {
    const settings = await api('/api/admin/settings');
    homeFields.forEach((key) => {
      const el = document.getElementById(`h-${key}`);
      if (el && settings[key] !== undefined) el.value = settings[key];
    });
    jsonArrayFields.forEach((key) => {
      const el = document.getElementById(`h-${key}`);
      if (el && settings[key]) {
        try { el.value = JSON.stringify(JSON.parse(settings[key]), null, 2); } catch (e) { el.value = settings[key]; }
      }
    });
  } catch (err) {
    showMsg('msg-home', 'Failed to load settings', 'error');
  }
}

document.getElementById('form-home').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const payload = {};
  homeFields.forEach((key) => {
    const el = document.getElementById(`h-${key}`);
    if (el) payload[key] = el.value;
  });
  jsonArrayFields.forEach((key) => {
    const el = document.getElementById(`h-${key}`);
    if (el) {
      try { payload[key] = JSON.parse(el.value || '[]'); } catch (err) { payload[key] = []; }
    }
  });

  try {
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
    showMsg('msg-home', 'All text saved.', 'success');
    clearUnsaved();
  } catch (err) {
    showMsg('msg-home', err.data?.error || 'Save failed.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save all text';
  }
});

/* ---------- Images Tab ---------- */
const imageFields = ['logo_url', 'hero_image_url'];

async function loadImageForm() {
  try {
    const settings = await api('/api/admin/settings');
    updateLogoPreview(settings.logo_url);
    updateHeroPreview(settings.hero_image_url);
  } catch (err) {
    showMsg('msg-images', 'Failed to load images', 'error');
  }
}

function updateLogoPreview(url) {
  const img = document.getElementById('logo-preview-img');
  if (img) img.src = url || '../assets/logo.svg';
}

function updateHeroPreview(url) {
  const img = document.getElementById('hero-preview-img');
  if (img) img.src = url || '../assets/hero-illustration.svg';
}

async function uploadImage(fileInputId, previewImgId, settingsKey) {
  const fileInput = document.getElementById(fileInputId);
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch(`${API_BASE}/api/admin/upload-image`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await res.json();
    if (res.ok && data.imageUrl) {
      document.getElementById(previewImgId).src = data.imageUrl;
      document.getElementById(`s-${settingsKey}`).value = data.imageUrl;
      showMsg('msg-images', 'Image uploaded.', 'success');
      markUnsaved();
    } else {
      showMsg('msg-images', 'Upload failed. Please try again.', 'error');
    }
  } catch (err) {
    showMsg('msg-images', 'Upload error. Please try again.', 'error');
  }
}

async function saveImages() {
  const btn = document.querySelector('#form-images .btn-save');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const logoFile = document.getElementById('logo-file').files[0];
    if (logoFile) await uploadImage('logo-file', 'logo-preview-img', 'logo_url');

    const heroFile = document.getElementById('hero-file').files[0];
    if (heroFile) await uploadImage('hero-file', 'hero-preview-img', 'hero_image_url');

    const payload = {};
    imageFields.forEach((key) => {
      const el = document.getElementById(`s-${key}`);
      if (el && el.value) payload[key] = el.value;
    });
    if (Object.keys(payload).length > 0) {
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
    }

    showMsg('msg-images', 'Images saved.', 'success');
    clearUnsaved();
  } catch (err) {
    showMsg('msg-images', err.data?.error || 'Save failed.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save images';
  }
}

document.getElementById('logo-file')?.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) document.getElementById('logo-preview-img').src = URL.createObjectURL(f);
});
document.getElementById('hero-file')?.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) document.getElementById('hero-preview-img').src = URL.createObjectURL(f);
});
document.getElementById('nm-file')?.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) document.getElementById('nm-preview').querySelector('img').src = URL.createObjectURL(f);
});

/* ---------- Services Tab ---------- */
async function loadServices() {
  try {
    const services = await api('/api/admin/services');
    renderServiceList(services);
  } catch (err) {
    showMsg('msg-services', 'Failed to load services', 'error');
  }
}

function renderServiceList(services) {
  const list = document.getElementById('service-list');
  if (!services || services.length === 0) {
    list.innerHTML = '<p style="color:var(--color-text-muted);">No services yet.</p>';
    return;
  }
  list.innerHTML = services.map((s) => `
    <div class="admin-item" data-id="${s.id}">
      <div style="display:flex;flex-direction:column;gap:0.4rem;">
        <input type="text" value="${escapeHtml(s.title)}" data-field="title" placeholder="Service name" />
        <input type="text" value="${escapeHtml(s.tag || '')}" data-field="tag" placeholder="Category tag" />
        <input type="text" value="${escapeHtml(s.description || '')}" data-field="description" placeholder="Description" />
        <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.3rem;">
          <label style="display:flex;align-items:center;gap:0.5rem;margin:0;cursor:pointer;">
            <input type="checkbox" data-field="published" ${s.published ? 'checked' : ''} />
            <span style="font-size:0.9rem;">Show on website</span>
          </label>
          <button type="button" class="btn-move btn-move-up" onclick="moveService(${s.id}, -1)" title="Move up">↑</button>
          <button type="button" class="btn-move btn-move-down" onclick="moveService(${s.id}, 1)" title="Move down">↓</button>
        </div>
      </div>
      <button class="btn-delete" onclick="deleteService(${s.id})">Delete</button>
    </div>
  `).join('');

  list.querySelectorAll('.admin-item').forEach((item) => {
    const id = item.dataset.id;
    item.querySelectorAll('input').forEach((input) => {
      if (input.type === 'file') return;
      input.addEventListener('change', () => {
        const field = input.dataset.field;
        let value = input.type === 'checkbox' ? input.checked : input.value;
        updateService(id, field, value);
        markUnsaved();
      });
    });
  });
}

window.updateService = async (id, field, value) => {
  try {
    await api(`/api/admin/services/${id}`, { method: 'PUT', body: JSON.stringify({ [field]: value }) });
    showMsg('msg-services', 'Service updated.', 'success');
  } catch (err) {
    showMsg('msg-services', err.data?.error || 'Update failed.', 'error');
  }
};

window.deleteService = async (id) => {
  if (!confirm('Delete this service?')) return;
  try {
    await api(`/api/admin/services/${id}`, { method: 'DELETE' });
    loadServices();
    showMsg('msg-services', 'Service deleted.', 'success');
  } catch (err) {
    showMsg('msg-services', err.data?.error || 'Delete failed.', 'error');
  }
};

window.moveService = async (id, direction) => {
  try {
    await api(`/api/admin/services/${id}/move`, { method: 'POST', body: JSON.stringify({ direction }) });
    loadServices();
    showMsg('msg-services', 'Service order updated.', 'success');
  } catch (err) {
    showMsg('msg-services', err.data?.error || 'Reorder failed.', 'error');
  }
};

document.getElementById('form-new-service').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Adding...';
  try {
    await api('/api/admin/services', {
      method: 'POST',
      body: JSON.stringify({
        title: document.getElementById('ns-title').value,
        tag: document.getElementById('ns-tag').value,
        description: document.getElementById('ns-desc').value,
        published: true,
      }),
    });
    document.getElementById('ns-title').value = '';
    document.getElementById('ns-tag').value = '';
    document.getElementById('ns-desc').value = '';
    loadServices();
    showMsg('msg-services', 'Service added.', 'success');
  } catch (err) {
    showMsg('msg-services', err.data?.error || 'Add failed.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add service';
  }
});

/* ---------- Packs Tab ---------- */
async function loadPacks() {
  try {
    const packs = await api('/api/admin/packs');
    renderPackList(packs);
  } catch (err) {
    showMsg('msg-packs', 'Failed to load packs', 'error');
  }
}

function renderPackList(packs) {
  const list = document.getElementById('pack-list');
  if (!packs || packs.length === 0) {
    list.innerHTML = '<p style="color:var(--color-text-muted);">No packs yet.</p>';
    return;
  }
  list.innerHTML = packs.map((p) => `
    <div class="admin-item" data-id="${p.id}">
      <div style="display:flex;flex-direction:column;gap:0.4rem;">
        <input type="text" value="${escapeHtml(p.name)}" data-field="name" placeholder="Pack name" />
        <input type="text" value="${escapeHtml(p.price || '')}" data-field="price" placeholder="Price (₹)" />
        <input type="text" value="${escapeHtml(p.badge || '')}" data-field="badge" placeholder="Badge" />
        <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.3rem;">
          <label style="display:flex;align-items:center;gap:0.5rem;margin:0;cursor:pointer;">
            <input type="checkbox" data-field="published" ${p.published ? 'checked' : ''} />
            <span style="font-size:0.9rem;">Show on website</span>
          </label>
          <label style="display:flex;align-items:center;gap:0.5rem;margin:0;cursor:pointer;">
            <input type="checkbox" data-field="is_featured" ${p.is_featured ? 'checked' : ''} />
            <span style="font-size:0.9rem;">Featured</span>
          </label>
          <button type="button" class="btn-move btn-move-up" onclick="movePack(${p.id}, -1)" title="Move up">↑</button>
          <button type="button" class="btn-move btn-move-down" onclick="movePack(${p.id}, 1)" title="Move down">↓</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:0.4rem;flex:1;">
        <strong style="font-size:0.85rem;color:var(--color-text-muted);">Features</strong>
        <div class="feature-list" data-pack-id="${p.id}">
          ${(p.features || []).map((f) => `
            <div class="feature-row" style="display:flex;gap:0.4rem;align-items:center;margin-bottom:0.3rem;">
              <input type="text" value="${escapeHtml(f.feature || f)}" data-field="feature" data-feature-id="${f.id || ''}" data-pack-id="${p.id}" />
              <button class="btn-delete" style="padding:0.2rem 0.5rem;font-size:0.8rem;" onclick="deletePackFeature(${p.id}, '${f.id || ''}')">×</button>
            </div>
          `).join('')}
          <button type="button" class="btn-add" style="padding:0.4rem 0.8rem;font-size:0.85rem;" onclick="addPackFeature(${p.id})">+ Add feature</button>
        </div>
      </div>
      <button class="btn-delete" onclick="deletePack(${p.id})">Delete</button>
    </div>
  `).join('');

  list.querySelectorAll('.admin-item').forEach((item) => {
    const id = item.dataset.id;
    item.querySelectorAll('input').forEach((input) => input.addEventListener('change', () => {
      const field = input.dataset.field;
      if (field === 'feature') {
        updatePackFeature(input.dataset.packId, input.dataset.featureId, input.value);
        markUnsaved();
        return;
      }
      let value = input.type === 'checkbox' ? input.checked : input.value;
      updatePack(id, field, value);
      markUnsaved();
    }));
  });
}

window.updatePack = async (id, field, value) => {
  try {
    await api(`/api/admin/packs/${id}`, { method: 'PUT', body: JSON.stringify({ [field]: value }) });
    showMsg('msg-packs', 'Pack updated.', 'success');
  } catch (err) {
    showMsg('msg-packs', err.data?.error || 'Update failed.', 'error');
  }
};

window.updatePackFeature = async (packId, featureId, value) => {
  try {
    await api(`/api/admin/packs/${packId}/features/${featureId}`, { method: 'PUT', body: JSON.stringify({ feature: value }) });
    showMsg('msg-packs', 'Feature updated.', 'success');
  } catch (err) {
    showMsg('msg-packs', err.data?.error || 'Update failed.', 'error');
  }
};

window.addPackFeature = async (packId) => {
  try {
    await api(`/api/admin/packs/${packId}/features`, { method: 'POST', body: JSON.stringify({ feature: '', sort_order: 0 }) });
    loadPacks();
  } catch (err) {
    showMsg('msg-packs', err.data?.error || 'Add feature failed.', 'error');
  }
};

window.deletePackFeature = async (packId, featureId) => {
  if (!featureId) { loadPacks(); return; }
  if (!confirm('Delete this feature?')) return;
  try {
    await api(`/api/admin/packs/${packId}/features/${featureId}`, { method: 'DELETE' });
    loadPacks();
    showMsg('msg-packs', 'Feature deleted.', 'success');
  } catch (err) {
    showMsg('msg-packs', err.data?.error || 'Delete failed.', 'error');
  }
};

window.deletePack = async (id) => {
  if (!confirm('Delete this pack?')) return;
  try {
    await api(`/api/admin/packs/${id}`, { method: 'DELETE' });
    loadPacks();
    showMsg('msg-packs', 'Pack deleted.', 'success');
  } catch (err) {
    showMsg('msg-packs', err.data?.error || 'Delete failed.', 'error');
  }
};

window.movePack = async (id, direction) => {
  try {
    await api(`/api/admin/packs/${id}/move`, { method: 'POST', body: JSON.stringify({ direction }) });
    loadPacks();
    showMsg('msg-packs', 'Pack order updated.', 'success');
  } catch (err) {
    showMsg('msg-packs', err.data?.error || 'Reorder failed.', 'error');
  }
};

document.getElementById('form-new-pack').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Adding...';
  const featuresText = document.getElementById('np-features').value;
  const features = featuresText.split('\n').map((f) => f.trim()).filter((f) => f.length > 0);
  try {
    await api('/api/admin/packs', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('np-name').value,
        price: document.getElementById('np-price').value,
        badge: document.getElementById('np-badge').value,
        features,
        published: true,
      }),
    });
    document.getElementById('np-name').value = '';
    document.getElementById('np-price').value = '';
    document.getElementById('np-badge').value = '';
    document.getElementById('np-features').value = '';
    loadPacks();
    showMsg('msg-packs', 'Pack added.', 'success');
  } catch (err) {
    showMsg('msg-packs', err.data?.error || 'Add failed.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add pack';
  }
});

/* ---------- Team Tab ---------- */
async function loadTeam() {
  try {
    const team = await api('/api/admin/team');
    renderTeamList(team);
  } catch (err) {
    showMsg('msg-team', 'Failed to load team', 'error');
  }
}

function renderTeamList(team) {
  const list = document.getElementById('member-list');
  if (!team || team.length === 0) {
    list.innerHTML = '<p style="color:var(--color-text-muted);">No team members yet.</p>';
    return;
  }
  list.innerHTML = team.map((m) => `
    <div class="admin-item" data-id="${m.id}">
      <div style="display:flex;flex-direction:column;gap:0.4rem;">
        <input type="text" value="${escapeHtml(m.name)}" data-field="name" placeholder="Name" />
        <input type="text" value="${escapeHtml(m.role || '')}" data-field="role" placeholder="Role" />
        <input type="text" value="${escapeHtml(m.description || '')}" data-field="description" placeholder="Description" />
        <input type="file" id="tm-file-${m.id}" accept="image/*" onchange="uploadMemberImage(${m.id}, this)" />
        <input type="hidden" id="tm-url-${m.id}" value="${escapeHtml(m.image_url || '')}" />
      </div>
      <div class="image-preview" id="preview-${m.id}"><img src="${m.image_url || '../assets/team-placeholder.svg'}" alt="Preview" width="80" height="80" /></div>
      <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.3rem;">
        <label style="display:flex;align-items:center;gap:0.5rem;margin:0;cursor:pointer;">
          <input type="checkbox" data-field="published" ${m.published ? 'checked' : ''} />
          <span style="font-size:0.9rem;">Show on website</span>
        </label>
        <button type="button" class="btn-move btn-move-up" onclick="moveMember(${m.id}, -1)" title="Move up">↑</button>
        <button type="button" class="btn-move btn-move-down" onclick="moveMember(${m.id}, 1)" title="Move down">↓</button>
      </div>
      <button class="btn-delete" onclick="deleteMember(${m.id})">Delete</button>
    </div>
  `).join('');

  list.querySelectorAll('.admin-item').forEach((item) => {
    const id = item.dataset.id;
    item.querySelectorAll('input').forEach((input) => {
      if (input.type === 'file') return;
      input.addEventListener('change', () => {
        const field = input.dataset.field;
        let value = input.type === 'checkbox' ? input.checked : input.value;
        updateMember(id, field, value);
        markUnsaved();
      });
    });
  });
}

async function uploadMemberImage(memberId, fileInput) {
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch(`${API_BASE}/api/admin/upload-image`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await res.json();
    if (res.ok && data.imageUrl) {
      document.getElementById(`preview-${memberId}`).querySelector('img').src = data.imageUrl;
      document.getElementById(`tm-url-${memberId}`).value = data.imageUrl;
      await api(`/api/admin/team/${memberId}`, {
        method: 'PUT',
        body: JSON.stringify({ image_url: data.imageUrl }),
      });
      showMsg('msg-team', 'Photo uploaded.', 'success');
      markUnsaved();
    } else {
      showMsg('msg-team', 'Photo upload failed.', 'error');
    }
  } catch (err) {
    showMsg('msg-team', 'Photo upload error.', 'error');
  }
}

window.updateImagePreview = (id, url) => {
  const img = document.getElementById(`preview-${id}`).querySelector('img');
  if (img) img.src = url || '../assets/team-placeholder.svg';
};

window.updateMember = async (id, field, value) => {
  try {
    await api(`/api/admin/team/${id}`, { method: 'PUT', body: JSON.stringify({ [field]: value }) });
    showMsg('msg-team', 'Member updated.', 'success');
  } catch (err) {
    showMsg('msg-team', err.data?.error || 'Update failed.', 'error');
  }
};

window.deleteMember = async (id) => {
  if (!confirm('Delete this team member?')) return;
  try {
    await api(`/api/admin/team/${id}`, { method: 'DELETE' });
    loadTeam();
    showMsg('msg-team', 'Member deleted.', 'success');
  } catch (err) {
    showMsg('msg-team', err.data?.error || 'Delete failed.', 'error');
  }
};

window.moveMember = async (id, direction) => {
  try {
    await api(`/api/admin/team/${id}/move`, { method: 'POST', body: JSON.stringify({ direction }) });
    loadTeam();
    showMsg('msg-team', 'Member order updated.', 'success');
  } catch (err) {
    showMsg('msg-team', err.data?.error || 'Reorder failed.', 'error');
  }
};

document.getElementById('form-new-member').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Adding...';
  try {
    let imageUrl = '';
    const file = document.getElementById('nm-file').files[0];
    if (file) {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`${API_BASE}/api/admin/upload-image`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.imageUrl) {
        imageUrl = data.imageUrl;
      }
    }

    await api('/api/admin/team', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('nm-name').value,
        role: document.getElementById('nm-role').value,
        description: document.getElementById('nm-desc').value,
        image_url: imageUrl,
        published: true,
      }),
    });
    document.getElementById('nm-name').value = '';
    document.getElementById('nm-role').value = '';
    document.getElementById('nm-desc').value = '';
    document.getElementById('nm-file').value = '';
    loadTeam();
    showMsg('msg-team', 'Member added.', 'success');
  } catch (err) {
    showMsg('msg-team', err.data?.error || 'Add failed.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add member';
  }
});

/* ---------- Contact Tab ---------- */
const contactFields = ['whatsapp', 'contact_email', 'instagram'];

async function loadContactForm() {
  try {
    const settings = await api('/api/admin/settings');
    contactFields.forEach((key) => {
      const el = document.getElementById(`c-${key}`);
      if (el && settings[key] !== undefined) el.value = settings[key];
    });
  } catch (err) {
    showMsg('msg-contact', 'Failed to load contact details', 'error');
  }
}

document.getElementById('form-contact').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  const payload = {};
  contactFields.forEach((key) => {
    const el = document.getElementById(`c-${key}`);
    if (el) payload[key] = el.value;
  });
  try {
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
    showMsg('msg-contact', 'Contact details saved.', 'success');
    clearUnsaved();
  } catch (err) {
    showMsg('msg-contact', err.data?.error || 'Save failed.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save contact details';
  }
});

/* ---------- Publish Tab ---------- */
let lastPublishedAt = null;

async function loadPublishStatus() {
  try {
    const [services, packs, team] = await Promise.all([
      api('/api/admin/services'), api('/api/admin/packs'), api('/api/admin/team'),
    ]);
    const pending = services.filter((s) => !s.published).length +
      packs.filter((p) => !p.published).length +
      team.filter((t) => !t.published).length;
    document.getElementById('pending-count').textContent = pending;
    document.getElementById('last-published').textContent = lastPublishedAt || 'Never';
  } catch (err) {
    console.error('Publish status failed:', err);
  }
}

document.getElementById('btn-save-draft').addEventListener('click', async () => {
  try {
    await Promise.all([loadHomeForm(), loadServices(), loadPacks(), loadTeam(), loadImageForm(), loadContactForm()]);
    showMsg('msg-publish', 'All changes saved to draft.', 'success');
    clearUnsaved();
  } catch (err) {
    showMsg('msg-publish', 'Save failed.', 'error');
  }
});

document.getElementById('btn-publish').addEventListener('click', async () => {
  const btn = document.getElementById('btn-publish');
  btn.disabled = true;
  btn.textContent = 'Publishing...';
  try {
    const [services, packs, team] = await Promise.all([
      api('/api/admin/services'), api('/api/admin/packs'), api('/api/admin/team'),
    ]);
    const updates = [];
    services.filter((s) => !s.published).forEach((s) =>
      updates.push(api(`/api/admin/services/${s.id}`, { method: 'PUT', body: JSON.stringify({ published: true }) }))
    );
    packs.filter((p) => !p.published).forEach((p) =>
      updates.push(api(`/api/admin/packs/${p.id}`, { method: 'PUT', body: JSON.stringify({ published: true }) }))
    );
    team.filter((t) => !t.published).forEach((t) =>
      updates.push(api(`/api/admin/team/${t.id}`, { method: 'PUT', body: JSON.stringify({ published: true }) }))
    );
    await Promise.all(updates);
    lastPublishedAt = new Date().toLocaleDateString();
    await loadPublishStatus();
    showMsg('msg-publish', 'Published to loopcampus.online!', 'success');
    clearUnsaved();
  } catch (err) {
    showMsg('msg-publish', err.data?.error || 'Publish failed.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publish now';
  }
});

function showMsg(id, text, type = 'success') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `msg ${type === 'error' ? 'error' : 'success'}`;
  setTimeout(() => { el.textContent = ''; }, 4000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

(async function init() {
  const auth = await checkAuth();
  if (auth) {
    isAuthenticated = true;
    showScreen('dashboard');
    await loadHomeForm();
    loadImageForm();
    loadContactForm();
    loadPublishStatus();
  } else {
    showScreen('login');
  }
})();