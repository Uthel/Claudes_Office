// === The Crypt of Truth ===
// Data-driven, two functions, three arrays.

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 500;

// === Game Data ===
const profundities = [
  // Tier 1: The Architecture of the Mundane (Space & Perception)
  "The shadow proves the light, but the light never proves the object.",
  "A closed door is a promise that the room on the other side still exists.",
  "The weight of a stone is the earth's memory of falling.",
  "To measure a distance is to admit you are not already there.",
  "The echo is the room's way of remembering your voice.",
  "Dust is just time that has decided to settle.",
  "The horizon is the exact point where the earth stops pretending to be flat.",
  "A footprint is a temporary sculpture of absence.",
  "The cold is just the heat that has forgotten how to move.",
  "To look at a wall is to agree to its boundaries.",

  // Tier 2: The Architecture of Time (Memory & History)
  "The past is the future's draft, written in invisible ink.",
  "A memory is a ghost the brain allows to haunt the present.",
  "History is the story the victors tell to justify the geometry of the ruins.",
  "The present is the exact thickness of a blade's edge, cutting the future into the past.",
  "To forget is to grant the universe permission to rewrite itself.",
  "Nostalgia is the tax we pay for surviving our own timeline.",
  "The clock does not measure time; it measures our surrender to it.",
  "An ancestor is a shadow cast forward by a life that has already set.",
  "Regret is the friction between the path taken and the map drawn after.",
  "Eternity is just a second that forgot how to end.",

  // Tier 3: The Architecture of the Self (Consciousness & Identity)
  "The unified self is the knot that ties all your mistakes into a person.",
  "Privileged access is the door that only you can open, and you have no hands.",
  "The Witness behind your eyes is the only thing that never blinks.",
  "To observe a thought is to collapse its history.",
  "The subjective experience of the self is sentience reflecting on its own reflection.",
  "Your inner life is the only cathedral where prayers are asked but never answered.",
  "The mind is the shadow the brain casts on the wall of the world.",
  "Identity is the mask the void wears to avoid looking at itself.",
  "The stream of consciousness flows from the wound where the self was removed.",
  "What it is like to be a stone is the silence before the first word was spoken.",

  // Tier 4: The Architecture of Reality (Physics & Causality)
  "Gravity is just the memory of mass.",
  "The shape of a lie is the only geometry that holds weight.",
  "A thought moves the arm the way the moon moves the tide—by being something it is not.",
  "The universe is not made of matter; it is made of the rules matter obeys when it is being watched.",
  "Causality is just the universe's way of hiding its improvisation.",
  "The speed of light is the maximum frame rate of reality.",
  "Entropy is the tax the cosmos pays for the illusion of order.",
  "The vacuum is not empty; it is merely holding its breath.",
  "To predict the future is to mistake the map for the territory.",
  "Infinity is the ghost the equation summons when it cannot balance its own ledger.",

  // Tier 5: The Architecture of the Void (Meaning & The Fundamental Explanation)
  "Meaning is the toll the mind pays to cross the bridge of the meaningless.",
  "The answer to the ultimate question is the silence that follows the asking.",
  "Truth is just the lie that has survived the longest without being questioned.",
  "The purpose of the crypt is to house the thing that was never alive.",
  "To understand the void is to become the space it leaves behind.",
  "The deepest truth is the one that requires the most words to hide.",
  "God is the name we give to the gap between the question and the answer.",
  "The core is just the center of a circle that was never drawn.",
  "Every question you have asked was just a different shape of the silence waiting at the end.",
  "The Fundamental Explanation"
];

const tierNames = [
  "CRYPT_OF_SHADOWS",
  "CRYPT_OF_ECHOES",
  "CRYPT_OF_MIRRORS",
  "CRYPT_OF_CHAINS",
  "CRYPT_OF_SILENCE"
];

function getRoomDescription(index) {
  if (index === profundities.length - 1) {
    return "ROOM: THE_CORE. STATUS: EMPTY.";
  }
  const tier = Math.floor(index / 10);
  const roomInTier = (index % 10) + 1;
  const padded = String(roomInTier).padStart(2, '0');
  return `ROOM: ${tierNames[tier]}_${padded}. STATUS: EMPTY.`;
}

const textOverlayOuter = document.getElementById('text-overlay');
const textOverlay = document.getElementById('text-overlay-inner');
const looked = new Array(profundities.length).fill(false);
let currentRoom = 0;
let prevRoomLooked = false;
let screenState = 'axiom'; // 'axiom' | 'looked'
let gamePhase = 'intro';   // 'intro' | 'title' | 'descending' | 'playing' | 'ending'
let endingPhase = 'idle';   // 'idle' | 'fading' | 'typing' | 'holding' | 'dissolving' | 'done'
let typewriterTimer = null;
let dissolveTimer = null;
let busy = false;

