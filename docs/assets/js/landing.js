/*
 * The landing page's motion. The page reads completely without this file: every board is
 * printed as SVG. With it, each weather scene's pieces land when the scene scrolls in, and
 * the weather moves on the plates of the scene most in view: motes on a clear sky, small
 * clouds, slanted rain, wind lines and swaying snow, in the condition's own ink, behind
 * the pieces. One loop draws, and only while a scene is in view and the tab is showing.
 *
 * Every animation plays whatever the operating system prefers (product-decisions.md).
 * Capability is the only gate.
 */
(function () {
  'use strict';

  var root = document.documentElement;

  /* Scroll reveals for an engine without scroll-driven animations. */
  if (!(window.CSS && CSS.supports && CSS.supports('animation-timeline', 'view()')) && 'IntersectionObserver' in window) {
    root.classList.add('ku-js-reveal');
    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('ku-is-in'); revealer.unobserve(entry.target); }
      });
    }, { threshold: 0.15 });
    document.querySelectorAll('.ku-rise').forEach(function (target) { revealer.observe(target); });
  }

  var scenes = [].slice.call(document.querySelectorAll('[data-particles]'));
  if (!scenes.length || !('IntersectionObserver' in window)) return;

  /* ------------------------------------------------------------- particles */
  var COUNT = { motes: 8, clouds: 4, rain: 22, wind: 9, snow: 18 };
  var MOST = 22; /* the dressing stage changes its weather, so every plate seeds the most */
  function seeded(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  function Plate(plate, kind, seed) {
    this.host = plate;
    this.canvas = plate.querySelector('.ku-particles');
    this.ctx = this.canvas.getContext('2d');
    var random = seeded(seed), parts = [];
    for (var i = 0; i < MOST; i++) parts.push({ x: random(), y: random(), s: random(), p: random(), sway: random() * 2 - 1 });
    this.parts = parts;
    this.w = 0; this.h = 0; this.dpr = 1;
  }
  Plate.prototype.size = function () {
    var rect = this.host.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = rect.width; this.h = rect.height;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  };
  Plate.prototype.draw = function (kind, ink, t) {
    var ctx = this.ctx, w = this.w, h = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineCap = 'round';
    this.parts.slice(0, COUNT[kind]).forEach(function (q) {
      var v, x, y, d;
      if (kind === 'rain') {
        v = (t / (0.65 * (1 + q.s * 0.6)) + q.p) % 1;
        x = q.x * (w + 0.25 * h) - 0.25 * h * v; y = v * (h + 40) - 20; d = 10 + q.s * 8;
        ctx.lineWidth = 1.6; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 0.24 * d, y + 0.97 * d); ctx.stroke();
      } else if (kind === 'snow') {
        v = (t / (1.5 * (10 / 3 + q.s * 2)) + q.p) % 1;
        x = q.x * w + Math.sin((v + q.p) * Math.PI * 2) * 18 * q.sway; y = v * (h + 30) - 15; d = 3 + q.s * 3;
        ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(x, y, d / 2, 0, Math.PI * 2); ctx.fill();
      } else if (kind === 'motes') {
        v = 0.5 - 0.5 * Math.cos(((t / (1.5 * (8 / 3 + q.s * 8 / 3)) + q.p) % 1) * Math.PI * 2);
        x = q.x * w - 6 + 12 * v; y = q.y * h + 8 - 16 * v; d = 2.5 + q.s * 3.5;
        ctx.globalAlpha = 0.3 + 0.3 * v; ctx.beginPath(); ctx.arc(x, y, d / 2, 0, Math.PI * 2); ctx.fill();
      } else if (kind === 'wind') {
        /* Long, thin, quick lines with a slight lift, faster than the clouds. */
        v = (t / (1.1 + q.s * 0.9) + q.p) % 1;
        d = 0.18 * w + q.s * 0.22 * w; x = v * (w + d + 40) - d - 20; y = q.y * h;
        ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + d * 0.6, y - 4 * q.sway, x + d, y - 2); ctx.stroke();
      } else {
        /* A small cloud: three soft puffs on a flat base, drifting slowly across the upper
           plate, faint enough to read as sky rather than as a mark. */
        v = (t / (1.5 * (28 / 3 + q.s * 16 / 3)) + q.p) % 1;
        d = 9 + q.s * 7; x = v * (w + 6 * d) - 3 * d; y = 0.08 * h + q.y * 0.55 * h;
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.arc(x, y, d, Math.PI, 0);
        ctx.arc(x + 1.25 * d, y - 0.45 * d, 1.3 * d, Math.PI, 0);
        ctx.arc(x + 2.5 * d, y, d, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
  };

  /* The particles stand on the plate, which is light in both appearances, so their ink is
     the light condition ink in both and never needs repainting on a theme change. */
  var style = getComputedStyle(root);
  function inkOf(name) {
    return style.getPropertyValue('--ku-particle-' + name.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); })).trim();
  }
  var items = scenes.map(function (scene, index) {
    var kind = scene.getAttribute('data-particles');
    var ink = inkOf(scene.getAttribute('data-ink'));
    var plates = [].map.call(scene.querySelectorAll('.ku-plate'), function (plate, n) { return new Plate(plate, kind, 7 + index * 2 + n); });
    return { scene: scene, kind: kind, ink: ink || '#000', plates: plates, ratio: 0 };
  });

  var resizer = 'ResizeObserver' in window ? new ResizeObserver(function () {
    items.forEach(function (item) { item.plates.forEach(function (plate) { plate.size(); }); });
  }) : null;
  items.forEach(function (item) {
    item.plates.forEach(function (plate) { plate.size(); if (resizer) resizer.observe(plate.host); });
  });

  /* ---------------------------------------------------------- the one loop */
  var active = null, raf = 0;
  function frame(now) {
    raf = 0;
    if (!active || document.hidden) return;
    var t = now / 1000;
    active.plates.forEach(function (plate) { plate.draw(active.kind, active.ink, t); });
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && active && !document.hidden) raf = requestAnimationFrame(frame); }
  document.addEventListener('visibilitychange', kick);

  /* A scene lands its pieces the first time a fifth of it shows; the scene most in view
     owns the loop. A scene that loses it keeps its last frame, still. */
  var watcher = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var item = items[scenes.indexOf(entry.target)];
      item.ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
      if (entry.intersectionRatio >= 0.2) entry.target.classList.add('is-in');
    });
    var best = null;
    items.forEach(function (item) { if (item.ratio > 0 && (!best || item.ratio > best.ratio)) best = item; });
    active = best;
    kick();
  }, { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] });
  scenes.forEach(function (scene) { watcher.observe(scene); });

  /* ------------------------------------------------------- the dressing stage */
  /* The first screen walks the five scenes as the page scrolls. The first scene stands
     dressed; every later one puts its pieces on in order across the first part of its
     step, so a slow scroll watches each piece land. Scrolling back takes them off. */
  var dress = document.querySelector('.ku-dress');
  var art = dress && dress.querySelector('.ku-dress__art');
  var dressItem = art ? items[scenes.indexOf(art)] : null;
  if (!dressItem) return;
  root.classList.add('ku-dress-live');
  var plate = art.querySelector('.ku-dress__plate');
  var progress = art.querySelector('.ku-dress__progress');
  var looks = [].slice.call(art.querySelectorAll('.ku-dress__look'));
  var weathers = [].slice.call(art.querySelectorAll('.ku-dress__weather'));
  var order = function (piece) { return parseFloat(piece.style.getPropertyValue('--i')) || 0; };
  var worn = looks.map(function (look) {
    return [].slice.call(look.querySelectorAll('.ku-piece')).sort(function (a, b) { return order(a) - order(b); });
  });
  var LEAD = 0.4; /* the share of a step the first scene holds before the next one starts */
  var current = -1, pending = 0;

  function show(index) {
    looks.forEach(function (look, n) {
      look.classList.toggle('is-current', n === index);
      if (n !== index) worn[n].forEach(function (piece) { piece.classList.remove('is-on'); });
      if (n === index) look.removeAttribute('aria-hidden'); else look.setAttribute('aria-hidden', 'true');
    });
    weathers.forEach(function (weather, n) { weather.classList.toggle('is-current', n === index); });
    plate.setAttribute('data-atmosphere', looks[index].getAttribute('data-atmosphere'));
    dressItem.kind = looks[index].getAttribute('data-particles-kind');
    dressItem.ink = inkOf(looks[index].getAttribute('data-ink'));
    current = index;
  }

  function place() {
    pending = 0;
    var run = dress.offsetHeight - window.innerHeight;
    var p = run > 0 ? Math.min(1, Math.max(0, -dress.getBoundingClientRect().top / run)) : 0;
    var x = p * (looks.length - 1 + LEAD) - LEAD;
    var index = x < 0 ? 0 : Math.min(looks.length - 1, Math.floor(x) + 1);
    var f = x < 0 ? 1 : Math.min(1, x - (index - 1));
    if (index !== current) show(index);
    worn[index].forEach(function (piece, n) {
      piece.classList.toggle('is-on', index === 0 || f >= n * 0.14);
    });
    if (progress) progress.style.setProperty('--ku-dress-progress', p.toFixed(3));
  }
  function schedule() { if (!pending) pending = requestAnimationFrame(place); }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  place();
})();
