// Headmosh Neon Network — viz.js (visual-only; uses window.getAudioLevel/getBandLevels from audio.js)

/* Visual config (no audio/mic here; audio.js handles that) */
const VIZ = {
  particleDensity: 0.10,     // higher = more particles
  maxSpeed: 1.8,             // clamp per-frame particle speed
  connectRadius: 190,        // max link distance between particles
  trailAlpha: 34,            // motion blur strength (0 transparent fill per frame)
  bloomPasses: 1,            // extra additive pass count
  showLogo: true,            // banner on/off
  bannerTitle: "HEADMOSH STUDIO",
  bannerSub: "Go Head-First.",
};

/* State */
let particles = [];
let pg, t = 0;
let bloom = true;
let palettes, paletteIndex = 0;

let energy = 0;              // final visual envelope (0..1+)
let sensitivity = 1.6;       // global multiplier
let extraBassBias = true;

/* Simple low-band peak detect */
let lastLow = 0;
let lowRise = 0;

/* Envelope dynamics */
const ATTACK = 0.95;         // approach up speed
const DECAY  = 0.22;         // fall down speed
const BASS_BIAS_ON  = 0.78;
const BASS_BIAS_OFF = 0.60;

const MAX_CONNECTIONS_PER_PARTICLE = 22;
// === Added globals for advanced rendering ===
let glow;                 // downscaled glow buffer
let mode = 0;             // 0=Network, 1=Triangles (future), 2=Flow (future)

// === Spatial hashing helpers ===
function buildGrid(particles, cellSize){
  const cols = Math.ceil(width / cellSize), rows = Math.ceil(height / cellSize);
  const grid = Array.from({length: cols * rows}, () => []);
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const cx = (p.x / cellSize) | 0, cy = (p.y / cellSize) | 0;
    const idx = cy * cols + cx;
    if (grid[idx]) grid[idx].push(i);
  }
  return { grid, cols, rows };
}
function forNeighbors(i, parts, gridData, cellSize, fn){
  const p = parts[i];
  const cx = (p.x / cellSize) | 0, cy = (p.y / cellSize) | 0;
  const {grid, cols, rows} = gridData;
  for (let oy=-1; oy<=1; oy++){
    for (let ox=-1; ox<=1; ox++){
      const nx = cx + ox, ny = cy + oy;
      if (nx<0||ny<0||nx>=cols||ny>=rows) continue;
      const bucket = grid[ny*cols + nx];
      for (const j of bucket){
        if (j <= i) continue;
        fn(j);
      }
    }
  }
}


/* Palette triplets used to color links by distance */
function initPalettes(){
  palettes = [
    [ [10,240,255], [180,90,255], [255,80,180], [255,210,60] ],
    [ [90,200,255], [90,255,160], [255,120,120], [250,250,180] ],
    [ [255,100,40], [255,220,40], [80,220,255], [120,120,255] ],
    [ [140,255,220], [255,80,140], [110,150,255], [255,220,160] ],
  ];
}

