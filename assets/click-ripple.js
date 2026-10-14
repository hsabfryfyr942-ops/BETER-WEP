document.querySelectorAll('video.site-background-video, video.background-video').forEach(video => {
  video.playbackRate = 1.15;
});

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const fontScaleKey = 'hardhub-font-scale';
let fontScale = 1;
const scalableTextElements = new Set();

try {
  const savedScale = Number(localStorage.getItem(fontScaleKey));
  if (Number.isFinite(savedScale) && savedScale >= 0.9 && savedScale <= 1.5) {
    fontScale = savedScale;
  }
} catch (error) {
  console.warn('HardHub could not read the saved font size preference.', error);
}

function applyFontScale() {
  scalableTextElements.forEach(element => {
    element.style.zoom = String(fontScale);
  });
  const status = document.querySelector('.hh-font-status');
  if (status) status.textContent = `${Math.round(fontScale * 100)}%`;
}

function saveFontScale() {
  try {
    localStorage.setItem(fontScaleKey, String(fontScale));
  } catch (error) {
    console.warn('HardHub could not save the font size preference.', error);
  }
}

const fontControls = document.createElement('div');
fontControls.className = 'hh-font-controls';
fontControls.setAttribute('role', 'group');
fontControls.innerHTML = '<button type="button" data-font-step="-0.1"></button><span class="hh-font-status" aria-live="polite"></span><button type="button" data-font-step="0.1"></button>';
document.body.appendChild(fontControls);

const fontControlLabels = {
  ar: { group: 'حجم الخط', decrease: 'تصغير الخط', increase: 'تكبير الخط', decreaseMark: 'أ−', increaseMark: 'أ+' },
  en: { group: 'Font size', decrease: 'Decrease font size', increase: 'Increase font size', decreaseMark: 'A−', increaseMark: 'A+' },
  tr: { group: 'Yazı boyutu', decrease: 'Yazı boyutunu küçült', increase: 'Yazı boyutunu büyüt', decreaseMark: 'A−', increaseMark: 'A+' },
  fr: { group: 'Taille du texte', decrease: 'Réduire la taille du texte', increase: 'Augmenter la taille du texte', decreaseMark: 'A−', increaseMark: 'A+' },
  es: { group: 'Tamaño del texto', decrease: 'Reducir el tamaño del texto', increase: 'Aumentar el tamaño del texto', decreaseMark: 'A−', increaseMark: 'A+' }
};

function localizeFontControls() {
  const labels = fontControlLabels[document.documentElement.lang] || fontControlLabels.ar;
  const [decreaseButton, increaseButton] = fontControls.querySelectorAll('button');
  fontControls.setAttribute('aria-label', labels.group);
  decreaseButton.setAttribute('aria-label', labels.decrease);
  decreaseButton.textContent = labels.decreaseMark;
  increaseButton.setAttribute('aria-label', labels.increase);
  increaseButton.textContent = labels.increaseMark;
}

localizeFontControls();
new MutationObserver(localizeFontControls).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['lang']
});

