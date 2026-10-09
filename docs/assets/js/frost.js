/*
 * Frost on the glass. When the dressing stage reaches its last, snowy scene, frost creeps
 * over the plate from its edges and corners, with fine branching crystals, and greys the
 * board. A finger or a mouse wipes it; a wiped patch slowly frosts over again. If nobody
 * touches it, one soft stroke shows the gesture and a line under the plate says what to
 * do. Leaving the scene, or scrolling on past the stage, melts it.
 *
 * The frost is a mask over two textures painted once per size: a haze and its crystals.
 * The mask is a coarse field (one cell per few pixels) scaled up smoothly, so the edges
 * stay soft and each frame costs little. Frames run only while something changes.
 * Without this file nothing shows. Motion always plays (product-decisions.md).
 */
(function () {
  'use strict';

  var plate = document.querySelector('.ku-dress__plate');
  var dress = document.querySelector('.ku-dress');
  if (!plate || !dress || !window.requestAnimationFrame) return;
  var looks = plate.querySelectorAll('.ku-dress__look');
  var snow = looks[looks.length - 1];
  if (!snow) return;
  var art = plate.parentNode;
  var root = document.documentElement;

  /* ------------------------------------------------------------- colours */
  function rgb(name, fallback) {
    var hex = getComputedStyle(root).getPropertyValue(name).trim() || fallback;
    var n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  var CLOUD = rgb('--ku-brand-cloud-white', '#EFF4F3');
  var MIST = rgb('--ku-brand-soft-mist', '#F4F6F5');
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  /* -------------------------------------------------------------- the DOM */
  var canvas = document.createElement('canvas');
  canvas.className = 'ku-frost';
  canvas.setAttribute('aria-hidden', 'true');
  plate.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var hint = null, oldHint = art.querySelector('.ku-dress__hint');
  var hintText = plate.getAttribute('data-frost-hint');
  if (hintText) {
    hint = document.createElement('p');
    hint.className = 'ku-caption ku-frost__hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.textContent = hintText;
    art.classList.add('ku-frost-host');
    art.appendChild(hint);
  }

  function seeded(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  /* ------------------------------------------------------------ the field */
  var CELL = 4; /* CSS pixels per mask cell */
  var w = 0, h = 0, dpr = 1, cols = 0, rows = 0;
  var start = null, wipe = null, rate = null; /* per cell: when it frosts, how wiped it is, how fast it heals */
  var haze, crystals, maskA, maskB, scratch, imgA, imgB;

  function layer(cw, ch) { var c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; }

  /* Value noise on the cell grid, three octaves, in 0..1. */
  function noiseField(random) {
    var out = new Float32Array(cols * rows), amp = 0.5, total = 0;
    for (var o = 0; o < 3; o++) {
      var step = [10, 5, 2.5][o], gw = Math.ceil(cols / step) + 2, gh = Math.ceil(rows / step) + 2, g = [];
      for (var k = 0; k < gw * gh; k++) g.push(random());
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var fx = x / step, fy = y / step, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
          tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
          var a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
          out[y * cols + x] += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
        }
      }
      total += amp; amp /= 2;
    }
    for (var i = 0; i < out.length; i++) out[i] /= total;
    return out;
  }

  /* One fern of ice: a stem that bends a little, with side shoots at sixty degrees that
     carry their own smaller shoots. */
  function fern(c, random, x, y, angle, length, width, depth) {
    var steps = Math.max(2, Math.round(length / 6)), seg = length / steps, a = angle;
    c.lineWidth = width;
    c.beginPath(); c.moveTo(x, y);
    var points = [];
    for (var s = 0; s < steps; s++) {
      a += (random() - 0.5) * 0.18;
      x += Math.cos(a) * seg; y += Math.sin(a) * seg;
      c.lineTo(x, y); points.push([x, y, a]);
    }
    c.stroke();
    if (depth <= 0) return;
    for (var p = 0; p < points.length - 1; p++) {
      var q = points[p], fade = 1 - p / points.length;
      for (var side = -1; side <= 1; side += 2) {
        if (random() < 0.25) continue;
        var shoot = length * (0.2 + random() * 0.2) * fade;
        fern(c, random, q[0], q[1], q[2] + side * (Math.PI / 3 + (random() - 0.5) * 0.25), shoot, width * 0.75, depth - 1);
      }
    }
  }

  function size() {
    var rect = plate.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    if (Math.abs(rect.width - w) < 1 && Math.abs(rect.height - h) < 1) return true;
    w = rect.width; h = rect.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var W = canvas.width, H = canvas.height, random = seeded(311);
    cols = Math.ceil(w / CELL) + 1; rows = Math.ceil(h / CELL) + 1;

    /* When each cell frosts: corners first, then the edges, the middle last, with a
       ragged noisy front. */
    var noise = noiseField(random), heal = noiseField(seeded(97));
    start = new Float32Array(cols * rows); rate = new Float32Array(cols * rows);
    var keepWipe = wipe && wipe.length === cols * rows ? wipe : null;
    wipe = keepWipe || new Float32Array(cols * rows);
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var nx = Math.min(x, cols - 1 - x) / (cols / 2), ny = Math.min(y, rows - 1 - y) / (rows / 2);
        var i = y * cols + x;
        start[i] = 0.55 * Math.min(nx, ny) + 0.45 * nx * ny + (noise[i] - 0.5) * 0.55;
        rate[i] = 0.6 + 0.8 * heal[i];
      }
    }
    maskA = layer(cols, rows); maskB = layer(cols, rows);
    imgA = maskA.getContext('2d').createImageData(cols, rows);
    imgB = maskB.getContext('2d').createImageData(cols, rows);
    scratch = layer(W, H);

    /* The haze: soft mist, thicker towards the rim, grained, with clear channels beside
       each crystal the way real frost leaves them. */
    haze = layer(W, H);
    var hc = haze.getContext('2d');
    hc.scale(dpr, dpr);
    hc.fillStyle = rgba(MIST, 0.7); hc.fillRect(0, 0, w, h);
    var rim = hc.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.hypot(w, h) / 2);
    rim.addColorStop(0, rgba(CLOUD, 0)); rim.addColorStop(1, rgba(CLOUD, 0.38));
    hc.fillStyle = rim; hc.fillRect(0, 0, w, h);
    for (var g = 0; g < w * h / 40; g++) {
      hc.fillStyle = rgba(random() < 0.5 ? CLOUD : MIST, 0.25 + random() * 0.5);
      hc.fillRect(random() * w, random() * h, 0.6 + random(), 0.6 + random());
    }

    /* The crystals grow from the edges and the corners inwards. */
    crystals = layer(W, H);
    var cc = crystals.getContext('2d');
    cc.scale(dpr, dpr); cc.lineCap = 'round'; cc.lineJoin = 'round';
    var seeds = [], perimeter = 2 * (w + h), count = Math.round(perimeter / 26);
    for (var s = 0; s < count; s++) {
      var d = random() * perimeter, px, py, inward;
      if (d < w) { px = d; py = 0; inward = Math.PI / 2; }
      else if (d < w + h) { px = w; py = d - w; inward = Math.PI; }
      else if (d < 2 * w + h) { px = 2 * w + h - d; py = h; inward = -Math.PI / 2; }
      else { px = 0; py = perimeter - d; inward = 0; }
      seeds.push([px, py, inward + (random() - 0.5) * 1.6, 24 + random() * 46]);
    }
    [[0, 0, Math.PI / 4], [w, 0, 3 * Math.PI / 4], [w, h, -3 * Math.PI / 4], [0, h, -Math.PI / 4]].forEach(function (corner) {
      for (var k = 0; k < 4; k++) seeds.push([corner[0], corner[1], corner[2] + (random() - 0.5) * 1.2, 50 + random() * 60]);
    });
    seeds.forEach(function (seedPoint) {
      var r = seeded(1 + Math.floor(random() * 1e6));
      hc.globalCompositeOperation = 'destination-out';
      hc.strokeStyle = 'rgba(0,0,0,0.22)'; hc.lineCap = 'round';
      fern(hc, seeded(r() * 1e6 + 1), seedPoint[0], seedPoint[1], seedPoint[2], seedPoint[3], 2.6, 2);
      hc.globalCompositeOperation = 'source-over';
      cc.strokeStyle = rgba(CLOUD, 0.95);
      fern(cc, r, seedPoint[0], seedPoint[1], seedPoint[2], seedPoint[3], 1.1, 2);
    });
    for (var sp = 0; sp < perimeter / 6; sp++) {
      cc.fillStyle = rgba(CLOUD, 0.5 + random() * 0.5);
      var edge = random() * 0.25, side = random() * 4 | 0, along = random();
      var sx = side === 0 ? along * w : side === 1 ? w - edge * w : side === 2 ? along * w : edge * w;
      var sy = side === 0 ? edge * h : side === 1 ? along * h : side === 2 ? h - edge * h : along * h;
      cc.beginPath(); cc.arc(sx, sy, 0.5 + random() * 0.8, 0, Math.PI * 2); cc.fill();
    }
    dirty = true;
    return true;
  }

  /* ------------------------------------------------------------ the state */
  var GROW = 1.2, MELT = 0.45, HEAL = 6, HOLD = 1.3, LEAD = 0.12, TOP = 1.5;
  var level = 0, target = 0, last = 0, raf = 0, dirty = false;
  var frostTimer = 0, demoTimer = 0, demoDone = false, touched = false, demo = null;
  var brush = null; /* the fingertip's last point, in CSS pixels */

  function smooth(e0, e1, v) { var t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

  function paint() {
    var A = imgA.data, B = imgB.data, n = cols * rows, g = level - 0.12;
    for (var i = 0; i < n; i++) {
      var clear = 1 - Math.min(1, wipe[i]);
      A[i * 4 + 3] = 255 * smooth(start[i], start[i] + 0.18, g) * clear;
      B[i * 4 + 3] = 255 * smooth(start[i], start[i] + 0.06, g + LEAD) * clear;
    }
    maskA.getContext('2d').putImageData(imgA, 0, 0);
    maskB.getContext('2d').putImageData(imgB, 0, 0);
    var W = canvas.width, H = canvas.height, sw = cols * CELL * dpr, sh = rows * CELL * dpr;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    if (level <= 0.001) return;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(haze, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(maskA, 0, 0, sw, sh);
    var sc = scratch.getContext('2d');
    sc.globalCompositeOperation = 'source-over';
    sc.clearRect(0, 0, W, H);
    sc.drawImage(crystals, 0, 0);
    sc.globalCompositeOperation = 'destination-in';
    sc.imageSmoothingEnabled = true;
    sc.drawImage(maskB, 0, 0, sw, sh);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(scratch, 0, 0);
    if (demo && demo.tip) {
      /* The demonstrating fingertip: a soft ring where the stroke is. */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = rgba(CLOUD, 0.9 * demo.tip.a); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(demo.tip.x, demo.tip.y, 15, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = rgba(CLOUD, 0.35 * demo.tip.a); ctx.fill();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  /* Clear the cells under one dab of a fingertip of radius r (CSS pixels). */
  function dab(x, y, r) {
    var cr = r / CELL, cx = x / CELL, cy = y / CELL;
    var x0 = Math.max(0, Math.floor(cx - cr)), x1 = Math.min(cols - 1, Math.ceil(cx + cr));
    var y0 = Math.max(0, Math.floor(cy - cr)), y1 = Math.min(rows - 1, Math.ceil(cy + cr));
    for (var yy = y0; yy <= y1; yy++) {
      for (var xx = x0; xx <= x1; xx++) {
        var d = Math.hypot(xx - cx, yy - cy) / cr;
        if (d >= 1) continue;
        var v = HOLD * (1 - smooth(0.55, 1, d)), i = yy * cols + xx;
        if (v > wipe[i]) wipe[i] = v;
      }
    }
  }
  function stroke(x, y, r) {
    if (brush) {
      var dist = Math.hypot(x - brush.x, y - brush.y), n = Math.max(1, Math.ceil(dist / (r * 0.35)));
      for (var k = 1; k <= n; k++) dab(brush.x + (x - brush.x) * k / n, brush.y + (y - brush.y) * k / n, r);
    } else dab(x, y, r);
    brush = { x: x, y: y };
    kick();
  }

  function frame(now) {
    raf = 0;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    var busy = false;
    if (level < target) { level = Math.min(target, level + dt * TOP / GROW); busy = true; }
    else if (level > target) { level = Math.max(target, level - dt * TOP / MELT); busy = true; }
    if (level > 0) {
      for (var i = 0, n = wipe.length; i < n; i++) {
        if (wipe[i] > 0) { wipe[i] = Math.max(0, wipe[i] - dt * rate[i] * HOLD / HEAL); busy = true; }
      }
    }
    if (demo) {
      /* A gentle S across the middle of the plate, eased like a hand. A late frame still
         finishes the stroke: the last dab joins up with the one before it. */
      var t = Math.min(1, Math.max(0, (now - demo.t0) / demo.ms));
      var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      var x = w * (0.18 + 0.64 * e), y = h * (0.42 + 0.1 * Math.sin(e * Math.PI * 2));
      stroke(x, y, Math.min(w, h) * 0.11);
      demo.tip = { x: x, y: y, a: Math.sin(Math.PI * t) };
      if (t >= 1) { brush = null; demo = null; }
      busy = true;
    }
    if (busy || dirty) { paint(); dirty = false; }
    if (busy) raf = requestAnimationFrame(frame); else last = 0;
  }
  function kick() { if (!raf) { raf = requestAnimationFrame(frame); } }

  /* --------------------------------------------------------- frost or melt */
  function placeHint() {
    if (!hint) return;
    var ref = oldHint && oldHint.offsetHeight ? oldHint : null;
    var top = ref ? ref.offsetTop : plate.offsetTop + plate.offsetHeight + 8;
    hint.style.top = top + 'px';
    hint.style.left = plate.offsetLeft + 'px';
    hint.style.width = plate.offsetWidth + 'px';
  }
  function showHint(on) {
    if (!hint) return;
    if (on) placeHint();
    art.classList.toggle('ku-frost-hinting', on);
  }

  function frost(on) {
    if (on === (target > 0)) return;
    clearTimeout(frostTimer); clearTimeout(demoTimer);
    if (on) {
      if (!size()) return;
      frostTimer = setTimeout(function () {
        size();
        target = TOP; touched = false;
        canvas.classList.add('is-on');
        kick();
        demoTimer = setTimeout(function () {
          if (touched || target <= 0) return;
          showHint(true);
          if (!demoDone) { demoDone = true; brush = null; demo = { t0: performance.now(), ms: 1100 }; kick(); }
        }, 2500);
      }, 350);
      target = 0.0001; /* claimed, so a second call is a no-op until the timer runs */
    } else {
      target = 0; brush = null; demo = null;
      canvas.classList.remove('is-on');
      showHint(false);
      kick();
    }
  }

  /* The snow scene is current and the stage is still pinned. Scrolling on past the stage
     melts the frost, so it can never keep the board hidden. */
  var checking = 0;
  function sync() {
    checking = 0;
    var cold = snow.classList.contains('is-current');
    var pinned = dress.getBoundingClientRect().bottom >= window.innerHeight - 2;
    frost(cold && pinned);
  }
  function schedule() { if (!checking) checking = requestAnimationFrame(sync); }
  document.addEventListener('ku:stage', schedule);
  window.addEventListener('scroll', schedule, { passive: true });
  if ('MutationObserver' in window) {
    new MutationObserver(schedule).observe(snow, { attributes: true, attributeFilter: ['class'] });
  }
  window.addEventListener('resize', function () { if (target > 0 && size()) { placeHint(); kick(); } });

  /* ------------------------------------------------------------- wiping */
  function point(event) {
    var rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  var down = false;
  function wiped(event) {
    if (target <= 0) return;
    if (event.pointerType !== 'mouse' && !down) return;
    var p = point(event);
    if (!touched) { touched = true; clearTimeout(demoTimer); showHint(false); }
    demo = null;
    stroke(p.x, p.y, event.pointerType === 'mouse' ? 26 : 30);
  }
  canvas.addEventListener('pointerdown', function (event) { down = true; brush = null; wiped(event); });
  canvas.addEventListener('pointermove', wiped);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (type) {
    canvas.addEventListener(type, function () { down = false; brush = null; });
  });

  schedule();
})();