/* Particle used for dots + link curves */
class Particle {
  constructor(){
    this.x = random(width);
    this.y = random(height);
    this.vx = random(-VIZ.maxSpeed, VIZ.maxSpeed);
    this.vy = random(-VIZ.maxSpeed, VIZ.maxSpeed);
  }
  move(){
    const ang = noise(this.x*0.0012, this.y*0.0012, t*0.001) * TAU * (1.1 + energy*1.4);
    const punch = (0.03 + energy*0.11 + energy*energy*0.16) * sensitivity;
    this.vx += Math.cos(ang) * punch;
    this.vy += Math.sin(ang) * punch;

    const sp = Math.hypot(this.vx, this.vy);
    if (sp > VIZ.maxSpeed){
      this.vx = (this.vx/sp)*VIZ.maxSpeed;
      this.vy = (this.vy/sp)*VIZ.maxSpeed;
    }

    this.x += this.vx;
    this.y += this.vy;

    if (this.x < -12) this.x = width+12;
    if (this.x > width+12) this.x = -12;
    if (this.y < -12) this.y = height+12;
    if (this.y > height+12) this.y = -12;
  }
  dot(g){
    g.noStroke();
    g.fill(255, 220);
    g.circle(this.x, this.y, 3.2 + energy*2.2);
  }
  connect(g, others){
    const cols = palettes[paletteIndex];
    let links = 0;
    for (let i=0;i<others.length && links<MAX_CONNECTIONS_PER_PARTICLE;i++){
      const p = others[i];
      const dx = this.x - p.x, dy = this.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < VIZ.connectRadius){
        const widthBoost = 1.0 + energy*3.4 + energy*energy*1.8;
        const w = map(d, 0, VIZ.connectRadius, 3.6*widthBoost, 0.35);
        const a = map(d, 0, VIZ.connectRadius, 250, 90);
        const c = cols[Math.floor(map(d,0,VIZ.connectRadius,0,cols.length))%cols.length];

        g.stroke(c[0], c[1], c[2], a);
        g.strokeWeight(w);

        const j = 8*(1+energy*1.2); // jitter grows on hits
        const mx = (this.x + p.x)/2 + Math.sin((this.x+t)*0.014)*j;
        const my = (this.y + p.y)/2 + Math.cos((this.y+t)*0.014)*j;
        g.noFill();
        g.beginShape();
        g.curveVertex(this.x, this.y);
        g.curveVertex(this.x, this.y);
        g.curveVertex(mx, my);
        g.curveVertex(p.x, p.y);
        g.curveVertex(p.x, p.y);
        g.endShape();

        links++;
      }
    }
  }
}

/* p5 setup/draw */
function setup(){

  // === PRESETS FROM URL ===
  try {
    const q = new URLSearchParams(location.search);
    const preset = (q.get('preset') || '').toLowerCase();
    if (preset === 'punchy') {
      sensitivity = 2.2;
      VIZ.connectRadius = 160;
      VIZ.trailAlpha = 22;
      VIZ.bloomPasses = 1;
    } else if (preset === 'chill') {
      sensitivity = 1.1;
      VIZ.connectRadius = 210;
      VIZ.trailAlpha = 46;
      bloom = true;
      VIZ.bloomPasses = 2;
    } else if (preset === 'dub') {
      sensitivity = 1.6;
      VIZ.connectRadius = 180;
      VIZ.trailAlpha = 34;
      extraBassBias = true;
      VIZ.bloomPasses = 2;
    }
  } catch(e){}

  pixelDensity(1);
  createCanvas(windowWidth, windowHeight);
  pg = createGraphics(width, height);

  // downscaled glow buffer
  glow = createGraphics(Math.max(1, width >> 1), Math.max(1, height >> 1));

  initPalettes();
  initParticles();
  pg.background(0);
}

function initParticles(){
  particles.length = 0;
  const count = Math.floor(width * VIZ.particleDensity);
  for (let i=0;i<count;i++) particles.push(new Particle());
}

function drawBackground(g){
  const cx = width*0.5 + Math.sin(t*0.0012)*80*(0.6+energy);
  const cy = height*0.5 + Math.cos(t*0.0011)*60*(0.6+energy);
  for (let r = Math.max(width,height); r>0; r -= 7){
    const k = map(r, 0, Math.max(width,height), 0, 1);
    const v = 10 + 26*(1-k)*(0.5+0.5*Math.sin(t*0.002+energy*3.2));
    g.noStroke();
    g.fill(v, v*0.8, v*0.9, 16);
    g.circle(cx, cy, r*2);
  }
}

