/*
 * The bottom App Store pill and the in-app browser line. The page works without this
 * file: the pill stays hidden and inert, and every badge is a plain link.
 *
 * The pill shows once the hero badge has scrolled up out of view (on a phone that happens
 * early in the dressing stage, whose plate is taller than the screen), and hides while the
 * hero badge or the closing badge is on screen, so the page never shows two badges at once.
 */
(function () {
  'use strict';

  var pill = document.querySelector('.ku-pill');
  if (!pill) return;

  /* Instagram, Facebook, Messenger and other apps' own browsers. */
  var inApp = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|LinkedInApp|TikTok|musical_ly|Bytedance|Snapchat|Pinterest|Line\//i;
  var hero = document.querySelector('.ku-hero__cta');
  var note = pill.getAttribute('data-inapp');
  if (hero && note && inApp.test(navigator.userAgent || '')) {
    var line = document.createElement('p');
    line.className = 'ku-caption ku-inapp';
    line.textContent = note;
    hero.appendChild(line);
  }

  var first = document.querySelector('.ku-hero .ku-badge');
  var badges = [].slice.call(document.querySelectorAll('.ku-hero .ku-badge, .ku-cta .ku-badge'));
  if (!first || !('IntersectionObserver' in window)) return;

  var seen = new Set();
  var past = false;
  var shown = false;

  function update() {
    var want = past && seen.size === 0;
    if (want === shown) return;
    shown = want;
    pill.classList.toggle('is-shown', want);
    if (want) { pill.removeAttribute('aria-hidden'); pill.removeAttribute('inert'); }
    else { pill.setAttribute('aria-hidden', 'true'); pill.setAttribute('inert', ''); }
  }

  var badgeWatch = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) seen.add(entry.target); else seen.delete(entry.target);
    });
    update();
  });
  badges.forEach(function (badge) { badgeWatch.observe(badge); });

  /* The visitor has moved on once the hero badge has risen above the top of the screen. */
  var queued = false;
  function measure() {
    queued = false;
    past = first.getBoundingClientRect().bottom < 0;
    update();
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(measure); } }
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  measure();
})();
