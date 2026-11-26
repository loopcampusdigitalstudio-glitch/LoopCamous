/* =========================================
   LoopCampus Digital Studio — script.js
   Public website: fetches content from backend,
   contact form via Formspree.
   ========================================= */

// IMPORTANT: Set this to your deployed backend URL.
// Local: 'http://localhost:3000'
// Production: 'https://your-backend.onrender.com'
const API_BASE = 'https://loopcamous.onrender.com';

(function () {
  'use strict';

  /* -------------------------------------------------
     State
     ------------------------------------------------- */
  let content = {
    settings: {},
    services: [],
    packs: [],
    team: [],
    mentor: {},
    problem: [],
    steps: [],
  };

  let isLoading = true;

  /* -------------------------------------------------
     DOM elements
     ------------------------------------------------- */
  const packsList = document.getElementById('packs-list');
  const contactForm = document.getElementById('contact-form');
  const formStatus = document.getElementById('form-status');

  /* -------------------------------------------------
     API helpers
     ------------------------------------------------- */
  async function fetchJSON(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* -------------------------------------------------
     Content loading
     ------------------------------------------------- */
  async function loadContent() {
    try {
      const [settings, services, packs, team] = await Promise.all([
        fetchJSON(`${API_BASE}/api/public/settings`),
        fetchJSON(`${API_BASE}/api/public/services`),
        fetchJSON(`${API_BASE}/api/public/packs`),
        fetchJSON(`${API_BASE}/api/public/team`),
      ]);

      content.settings = settings;
      content.services = services;
      content.packs = packs;
      content.team = team;
      content.mentor =
        team.find((t) => t.role && t.role.toLowerCase().includes('mentor')) ||
        team[team.length - 1] ||
        {};
      content.team = team.filter(
        (t) => !(t.role && t.role.toLowerCase().includes('mentor'))
      );

      // Parse stored problem/steps items, fall back to defaults
      content.problem = parseStoredItems(
        content.settings.problem_items,
        [
          { title: 'No online presence', desc: "Customers search for businesses near them on Google and Instagram — and find your competitors instead." },
          { title: 'No time or skills', desc: 'Running a business leaves no time to design posters, write captions or post regularly.' },
          { title: 'Agencies cost too much', desc: 'Big marketing agencies charge prices most small businesses simply can\'t afford.' },
        ]
      );
      content.steps = parseStoredItems(
        content.settings.steps_items,
        [
          { title: 'Say hello', wd: 'Chat about your business and goals.', yd: 'Tell us what you need.' },
          { title: 'Pick a pack', wd: 'Explain Starter, Standard and Plus.', yd: 'Choose the pack that fits your budget.' },
          { title: 'We create', wd: 'Design your profile, posts, logo or calendar.', yd: 'Wait (and relax).' },
          { title: 'You approve', wd: 'Send drafts for your feedback.', yd: 'Review and request changes.' },
          { title: 'Go live', wd: 'Publish and hand over access.', yd: 'Start getting found online.' },
        ]
      );

      isLoading = false;
      renderAll();
    } catch (err) {
      console.error('Failed to load content:', err);
      isLoading = false;
      showGlobalError('Unable to load website content. Please try again later.');
    }
  }

  function parseStoredItems(stored, defaults) {
    if (!stored) return defaults;
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      // ignore parse errors, use defaults
    }
    return defaults;
  }

  /* -------------------------------------------------
     Render functions
     ------------------------------------------------- */
  function renderAll() {
    renderSettings();
    renderProblem();
    renderServices();
    renderSteps();
    renderPacks();
    renderTeam();
  }

  function renderSettings() {
    const s = content.settings;

    // Hero
    const heroTitle = document.getElementById('hero-title');
    const heroSub = document.getElementById('hero-sub');
    if (heroTitle && s.hero_title) heroTitle.textContent = s.hero_title;
    if (heroSub && s.hero_sub) heroSub.textContent = s.hero_sub;

    // WhatsApp links
    const wa = s.whatsapp || '9148156509';
    const heroWa = document.getElementById('hero-whatsapp');
    const contactWa = document.getElementById('contact-whatsapp');
    if (heroWa) heroWa.href = `https://wa.me/${wa}`;
    if (contactWa) contactWa.href = `https://wa.me/${wa}`;

    // Contact
    const contactEmail = document.getElementById('contact-email');
    const contactInstagram = document.getElementById('contact-instagram');
    if (contactEmail && s.contact_email) {
      contactEmail.textContent = s.contact_email;
      contactEmail.href = `mailto:${s.contact_email}`;
    }
    if (contactInstagram && s.instagram) {
      contactInstagram.textContent = `@${s.instagram}`;
      contactInstagram.href = `https://instagram.com/${s.instagram}`;
    }

    // Section titles
    setText('problem-title', s.problem_title);
    setText('problem-intro', s.problem_intro);
    setText('services-title', s.services_title);
    setText('services-intro', s.services_intro);
    setText('steps-title', s.steps_title);
    setText('steps-intro', s.steps_intro);
    setText('packs-title', s.packs_title);
    setText('packs-intro', s.packs_intro);
    setText('team-title', s.team_title);
    setText('team-intro', s.team_intro);

    // Footer
    setText('footer-name', s.footer_name);
    setText('footer-note', s.footer_note);
    setText('footer-year', `&copy; ${s.footer_year || '2026'} LoopCampus Digital Studio. All rights reserved.`);

    // Logo
    const logoImg = document.getElementById('logo-img');
    if (logoImg && s.logo_url) logoImg.src = s.logo_url;

    // Hero image
    const heroImg = document.getElementById('hero-image');
    if (heroImg && s.hero_image_url) heroImg.src = s.hero_image_url;
  }

  function setText(id, html) {
    const el = document.getElementById(id);
    if (el && html !== undefined) el.innerHTML = html;
  }

  function renderProblem() {
    const list = document.getElementById('problem-list');
    if (!list) return;
    list.innerHTML = content.problem
      .map(
        (p) => `
      <li class="card">
        <h3>${escapeHtml(p.title)}</h3>
        <p>${escapeHtml(p.desc)}</p>
      </li>
    `
      )
      .join('');
  }

  function renderServices() {
    const list = document.getElementById('services-list');
    if (!list) return;
    list.innerHTML = content.services
      .map(
        (s) => `
      <li class="card service-card">
        <span class="card-tag">${escapeHtml(s.tag || '')}</span>
        <h3>${escapeHtml(s.title)}</h3>
        <p>${escapeHtml(s.description || '')}</p>
      </li>
    `
      )
      .join('');
  }

  function renderSteps() {
    const list = document.getElementById('steps-list');
    if (!list) return;
    list.innerHTML = content.steps
      .map(
        (s, i) => `
      <li class="step card">
        <span class="step-number">${i + 1}</span>
        <h3>${escapeHtml(s.title)}</h3>
        <p><strong>What we do:</strong> ${escapeHtml(s.wd)}</p>
        <p><strong>What you do:</strong> ${escapeHtml(s.yd)}</p>
      </li>
    `
      )
      .join('');
  }

  function renderPacks() {
    const list = document.getElementById('packs-list');
    if (!list) return;

    list.innerHTML = content.packs
      .map(
        (p) => `
      <li class="card pack-card${p.badge ? ' featured' : ''}" data-pack-id="${p.id}">
        ${p.badge ? `<span class="pack-badge">${escapeHtml(p.badge)}</span>` : ''}
        <span class="pack-name">${escapeHtml(p.name)}</span>
        <span class="pack-price">₹${escapeHtml(p.price)}</span>
        <ul class="pack-features" role="list">
          ${(p.features || []).map((f) => `<li>${escapeHtml(f)}</li>`).join('')}
        </ul>
        <a href="https://wa.me/${content.settings.whatsapp || '9148156509'}" class="btn btn-primary pack-btn" target="_blank" rel="noopener">
          Get ${escapeHtml(p.name)} <span class="icon">&#8599;</span>
        </a>
      </li>
    `
      )
      .join('');
  }

  function renderTeam() {
    const list = document.getElementById('team-list');
    const mentorCard = document.getElementById('mentor-card');

    if (list) {
      list.innerHTML = content.team
        .map(
          (m) => `
        <li class="card team-card">
          <img src="${m.image_url || 'assets/team-placeholder.svg'}" alt="Photo of ${escapeHtml(m.name)}" width="120" height="120" loading="lazy" />
          <h3>${escapeHtml(m.name)}</h3>
          <p class="team-role">${escapeHtml(m.role || '')}</p>
          <p>${escapeHtml(m.description || '')}</p>
        </li>
      `
        )
        .join('');
    }

    if (mentorCard && content.mentor) {
      mentorCard.innerHTML = `
        <img src="${content.mentor.image_url || 'assets/team-placeholder.svg'}" alt="Photo of ${escapeHtml(content.mentor.name)}" width="120" height="120" loading="lazy" />
        <h3>${escapeHtml(content.mentor.name)}</h3>
        <p class="team-role">${escapeHtml(content.mentor.role || 'Faculty Mentor')}</p>
        <p>${escapeHtml(content.mentor.description || '')}</p>
      `;
    }
  }

  function showGlobalError(message) {
    const hero = document.getElementById('hero-title');
    if (hero) {
      const err = document.createElement('p');
      err.style.color = '#FF7A59';
      err.textContent = message;
      hero.insertAdjacentElement('afterend', err);
    }
  }

  /* -------------------------------------------------
     Contact form (Formspree)
     ------------------------------------------------- */
  if (contactForm) {
    contactForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const btn = contactForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      formStatus.textContent = '';

      const formData = new FormData(contactForm);

      try {
        const response = await fetch(contactForm.action, {
          method: 'POST',
          body: formData,
          headers: { 'Accept': 'application/json' },
        });

        if (response.ok) {
          formStatus.style.color = '#2EC4B6';
          formStatus.textContent = 'Message sent! We will reply to your email soon.';
          contactForm.reset();
        } else {
          formStatus.style.color = '#FF7A59';
          formStatus.textContent = 'Something went wrong. Please try again.';
        }
      } catch (error) {
        formStatus.style.color = '#FF7A59';
        formStatus.textContent = 'Something went wrong. Please try again.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send message';
      }
    });
  }

  /* -------------------------------------------------
     Mobile navigation
     ------------------------------------------------- */
  const navToggle = document.getElementById('nav-toggle');
  const primaryNav = document.getElementById('primary-nav');

  if (navToggle && primaryNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = primaryNav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  document.querySelectorAll('.nav-list a').forEach((link) => {
    link.addEventListener('click', () => {
      if (primaryNav) primaryNav.classList.remove('open');
      if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  /* -------------------------------------------------
     Header scroll shadow
     ------------------------------------------------- */
  const header = document.getElementById('site-header');
  if (header) {
    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 10);
    });
  }

  /* -------------------------------------------------
     Smooth scrolling
     ------------------------------------------------- */
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  /* -------------------------------------------------
     Escape HTML helper
     ------------------------------------------------- */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /* -------------------------------------------------
     Initialize
     ------------------------------------------------- */
  loadContent();
})();
