// Kilker Etxea scripts

(function () {
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.querySelector('#main-nav');
  var navLinks = nav.querySelectorAll('.nav-link');

  // ── Menu toggle ──
  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open);
  });

  navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', false);
    });
  });

  // ── Smooth scroll ──
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // ── Scroll reveal ──
  var revealEls = document.querySelectorAll(
    '.section-title, .card, .about-gallery, .contact-info'
  );

  revealEls.forEach(function (el) { el.classList.add('reveal'); });

  if ('IntersectionObserver' in window) {
    var revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    revealEls.forEach(function (el) { revealObs.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  // ── Nav active on scroll ──
  var sections = document.querySelectorAll('.section[id]');

  if ('IntersectionObserver' in window && sections.length) {
    var navObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = entry.target.getAttribute('id');
          navLinks.forEach(function (link) {
            if (link.getAttribute('href') === '#' + id) {
              link.classList.add('nav-active');
            } else {
              link.classList.remove('nav-active');
            }
          });
        }
      });
    }, { threshold: 0.3, rootMargin: '-48px 0px 0px 0px' });

    sections.forEach(function (s) { navObs.observe(s); });
  }
})();
