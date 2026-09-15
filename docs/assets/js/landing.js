/*
 * The landing page is complete without this file. It exists only to give a
 * reveal to an engine that has no scroll-driven animations (Firefox today), and
 * it stays out of the way everywhere else: where the CSS path is available it
 * adds nothing and observes nothing. Capability is the only gate.
 */
(function () {
  'use strict';

  var supported =
    window.CSS &&
    typeof window.CSS.supports === 'function' &&
    window.CSS.supports('animation-timeline', 'view()');

  if (supported || !('IntersectionObserver' in window)) {
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