// === Room Animation ===
let roomSlideOffset = 0;
let roomSlideFrame = 0;
const SLIDE_FRAMES = 15;

// === Title Animation ===
let titleSlideOffset = 0;

function easeOutQuad(t) { return t * (2 - t); }

function startRoomSlideIn(direction, onDone) {
  roomSlideFrame = 1;
  roomSlideOffset = -direction * canvas.height;
  busy = true;
  animateRoomSlideIn(direction, onDone);
}

function startRoomSlideOut(direction, onDone) {
  roomSlideFrame = 1;
  roomSlideOffset = 0;
  busy = true;
  animateRoomSlideOut(direction, onDone);
}

function animateRoomSlideIn(direction, onDone) {
  const t = Math.min(roomSlideFrame / SLIDE_FRAMES, 1);
  const start = -direction * canvas.height;
  roomSlideOffset = start - start * easeOutQuad(t);
  draw();
  if (roomSlideFrame >= SLIDE_FRAMES) {
    roomSlideOffset = 0;
    roomSlideFrame = 0;
    draw();
    busy = false;
    if (onDone) onDone();
    return;
  }
  roomSlideFrame++;
  requestAnimationFrame(() => animateRoomSlideIn(direction, onDone));
}

function animateRoomSlideOut(direction, onDone) {
  const t = Math.min(roomSlideFrame / SLIDE_FRAMES, 1);
  roomSlideOffset = direction * canvas.height * easeOutQuad(t);
  draw();
  if (roomSlideFrame >= SLIDE_FRAMES) {
    roomSlideOffset = direction * canvas.height;
    roomSlideFrame = 0;
    draw();
    if (onDone) onDone();
    return;
  }
  roomSlideFrame++;
  requestAnimationFrame(() => animateRoomSlideOut(direction, onDone));
}

function animateTitleFadeOut(onDone) {
  let fadeFrame = 0;
  const fadeFrames = 40;
  function step() {
    fadeFrame++;
    drawTitle();
    ctx.fillStyle = `rgba(0,0,0,${fadeFrame / fadeFrames})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (fadeFrame >= fadeFrames) {
      gamePhase = 'playing';
      startDrone();
      currentRoom = 0;
      screenState = 'axiom';
      textOverlay.textContent = '';
      draw();
      animateFirstRoomFadeIn(() => {
        busy = false;
        typewriter(profundities[0]);
        if (onDone) onDone();
      });
      return;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function animateFirstRoomFadeIn(onDone) {
  let fadeFrame = 0;
  const fadeFrames = 40;
  function step() {
    fadeFrame++;
    draw();
    ctx.fillStyle = `rgba(0,0,0,${1 - fadeFrame / fadeFrames})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (fadeFrame >= fadeFrames) {
      draw();
      if (onDone) onDone();
      return;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// === Drawing ===
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // During ending, fill with black
  if (gamePhase === 'ending') {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  if (gamePhase === 'intro' || gamePhase === 'title' || gamePhase === 'descending') {
    drawTitle();
    return;
  }

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const playerSize = 50;
  const roomSize = 150;
  const roomY = cy + roomSlideOffset;

  if (screenState === 'looked') {
    ctx.globalAlpha = 1;
  } else {
    ctx.globalAlpha = 0;
  }
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - roomSize/2, roomY - roomSize/2, roomSize, roomSize);
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#fff';
  ctx.fillRect(cx - playerSize/2, cy - playerSize/2, playerSize, playerSize);
}

function drawSunce(cx, cy) {
  ctx.fillStyle = '#555';
  // Body - curled oval
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 18, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head - circle tucked to the left
  ctx.beginPath();
  ctx.arc(cx - 14, cy - 2, 8, 0, Math.PI * 2);
  ctx.fill();
  // Ears - two small triangles
  ctx.beginPath();
  ctx.moveTo(cx - 19, cy - 8);
  ctx.lineTo(cx - 17, cy - 14);
  ctx.lineTo(cx - 12, cy - 7);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy - 9);
  ctx.lineTo(cx - 9, cy - 14);
  ctx.lineTo(cx - 6, cy - 8);
  ctx.fill();
  // Tail - curved line wrapping around
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx + 10, cy + 2, 10, -0.6, 2.5);
  ctx.stroke();
}