function draw(){
  t++;

  // === URL BURST HOOK ===
  try {
    const last = +(localStorage.getItem('hm_burst') || 0);
    if (Date.now() - last < 1100) {
      sensitivity = Math.min(3.2, sensitivity + 0.6);
      VIZ.connectRadius = lerp(VIZ.connectRadius, VIZ.connectRadius * 0.78, 0.25);
    }
  } catch(e){}


  // ----- ENERGY ENVELOPE (from audio.js) -----
  const bands = (typeof getBandLevels==='function') ? getBandLevels() : {bass:0,mids:0,highs:0};
  const ema = (typeof getAudioLevel==='function') ? getAudioLevel() : 0; // ~0..~0.35 typical
  const BASS_BIAS = extraBassBias ? BASS_BIAS_ON : BASS_BIAS_OFF;

  // Weighted band mix
  let e = (bands.bass * BASS_BIAS + bands.mids * 0.22 + bands.highs * 0.06);
  // Auto-gain using EMA as "norm"
  const norm = constrain(ema * 3.0, 0, 3.0); // normalize for visibility
  e = Math.max(e, norm * 0.9);

  // Simple low-band peak punch
  const rise = Math.max(0, bands.bass - lastLow);
  lowRise = lowRise * 0.85 + rise * 0.15;
  if (lowRise > 0.10 && bands.bass > 0.35){ // tuned thresholds
    e = Math.min(1.6, e + 0.55);

    // Flash DROP! element on big bass rise
    try {
      const dropEl = document.getElementById('drop');
      if (dropEl) { dropEl.classList.add('show'); setTimeout(()=>dropEl.classList.remove('show'), 380); }
    } catch(e){}
  }
  lastLow = bands.bass;

  const target = Math.min(1.6, e * sensitivity);
  
  // === ADAPTIVE AUTO-GAIN ===
  {
    const targetVis = 0.42;
    const currentVis = Math.min(1, ema * 3.0);
    const err = targetVis - currentVis;
    sensitivity = constrain(sensitivity + err * 0.02, 0.8, 2.8);
  }

  energy += (target - energy) * (target > energy ? ATTACK : DECAY);

  // ----- RENDER -----
  pg.noStroke();
  pg.fill(0, VIZ.trailAlpha);
  pg.rect(0,0,width,height);

  drawBackground(pg);

  for (let p of particles) p.move();
  
for (let i=0; i<particles.length; i++){
  const p = particles[i];
  p.dot(pg);
}
// spatial hashing for neighbor links
{
  const cell = Math.max(32, VIZ.connectRadius * 0.9);
  const gridData = buildGrid(particles, cell);
  const cols = palettes[paletteIndex];
  for (let i=0; i<particles.length; i++){
    let links = 0;
    const pi = particles[i];
    forNeighbors(i, particles, gridData, cell, (j)=>{
      if (links >= MAX_CONNECTIONS_PER_PARTICLE) return;
      const pj = particles[j];
      const dx = pj.x - pi.x, dy = pj.y - pi.y;
      const d2 = dx*dx + dy*dy;
      const r = VIZ.connectRadius;
      if (d2 > r*r) return;
      links++;
      const d = Math.sqrt(d2);
      const widthBoost = 1.0 + energy*3.4 + energy*energy*1.8;
      const w = map(d, 0, r, 3.6*widthBoost, 0.35);
      const a = map(d, 0, r, 250, 90);
      const c = cols[Math.floor(map(d,0,r,0,cols.length))%cols.length];
      pg.stroke(c[0], c[1], c[2], a);
      pg.strokeWeight(w);
      const jtr = 8*(1+energy*1.2);
      const mx = (pi.x + pj.x)/2 + Math.sin((pi.x+t)*0.014)*jtr;
      const my = (pi.y + pj.y)/2 + Math.cos((pi.y+t)*0.014)*jtr;
      pg.noFill();
      pg.beginShape();
      pg.curveVertex(pi.x, pi.y);
      pg.curveVertex(pi.x, pi.y);
      pg.curveVertex(mx, my);
      pg.curveVertex(pj.x, pj.y);
      pg.curveVertex(pj.x, pj.y);
      pg.endShape();
    });
  }
}


  if (energy > 1.1){
    push();
    drawingContext.globalCompositeOperation = 'screen';
    fill(255, 255, 255, map(energy,1.1,1.6,10,40));
    rect(0,0,width,height);
    pop();
  }

  image(pg, 0, 0);

  
  // Downscaled glow pass (lighter than multiple full-res blits)
  glow.clear();
  glow.image(pg, 0, 0, glow.width, glow.height);
  glow.filter(BLUR, 2);
  push();
  drawingContext.globalCompositeOperation = 'screen';
  image(glow, 0, 0, width, height);
  pop();


  if ((frameCount & 3) === 0) scanlines();

  drawBanner();
  drawHUD(norm);
}

