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
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.paint(kind, ink, t, 1);
  };
  /* One kind's particles over what is already drawn, at a share of their own strength. */
  Plate.prototype.paint = function (kind, ink, t, weight) {
    var ctx = this.ctx, w = this.w, h = this.h;
    ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineCap = 'round';
    this.parts.slice(0, COUNT[kind]).forEach(function (q) {
      var v, x, y, d;
      if (kind === 'rain') {
        v = (t / (0.65 * (1 + q.s * 0.6)) + q.p) % 1;
        x = q.x * (w + 0.25 * h) - 0.25 * h * v; y = v * (h + 40) - 20; d = 10 + q.s * 8;
        ctx.lineWidth = 1.6; ctx.globalAlpha = 0.8 * weight;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 0.24 * d, y + 0.97 * d); ctx.stroke();
      } else if (kind === 'snow') {
        v = (t / (1.5 * (10 / 3 + q.s * 2)) + q.p) % 1;
        x = q.x * w + Math.sin((v + q.p) * Math.PI * 2) * 18 * q.sway; y = v * (h + 30) - 15; d = 3 + q.s * 3;
        ctx.globalAlpha = 0.85 * weight; ctx.beginPath(); ctx.arc(x, y, d / 2, 0, Math.PI * 2); ctx.fill();
      } else if (kind === 'motes') {
        v = 0.5 - 0.5 * Math.cos(((t / (1.5 * (8 / 3 + q.s * 8 / 3)) + q.p) % 1) * Math.PI * 2);
        x = q.x * w - 6 + 12 * v; y = q.y * h + 8 - 16 * v; d = 2.5 + q.s * 3.5;
        ctx.globalAlpha = (0.3 + 0.3 * v) * weight; ctx.beginPath(); ctx.arc(x, y, d / 2, 0, Math.PI * 2); ctx.fill();
      } else if (kind === 'wind') {
        /* Long, thin, quick lines with a slight lift, faster than the clouds. */
        v = (t / (1.1 + q.s * 0.9) + q.p) % 1;
        d = 0.18 * w + q.s * 0.22 * w; x = v * (w + d + 40) - d - 20; y = q.y * h;
        ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6 * weight;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + d * 0.6, y - 4 * q.sway, x + d, y - 2); ctx.stroke();
      } else {
        /* A small cloud: three soft puffs on a flat base, drifting slowly across the upper
           plate, faint enough to read as sky rather than as a mark. */
        v = (t / (1.5 * (28 / 3 + q.s * 16 / 3)) + q.p) % 1;
        d = 9 + q.s * 7; x = v * (w + 6 * d) - 3 * d; y = 0.08 * h + q.y * 0.55 * h;
        ctx.globalAlpha = 0.18 * weight;
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

  /* ------------------------------------------------------- the stage weather */
  /* The dressing stage's plate draws its weather as a function of where the descent is:
     each scene's own particles fade in and out around that scene, and from the rain on the
     sky is one precipitation that thickens toward zero and, when the number crosses it,
     turns to snow in place: every streak shortens into a dot, slows and starts to sway.
     Everything moves by elapsed time, so it reads the same at 30 frames as at 120. */
  var STREAKS = 36;
  function mix(a, b, k) { return a + (b - a) * k; }
  function ease(k) { return k * k * (3 - 2 * k); }
  function step(a, b, x) { return ease(Math.min(1, Math.max(0, (x - a) / (b - a)))); }
  function rgb(hex) { var n = parseInt(hex.replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function blend(a, b, k) {
    var p = rgb(a), q = rgb(b);
    return 'rgb(' + Math.round(mix(p[0], q[0], k)) + ',' + Math.round(mix(p[1], q[1], k)) + ',' + Math.round(mix(p[2], q[2], k)) + ')';
  }

  function Sky(plate) {
    var random = seeded(97), drops = [];
    for (var i = 0; i < STREAKS; i++) {
      var y = random();
      drops.push({ x: random(), y: y, s: random(), p: random(), sway: random() * 2 - 1, dx: -0.24 * y });
    }
    this.plate = plate; this.drops = drops;
    this.weight = { motes: 1, clouds: 0, wind: 0, fall: 0 };
    this.target = { motes: 1, clouds: 0, wind: 0, fall: 0 };
    this.snow = 0; this.snowTarget = 0; this.density = 22; this.last = 0;
  }
  /* x is the stage's position in scenes (0 is the second scene arriving), t the degrees. */
  Sky.prototype.aim = function (x, t) {
    this.target.motes = 1 - step(-0.1, 0.04, x);
    this.target.clouds = step(-0.1, 0.04, x) * (1 - step(0.9, 1.04, x));
    this.target.wind = step(1.9, 2.04, x) * (1 - step(2.9, 3.06, x));
    this.target.fall = step(0.9, 1.04, x);
    this.density = mix(24, STREAKS, step(11, 1, t));
    this.snowTarget = t <= 0 ? 1 : 0;
  };
  Sky.prototype.draw = function (now, inks) {
    var plate = this.plate, ctx = plate.ctx, w = plate.w, h = plate.h;
    var dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    var t = now / 1000, k, key;
    var settle = 1 - Math.exp(-dt / 0.18);
    for (key in this.weight) this.weight[key] += (this.target[key] - this.weight[key]) * settle;
    /* The turn to snow takes 600 ms either way, whatever the scroll does meanwhile. */
    k = dt / 0.6;
    this.snow = this.snowTarget > this.snow ? Math.min(1, this.snow + k) : Math.max(0, this.snow - k);

    ctx.setTransform(plate.dpr, 0, 0, plate.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    if (this.weight.motes > 0.01) plate.paint('motes', inks.motes, t, this.weight.motes);
    if (this.weight.clouds > 0.01) plate.paint('clouds', inks.clouds, t, this.weight.clouds);
    if (this.weight.wind > 0.01) plate.paint('wind', inks.wind, t, this.weight.wind);

    var fall = this.weight.fall;
    if (fall > 0.01) {
      var m = ease(this.snow), wind = this.weight.wind;
      var slant = 0.24 + 0.22 * wind;
      ctx.strokeStyle = blend(inks.rain, inks.snow, m);
      ctx.shadowColor = 'rgba(20, 47, 59, ' + (0.35 * m).toFixed(3) + ')'; ctx.shadowBlur = 3 * m; ctx.shadowOffsetY = 0.5 * m;
      for (var i = 0; i < STREAKS; i++) {
        var q = this.drops[i];
        /* Speed, in plate heights a second: the rain's quick fall, the snow's slow drift. */
        var speed = mix(1 / (0.65 * (1 + q.s * 0.6)), 1 / (1.5 * (10 / 3 + q.s * 2)), m);
        var dy = speed * dt;
        q.y += dy;
        q.dx -= dy * mix(slant, 0.1 + 0.3 * wind, m); /* in plate heights, like y */
        if (q.y >= 1) { q.y -= 1; q.dx = 0; }
        var alpha = Math.min(1, Math.max(0, this.density - i)) * fall;
        if (alpha <= 0.01) continue;
        var length = mix(10 + q.s * 8, 0.01, m);
        var size = mix(1.6, 3 + q.s * 3, m);
        var x = q.x * (w + mix(0.3, 0.12, m) * h) + q.dx * (h + 40) + Math.sin((t / (3 + q.s * 2) + q.p) * Math.PI * 2) * 18 * q.sway * m;
        var y = q.y * (h + 40) - 20;
        ctx.lineWidth = size;
        ctx.globalAlpha = mix(0.8, 0.85, m) * alpha;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - slant * length * (1 - m), y + 0.97 * length); ctx.stroke();
      }
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }
    ctx.globalAlpha = 1;
  };

  /* ---------------------------------------------------------- the one loop */
  var active = null, raf = 0, sky = null;
  function frame(now) {
    raf = 0;
    if (!active || document.hidden) return;
    if (sky && active === dressItem) {
      sky.draw(now, skyInks);
    } else {
      var t = now / 1000;
      active.plates.forEach(function (plate) { plate.draw(active.kind, active.ink, t); });
    }
    raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (raf || !active || document.hidden) return;
    if (sky) sky.last = 0; /* a paused loop resumes where it stopped, not with a jump */
    raf = requestAnimationFrame(frame);
  }
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
     step, so a slow scroll watches each piece land. Scrolling back takes them off.
     Above the plate one number counts the degrees down with the scroll, reaching each
     scene's own temperature as that scene arrives. */
  var dress = document.querySelector('.ku-dress');
  var art = dress && dress.querySelector('.ku-dress__art');
  var dressItem = art ? items[scenes.indexOf(art)] : null;
  if (!dressItem) return;
  root.classList.add('ku-dress-live');
  var plate = art.querySelector('.ku-dress__plate');
  var progress = art.querySelector('.ku-dress__progress');
  var looks = [].slice.call(art.querySelectorAll('.ku-dress__look'));
  var weathers = [].slice.call(art.querySelectorAll('.ku-dress__weather'));
  var slots = [].slice.call(art.querySelectorAll('.ku-dress__degrees .ku-roll'));
  var order = function (piece) { return parseFloat(piece.style.getPropertyValue('--i')) || 0; };
  var worn = looks.map(function (look) {
    return [].slice.call(look.querySelectorAll('.ku-piece')).sort(function (a, b) { return order(a) - order(b); });
  });
  var degrees = weathers.map(function (weather) {
    var temp = weather.querySelector('.ku-dress__temp');
    return parseFloat((temp ? temp.textContent : '0').replace('−', '-')) || 0;
  });
  var LEAD = 0.4; /* the share of a step the first scene holds before the next one starts */
  var MINUS = '−';
  var current = -1, pending = 0, shown = null, sent = '';
  var hottest = Math.max.apply(Math, degrees), coldest = Math.min.apply(Math, degrees);
  if (progress && hottest > coldest) progress.style.setProperty('--ku-dress-zero', ((0 - coldest) / (hottest - coldest)).toFixed(3));

  var kindOf = function (look) { return look.getAttribute('data-particles-kind'); };
  var inkFor = function (kind) {
    for (var n = 0; n < looks.length; n++) if (kindOf(looks[n]) === kind) return inkOf(looks[n].getAttribute('data-ink'));
    return dressItem.ink;
  };
  /* The stage's snow is white, as snow is, with a faint shade so it reads on the pale plate. */
  var skyInks = { motes: inkFor('motes'), clouds: inkFor('clouds'), wind: inkFor('wind'), rain: inkFor('rain'), snow: '#FFFFFF' };
  if (/^#[0-9a-f]{6}$/i.test(skyInks.rain) && /^#[0-9a-f]{6}$/i.test(skyInks.snow)) sky = new Sky(dressItem.plates[0]);

  /* The temperature at stage position x: the scenes' own temperatures at the moments they
     arrive (the first at the top, each later one at x = its index - 1), straight between. */
  function degreesAt(x) {
    if (x <= -LEAD) return degrees[0];
    if (x < 0) return mix(degrees[0], degrees[1], (x + LEAD) / LEAD);
    var n = Math.floor(x) + 1;
    if (n >= degrees.length - 1) return degrees[degrees.length - 1];
    return mix(degrees[n], degrees[n + 1], x - (n - 1));
  }

  /* Each slot rolls only when its own character changes: the old one leaves a line down
     and the new one arrives from above as it gets colder, the other way as it warms. */
  function glyphs(value) {
    var text = String(Math.abs(value));
    if (value < 0) return [MINUS, text];
    return text.length > 1 ? [text.charAt(0), text.charAt(1)] : ['', text];
  }
  function roll(slot, glyph, colder) {
    var held = slot.lastElementChild;
    if (held && held.textContent === glyph) return;
    [].slice.call(slot.children, 0, -1).forEach(function (old) { old.remove(); });
    var next = document.createElement('span');
    next.textContent = glyph;
    slot.appendChild(next);
    if (!held || !next.animate) { if (held) held.remove(); return; }
    var away = colder ? '100%' : '-100%', from = colder ? '-100%' : '100%';
    var timing = { duration: 200, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' };
    next.animate([{ transform: 'translateY(' + from + ')' }, { transform: 'none' }], timing);
    held.animate([{ transform: 'none' }, { transform: 'translateY(' + away + ')' }], timing).onfinish = function () { held.remove(); };
  }
  function count(value) {
    if (value === shown) return;
    var colder = shown !== null && value < shown, parts = glyphs(value);
    slots.forEach(function (slot, n) { roll(slot, parts[n], colder); });
    shown = value;
  }

  function show(index) {
    looks.forEach(function (look, n) {
      look.classList.toggle('is-current', n === index);
      if (n !== index) worn[n].forEach(function (piece) { piece.classList.remove('is-on'); });
      if (n === index) look.removeAttribute('aria-hidden'); else look.setAttribute('aria-hidden', 'true');
    });
    weathers.forEach(function (weather, n) { weather.classList.toggle('is-current', n === index); });
    plate.setAttribute('data-atmosphere', looks[index].getAttribute('data-atmosphere'));
    dressItem.kind = kindOf(looks[index]);
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
    /* Rounded up, so a scene's own number shows the moment it arrives and not before. */
    var t = degreesAt(x), whole = Math.ceil(t - 1e-6);
    count(whole === 0 ? 0 : whole);
    if (sky) { sky.aim(x, whole); kick(); }
    if (progress) {
      progress.style.setProperty('--ku-dress-progress', p.toFixed(3));
      progress.style.setProperty('--ku-dress-warmth', hottest > coldest ? ((t - coldest) / (hottest - coldest)).toFixed(4) : '1');
    }
    var mark = index + ':' + p.toFixed(4);
    if (mark !== sent) {
      sent = mark;
      document.dispatchEvent(new CustomEvent('ku:stage', { detail: { index: index, progress: p } }));
    }
  }
  function schedule() { if (!pending) pending = requestAnimationFrame(place); }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  place();
})();
