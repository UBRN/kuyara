/*
 * In an app's own browser (Instagram, Facebook and the like) the App Store link can stall,
 * so one line under the first badge says the way out. The page works without this file.
 */
(function () {
  'use strict';
  var hero = document.querySelector('.ku-hero__cta');
  var note = hero && hero.getAttribute('data-inapp');
  var inApp = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|LinkedInApp|TikTok|musical_ly|Bytedance|Snapchat|Pinterest|Line\//i;
  if (!note || !inApp.test(navigator.userAgent || '')) return;
  var line = document.createElement('p');
  line.className = 'ku-caption ku-inapp';
  line.textContent = note;
  hero.appendChild(line);
})();
