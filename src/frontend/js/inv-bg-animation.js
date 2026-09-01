/**
 * inv-bg-animation.js  – Inventory-themed floating icon canvas animation.
 * Colors match the app palette: indigo #6366f1 · violet #8b5cf6 · cyan #06b6d4
 */
(function () {
  'use strict';

  // Full opaque palette colors; opacity is applied via globalAlpha only
  var DARK_COLORS  = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#a78bfa'];
  var LIGHT_COLORS = ['#4f46e5','#7c3aed','#0891b2','#059669','#d97706','#6d28d9'];

  function getPalette() {
    return document.documentElement.getAttribute('data-theme') === 'light'
      ? LIGHT_COLORS : DARK_COLORS;
  }

  /* ── Icon drawers ─────────────────────────────────────────────────────────── */

  function drawBox(ctx, size) {
    var s = size, h = s * 0.55;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    // Body
    ctx.strokeRect(-s/2, -h/2, s, h);
    // Lid
    ctx.beginPath();
    ctx.moveTo(-s/2, -h/2);
    ctx.lineTo(-s*0.3, -h/2 - s*0.25);
    ctx.lineTo( s*0.3, -h/2 - s*0.25);
    ctx.lineTo( s/2,   -h/2);
    ctx.stroke();
    // Tape
    ctx.beginPath();
    ctx.moveTo(-s*0.07, -h/2); ctx.lineTo(-s*0.03, -h/2 - s*0.25);
    ctx.moveTo( s*0.07, -h/2); ctx.lineTo( s*0.03, -h/2 - s*0.25);
    ctx.stroke();
    // Center seam
    ctx.save();
    ctx.setLineDash([4,4]);
    ctx.beginPath();
    ctx.moveTo(0, -h/2); ctx.lineTo(0, h/2);
    ctx.stroke();
    ctx.restore();
  }

  function drawBarcode(ctx, size) {
    var w = size, h = size * 0.6;
    var bars = [2,1,3,1,2,1,1,3,2,1,2,1,3];
    var total = bars.reduce(function(a,b){return a+b;},0);
    var unit = w / total;
    var cx = -w/2;
    ctx.lineJoin = 'round';
    bars.forEach(function(bw, i) {
      if (i % 2 === 0) {
        ctx.lineWidth = bw * unit;
        ctx.beginPath();
        ctx.moveTo(cx + bw*unit/2, -h/2);
        ctx.lineTo(cx + bw*unit/2,  h/2);
        ctx.stroke();
      }
      cx += bw * unit;
    });
    // Number strip below
    ctx.lineWidth = 1;
    ctx.save();
    ctx.globalAlpha *= 0.5;
    ctx.strokeRect(-w/2, h/2 + 3, w, 6);
    ctx.restore();
  }

  function drawRack(ctx, size) {
    var w = size, h = size * 0.9, shelves = 3;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    // Uprights
    ctx.beginPath();
    ctx.moveTo(-w/2, -h/2); ctx.lineTo(-w/2, h/2);
    ctx.moveTo( w/2, -h/2); ctx.lineTo( w/2, h/2);
    ctx.stroke();
    // Shelves + mini boxes
    for (var i = 0; i <= shelves; i++) {
      var sy = -h/2 + (h/shelves) * i;
      ctx.beginPath();
      ctx.moveTo(-w/2, sy); ctx.lineTo(w/2, sy);
      ctx.stroke();
      if (i < shelves) {
        var bh = (h/shelves)*0.5, bw = w*0.27;
        ctx.lineWidth = 1.2;
        ctx.save();
        ctx.globalAlpha *= 0.7;
        ctx.strokeRect(-w*0.32, sy + (h/shelves-bh)/2, bw, bh);
        ctx.strokeRect( w*0.04, sy + (h/shelves-bh)/2, bw, bh);
        ctx.restore();
        ctx.lineWidth = 1.8;
      }
    }
  }

  function drawArrowUp(ctx, size) {
    var s = size * 0.55;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';
    ctx.beginPath();
    ctx.moveTo(0, s); ctx.lineTo(0, -s*0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s*0.5, -s*0.05);
    ctx.lineTo(0, -s);
    ctx.lineTo( s*0.5, -s*0.05);
    ctx.stroke();
  }

  function drawQR(ctx, size) {
    var s = size * 0.42;
    ctx.lineWidth = 1.5;
    // 3 corner squares
    [[-s,-s],[s*0.35,-s],[-s,s*0.35]].forEach(function(c) {
      ctx.strokeRect(c[0], c[1], s*0.6, s*0.6);
      ctx.strokeRect(c[0]+s*0.13, c[1]+s*0.13, s*0.34, s*0.34);
    });
    // Body dots
    ctx.save();
    ctx.globalAlpha *= 0.8;
    [[s*0.4,s*0.4],[s*0.6,s*0.1],[s*0.1,s*0.6],[s*0.6,s*0.6]].forEach(function(d) {
      ctx.beginPath();
      ctx.arc(d[0], d[1], size*0.045, 0, Math.PI*2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawClipboard(ctx, size) {
    var w = size*0.65, h = size*0.85;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.strokeRect(-w/2, -h/2 + size*0.08, w, h - size*0.08);
    // Clip
    ctx.beginPath();
    ctx.arc(0, -h/2 + size*0.08, size*0.11, Math.PI, 0);
    ctx.stroke();
    // Checklist lines
    ctx.lineWidth = 1.2;
    ctx.save();
    ctx.globalAlpha *= 0.75;
    [-h*0.18, h*0.02, h*0.22].forEach(function(ly) {
      ctx.beginPath();
      ctx.moveTo(-w*0.3, ly); ctx.lineTo(-w*0.17, ly+4); ctx.lineTo(-w*0.03, ly-4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w*0.0, ly); ctx.lineTo(w*0.35, ly);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawTruck(ctx, size) {
    var w = size, h = size*0.55;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    // Trailer body
    ctx.strokeRect(-w*0.5, -h/2, w*0.65, h);
    // Cab
    ctx.beginPath();
    ctx.moveTo( w*0.15, -h/2);
    ctx.lineTo( w*0.5,  -h/2);
    ctx.lineTo( w*0.5,   h/2);
    ctx.lineTo( w*0.15,  h/2);
    ctx.stroke();
    // Cab roof slope
    ctx.beginPath();
    ctx.moveTo(w*0.15, -h/2);
    ctx.lineTo(w*0.35, -h/2 - h*0.4);
    ctx.lineTo(w*0.5,  -h/2 - h*0.4);
    ctx.lineTo(w*0.5,  -h/2);
    ctx.stroke();
    // Wheels
    ctx.beginPath();
    ctx.arc(-w*0.2, h/2 + size*0.1, size*0.09, 0, Math.PI*2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w*0.38, h/2 + size*0.1, size*0.09, 0, Math.PI*2);
    ctx.stroke();
  }

  var DRAW_FNS = [drawBox, drawBarcode, drawRack, drawArrowUp, drawQR, drawClipboard, drawTruck];

  /* ── Particle ─────────────────────────────────────────────────────────────── */

  function Particle(canvas) { this.reset(canvas, true); }

  Particle.prototype.reset = function(canvas, initial) {
    this.x       = Math.random() * canvas.width;
    this.y       = initial ? Math.random() * canvas.height : canvas.height + 80;
    this.size    = 30 + Math.random() * 50;          // 30 – 80 px
    this.speedX  = (Math.random() - 0.5) * 0.3;
    this.speedY  = -(0.2 + Math.random() * 0.35);    // float upward
    this.rot     = Math.random() * Math.PI * 2;
    this.rotSpd  = (Math.random() - 0.5) * 0.005;
    this.alpha   = 0.20 + Math.random() * 0.25;      // 0.20 – 0.45  clearly visible
    this.color   = null; // set per-frame from palette
    this.colIdx  = Math.floor(Math.random() * 6);
    this.drawFn  = DRAW_FNS[Math.floor(Math.random() * DRAW_FNS.length)];
  };

  Particle.prototype.update = function(canvas) {
    this.x += this.speedX;
    this.y += this.speedY;
    this.rot += this.rotSpd;
    if (this.y < -100 || this.x < -100 || this.x > canvas.width + 100) {
      this.reset(canvas, false);
    }
  };

  Particle.prototype.draw = function(ctx, palette) {
    var col = palette[this.colIdx];
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.strokeStyle = col;
    ctx.fillStyle   = col;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    this.drawFn(ctx, this.size);
    ctx.restore();
  };

  /* ── Init ─────────────────────────────────────────────────────────────────── */

  function init() {
    var canvas = document.getElementById('inv-bg-canvas');
    if (!canvas) { console.warn('[inv-anim] canvas not found'); return; }

    var ctx = canvas.getContext('2d');
    var particles = [];
    var palette   = getPalette();
    var animId;

    function resize() {
      canvas.width  = window.innerWidth  || document.documentElement.clientWidth  || 1280;
      canvas.height = window.innerHeight || document.documentElement.clientHeight || 800;
    }

    function spawn() {
      var count = Math.max(20, Math.min(55, Math.floor((canvas.width * canvas.height) / 22000)));
      particles = [];
      for (var i = 0; i < count; i++) { particles.push(new Particle(canvas)); }
    }

    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      palette = getPalette();
      for (var i = 0; i < particles.length; i++) {
        particles[i].update(canvas);
        particles[i].draw(ctx, palette);
      }
      animId = requestAnimationFrame(loop);
    }

    resize();
    spawn();
    loop();

    window.addEventListener('resize', function() { resize(); spawn(); });

    if (window.MutationObserver) {
      new MutationObserver(function() { palette = getPalette(); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
  }

  // Use window load to ensure layout is complete and canvas has proper dimensions
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }

})();
