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
  triangleStep: 3            // NEW: lower = more triangles (default 3)
};

/* State */
let particles = [];
let pg, t = 0;
let bloom = true;
let mode = 0; // 0=Network, 1=Triangles, 2=Flow
let palettes, paletteIndex = 0;

let energy = 0;
let sensitivity = 1.6;
let extraBassBias = true;

/* Simple low-band peak detect */
let lastLow = 0;
let lowRise = 0;

/* Envelope dynamics */
const ATTACK = 0.95;
const DECAY  = 0.22;
const BASS_BIAS_ON  = 0.78;
const BASS_BIAS_OFF = 0.60;

const MAX_CONNECTIONS_PER_PARTICLE = 22;

/* Palettes */
function initPalettes(){
  palettes = [
    [ [10,240,255], [180,90,255], [255,80,180], [255,210,60] ],
    [ [90,200,255], [90,255,160], [255,120,120], [250,250,180] ],
    [ [255,100,40], [255,220,40], [80,220,255], [120,120,255] ],
    [ [140,255,220], [255,80,140], [110,150,255], [255,220,160] ],
  ];
}

/* Particle */
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

        const j = 8*(1+energy*1.2);
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

/* Setup */
function setup(){
  pixelDensity(1);
  createCanvas(windowWidth, windowHeight);
  pg = createGraphics(width, height);
  initPalettes();
  initParticles();
  pg.background(0);
}

function initParticles(){
  particles.length = 0;
  const count = Math.floor(width * VIZ.particleDensity);
  for (let i=0;i<count;i++) particles.push(new Particle());
}

/* Draw */
function draw(){
  t++;

  const bands = (typeof getBandLevels==='function') ? getBandLevels() : {bass:0,mids:0,highs:0};
  const ema = (typeof getAudioLevel==='function') ? getAudioLevel() : 0;
  const BASS_BIAS = extraBassBias ? BASS_BIAS_ON : BASS_BIAS_OFF;

  let e = (bands.bass * BASS_BIAS + bands.mids * 0.22 + bands.highs * 0.06);
  const norm = constrain(ema * 3.0, 0, 3.0);
  e = Math.max(e, norm * 0.9);

  const rise = Math.max(0, bands.bass - lastLow);
  lowRise = lowRise * 0.85 + rise * 0.15;
  if (lowRise > 0.10 && bands.bass > 0.35){ e = Math.min(1.6, e + 0.55); }
  lastLow = bands.bass;

  const target = Math.min(1.6, e * sensitivity);
  energy += (target - energy) * (target > energy ? ATTACK : DECAY);

  // ----- RENDER -----
  pg.noStroke();
  pg.fill(0, VIZ.trailAlpha);
  pg.rect(0,0,width,height);   // ← black background each frame

  for (let p of particles) p.move();

  if (mode===0){
    for (let i=0;i<particles.length;i++){
      const p = particles[i];
      p.dot(pg);
      p.connect(pg, particles.slice(i+1));
    }
  } else if (mode===1){
    drawTriangles(pg, energy);
  } else {
    drawFlow(pg, energy);
  }

  image(pg, 0, 0);

  if (bloom){
    push();
    drawingContext.globalCompositeOperation = 'screen';
    for (let i=0;i<VIZ.bloomPasses;i++) image(pg, 0, 0);
    pop();
  }

  if ((frameCount & 3) === 0) scanlines();

  drawBanner();
  drawHUD(norm);
}

/* Scanlines */
function scanlines(){
  stroke(255, 8);
  strokeWeight(1);
  for (let y=0; y<height; y+=3) line(0,y,width,y);
}

/* Banner + HUD */
function drawBanner(){
  if (!VIZ.showLogo) return;
  const title = VIZ.bannerTitle;
  const sub = VIZ.bannerSub;
  const jx = (noise(t*0.02)-0.5)*2.0;

  push();
  textAlign(LEFT, TOP);
  noStroke();
  fill(0, 170);
  textSize(42);
  const w = textWidth(title) + 260;
  rect(18, 72, w, 84, 16);

  fill(255, 255, 255, 40);
  text(title, 36 + jx + 0.8, 88 + 0.8);
  fill(255);
  text(title, 36 + jx, 88);

  textSize(18);
  fill(220);
  text(sub, 36, 124);
  pop();
}

