/* =========================================
   LoopCampus Digital Studio — script.js
   Plain vanilla JavaScript (no frameworks)
   ========================================= */

(function () {
  'use strict';

  /* -------------------------------------------------
     Mobile navigation toggle
     ------------------------------------------------- */
  const navToggle = document.getElementById('nav-toggle');
  const primaryNav = document.getElementById('primary-nav');

  if (navToggle && primaryNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = primaryNav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  /* Close the mobile menu when a navigation link is clicked */
  document.querySelectorAll('.nav-list a').forEach((link) => {
    link.addEventListener('click', () => {
      if (primaryNav) primaryNav.classList.remove('open');
      if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  /* -------------------------------------------------
     Contact form — open the visitor's email app
     ------------------------------------------------- */
  const form = document.getElementById('contact-form');

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();

      const data = new FormData(form);
      const name = data.get('name') || '';
      const email = data.get('email') || '';
      const message = data.get('message') || '';

      const to = 'loopcampusdigitalstudio@gmail.com';
      const subject = encodeURIComponent('New message from LoopCampus website');
      const body = encodeURIComponent(
        `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`
      );

      window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
      form.reset();
    });
  }

  /* -------------------------------------------------
     Header shadow on scroll
     ------------------------------------------------- */
  const header = document.getElementById('site-header');

  window.addEventListener('scroll', () => {
    if (header) {
      header.classList.toggle('scrolled', window.scrollY > 10);
    }
  });

  /* -------------------------------------------------
     Reveal elements when they scroll into view
     ------------------------------------------------- */
  const observerOptions = { threshold: 0.1 };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.card, .section-title, .section-intro, .step').forEach((el) => {
    el.classList.add('reveal');
    observer.observe(el);
  });
})();