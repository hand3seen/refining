// p5 visual + handlers for palette/burst/drop — split file
var inc = 0.1, scl = 90, cols, rows, zoff = 0;
var particles = [], flowfield;
var palette = 'default'; // 'neon', 'mono', etc.
var burstTicks = 0;

// Simple palettes
const PALETTES = {
  default: { bg:'#000000', accent:'#ffc600', ink:'#111111' },
  neon:    { bg:'#02010f', accent:'#00fff0', ink:'#0a0a2a' },
  ember:   { bg:'#0b0502', accent:'#ff7a00', ink:'#201008' },
  mono:    { bg:'#0a0a0a', accent:'#dddddd', ink:'#191919' }
};
function pal(){ return PALETTES[palette] || PALETTES.default; }

function setup(){
  createCanvas(window.innerWidth, window.innerHeight);
  cols=floor(width/scl); rows=floor(height/scl);
  flowfield = new Array(cols*rows);
  for (var i=0;i<30;i++) particles[i]=new Particle();
  background(pal().bg);
}

function windowResized(){
  resizeCanvas(window.innerWidth, window.innerHeight);
  cols=floor(width/scl); rows=floor(height/scl);
  flowfield = new Array(cols*rows);
  background(pal().bg);
}

function draw(){
  const lvl = (typeof getAudioLevel==='function') ? getAudioLevel() : 0.0;
  const bands = (typeof getBandLevels==='function') ? getBandLevels() : {bass:0,mids:0,highs:0};
  const bass=constrain(map(bands.bass,0,0.4,0,1),0,1);
  const mids=constrain(map(bands.mids,0,0.35,0,1),0,1);
  const highs=constrain(map(bands.highs,0,0.3,0,1),0,1);

  // Burst multiplies mids/highs temporarily
  const burst = max(0, burstTicks/60.0);
  const mag = 0.70 + (bass * 0.7) + burst*3;
  const incBoost = 0.06 + (mids * 0.30) + burst*0.05;
  const zBoost = 0.00015 + (mids * 0.001) + burst*0.0006;
  const highlight = highs + burst*0.4;

  var yoff=0;
  for (var y=0;y<rows;y++){
    var xoff=0;
    for (var x=0;x<cols;x++){
      var index=x+y*cols;
      var angle=noise(xoff,yoff,zoff)*TWO_PI*7;
      var v=p5.Vector.fromAngle(angle);
      v.setMag(mag);
      flowfield[index]=v;
      xoff+=incBoost;
    }
    yoff+=incBoost;
    zoff+=zBoost;
  }

  // transparent overlay to slowly fade trails
  noStroke(); fill(0, 10); rect(0,0,width,height);

  for (var i=0;i<particles.length;i++){
    var p=particles[i];
    p.reactEnergy = constrain(map(lvl,0,0.35,0,1),0,1);
    p.reactBands = {bass:bass, mids:mids, highs:highlight};
    p.follow(flowfield); p.update(); p.edges(); p.show();
  }

  if (burstTicks>0) burstTicks--;
}

// ---- Particle (stylized lines/points) ----
function Particle(){
  this.pos=createVector(random(width),random(height));
  this.vel=createVector(0,0);
  this.acc=createVector(0,0);
  this.maxspeed=0.5;
  this.prevPos=this.pos.copy();
  this.reactEnergy=0; this.reactBands={bass:0,mids:0,highs:0};

  this.update=function(){
    var speedBoost = 1.0 + this.reactBands.bass*0.9 + this.reactBands.mids*0.3;
    this.vel.add(this.acc); this.vel.limit(this.maxspeed*speedBoost);
    this.pos.add(this.vel); this.acc.mult(0);
  }
  this.applyForce=function(force){ this.acc.add(force); }
  this.follow=function(vectors){
    var x=floor(this.pos.x/scl), y=floor(this.pos.y/scl);
    x=constrain(x,0,cols-1); y=constrain(y,0,rows-1);
    var index=x+y*cols; var force=vectors[index]; if(force) this.applyForce(force);
  }
  this.show=function(){
    const theme=pal();
    // layered strokes
    stroke(theme.ink); strokeWeight(110 + this.reactEnergy*60); strokeCap(SQUARE);
    line(this.pos.x+3,this.pos.y+30,this.prevPos.x+5,this.prevPos.y+5);

    stroke(theme.accent); strokeWeight(2 + this.reactBands.highs*8); point(this.pos.x+7,this.pos.y-3);
    if (random()<0.12*this.reactBands.highs){ stroke(255); strokeWeight(1 + this.reactBands.highs*3); point(this.pos.x+random(-8,8), this.pos.y+random(-8,8)); }

    stroke(34); strokeWeight(150); line(this.pos.x+3,this.pos.y+30,this.prevPos.x+5,this.prevPos.y+55);
    stroke(0); strokeWeight(170); line(this.pos.x+3,this.pos.y+40,this.prevPos.x+5,this.prevPos.y+75);
    stroke(51); strokeWeight(110); line(this.pos.x+3,this.pos.y+30,this.prevPos.x+5,this.prevPos.y+85);

    // faint white trail
    stroke(255, 130); strokeWeight(1 + this.reactEnergy*2);
    line(this.pos.x-80,this.pos.y,this.prevPos.x+60,this.prevPos.y);
    this.updatePrev();
  }
  this.updatePrev=function(){ this.prevPos.x=this.pos.x; this.prevPos.y=this.pos.y; }
  this.edges=function(){
    if (this.pos.x>width){ this.pos.x=0; this.updatePrev(); }
    if (this.pos.x<0){ this.pos.x=width; this.updatePrev(); }
    if (this.pos.y>height){ this.pos.y=0; this.updatePrev(); }
    if (this.pos.y<0){ this.pos.y=height; this.updatePrev(); }
  }
}

// ---- Handlers for mock chat & hotkeys ----
window.HM_onPalette = (name)=>{
  palette = name || 'default';
  background(pal().bg);
};
window.HM_onBurst = ({power=1,band='highs'}={})=>{
  burstTicks = floor(30 + power*60); // ~1–1.5s kick
  const lt = document.querySelector('.lower-third');
  if(lt){ lt.style.borderColor = '#ffc600'; setTimeout(()=> lt.style.borderColor = 'rgba(255,255,255,.2)', 400); }
};
window.HM_onDrop = ()=>{
  const el=document.getElementById('drop');
  if(!el) return;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  setTimeout(()=> el.style.display='none', 1400);
};

// --- Hotkeys ---
window.addEventListener('keydown', (e)=>{
  if(e.key==='1') HM_onPalette('default');
  if(e.key==='2') HM_onPalette('neon');
  if(e.key==='3') HM_onPalette('ember');
  if(e.key==='4') HM_onPalette('mono');
  if(e.code==='Space'){ e.preventDefault(); HM_onBurst({power:1}); }
  if(e.key==='d'||e.key==='D'){ HM_onDrop(); }
});