function drawHUD(levelVis=0){
  const meterBar = document.querySelector('#meter > i');
  if (meterBar){
    meterBar.style.width = Math.min(1, levelVis).toFixed(3) * 100 + '%';
  }

  const hud = `Sens ${sensitivity.toFixed(2)}  TriStep ${VIZ.triangleStep}  Mode ${mode}  Energy ${energy.toFixed(2)}  [K/J] Sens [T] Turbo [H] Bass [M] Mode [< / >] Triangles [N] Palette [B] Bloom [L] Logo [R] Reset`;
  const w = textWidth(hud) + 24;
  noStroke();
  fill(0, 140);
  rect(width - w - 20, height - 50, w, 34, 10);
  fill(230);
  textAlign(RIGHT, CENTER);
  textSize(14);
  text(hud, width - 32, height - 33);
}

/* Triangles */
function drawTriangles(g, energy){
  const nodes = [];
  const step = VIZ.triangleStep; // ← uses config
  for (let i=0; i<particles.length; i+=step){
    nodes.push(particles[i]);
  }

  const r = Math.max(60, VIZ.connectRadius*0.7);
  const pal = palettes[paletteIndex];
  g.noStroke();

  for (let i=0;i<nodes.length-2;i++){
    const a = nodes[i], b = nodes[i+1], c = nodes[i+2];
    const col = pal[(i)%pal.length];
    const alpha = 28 + Math.min(80, energy*110);
    g.fill(col[0], col[1], col[2], alpha);
    g.triangle(a.x,a.y,b.x,b.y,c.x,c.y);
  }
}

/* Flow (kept as-is) */
let flowSeeds = [];
let flowInit = false;
let flowLayer;

function ensureFlow(){
  if (!flowInit){
    flowLayer = createGraphics(width, height);
    flowLayer.clear();
    flowSeeds = Array.from({length: 280}, () => ({
      x: Math.random()*width,
      y: Math.random()*height,
      life: 40 + Math.random()*60
    }));
    flowInit = true;
  }
}

function drawFlow(g, energy){
  ensureFlow();
  flowLayer.noStroke();
  flowLayer.fill(0, Math.max(8, VIZ.trailAlpha*0.35));
  flowLayer.rect(0,0,width,height);
  flowLayer.stroke(255, 40 + energy*140);
  flowLayer.strokeWeight(1.2 + energy*0.8);
  for (let s of flowSeeds){
    let x=s.x, y=s.y;
    for (let i=0;i<14;i++){
      const ang = noise((x+t)*0.002, (y-t)*0.002, t*0.002)*TAU + energy*0.8;
      const sp = 1.2 + energy*1.8;
      const nx = x + Math.cos(ang)*sp;
      const ny = y + Math.sin(ang)*sp;
      flowLayer.line(x,y,nx,ny);
      x=nx; y=ny;
    }
    s.x = x; s.y = y; s.life -= 1;
    if (s.x < -10 || s.x > width+10 || s.y < -10 || s.y > height+10 || s.life <= 0){
      s.x = Math.random()*width; s.y = Math.random()*height; s.life = 40 + Math.random()*60;
    }
  }
  push();
  drawingContext.globalCompositeOperation='screen';
  image(flowLayer,0,0);
  pop();
}

/* Hotkeys */
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

  if (key==='<' || key===',') VIZ.triangleStep = Math.max(1, VIZ.triangleStep-1);
  if (key==='>' || key==='.') VIZ.triangleStep = VIZ.triangleStep+1;
}

/* Resize */
function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
  pg = createGraphics(width, height);
  pg.background(0);
  initParticles();
  flowInit = false;
  ensureFlow();
}

