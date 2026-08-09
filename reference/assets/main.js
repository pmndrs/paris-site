/* Advanced React Three Fiber — Paris workshop
   Interaction ported from the design doc's DCLogic component. */

(function () {
  'use strict';

  var SECTIONS = ['overview', 'outcomes', 'two-days', 'instructors', 'setup', 'venue', 'faq'];

  var root = document.documentElement;
  var header = document.querySelector('[data-header]');
  var railFill = document.querySelector('.rail__fill');
  var marksHost = document.querySelector('[data-marks]');
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.navstrip a'));
  var glintHost = document.querySelector('[data-glints]');
  var todInput = document.querySelector('[data-tod]');
  var todLabel = document.querySelector('[data-tod-label]');

  /* ---------- time of day ---------- */

  var WASHES = [
    'linear-gradient(180deg,#070b18 0%,#0b1226 45%,#000 100%)',
    'linear-gradient(180deg,#141a38 0%,#1b2244 45%,#05070f 100%)',
    'linear-gradient(180deg,#3b2f56 0%,#8c5a53 60%,#160f18 100%)',
    'linear-gradient(180deg,#4c7cb8 0%,#8fb2d6 55%,#1a2430 100%)'
  ];
  var LABELS = ['NIGHT', 'DUSK', 'GOLDEN', 'DAY'];

  function applyTod(value) {
    var t = value / 100;
    var i = t < 0.2 ? 0 : t < 0.45 ? 1 : t < 0.7 ? 2 : 3;

    root.style.setProperty('--sky-wash', WASHES[i]);
    root.style.setProperty('--city-opacity', String(0.42 + t * 0.38));
    root.style.setProperty('--glint-opacity', String(0.95 - t * 0.75));
    if (todLabel) todLabel.textContent = 'TIME OF DAY — ' + LABELS[i];
  }

  if (todInput) {
    todInput.addEventListener('input', function () { applyTod(+todInput.value); });
    applyTod(+todInput.value);
  }

  /* ---------- glints ---------- */

  // Deterministic hash so the star field is identical on every load — the design
  // relies on the same seeds, and a stable field keeps the mobile frames matched.
  function rnd(n, seed) {
    var x = Math.sin(seed * 9301 + n * 49297) * 233280;
    return x - Math.floor(x);
  }

  if (glintHost) {
    var frag = document.createDocumentFragment();
    for (var n = 0; n < 16; n++) {
      var dot = document.createElement('div');
      var size = (2 + rnd(n, 3) * 2.4).toFixed(1) + 'px';
      dot.className = 'glint';
      dot.style.left = (12 + rnd(n, 1) * 76).toFixed(1) + '%';
      dot.style.top = (8 + rnd(n, 2) * 54).toFixed(1) + '%';
      dot.style.width = size;
      dot.style.height = size;
      dot.style.animationDuration = (2.4 + rnd(n, 4) * 3.4).toFixed(2) + 's';
      dot.style.animationDelay = (rnd(n, 5) * 4).toFixed(2) + 's';
      frag.appendChild(dot);
    }
    glintHost.appendChild(frag);
  }

  /* ---------- scroll: header reveal, progress rail, section marks ---------- */

  var marks = [];
  if (marksHost) {
    marks = SECTIONS.map(function (id) {
      var el = document.createElement('div');
      el.className = 'rail__mark';
      el.dataset.section = id;
      marksHost.appendChild(el);
      return el;
    });
  }

  var ticking = false;

  function update() {
    ticking = false;

    var doc = document.documentElement;
    var vh = window.innerHeight;
    var y = window.scrollY || doc.scrollTop || 0;
    var total = Math.max(1, doc.scrollHeight - vh);

    // The last section whose top has crossed 40% of the viewport wins.
    var active = '';
    SECTIONS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= vh * 0.4) active = id;
    });

    // Header only appears once the hero poster is mostly scrolled past.
    var shown = y > Math.max(400, vh) * 0.55;
    header.classList.toggle('is-visible', shown);

    root.style.setProperty('--progress', (Math.min(1, y / total) * 100).toFixed(2) + '%');

    marks.forEach(function (mark) {
      var el = document.getElementById(mark.dataset.section);
      var top = el ? el.getBoundingClientRect().top + y : 0;
      mark.style.left = Math.min(100, (top / total) * 100).toFixed(2) + '%';
      mark.classList.toggle('is-active', active === mark.dataset.section);
    });

    navLinks.forEach(function (link) {
      link.setAttribute('aria-current', String(link.hash === '#' + active));
    });
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
  // Sections shift as webfonts land, so re-measure once things have settled.
  window.addEventListener('load', update);
  setTimeout(update, 400);

  /* ---------- faq ---------- */

  var faq = document.querySelector('[data-faq]');
  if (faq) {
    faq.addEventListener('click', function (e) {
      var btn = e.target.closest('.faq__q');
      if (!btn) return;

      var item = btn.parentElement;
      var wasOpen = item.classList.contains('is-open');

      faq.querySelectorAll('.faq__item').forEach(function (other) {
        other.classList.remove('is-open');
        other.querySelector('.faq__q').setAttribute('aria-expanded', 'false');
        other.querySelector('.faq__sign').textContent = '+';
      });

      if (!wasOpen) {
        item.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
        item.querySelector('.faq__sign').textContent = '–';
      }

      // Opening or closing changes document height; the rail needs to know.
      update();
    });
  }
})();
