/*
 * The landing page is complete without this file. It exists only to give a
 * reveal to an engine that has no scroll-driven animations (Firefox today), and
 * it stays out of the way everywhere else: where the CSS path is available, or
 * where the reader has asked for less motion, it adds nothing and observes
 * nothing. Reduce Motion in this project means no motion at all, not a gentler
 * one, which is why the same branch covers both.
 */
(function () {
  'use strict';

  var supported =
    window.CSS &&
    typeof window.CSS.supports === 'function' &&
    window.CSS.supports('animation-timeline', 'view()');
  var reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (supported || reduced || !('IntersectionObserver' in window)) {
    return;
  }

  document.documentElement.classList.add('ku-js-reveal');

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('ku-is-in');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  document.querySelectorAll('.ku-rise').forEach(function (target) {
    observer.observe(target);
  });
})();