function scaleTextContent(element) {
  if (
    !(element instanceof Element) ||
    element.classList.contains('hh-font-scaled') ||
    element.closest('.hh-font-controls') ||
    element.parentElement?.closest('.hh-font-scaled')
  ) return;
  const tagName = element.tagName;
  if (['SCRIPT', 'STYLE', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME'].includes(tagName)) return;

  const isFormControl = ['INPUT', 'SELECT', 'TEXTAREA'].includes(tagName);
  const hasDirectText = [...element.childNodes].some(node =>
    node.nodeType === Node.TEXT_NODE && node.textContent.trim()
  );

  if (isFormControl || hasDirectText) {
    element.querySelectorAll('.hh-font-scaled').forEach(descendant => {
      scalableTextElements.delete(descendant);
      descendant.classList.remove('hh-font-scaled');
      descendant.style.removeProperty('zoom');
    });
    element.classList.add('hh-font-scaled');
    scalableTextElements.add(element);
    element.style.zoom = String(fontScale);
    return;
  }

  element.childNodes.forEach(child => {
    if (child instanceof Element) scaleTextContent(child);
  });
}

function forgetTextContent(element) {
  if (!(element instanceof Element)) return;
  if (element.classList.contains('hh-font-scaled')) {
    scalableTextElements.delete(element);
    element.classList.remove('hh-font-scaled');
    element.style.removeProperty('zoom');
  }
  element.querySelectorAll('.hh-font-scaled').forEach(descendant => {
    scalableTextElements.delete(descendant);
    descendant.classList.remove('hh-font-scaled');
    descendant.style.removeProperty('zoom');
  });
}

scaleTextContent(document.body);
new MutationObserver(records => {
  records.forEach(record => {
    record.removedNodes.forEach(forgetTextContent);
    if (record.target instanceof Element) scaleTextContent(record.target);
    record.addedNodes.forEach(node => {
      if (node instanceof Element) scaleTextContent(node);
    });
  });
}).observe(document.body, { childList: true, subtree: true });

applyFontScale();

fontControls.addEventListener('click', event => {
  const button = event.target.closest('[data-font-step]');
  if (!button) return;

  fontScale = Math.min(1.5, Math.max(0.9, Math.round((fontScale + Number(button.dataset.fontStep)) * 10) / 10));
  applyFontScale();
  saveFontScale();
});

window.addEventListener('storage', event => {
  if (event.key !== fontScaleKey) return;
  const updatedScale = Number(event.newValue);
  if (Number.isFinite(updatedScale) && updatedScale >= 0.9 && updatedScale <= 1.5) {
    fontScale = updatedScale;
    applyFontScale();
  }
});

const backgroundVideos = [...document.querySelectorAll('video.site-background-video, video.background-video')];
let lastPointerAt = 0;
let lastPointerX = 0;
let lastPointerY = 0;
let playbackFrame = 0;
let playbackResetTimer = 0;
const basePlaybackRate = 1.15;

function animatePlaybackRate() {
  playbackFrame = 0;
  let needsAnotherFrame = false;
  backgroundVideos.forEach(video => {
    video.playbackRate += (basePlaybackRate - video.playbackRate) * 0.08;
    if (Math.abs(video.playbackRate - basePlaybackRate) > 0.015) needsAnotherFrame = true;
    else video.playbackRate = basePlaybackRate;
  });
  if (needsAnotherFrame) playbackFrame = requestAnimationFrame(animatePlaybackRate);
}

if (!reducedMotion.matches && window.matchMedia('(pointer: fine)').matches) {
  const trail = document.createElement('canvas');
  trail.className = 'hh-pointer-trail';
  trail.setAttribute('aria-hidden', 'true');
  document.documentElement.appendChild(trail);

  const context = trail.getContext('2d');
  const particles = [];
  let pixelRatio = 1;
  let trailFrame = 0;

  function resizeTrail() {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    trail.width = Math.round(window.innerWidth * pixelRatio);
    trail.height = Math.round(window.innerHeight * pixelRatio);
    trail.style.width = `${window.innerWidth}px`;
    trail.style.height = `${window.innerHeight}px`;
    if (context) context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function drawTrail() {
    trailFrame = 0;
    if (!context) return;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const now = performance.now();

    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      const progress = (now - particle.bornAt) / particle.lifetime;
      if (progress >= 1) {
        particles.splice(index, 1);
        continue;
      }
      particle.x += particle.velocityX;
      particle.y += particle.velocityY;
      particle.velocityX *= 0.97;
      particle.velocityY *= 0.97;
      context.globalAlpha = 1 - progress;
      context.fillStyle = particle.color;
      context.shadowBlur = 12;
      context.shadowColor = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius * (1 - progress * 0.45), 0, Math.PI * 2);
      context.fill();
    }

    context.globalAlpha = 1;
    context.shadowBlur = 0;
    if (particles.length) trailFrame = requestAnimationFrame(drawTrail);
  }

  resizeTrail();
  window.addEventListener('resize', resizeTrail);

  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;

    const now = performance.now();
    const elapsed = Math.max(now - lastPointerAt, 1);
    const distance = lastPointerAt ? Math.hypot(event.clientX - lastPointerX, event.clientY - lastPointerY) : 0;
    const speed = distance / elapsed * 1000;
    const pointerOffsetX = (event.clientX / window.innerWidth - 0.5) * 18;
    const pointerOffsetY = (event.clientY / window.innerHeight - 0.5) * 18;

    document.querySelectorAll('.site-background-overlay, .overlay').forEach(overlay => {
      overlay.style.backgroundPosition = `${50 + pointerOffsetX / 2}% ${50 + pointerOffsetY / 2}%`;
    });

    const count = Math.min(5, Math.max(1, Math.ceil(distance / 18)));
    for (let index = 0; index < count; index += 1) {
      particles.push({
        x: event.clientX + (Math.random() - 0.5) * 8,
        y: event.clientY + (Math.random() - 0.5) * 8,
        velocityX: (Math.random() - 0.5) * 1.2,
        velocityY: (Math.random() - 0.5) * 1.2,
        radius: 2 + Math.random() * 2.5,
        bornAt: now,
        lifetime: 520 + Math.random() * 260,
        color: Math.random() > 0.5 ? '#b5ff70' : '#70eaff'
      });
    }
    if (particles.length > 90) particles.splice(0, particles.length - 90);
    if (!trailFrame) trailFrame = requestAnimationFrame(drawTrail);

    const playbackRate = Math.min(2.45, basePlaybackRate + Math.min(1.3, speed / 1800));
    backgroundVideos.forEach(video => { video.playbackRate = playbackRate; });
    if (playbackFrame) {
      cancelAnimationFrame(playbackFrame);
      playbackFrame = 0;
    }
    if (playbackResetTimer) window.clearTimeout(playbackResetTimer);
    playbackResetTimer = window.setTimeout(() => {
      if (!playbackFrame) playbackFrame = requestAnimationFrame(animatePlaybackRate);
    }, 180);
    lastPointerAt = now;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
  });

  document.addEventListener('pointerleave', () => {
    if (playbackResetTimer) window.clearTimeout(playbackResetTimer);
    if (!playbackFrame) playbackFrame = requestAnimationFrame(animatePlaybackRate);
  });
}

document.addEventListener('click', event => {
  if (event.button !== 0 || event.detail === 0) return;

  const ripple = document.createElement('span');
  ripple.className = 'hh-click-ripple';
  ripple.setAttribute('aria-hidden', 'true');
  ripple.style.left = `${event.clientX}px`;
  ripple.style.top = `${event.clientY}px`;
  document.documentElement.appendChild(ripple);
  window.setTimeout(() => ripple.remove(), 800);
}, { passive: true });