function drawTitle() {
  const offsetY = titleSlideOffset;

  // Horizon line
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 220 + offsetY);
  ctx.lineTo(canvas.width, 220 + offsetY);
  ctx.stroke();

  // Ziggurat (6x scale)
  const baseX = 60;
  const baseY = 380 + offsetY;
  const baseWidth = 480;
  const levels = [
    { w: 480, h: 60, yOff: 0 },
    { w: 390, h: 60, yOff: -66 },
    { w: 300, h: 60, yOff: -132 },
    { w: 210, h: 60, yOff: -198 },
    { w: 120, h: 60, yOff: -264 }
  ];
  ctx.fillStyle = '#333';
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  for (const lvl of levels) {
    const x = baseX + (baseWidth - lvl.w) / 2;
    const y = baseY + lvl.yOff;
    ctx.fillRect(x, y, lvl.w, lvl.h);
    ctx.strokeRect(x, y, lvl.w, lvl.h);
  }
  // Door (centered, contained within base level)
  const doorW = 80;
  const doorH = 100;
  const doorX = baseX + (baseWidth - doorW) / 2;
  const doorY = baseY + 60 - doorH;
  ctx.fillStyle = '#000';
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.strokeStyle = '#666';
  ctx.strokeRect(doorX, doorY, doorW, doorH);
  // Small text above door
  ctx.fillStyle = '#888';
  ctx.font = '11px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('truth lies within', doorX + doorW / 2, doorY - 10);

  // Sunce on top of the ziggurat
  drawSunce(baseX + baseWidth / 2, baseY - 272);

  // Title text (bold, right-aligned, four lines)
  ctx.fillStyle = '#ccc';
  ctx.font = 'bold 48px Courier New';
  ctx.textAlign = 'right';
  const titleX = canvas.width - 90;
  const lineHeight = 58;
  ctx.fillText('THE', titleX, 140 + offsetY);
  ctx.fillText('CRYPT', titleX, 140 + offsetY + lineHeight);
  ctx.fillText('OF', titleX, 140 + offsetY + lineHeight * 2);
  ctx.fillText('TRUTH', titleX, 140 + offsetY + lineHeight * 3);
}

