(() => {
  'use strict';

  const YOKAI = [
    { id: 'umbrella', name: 'からかさ', emoji: '☂️', speed: 1.08, sway: 1.4, size: 1.04 },
    { id: 'kappa', name: 'かっぱ', emoji: '🐸', speed: .94, sway: 1.1, size: .94 },
    { id: 'dracula', name: 'ドラキュラ', emoji: '🦇', speed: 1.25, sway: 1.3, size: 1 },
    { id: 'ittanmomen', name: '一反木綿', emoji: '👻', speed: 1.04, sway: 1.8, size: 1.02 },
    { id: 'gashadokuro', name: 'がしゃどくろ', emoji: '💀', speed: .72, sway: .55, size: 1.22 },
    { id: 'tengu', name: 'からすてんぐ', emoji: '👺', speed: 1.35, sway: 1.45, size: 1.15 },
    { id: 'rokuro', name: 'ろくろくび', emoji: '👘', speed: .97, sway: 1.25, size: 1.01 },
    { id: 'nurikabe', name: 'ぬりかべ', emoji: '🪨', speed: .68, sway: .5, size: 1.18 }
  ];
  const TECHNIQUES = [
    { id: 'comet', name: 'きらきらダッシュ', color: '#88faff', duration: 1.55 },
    { id: 'tornado', name: 'ぐるぐるトルネード', color: '#cba7ff', duration: 1.85 },
    { id: 'teleport', name: 'ワープ！', color: '#ffbeed', duration: 1.3 },
    { id: 'bounce', name: 'ぴょんぴょんジャンプ', color: '#ffdf75', duration: 1.4 },
    { id: 'reverse', name: 'くるっとターン', color: '#ff9eaa', duration: 1.35 },
    { id: 'burst', name: 'キラキラばくはつ', color: '#ffe594', duration: 1.5 }
  ];
  const TAU = Math.PI * 2;
  const $ = id => document.getElementById(id);
  const el = {
    experience: $('experience'), scene: $('scene'), video: $('camera'), canvas: $('yokaiCanvas'),
    backdrop: $('demoBackdrop'), status: $('cameraStatus'), statusText: $('cameraStatusText'),
    welcome: $('welcome'), start: $('startCamera'), demo: $('watchDemo'), retry: $('cameraRetry'),
    flip: $('flipCamera'), modes: document.querySelector('.capture-modes'), shuffle: $('shuffle'), shutter: $('shutter'),
    skill: $('skillMessage'), toast: $('toast'), review: $('photoReview'), captured: $('capturedPhoto'),
    capturedVideo: $('capturedVideo'), reviewTitle: $('reviewTitle'), reviewNote: $('reviewNote'),
    recordingIndicator: $('recordingIndicator'), recordingTime: $('recordingTime'), hint: $('cameraHint'),
    save: $('savePhoto'), close: $('closeReview'), flash: $('flash')
  };
  const ctx = el.canvas.getContext('2d', { alpha: true });
  const random = (min, max) => min + Math.random() * (max - min);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const smooth = n => n * n * (3 - 2 * n);
  const state = {
    count: 3 + Math.floor(Math.random() * 3), width: 1, height: 1, dpr: 1,
    actors: [], particles: [], facing: 'environment', stream: null,
    cameraReady: false, cameraBusy: false, images: new Map(), mode: 'photo',
    recorder: null, recording: false, recordingStarted: 0, lastComposite: 0, recordingCanvas: null,
    recordingContext: null, recordingStream: null, chunks: [],
    lastTime: performance.now(), skillUntil: 0, toastTimer: 0, reviewUrl: null
  };

  for (const y of YOKAI) {
    const img = new Image();
    img.decoding = 'async';
    img.src = `images/${y.id}.png`;
    state.images.set(y.id, img);
  }

  function setCameraUI(active) {
    state.cameraReady = active;
    el.video.classList.toggle('active', active);
    el.video.classList.toggle('mirrored', active && state.facing === 'user');
    el.backdrop.classList.toggle('hidden', active);
    el.status.classList.toggle('live', active);
    el.statusText.textContent = active ? 'カメラ ON' : 'デモ表示中';
    el.flip.disabled = !active || state.recording;
    el.shutter.disabled = !active;
    el.retry.hidden = active;
  }

  function stopCamera() {
    if (state.recording) stopVideo();
    if (state.stream) state.stream.getTracks().forEach(track => track.stop());
    state.stream = null;
    el.video.srcObject = null;
    setCameraUI(false);
  }

  async function startCamera() {
    if (state.cameraBusy) return;
    state.cameraBusy = true;
    el.start.disabled = true;
    el.start.textContent = 'カメラを準備中…';
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        throw new Error('安全な接続（HTTPS）のブラウザで開いてください');
      }
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: state.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      state.stream = stream;
      el.video.srcObject = stream;
      await el.video.play();
      setCameraUI(true);
      el.welcome.hidden = true;
      showToast('カメラに ようかいが あらわれた！');
    } catch (error) {
      stopCamera();
      const message = error?.name === 'NotAllowedError'
        ? 'カメラの使用を許可してね。ブラウザの設定から再試行できるよ。'
        : error?.name === 'NotFoundError'
          ? 'カメラが見つかりません。別の端末で試してね。'
          : error?.message || 'カメラを使えませんでした。';
      showToast(message, 5600);
      el.welcome.hidden = false;
    } finally {
      state.cameraBusy = false;
      el.start.disabled = false;
      el.start.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h4l2-2h4l2 2h4v12H4z"/><circle cx="12" cy="13" r="3.4"/></svg>カメラをはじめる';
    }
  }

  function showToast(message, duration = 2600) {
    clearTimeout(state.toastTimer);
    el.toast.textContent = message;
    el.toast.classList.add('visible');
    state.toastTimer = setTimeout(() => el.toast.classList.remove('visible'), duration);
  }

  function updateModeButtons() {
    el.modes.querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode));
      button.disabled = state.recording;
    });
    el.shutter.classList.toggle('is-video', state.mode === 'video');
    el.shutter.classList.toggle('recording', state.recording);
    const shutterLabel = state.recording ? '動画撮影を停止する' : state.mode === 'video' ? '動画撮影を開始する' : '写真を撮影する';
    el.shutter.setAttribute('aria-label', shutterLabel);
    el.shutter.title = shutterLabel;
    el.hint.textContent = state.mode === 'video' ? '✦ 妖怪といっしょに動画を撮ろう（最大60秒）' : '✦ 妖怪といっしょに写真を撮ろう';
    el.shuffle.disabled = state.recording;
    el.flip.disabled = !state.cameraReady || state.recording;
  }

  function resize() {
    const rect = el.scene.getBoundingClientRect();
    const oldWidth = state.width, oldHeight = state.height;
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    const ratioX = oldWidth > 1 ? width / oldWidth : 1;
    const ratioY = oldHeight > 1 ? height / oldHeight : 1;
    state.width = width;
    state.height = height;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2.2);
    el.canvas.width = Math.round(width * state.dpr);
    el.canvas.height = Math.round(height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    for (const a of state.actors) {
      a.x *= ratioX; a.tx *= ratioX; a.y *= ratioY; a.ty *= ratioY;
      a.vx *= ratioX; a.vy *= ratioY;
    }
  }

  function movementBounds(a) {
    const margin = a.size * .45;
    const top = Math.min(state.height * .3, Math.max(116, state.height * .16));
    const bottom = Math.max(top + 50, state.height - Math.max(185, state.height * .22));
    return {
      left: Math.min(state.width / 2, margin), right: Math.max(state.width / 2, state.width - margin),
      top: Math.min(top, state.height * .52), bottom: Math.min(state.height - margin, bottom)
    };
  }

  function chooseDestination(a) {
    const box = movementBounds(a);
    let best = null, score = -Infinity;
    for (let i = 0; i < 16; i++) {
      const x = random(box.left, box.right), y = random(box.top, Math.max(box.top + 1, box.bottom));
      const travel = Math.hypot(x - a.x, y - a.y);
      let congestion = 0;
      for (const other of state.actors) {
        if (a === other) continue;
        const distance = Math.hypot(x - other.tx, y - other.ty);
        congestion += Math.max(0, 1 - distance / ((a.size + other.size) * 1.2));
      }
      const value = travel / Math.max(1, state.width + state.height) + Math.random() * .5 - congestion * .75;
      if (value > score) { score = value; best = { x, y }; }
    }
    a.tx = best.x;
    a.ty = best.y;
    a.targetTime = random(2.1, 4.8);
  }

  function createLineup() {
    state.count = 3 + Math.floor(Math.random() * 3);
    const pool = [...YOKAI];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    state.actors = pool.slice(0, state.count).map((y, i) => {
      const base = clamp(state.width * .255, 78, 142);
      const a = {
        ...y, size: base * y.size * random(.83, 1.13),
        x: state.width * ((i + .7) / (state.count + .4)),
        y: state.height * (.27 + (i % 3) * .165 + random(-.05, .05)),
        vx: 0, vy: 0, tx: 0, ty: 0, targetTime: 0,
        phase: random(0, TAU), age: random(0, 9),
        speedFactor: random(.75, 1.22),
        nextSkill: performance.now() + random(3600, 9600),
        lastSkill: '', effect: null, draw: null
      };
      a.tx = a.x; a.ty = a.y;
      return a;
    });
    for (const a of state.actors) chooseDestination(a);
    spawnBurst(state.width * .5, state.height * .48, '#ffe3a7', 24, .7);
  }

  function spawnBurst(x, y, color, count = 14, power = 1) {
    for (let i = 0; i < count; i++) {
      const angle = i / count * TAU + random(-.4, .4);
      const speed = random(30, 115) * power;
      state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        age: 0, life: random(.45, 1.2), size: random(2, 6), color, spin: random(0, TAU) });
    }
    if (state.particles.length > 190) state.particles.splice(0, state.particles.length - 190);
  }

  function startSkill(a, now) {
    const choices = TECHNIQUES.filter(t => t.id !== a.lastSkill);
    const technique = choices[Math.floor(Math.random() * choices.length)];
    a.lastSkill = technique.id;
    a.effect = { ...technique, start: now, anchorX: a.x, anchorY: a.y, didTeleport: false };
    a.nextSkill = now + random(4900, 11600);
    if (technique.id === 'reverse') { a.vx *= -1.5; a.vy *= -1.5; chooseDestination(a); }
    if (technique.id === 'teleport') {
      const b = movementBounds(a);
      a.effect.teleX = random(b.left, b.right);
      a.effect.teleY = random(b.top, Math.max(b.top + 1, b.bottom));
    }
    if (technique.id === 'comet' || technique.id === 'burst') chooseDestination(a);
    spawnBurst(a.x, a.y, technique.color, technique.id === 'burst' ? 26 : 16, 1);
    if (now >= state.skillUntil - 400) {
      el.skill.textContent = `${a.name}の ${technique.name}！`;
      el.skill.classList.add('visible');
      state.skillUntil = now + 1600;
    }
  }

  function animateActor(a, dt, now) {
    a.age += dt;
    a.targetTime -= dt;
    if (a.targetTime <= 0 || Math.hypot(a.tx - a.x, a.ty - a.y) < a.size * .3) chooseDestination(a);
    if (now > a.nextSkill && !a.effect) startSkill(a, now);

    const e = a.effect;
    const inPlace = e && (e.id === 'tornado' || e.id === 'teleport');
    const speed = clamp(state.width * .17, 43, 105) * a.speed * a.speedFactor * (e?.id === 'comet' ? 2.3 : e?.id === 'burst' ? 1.7 : 1);
    if (!inPlace) {
      const dx = a.tx - a.x, dy = a.ty - a.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const sway = a.sway;
      const desiredX = dx / dist * speed + Math.sin(a.age * (1.5 + sway) + a.phase) * 12 * sway;
      const desiredY = dy / dist * speed + Math.cos(a.age * (1.8 + sway) + a.phase) * 11 * sway;
      const steering = clamp(dt * 2.6, 0, 1);
      a.vx += (desiredX - a.vx) * steering;
      a.vy += (desiredY - a.vy) * steering;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      const b = movementBounds(a);
      if (a.x < b.left || a.x > b.right || a.y < b.top || a.y > b.bottom) {
        a.x = clamp(a.x, b.left, b.right);
        a.y = clamp(a.y, b.top, b.bottom);
        chooseDestination(a);
      }
    }

    let x = a.x, y = a.y + Math.sin(a.age * 2.7 + a.phase) * (5 + a.sway * 3);
    let rotation = Math.sin(a.age * (1.4 + a.sway) + a.phase) * (.07 + a.sway * .06);
    let scale = 1 + Math.sin(a.age * 1.7 + a.phase) * .035;
    let alpha = .98;

    if (a.id === 'umbrella') rotation += a.age * .7;
    if (a.id === 'ittanmomen') rotation += Math.sin(a.age * 2.3 + a.phase) * .25;
    if (a.id === 'tengu') rotation += Math.sin(a.age * 3 + a.phase) * .14;
    if (a.id === 'nurikabe') rotation *= .42;

    if (e) {
      const u = clamp((now - e.start) / (e.duration * 1000), 0, 1);
      if (e.id === 'tornado') {
        const radius = Math.sin(u * Math.PI) * Math.min(42, state.width * .13);
        x = e.anchorX + Math.cos(u * TAU * 3.5) * radius;
        y = e.anchorY + Math.sin(u * TAU * 3.5) * radius;
        rotation += u * TAU * 4;
        scale += Math.sin(u * Math.PI) * .14;
      } else if (e.id === 'teleport') {
        if (u >= .45 && !e.didTeleport) {
          e.didTeleport = true; a.x = e.teleX; a.y = e.teleY;
          spawnBurst(a.x, a.y, e.color, 18, .8); chooseDestination(a);
        }
        x = a.x; y = a.y;
        const fade = u < .45 ? 1 - smooth(u / .45) : smooth((u - .45) / .55);
        alpha = fade; scale *= .22 + fade * .78; rotation += u * TAU;
      } else if (e.id === 'bounce') {
        y -= Math.abs(Math.sin(u * Math.PI * 3)) * Math.min(65, state.height * .09);
        rotation += Math.sin(u * TAU * 2) * .3;
      } else if (e.id === 'reverse') {
        rotation += Math.sin(u * TAU * 3) * .65;
        x += Math.sin(u * 25) * 9;
      } else if (e.id === 'comet' || e.id === 'burst') {
        rotation += u * TAU * (e.id === 'burst' ? 3 : 1.5);
        scale += .1;
        if (Math.random() < .35) spawnBurst(a.x, a.y, e.color, 2, .25);
      }
      if (u >= 1) a.effect = null;
    }
    a.draw = { x, y, rotation, scale, alpha, glow: e?.color || null };
  }

  function drawActor(a) {
    const d = a.draw;
    if (!d) return;
    const img = state.images.get(a.id);
    const width = a.size * d.scale;
    const height = width * (img?.naturalWidth ? img.naturalHeight / img.naturalWidth : 1.16);
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rotation);
    ctx.globalAlpha = d.alpha;
    ctx.shadowColor = d.glow || '#120d29bd';
    ctx.shadowBlur = d.glow ? 23 : 12;
    ctx.shadowOffsetY = d.glow ? 0 : 6;
    if (img?.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, -width / 2, -height / 2, width, height);
    } else {
      ctx.font = `${Math.round(width * .7)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.emoji, 0, 0);
    }
    ctx.restore();
  }

  function drawParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.age += dt;
      if (p.age >= p.life) { state.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - dt * 1.1);
      p.vy += 18 * dt;
      const fade = 1 - p.age / p.life;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);ctx.rotate(p.spin + p.age * 3);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.moveTo(0, -p.size * fade * 1.7);
      ctx.lineTo(p.size * fade * .55, 0);
      ctx.lineTo(0, p.size * fade * 1.7);
      ctx.lineTo(-p.size * fade * .55, 0);
      ctx.closePath();ctx.fill();ctx.restore();
    }
  }

  function tick(now) {
    const dt = clamp((now - state.lastTime) / 1000, 0, .06);
    state.lastTime = now;
    ctx.clearRect(0, 0, state.width, state.height);
    if (!el.review.hidden || document.hidden) {
      requestAnimationFrame(tick);
      return;
    }
    for (const a of state.actors) animateActor(a, dt, now);
    state.actors.sort((a, b) => (a.draw?.y || 0) - (b.draw?.y || 0));
    for (const a of state.actors) drawActor(a);
    drawParticles(dt);
    if (now > state.skillUntil) el.skill.classList.remove('visible');
    if (state.recording && state.recordingContext) {
      if (now - state.lastComposite >= 32) {
        drawComposite(state.recordingContext, state.recordingCanvas.width, state.recordingCanvas.height);
        state.lastComposite = now;
      }
      const seconds = Math.floor((now - state.recordingStarted) / 1000);
      el.recordingTime.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      if (seconds >= 60) stopVideo();
    }
    requestAnimationFrame(tick);
  }

  function drawComposite(c, outW, outH) {
    const video = el.video;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const scale = Math.max(outW / vw, outH / vh);
    const cropW = outW / scale, cropH = outH / scale;
    const sx = (vw - cropW) / 2, sy = (vh - cropH) / 2;
    c.clearRect(0, 0, outW, outH);
    c.save();
    if (state.facing === 'user') { c.translate(outW, 0); c.scale(-1, 1); }
    c.drawImage(video, sx, sy, cropW, cropH, 0, 0, outW, outH);
    c.restore();
    c.drawImage(el.canvas, 0, 0, outW, outH);
  }

  function openReview(blob, kind, extension) {
    if (state.reviewUrl) URL.revokeObjectURL(state.reviewUrl);
    state.reviewUrl = URL.createObjectURL(blob);
    const isVideo = kind === 'video';
    el.captured.hidden = isVideo;
    el.capturedVideo.hidden = !isVideo;
    if (isVideo) {
      el.capturedVideo.src = state.reviewUrl;
      el.capturedVideo.load();
      el.reviewTitle.textContent = '動画がとれたよ！ 🎬';
      el.reviewNote.textContent = '動画を保存して、端末の「ファイル」などから確認してね';
    } else {
      el.capturedVideo.pause();
      el.capturedVideo.removeAttribute('src');
      el.captured.src = state.reviewUrl;
      el.reviewTitle.textContent = '写真がとれたよ！ 📸';
      el.reviewNote.textContent = '写真を保存してね';
    }
    el.save.href = state.reviewUrl;
    el.save.download = `yokai-camera-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${extension}`;
    el.save.textContent = isVideo ? '動画を保存する ↓' : '写真を保存する ↓';
    el.review.hidden = false;
    el.close.focus();
  }

  async function capturePhoto() {
    if (!state.cameraReady || !el.video.videoWidth) {
      showToast('まずカメラを起動してね！');return;
    }
    el.shutter.disabled = true;
    try {
      const output = document.createElement('canvas');
      output.width = el.canvas.width; output.height = el.canvas.height;
      const c = output.getContext('2d');
      drawComposite(c, output.width, output.height);
      const blob = await new Promise(resolve => output.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('写真を作成できませんでした');
      el.flash.classList.remove('active');void el.flash.offsetWidth;el.flash.classList.add('active');
      openReview(blob, 'photo', 'png');
    } catch (error) {
      showToast(error?.message || '撮影に失敗しました。もう一度試してね。');
    } finally {
      el.shutter.disabled = !state.cameraReady;
    }
  }

  function startVideo() {
    if (!state.cameraReady || !el.video.videoWidth) {
      showToast('まずカメラを起動してね！');return;
    }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      showToast('このブラウザは動画の合成撮影に対応していません。', 4500);return;
    }
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(state.dpr, 1.6);
      canvas.width = Math.round(state.width * scale);
      canvas.height = Math.round(state.height * scale);
      const c = canvas.getContext('2d', { alpha: false });
      drawComposite(c, canvas.width, canvas.height);
      const stream = canvas.captureStream(30);
      const candidates = ['video/mp4;codecs="avc1.42E01E"', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm'];
      const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
        ? candidates.find(type => MediaRecorder.isTypeSupported(type)) : undefined;
      const options = { videoBitsPerSecond: 3000000 };
      if (mimeType) options.mimeType = mimeType;
      const recorder = new MediaRecorder(stream, options);
      state.chunks = [];
      state.recordingCanvas = canvas;
      state.recordingContext = c;
      state.recordingStream = stream;
      state.recorder = recorder;
      recorder.addEventListener('dataavailable', event => {
        if (event.data?.size) state.chunks.push(event.data);
      });
      recorder.addEventListener('stop', () => {
        stream.getTracks().forEach(track => track.stop());
        if (state.recordingStream === stream) state.recordingStream = null;
        const blobType = recorder.mimeType || mimeType || 'video/mp4';
        const blob = new Blob(state.chunks, { type: blobType });
        const extension = blobType.includes('webm') ? 'webm' : 'mp4';
        state.chunks = [];
        if (blob.size > 0) openReview(blob, 'video', extension);
        else showToast('動画を保存できませんでした。もう一度試してね。', 4500);
      }, { once: true });
      recorder.addEventListener('error', () => showToast('動画の録画に失敗しました。', 4500), { once: true });
      recorder.start(1000);
      state.recording = true;
      state.recordingStarted = performance.now();
      state.lastComposite = 0;
      el.recordingTime.textContent = '00:00';
      el.recordingIndicator.hidden = false;
      updateModeButtons();
    } catch (error) {
      state.recordingStream?.getTracks().forEach(track => track.stop());
      state.recordingStream = null;
      state.recordingContext = null;
      state.recordingCanvas = null;
      state.recorder = null;
      showToast('この端末では録画を開始できませんでした。', 4500);
    }
  }

  function stopVideo() {
    if (!state.recording) return;
    state.recording = false;
    el.recordingIndicator.hidden = true;
    const recorder = state.recorder;
    state.recorder = null;
    state.recordingContext = null;
    state.recordingCanvas = null;
    updateModeButtons();
    if (recorder?.state === 'recording') recorder.stop();
  }

  function pressShutter() {
    if (state.recording) stopVideo();
    else if (state.mode === 'video') startVideo();
    else capturePhoto();
  }

  function closeReview() {
    el.capturedVideo.pause();
    el.review.hidden = true;
    el.shutter.focus();
  }

  el.start.addEventListener('click', startCamera);
  el.retry.addEventListener('click', startCamera);
  el.demo.addEventListener('click', () => { el.welcome.hidden = true;showToast('デモモードだよ。撮影にはカメラを起動してね。', 3500); });
  el.flip.addEventListener('click', async () => {
    if (!state.cameraReady || state.cameraBusy) return;
    const previous = state.facing;
    state.facing = previous === 'environment' ? 'user' : 'environment';
    await startCamera();
    if (!state.cameraReady) {
      state.facing = previous;
      showToast('カメラを切り替えられませんでした。');
    }
  });
  el.modes.addEventListener('click', event => {
    const button = event.target.closest('button[data-mode]');
    if (!button) return;
    if (state.recording) return;
    state.mode = button.dataset.mode;
    updateModeButtons();
  });
  el.shuffle.addEventListener('click', () => {
    createLineup();showToast(`ようかい ${state.count}たいに いれかえたよ！`);
  });
  el.shutter.addEventListener('click', pressShutter);
  el.close.addEventListener('click', closeReview);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !el.review.hidden) closeReview();
  });
  window.addEventListener('pagehide', stopCamera);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.recording) stopVideo(); });
  window.addEventListener('resize', resize, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(el.scene);

  setCameraUI(false);
  updateModeButtons();
  resize();
  createLineup();
  requestAnimationFrame(tick);
})();
