// Headmosh Neon Network — viz.js (CLEAN: bloom removed)
/* Visual-only; relies on window.getAudioLevel/getBandLevels from audio.js */

const VIZ = {
  particleDensity: 0.10,
  maxSpeed: 1.8,
  connectRadius: 190,
  trailAlpha: 34,
  showLogo: true,
  bannerTitle: "HEADMOSH STUDIO",
  bannerSub: "Go Head-First.",
};

/* State */
let particles = [];
let pg, t = 0;
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

  // ----- ENERGY ENVELOPE (from audio.js) -----
  const bands = (typeof getBandLevels==='function') ? getBandLevels() : {bass:0,mids:0,highs:0};
  const ema = (typeof getAudioLevel==='function') ? getAudioLevel() : 0; // ~0..~0.35 typical
  const BASS_BIAS = extraBassBias ? BASS_BIAS_ON : BASS_BIAS_OFF;

  // Weighted band mix
  let e = (bands.bass * BASS_BIAS + bands.mids * 0.22 + bands.highs * 0.06);
  // Auto-gain using EMA as "norm"
  const norm = constrain(ema * 3.0, 0, 3.0);
  e = Math.max(e, norm * 0.9);

  // Simple low-band peak punch
  const rise = Math.max(0, bands.bass - lastLow);
  lowRise = lowRise * 0.85 + rise * 0.15;
  if (lowRise > 0.10 && bands.bass > 0.35){
    e = Math.min(1.6, e + 0.55);
  }
  lastLow = bands.bass;

  const target = Math.min(1.6, e * sensitivity);
  energy += (target - energy) * (target > energy ? ATTACK : DECAY);

  // ----- RENDER -----
  pg.noStroke();
  pg.fill(0, VIZ.trailAlpha);
  pg.rect(0,0,width,height);

  //drawBackground(pg);

  for (let p of particles) p.move();
  for (let i=0;i<particles.length;i++){
    const p = particles[i];
    p.dot(pg);
    p.connect(pg, particles.slice(i+1));
  }

  if (energy > 1.1){
    push();
    drawingContext.globalCompositeOperation = 'screen';
    fill(255, 255, 255, map(energy,1.1,1.6,10,40));
    rect(0,0,width,height);
    pop();
  }

  image(pg, 0, 0);

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

  const hud = `Sens ${sensitivity.toFixed(2)}  Bass ${extraBassBias?"BIAS":"norm"}  Energy ${energy.toFixed(2)}  [K/J] Sens [T] Turbo [H] Bass [N] Palette [L] Logo [R] Reset`;
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
  pg.background(0);
  initParticles();
}