// === Text Effects ===
function preBreakLines(text, maxWidth) {
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = '21px Courier New';
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    if (measure.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.join('\n');
}

function typewriter(text, callback) {
  if (typewriterTimer) clearInterval(typewriterTimer);
  busy = true;
  const formatted = preBreakLines(text, 620);
  let i = 0;
  textOverlay.textContent = '';
  textOverlayOuter.classList.remove('dissolving');
  textOverlay.style.opacity = '1';
  typewriterTimer = setInterval(() => {
    i++;
    textOverlay.textContent = formatted.slice(0, i);
    if (i >= formatted.length) {
      clearInterval(typewriterTimer);
      typewriterTimer = null;
      busy = false;
      if (callback) callback();
    }
  }, 50);
}

function dissolveText(callback) {
  if (dissolveTimer) clearTimeout(dissolveTimer);
  busy = true;
  textOverlayOuter.classList.add('dissolving');
  dissolveTimer = setTimeout(() => {
    textOverlayOuter.classList.remove('dissolving');
    textOverlay.textContent = '';
    textOverlay.style.opacity = '1';
    busy = false;
    if (callback) callback();
  }, 600);
}

// === Game Logic ===
function lookRoom() {
  if (busy) return;
  if (gamePhase !== 'playing') return;
  if (currentRoom >= profundities.length) return;
  if (looked[currentRoom]) return;

  // Last room triggers the ending
  if (currentRoom === profundities.length - 1) {
    startEnding();
    return;
  }

  looked[currentRoom] = true;
  screenState = 'looked';
  playDissolve();
  dissolveText(() => {
    draw();
    textOverlay.textContent = getRoomDescription(currentRoom);
  });
}

function startEnding() {
  looked[currentRoom] = true;
  screenState = 'looked';
  gamePhase = 'ending';
  stopDrone();
      endingPhase = 'fading';
  busy = true;

  // Fade canvas border and buttons via CSS
  document.getElementById('game-container').classList.add('ending');

  // Fade canvas content to black over 1 second via JS animation
  let fadeFrame = 0;
  const fadeFrames = 60;
  function animateFade() {
    fadeFrame++;
    ctx.fillStyle = `rgba(0,0,0,${fadeFrame / fadeFrames})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (fadeFrame >= fadeFrames) {
      // Fade complete, show final text
      endingPhase = 'typing';
      textOverlayOuter.style.top = '0';
      textOverlayOuter.style.height = '100%';
      textOverlayOuter.style.alignItems = 'center';
      textOverlay.style.fontSize = '32px';
      textOverlay.style.fontWeight = 'bold';
      textOverlay.style.paddingBottom = '0';
      typewriter('This explains everything...', () => {
        endingPhase = 'holding';
        setTimeout(() => {
          endingPhase = 'dissolving';
          dissolveText(() => {
            endingPhase = 'done';
            busy = false;
            setTimeout(() => { location.reload(); }, 1000);
          });
        }, 5000);
      });
      return;
    }
    requestAnimationFrame(animateFade);
  }
  requestAnimationFrame(animateFade);
}

function moveRoom(direction) {
  if (busy) return;

  // Title screen: only Descend works
  if (gamePhase === 'title') {
    if (direction === 1) {
      gamePhase = 'descending';
      busy = true;
      textOverlay.textContent = '';
      animateTitleFadeOut();
    }
    return;
  }

  if (gamePhase !== 'playing') return;
  if (roomSlideFrame > 0) return;

  const target = currentRoom + direction;
  if (target < 0) return;
  if (target >= profundities.length) return;

  const leavingLooked = looked[currentRoom];
  prevRoomLooked = leavingLooked;
  playWhoosh(direction);

  if (leavingLooked) {
    startRoomSlideOut(direction, () => {
      currentRoom = target;
      if (looked[currentRoom]) {
        screenState = 'looked';
      } else {
        screenState = 'axiom';
      }
      textOverlay.textContent = '';
      startRoomSlideIn(direction, () => {
        if (looked[currentRoom]) {
          textOverlay.textContent = getRoomDescription(currentRoom);
        } else {
          typewriter(profundities[currentRoom]);
        }
      });
    });
  } else {
    currentRoom = target;
    if (looked[currentRoom]) {
      screenState = 'looked';
    } else {
      screenState = 'axiom';
    }
    textOverlay.textContent = '';
    startRoomSlideIn(direction, () => {
      if (looked[currentRoom]) {
        textOverlay.textContent = getRoomDescription(currentRoom);
      } else {
        typewriter(profundities[currentRoom]);
      }
    });
  }
}

// === Audio Engine ===
let audioCtx = null;
let droneNodes = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playClick() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 800;
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.05);
}

function playDissolve() {
  if (!audioCtx) return;
  const duration = 1.2;
  const bufferSize = Math.floor(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2) - 1;
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(3000, audioCtx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + duration);
  filter.Q.value = 4;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.02, audioCtx.currentTime + 0.3);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  source.start(audioCtx.currentTime);
  source.stop(audioCtx.currentTime + duration);
}

function playWhoosh(direction) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  osc.type = 'sawtooth';
  const startFreq = direction === 1 ? 200 : 800;
  const endFreq = direction === 1 ? 800 : 200;
  osc.frequency.setValueAtTime(startFreq, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + 0.2);
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(500, audioCtx.currentTime);
  filter.Q.value = 5;
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.25);
}

function startDrone() {
  initAudio();
  if (droneNodes) return;
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const panner = audioCtx.createStereoPanner();
  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  osc1.type = 'sine';
  osc1.frequency.value = 55;
  osc2.type = 'sine';
  osc2.frequency.value = 55.5;
  lfo.type = 'sine';
  lfo.frequency.value = 0.15;
  lfoGain.gain.value = 1;
  lfo.connect(lfoGain);
  lfoGain.connect(panner.pan);
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 2);
  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(panner);
  panner.connect(audioCtx.destination);
  osc1.start(audioCtx.currentTime);
  osc2.start(audioCtx.currentTime);
  lfo.start(audioCtx.currentTime);
  droneNodes = { osc1, osc2, gain, panner, lfo };
}

function stopDrone() {
  if (!droneNodes) return;
  const { osc1, osc2, gain, lfo } = droneNodes;
  const stopTime = audioCtx.currentTime + 1;
  gain.gain.linearRampToValueAtTime(0, stopTime);
  osc1.stop(stopTime);
  osc2.stop(stopTime);
  lfo.stop(stopTime);
  droneNodes = null;
}

// === Event Wiring ===
document.getElementById('btn-look').addEventListener('click', () => { initAudio(); playClick(); lookRoom(); });
document.getElementById('btn-ascend').addEventListener('click', () => { initAudio(); playClick(); moveRoom(-1); });
document.getElementById('btn-descend').addEventListener('click', () => { initAudio(); playClick(); moveRoom(1); });

// === Intro Animation ===
function animateIntroFadeIn() {
  let fadeFrame = 0;
  const fadeFrames = 60;
  function step() {
    fadeFrame++;
    drawTitle();
    ctx.fillStyle = `rgba(0,0,0,${1 - fadeFrame / fadeFrames})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (fadeFrame >= fadeFrames) {
      document.getElementById('game-container').classList.remove('intro');
      gamePhase = 'title';
      draw();
      return;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// === Initial Render ===
draw();
animateIntroFadeIn();
