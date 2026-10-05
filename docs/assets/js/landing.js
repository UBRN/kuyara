/*
 * The landing page's motion and controls. The page reads completely without this file: the
 * first boards are printed as SVG. With it, the visitor changes the temperature, the sky and
 * the catalogue and the app's own board re-dresses, weather particles move on the plate, a
 * sample day plays on its own behind a visible pause control, and the story's plate follows
 * the moment in view. Board data comes from boards.js, generated from the app's code.
 *
 * Every animation plays whatever the operating system prefers (product-decisions.md).
 * Capability is the only gate.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var supportsViewTimeline = window.CSS && CSS.supports && CSS.supports('animation-timeline', 'view()');

  /* Scroll reveals for an engine without scroll-driven animations. */
  if (!supportsViewTimeline && 'IntersectionObserver' in window) {
    root.classList.add('ku-js-reveal');
    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('ku-is-in'); revealer.unobserve(entry.target); }
      });
    }, { threshold: 0.15 });
    document.querySelectorAll('.ku-rise').forEach(function (target) { revealer.observe(target); });
  }

  var D = window.KU_BOARDS;
  if (!D) { root.classList.remove('ku-js'); return; }

  var lang = (root.lang || 'en').slice(0, 2) === 'tr' ? 'tr' : 'en';
  var COPY = JSON.parse(document.getElementById('ku-copy').textContent || '{}');
  var NAMES = D.i18n[lang];
  var UNITS = D.units;
  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------------ springs
     The app's two springs (theme.ts): spatial 550 ms at damping ratio 0.825, arrival 550 ms
     at 0.65, which overshoots once. Sampled into CSS linear() so the browser runs them. */
  function spring(zeta, ms) {
    var T = ms / 1000, w0 = 6.9 / (zeta * T), wd = w0 * Math.sqrt(1 - zeta * zeta), points = [];
    for (var i = 0; i <= 48; i++) {
      var t = T * i / 48, e = Math.exp(-zeta * w0 * t);
      points.push(+(1 - e * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t))).toFixed(4));
    }
    points[48] = 1;
    return 'linear(' + points.join(', ') + ')';
  }
  var hasLinear = window.CSS && CSS.supports && CSS.supports('transition-timing-function', 'linear(0, 1)');
  var EASE = {
    arrival: hasLinear ? spring(0.65, 550) : 'cubic-bezier(0.34, 1.4, 0.64, 1)',
    spatial: hasLinear ? spring(0.825, 550) : 'cubic-bezier(0.25, 1.1, 0.5, 1)'
  };
  var SPRING_MS = 550, FAST = 120, NORMAL = 200, STAGGER = 45;

  /* ------------------------------------------------------------------ drawing */
  var copies = 0;
  function artMarkup(key) {
    copies += 1;
    return D.art[key].replace(/KU_/g, 'c' + copies + '_');
  }
  function pieceMarkup(piece) {
    var art = piece.art;
    if (art.length === 1) return artMarkup(art[0]);
    return '<g class="ku-art-light">' + artMarkup(art[0]) + '</g><g class="ku-art-dark">' + artMarkup(art[1]) + '</g>';
  }
  function pieceNode(piece, h) {
    var holder = document.createElement('div');
    holder.innerHTML = '<svg class="ku-piece" viewBox="0 0 ' + UNITS + ' ' + h + '" data-slot="' + piece.slot +
      '" aria-hidden="true" focusable="false"><g transform="translate(' + piece.t[0] + ' ' + piece.t[1] + ') scale(' +
      piece.t[2] + ')">' + pieceMarkup(piece) + '</g></svg>';
    return holder.firstChild;
  }
  function sameArt(a, b) { return a.art.join() === b.art.join(); }
  function nameOf(piece) {
    var family = NAMES.families[piece.family] || piece.family;
    return (NAMES.names[piece.type] || piece.type) + ' (' + family.toLocaleLowerCase(lang) + ')';
  }
  function outfitLabel(archetypeId, board) {
    return (NAMES.archetypes[archetypeId] || '') + ': ' + board.pieces.concat(board.touches).map(nameOf).join(', ');
  }

  /*
   * One board on the page. Re-dressing keeps a piece that stays, moves a piece whose place
   * or size changed on the spatial spring, lets a changed piece leave on the fast duration,
   * and lands each new piece with the arrival spring, one stagger step apart, in the order
   * it is put on.
   */
  function Board(el, data) {
    this.el = el;
    this.data = data;
    this.h = data.h;
    this.pieces = {};
    var self = this;
    data.pieces.forEach(function (piece) {
      var node = el.querySelector('.ku-piece[data-slot="' + piece.slot + '"]');
      if (node) self.pieces[piece.slot] = { p: piece, node: node };
    });
  }
  Board.prototype.unit = function () { return this.el.clientWidth / UNITS; };
  Board.prototype.dress = function (board, animate) {
    var el = this.el, self = this, u = this.unit();
    var oldHeight = el.clientHeight;
    var heightChanged = Math.abs(board.h - this.h) > 0.5;
    this.h = board.h;
    this.data = board;
    el.style.setProperty('--h', board.h);
    if (animate && heightChanged && oldHeight) {
      var newHeight = el.clientHeight;
      el.animate([{ height: oldHeight + 'px' }, { height: newHeight + 'px' }], { duration: SPRING_MS, easing: EASE.spatial });
    }
    var next = {}, leaving = [], order = 0;
    board.pieces.forEach(function (piece) { next[piece.slot] = piece; });
    Object.keys(this.pieces).forEach(function (slot) {
      var have = self.pieces[slot];
      if (!next[slot] || !sameArt(next[slot], have.p)) { leaving.push(have); delete self.pieces[slot]; }
    });
    leaving.forEach(function (have) {
      if (!animate) { have.node.remove(); return; }
      have.node.style.zIndex = 0;
      var out = have.node.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(' + 10 * u + 'px)', opacity: 0 }],
        { duration: FAST, easing: 'linear', fill: 'forwards' });
      out.onfinish = function () { have.node.remove(); };
    });
    board.pieces.forEach(function (piece) {
      var have = self.pieces[piece.slot];
      if (have) {
        var o = have.p.t, n = piece.t;
        if (o[0] !== n[0] || o[1] !== n[1] || o[2] !== n[2] || heightChanged) {
          var fresh = pieceNode(piece, board.h);
          have.node.replaceWith(fresh);
          have.node = fresh;
          if (animate) {
            var k = o[2] / n[2], ax = (o[0] - k * n[0]) * u, ay = (o[1] - k * n[1]) * u;
            fresh.style.transformOrigin = '0 0';
            fresh.animate([{ transform: 'translate(' + ax + 'px,' + ay + 'px) scale(' + k + ')' }, { transform: 'none' }],
              { duration: SPRING_MS, easing: EASE.spatial });
          }
        }
        have.p = piece;
        order += 1;
        return;
      }
      var node = pieceNode(piece, board.h);
      el.appendChild(node);
      self.pieces[piece.slot] = { p: piece, node: node };
      if (animate) self.arrive(node, piece, (leaving.length ? FAST : 0) + order * STAGGER, u);
      order += 1;
    });
    board.pieces.forEach(function (piece, index) {
      var have = self.pieces[piece.slot];
      if (have) have.node.style.zIndex = index + 1;
    });
  };
  Board.prototype.arrive = function (node, piece, delay, u) {
    var cx = (piece.box[0] + piece.box[2] / 2) * u, cy = (piece.box[1] + piece.box[3] / 2) * u;
    node.style.transformOrigin = cx + 'px ' + cy + 'px';
    node.animate([{ transform: 'translateY(' + -22 * u + 'px) scale(0.9)' }, { transform: 'none' }],
      { duration: SPRING_MS, delay: delay, easing: EASE.arrival, fill: 'backwards' });
    node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: NORMAL, delay: delay, easing: 'linear', fill: 'backwards' });
  };
  /* Lands every piece again, in dressing order: the story's plate when its moment arrives. */
  Board.prototype.replay = function () {
    var self = this, u = this.unit();
    this.data.pieces.forEach(function (piece, index) {
      var have = self.pieces[piece.slot];
      if (have) self.arrive(have.node, piece, index * STAGGER, u);
    });
  };

  /* ---------------------------------------------------------------- particles
     The first-generation runway's kinds and tempos: motes on a clear sky, wisps under cloud,
     slanted rain and swaying snow, in the condition's own ink, behind the pieces on the
     plate only. A plate off screen draws nothing. */
  function Particles(plate) {
    this.canvas = plate.querySelector('.ku-particles');
    this.host = plate;
    this.ctx = this.canvas.getContext('2d');
    this.parts = [];
    this.kind = null;
    this.ink = '#000';
    this.visible = false;
    this.raf = 0;
    this.w = 0; this.h = 0; this.dpr = 1;
    var self = this;
    new IntersectionObserver(function (entries) { self.visible = entries[0].isIntersecting; self.kick(); }).observe(plate);
    new ResizeObserver(function () { self.size(); self.kick(); }).observe(plate);
    document.addEventListener('visibilitychange', function () { self.kick(); });
  }
  var COUNT = { clear: 14, cloudy: 9, rain: 34, snow: 26 };
  function seeded(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  Particles.prototype.size = function () {
    var rect = this.host.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = rect.width; this.h = rect.height;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  };
  Particles.prototype.set = function (kind, ink) {
    var inkName = '--ku-particle-' + ink.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); });
    // The particles stand on the plate, which is light in both appearances, so their ink
    // is the light condition ink in both and never needs repainting on a theme change.
    this.ink = getComputedStyle(root).getPropertyValue(inkName).trim() || this.ink;
    if (kind !== this.kind) {
      this.kind = kind;
      var random = seeded(7 + ['clear', 'cloudy', 'rain', 'snow'].indexOf(kind)), parts = [];
      var area = Math.max(0.6, Math.min(1.6, (this.w * this.h) / 160000 || 1));
      for (var i = 0; i < Math.round(COUNT[kind] * area); i++) {
        parts.push({ x: random(), y: random(), s: random(), p: random(), sway: random() * 2 - 1 });
      }
      this.parts = parts;
    }
    this.kick();
  };
  Particles.prototype.kick = function () {
    var self = this;
    if (!this.raf) this.raf = requestAnimationFrame(function (now) { self.frame(now); });
  };
  Particles.prototype.frame = function (now) {
    this.raf = 0;
    var ctx = this.ctx, w = this.w, h = this.h, ink = this.ink, kind = this.kind;
    if (!this.visible || document.hidden || !kind) { ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); return; }
    if (this.canvas.width !== Math.round(this.host.clientWidth * this.dpr)) this.size();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var t = now / 1000;
    ctx.fillStyle = ink; ctx.strokeStyle = ink;
    this.parts.forEach(function (q) {
      var v, x, y, d;
      if (kind === 'rain') {
        v = (t / (0.65 * (1 + q.s * 0.6)) + q.p) % 1;
        x = q.x * (w + 0.25 * h) - 0.25 * h * v; y = v * (h + 60) - 30; d = 12 + q.s * 10;
        ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.sin(0.244) * d, y + Math.cos(0.244) * d); ctx.stroke();
      } else if (kind === 'snow') {
        v = (t / (1.5 * (10 / 3 + q.s * 2)) + q.p) % 1;
        x = q.x * w + Math.sin((v + q.p) * Math.PI * 2) * 30 * q.sway; y = v * (h + 60) - 30; d = 3.5 + q.s * 3.5;
        ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(x, y, d / 2, 0, Math.PI * 2); ctx.fill();
      } else if (kind === 'clear') {
        v = 0.5 - 0.5 * Math.cos(((t / (1.5 * (8 / 3 + q.s * 8 / 3)) + q.p) % 1) * Math.PI * 2);
        x = q.x * w - 8 + 18 * v; y = q.y * h + 10 - 24 * v; d = 4 + q.s * 6;
        ctx.globalAlpha = 0.55 + 0.3 * v; ctx.beginPath(); ctx.arc(x, y, d / 2, 0, Math.PI * 2); ctx.fill();
      } else {
        v = (t / (1.5 * (28 / 3 + q.s * 16 / 3)) + q.p) % 1;
        d = 18 + q.s * 26; x = v * (w + 160) - 80; y = q.y * h;
        ctx.globalAlpha = 0.55; ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, d, 4, 2); else ctx.rect(x, y, d, 4);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
    var self = this;
    this.raf = requestAnimationFrame(function (next) { self.frame(next); });
  };

  /* -------------------------------------------------------------------- state */
  var S = { pref: D.initial.pref, sky: D.initial.sky, t: D.initial.t };
  function stateOf() { return D.states[S.pref + '|' + S.sky + '|' + S.t]; }

  var heroPlate = $('ku-hero-plate');
  var heroBoard = new Board(heroPlate.querySelector('.ku-board'), stateOf().hero);
  var heroFx = new Particles(heroPlate);
  heroFx.size();

  var altItems = [].slice.call(document.querySelectorAll('#ku-alts .ku-alt'));
  var alts = altItems.map(function (item, index) {
    return { item: item, name: item.querySelector('.ku-title'), plate: item.querySelector('.ku-plate'),
      board: new Board(item.querySelector('.ku-board'), stateOf().options[index]) };
  });

  /* ----------------------------------------------------------------- readout */
  var shownTemp = String(S.t) + '°';
  function signed(t) { return (t < 0 ? '−' : '') + Math.abs(t) + '°'; }
  function renderTemp(t, animate) {
    var el = $('ku-temp'), text = signed(t);
    if (text === shownTemp) return;
    var previous = shownTemp, up = parseInt(previous.replace('−', '-'), 10) < t;
    shownTemp = text;
    el.innerHTML = text.split('').map(function (c) { return '<span class="ku-temp__digit">' + c + '</span>'; }).join('');
    if (!animate) return;
    var pad = previous.length - text.length;
    [].forEach.call(el.children, function (digit, index) {
      if (previous[index + pad] === digit.textContent) return;
      digit.animate([{ transform: 'translateY(' + (up ? 60 : -60) + '%)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 320, easing: EASE.spatial });
    });
  }
  function swapText(el, text, animate) {
    if (el.textContent === text) return;
    el.textContent = text;
    if (animate) el.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: NORMAL, easing: 'ease-out' });
  }

  function renderTouches(board, animate) {
    var host = $('ku-touches'), list = host.querySelector('ul');
    var signature = board.touches.map(function (piece) { return piece.art.join(); }).join('|');
    if (list.getAttribute('data-signature') === signature) return;
    list.setAttribute('data-signature', signature);
    host.hidden = board.touches.length === 0;
    list.innerHTML = board.touches.map(function (piece) {
      return '<li class="ku-touch"><svg viewBox="0 0 40 40" role="img" aria-label="' + nameOf(piece) + '"><g transform="translate(' +
        piece.t[0] + ' ' + piece.t[1] + ') scale(' + piece.t[2] + ')">' + pieceMarkup(piece) + '</g></svg></li>';
    }).join('');
    if (animate) [].forEach.call(list.children, function (item, index) {
      item.animate([{ transform: 'scale(0.8)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: SPRING_MS, delay: NORMAL + index * STAGGER, easing: EASE.arrival, fill: 'backwards' });
    });
  }

  var liveTimer = 0, altTimer = 0;
  function render(animate, announce) {
    var state = stateOf();
    var sky = D.skies[S.sky];
    var board = state.hero;
    heroPlate.setAttribute('data-atmosphere', sky.atmosphere);
    heroBoard.dress(board, animate);
    heroBoard.el.setAttribute('aria-label', outfitLabel(state.archetypes[0], board));
    heroFx.set(S.sky, sky.ink);
    renderTouches(board, animate);
    renderTemp(S.t, animate);
    swapText($('ku-condition'), NAMES.skies[S.sky], animate);
    swapText($('ku-archetype'), NAMES.archetypes[state.archetypes[0]] || '', animate);
    var range = $('ku-range');
    range.min = sky.range[0]; range.max = sky.range[1]; range.value = S.t;
    range.setAttribute('aria-valuetext', S.t + ' ' + COPY.degrees);
    $('ku-range-min').textContent = signed(sky.range[0]);
    $('ku-range-max').textContent = signed(sky.range[1]);
    markRadios($('ku-skies'), S.sky);
    markRadios($('ku-prefs'), S.pref);
    clearTimeout(altTimer);
    altTimer = setTimeout(function () { renderAlts(animate); }, animate ? 260 : 0);
    clearTimeout(liveTimer);
    if (announce) {
      liveTimer = setTimeout(function () {
        $('ku-live').textContent = S.t + '°, ' + NAMES.skies[S.sky] + '. ' + outfitLabel(state.archetypes[0], board) + '.';
      }, 700);
    }
  }

  function renderAlts(animate) {
    var state = stateOf();
    alts.forEach(function (alt, index) {
      var board = state.options[index];
      alt.item.hidden = !board;
      if (!board) return;
      alt.plate.setAttribute('data-atmosphere', D.skies[S.sky].atmosphere);
      alt.name.textContent = NAMES.archetypes[state.archetypes[index]] || '';
      alt.board.el.setAttribute('aria-label', outfitLabel(state.archetypes[index], board));
      alt.board.dress(board, animate);
    });
  }

  function set(patch, animate, announce) {
    var changed = false;
    Object.keys(patch).forEach(function (key) { if (S[key] !== patch[key]) { S[key] = patch[key]; changed = true; } });
    var range = D.skies[S.sky].range, clamped = Math.max(range[0], Math.min(range[1], S.t));
    if (clamped !== S.t) { S.t = clamped; changed = true; }
    if (!changed) return;
    render(animate !== false, announce);
    if (patch.pref) story.catalogue(S.pref);
  }

  /* -------------------------------------------------------------- radio groups */
  function markRadios(group, value) {
    [].forEach.call(group.querySelectorAll('[role="radio"]'), function (button) {
      var on = button.getAttribute('data-value') === value;
      button.setAttribute('aria-checked', on ? 'true' : 'false');
      button.tabIndex = on ? 0 : -1;
    });
  }
  function radioGroup(group, pick) {
    var values = [].map.call(group.querySelectorAll('[role="radio"]'), function (b) { return b.getAttribute('data-value'); });
    group.addEventListener('click', function (event) {
      var button = event.target.closest('[role="radio"]');
      if (button) { takeOver(); pick(button.getAttribute('data-value')); }
    });
    group.addEventListener('keydown', function (event) {
      var step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      var current = values.indexOf(group.querySelector('[aria-checked="true"]').getAttribute('data-value'));
      var value = values[(current + step + values.length) % values.length];
      takeOver(); pick(value);
      group.querySelector('[data-value="' + value + '"]').focus();
    });
  }
  radioGroup($('ku-skies'), function (sky) { set({ sky: sky }, true, true); });
  radioGroup($('ku-prefs'), function (pref) { set({ pref: pref }, true, true); });

  $('ku-range').addEventListener('input', function (event) {
    takeOver();
    set({ t: parseInt(event.target.value, 10) }, true, true);
  });

  /* Drag the plate sideways: one temperature step per 22 CSS pixels, and a flick carries on
     for up to four steps. Vertical travel stays with the page. */
  (function drag() {
    var start = null, base = 0, lastX = 0, lastT = 0, velocity = 0, STEP = 22;
    heroPlate.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      start = event.clientX; base = S.t; lastX = event.clientX; lastT = event.timeStamp; velocity = 0;
      heroPlate.setPointerCapture(event.pointerId);
      heroPlate.classList.add('is-dragging');
      takeOver();
    });
    heroPlate.addEventListener('pointermove', function (event) {
      if (start === null) return;
      var dt = event.timeStamp - lastT;
      if (dt > 0) velocity = 0.8 * ((event.clientX - lastX) / dt) + 0.2 * velocity;
      lastX = event.clientX; lastT = event.timeStamp;
      set({ t: base + Math.round((event.clientX - start) / STEP) * D.step }, true, true);
    });
    function end() {
      if (start === null) return;
      start = null;
      heroPlate.classList.remove('is-dragging');
      var extra = Math.max(-4, Math.min(4, Math.round(velocity * 140 / STEP)));
      if (Math.abs(velocity) > 0.5 && extra) {
        var n = 0, direction = extra > 0 ? 1 : -1, total = Math.abs(extra);
        (function tick() {
          if (n++ >= total) return;
          set({ t: S.t + direction * D.step }, true, true);
          setTimeout(tick, 70 + n * 25);
        })();
      }
    }
    heroPlate.addEventListener('pointerup', end);
    heroPlate.addEventListener('pointercancel', end);
  })();

  /* ------------------------------------------------------------ the sample day
     A day plays on its own a moment after the page opens. The pause control is always
     visible; taking any control stops the day, and the play control starts it again.
     It rests while the hero is off screen, so nothing below changes under the reader. */
  var DAY = [
    { hour: '07:00', sky: 'cloudy', t: 8 }, { hour: '09:00', sky: 'clear', t: 12 },
    { hour: '12:00', sky: 'clear', t: 20 }, { hour: '14:00', sky: 'clear', t: 24 },
    { hour: '16:00', sky: 'rain', t: 16 }, { hour: '18:00', sky: 'rain', t: 12 },
    { hour: '20:00', sky: 'cloudy', t: 10 }
  ];
  var play = { on: false, user: false, index: 0, timer: 0, heroVisible: true };
  var playButton = $('ku-play');
  function renderPlay() {
    $('ku-play-label').textContent = play.on ? COPY.pause : COPY.play;
    playButton.querySelector('.ku-play__pause').hidden = !play.on;
    playButton.querySelector('.ku-play__play').hidden = play.on;
  }
  function showClock(hour) { $('ku-clock').textContent = COPY.clock + ' · ' + hour; }
  function step() {
    clearTimeout(play.timer);
    if (!play.on || !play.heroVisible) return;
    var moment = DAY[play.index % DAY.length];
    var range = D.skies[moment.sky].range;
    showClock(moment.hour);
    if (S.sky !== moment.sky) set({ sky: moment.sky }, true, false);
    var target = Math.max(range[0], Math.min(range[1], moment.t));
    (function walk() {
      if (!play.on || !play.heroVisible) return;
      if (S.t === target) {
        play.index += 1;
        play.timer = setTimeout(step, 2600);
        return;
      }
      set({ t: S.t + (target > S.t ? D.step : -D.step) }, true, false);
      play.timer = setTimeout(walk, 160);
    })();
  }
  function startPlay() { play.on = true; renderPlay(); step(); }
  function stopPlay() { play.on = false; clearTimeout(play.timer); renderPlay(); }
  function takeOver() { play.user = true; if (play.on) stopPlay(); }
  playButton.addEventListener('click', function () {
    if (play.on) { play.user = true; stopPlay(); } else { play.user = true; startPlay(); }
  });
  new IntersectionObserver(function (entries) {
    play.heroVisible = entries[0].isIntersecting;
    if (play.on && play.heroVisible) step();
  }, { threshold: 0.25 }).observe(heroPlate);
  renderPlay();
  setTimeout(function () { if (!play.user && !play.on) startPlay(); }, 2500);

  /* ----------------------------------------------------------------- the story */
  var story = (function () {
    var plate = $('ku-story-plate');
    if (!plate) return { catalogue: function () {} };
    var fx = new Particles(plate);
    fx.size();
    var moments = D.storyBoards[S.pref];
    var boards = [].map.call(plate.querySelectorAll('.ku-board'), function (el, index) { return new Board(el, moments[index].board); });
    var steps = [].slice.call(document.querySelectorAll('.ku-story__step'));
    var active = -1;
    function activate(index) {
      if (index === active) return;
      active = index;
      var moment = D.story[index], data = D.storyBoards[S.pref][index];
      plate.setAttribute('data-atmosphere', data.atmosphere);
      fx.set(moment.sky, moment.ink);
      boards.forEach(function (board, i) { board.el.classList.toggle('is-active', i === index); board.el.setAttribute('aria-hidden', i === index ? 'false' : 'true'); });
      steps.forEach(function (stepEl, i) { stepEl.classList.toggle('is-active', i === index); });
      boards[index].replay();
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) activate(Number(entry.target.getAttribute('data-moment')));
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach(function (stepEl) { observer.observe(stepEl); });
    activate(0);
    return {
      catalogue: function (pref) {
        var list = D.storyBoards[pref];
        boards.forEach(function (board, index) {
          board.dress(list[index].board, index === active);
          board.el.setAttribute('aria-label', outfitLabel(list[index].archetype, list[index].board));
          var name = steps[index] && steps[index].querySelector('[data-archetype]');
          if (name) name.textContent = NAMES.archetypes[list[index].archetype] || '';
        });
      }
    };
  })();

  render(false, false);
})();
