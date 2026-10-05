/*
 * The reading pages are complete without this file. It gives every section heading a link
 * to itself, so a reader can share the address of one part of a long document.
 */
(function () {
  'use strict';
  if (document.querySelector('.ku-docs__group')) return;
  var label = document.documentElement.lang.indexOf('tr') === 0 ? 'Bu bölüme bağlantı' : 'Link to this section';
  document.querySelectorAll('.ku-prose h2[id], .ku-prose h3[id], .ku-prose h4[id]').forEach(function (heading) {
    var link = document.createElement('a');
    link.className = 'ku-anchor';
    link.href = '#' + heading.id;
    link.setAttribute('aria-label', label + ': ' + heading.textContent);
    link.textContent = '#';
    heading.appendChild(link);
  });
})();