function scanlines(){
  stroke(255, 8);
  strokeWeight(1);
  for (let y=0; y<height; y+=3) line(0,y,width,y);
}

function drawBanner(){
  if (!VIZ.showLogo) return;
  // Show only on big swells so it reads as a callout
  const hype = energy > 0.95 ? map(energy, 0.95, 1.6, 0, 1) : 0;
  if (hype <= 0) return;
  const title = VIZ.bannerTitle;
  const sub = VIZ.bannerSub;
  const jx = (noise(t*0.02)-0.5)*2.0;

  push();
  textAlign(LEFT, TOP);
  noStroke();
  // scale alpha by hype
  fill(0, 170 * constrain(hype,0,1));
  textSize(42);
  const w = textWidth(title) + 260;
  rect(18, 72, w, 84, 16);

  fill(255, 255, 255, 40 * constrain(hype,0,1));
  text(title, 36 + jx + 0.8, 88 + 0.8);
  fill(255, 255, 255, 255 * constrain(hype,0,1));
  text(title, 36 + jx, 88);

  textSize(18);
  fill(220, 220 * constrain(hype,0,1));
  text(sub, 36, 124);
  pop();
}

function drawHUD(levelVis=0){
  // live meter bar (matches #meter > i in your HTML)
  const meterBar = document.querySelector('#meter > i');
  if (meterBar){
    meterBar.style.width = Math.min(1, levelVis).toFixed(3) * 100 + '%';
  }

  const hud = `Sens ${sensitivity.toFixed(2)}  Bass ${extraBassBias?"BIAS":"norm"}  Energy ${energy.toFixed(2)}  [K/J] Sens [T] Turbo [H] Bass [N] Palette [B] Bloom [L] Logo [R] Reset`;
  const w = textWidth(hud) + 24;
  noStroke();
  fill(0, 140);
  rect(width - w - 20, height - 50, w, 34, 10);
  fill(230);
  textAlign(RIGHT, CENTER);
  textSize(14);
  text(hud, width - 32, height - 33);
}

/* Hotkeys (visual toggles only) */
function keyPressed(){
  if (key==='M'||key==='m') mode = (mode+1)%3;
  if (key==='B'||key==='b') bloom = !bloom;
  if (key==='N'||key==='n') paletteIndex = (paletteIndex+1)%palettes.length;
  if (key==='L'||key==='l') VIZ.showLogo = !VIZ.showLogo;
  if (key==='R'||key==='r') initParticles();

  if (key==='K'||key==='k') sensitivity = Math.min(3.2, sensitivity + 0.08);
  if (key==='J'||key==='j') sensitivity = Math.max(0.5, sensitivity - 0.08);
  if (key==='T'||key==='t') sensitivity = Math.min(3.2, sensitivity + 0.35);
  if (key==='H'||key==='h') extraBassBias = !extraBassBias;
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
  pg = createGraphics(width, height);

  // downscaled glow buffer
  glow = createGraphics(Math.max(1, width >> 1), Math.max(1, height >> 1));

  pg.background(0);
  initParticles();
}
