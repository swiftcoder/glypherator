
// Use the anchor to enable gif output
var doGif = window.location.hash.substring(1) === 'gif';
// Use the query string as the seed value
var inputSeed = parseInt(window.location.search.substring(1))

// Quick and dirty pseudo-random numbers
Math.seed = function(s) {
    console.log(s);
    var m_w  = s;
    var m_z  = s + 987654321;
    var mask = 0xffffffff;

    var random = function() {
      m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
      m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;

      var result = ((m_z << 16) + m_w) & mask;
      result /= 4294967296;

      return result + 0.5;
    }

    return random;
}

function randomRange(random, min, max) {
  return random()*(max-min) + min;
}

function vectorLength(x, y) {
  return Math.sqrt(x*x + y*y);
}

function Point(x, y) {
  this.x = x || 0;
  this.y = y || 0;
}

// 2-dimensional axis-aligned bounding box
function Bounds() {
  this.min = new Point();
  this.max = new Point();

  this.reset = function() {
    this.min.x = 4503599627370495;
    this.min.y = 4503599627370495;
    this.max.x = -4503599627370495;
    this.max.y = -4503599627370495;
  }

  this.reset();

  this.addPoint = function(p) {
    if (p.x < this.min.x)
      this.min.x = p.x;
    if (p.x > this.max.x)
      this.max.x = p.x;
    if (p.y < this.min.y)
      this.min.y = p.y;
    if (p.y > this.max.y)
      this.max.y = p.y;
  }

  this.center = function() {
    return new Point(this.min.x + (this.max.x - this.min.x)/2.0,
                     this.min.y + (this.max.y - this.min.y)/2.0);
  }

  this.size = function() {
    return new Point(Math.abs(this.max.x - this.min.x),
                     Math.abs(this.max.y - this.min.y));
  }
}

// This is a glyph renderer which doesn't draw anything
// Instead it calculates the bounding box and line length of the glyph
function Measure() {
  this.length = 0;
  this.transform = new Matrix();
  this.bounds = new Bounds();

  this._addPoint = function(p) {
    q = this.transform.applyToPoint(p.x, p.y);
    this.bounds.addPoint(q);
  }

  this._addCircle = function(p, r) {
    q = this.transform.applyToPoint(p.x, p.y);
    this.bounds.addPoint(new Point(q.x+r, q.y+r));
    this.bounds.addPoint(new Point(q.x-r, q.y-r));
  }

  this.begin = function() {
    this.length = 0;
    this.transform.reset();
    this.bounds.reset();
  }

  this.end = function() {}

  this.translate = function(x, y) {
    this.transform.translate(x, y);
  }
  this.rotate = function(angle) {
    this.transform.rotate(angle);
  }

  this.line = function(low, high, end) {
    this.length += Math.abs(high - low);
    this._addPoint(new Point(0, low));
    this._addPoint(new Point(0, high));
    this.transform.translate(0, end);
  }

  this.arc = function(centerX, centerY, pointX, pointY, arcAngle, anticlockwise) {
    var diffX = centerX - pointX;
    var diffY = centerY - pointY;
    var radius = vectorLength(diffX, diffY);

    var startAngle = Math.atan2(diffY, diffX) - Math.PI;
    var endAngle = startAngle + arcAngle;

    var x = centerX + radius*Math.cos(endAngle);
    var y = centerY + radius*Math.sin(endAngle);

    this.length += radius * arcAngle;
    this._addCircle(new Point(centerX, centerY), radius);
    this.transform.translate(x, y);
    this.transform.rotate(endAngle - Math.PI/2);
  }
}

// This renderer actually draws the glyph, clipped to a percentage of the
// total length, after applying a preliminary transform
function Renderer(context) {
  this.context = context;
  this.maxLength = 4503599627370495;
  this.length = 0;
  this.preTransform = new Matrix();

  this.begin = function() {
    this.length = 0;

    this.context.save();

    this.context.fillStyle = 'rgb(0,0,0)'
    this.context.fillRect(0, 0, 512, 512);
    this.context.strokeStyle = 'rgb(255,255,255)';

    this.preTransform.applyToContext(this.context);

    this.context.beginPath();
  }

  this.end = function() {
    this.context.stroke();

    this.context.restore();
  }

  this.translate = function(x, y) {
    this.context.translate(x, y);
  }

  this.rotate = function(angle) {
    this.context.rotate(angle);
  }

  this.line = function(low, high, end) {
    if (this.length >= this.maxLength)
      return;

    this.length += Math.abs(high - low);

    if (this.length > this.maxLength)
      high -= (this.length - this.maxLength) * Math.sign(high - low);

    this.context.moveTo(0, low);
    this.context.lineTo(0, high);
    this.context.translate(0, end);
  }

  this.arc = function(centerX, centerY, pointX, pointY, arcAngle, anticlockwise) {
    if (this.length >= this.maxLength)
      return;

    var diffX = centerX - pointX;
    var diffY = centerY - pointY;
    var radius = vectorLength(diffX, diffY);

    this.length += radius * arcAngle;

    if (this.length > this.maxLength)
      arcAngle -= (this.length - this.maxLength)*1.0/radius;

    var startAngle = Math.atan2(diffY, diffX) - Math.PI;
    var endAngle = startAngle + arcAngle;

    var x = centerX + radius*Math.cos(endAngle);
    var y = centerY + radius*Math.sin(endAngle);

    this.context.arc(centerX, centerY, radius, startAngle, endAngle, anticlockwise);
    this.context.translate(x, y);
    this.context.rotate(endAngle - Math.PI/2);
  }
}

// This is the state machine which actually generates the glyph
function Shape(seed) {

  console.log(seed)

  this.doLine = function(renderer, random) {
    renderer.line(randomRange(random, -25, 0),
                  randomRange(random, 75, 100),
                  randomRange(random, 25, 75));
    this.last = 'line';
  }

  this.doArc = function(renderer, random) {
    if (random() < 0.5)
      var angle = Math.round(randomRange(random, 1, 8)) * Math.PI/4.0;
    else
      var angle = Math.PI*2.0;

    var radius = randomRange(random, 15, 60);
    var direction = Math.round(randomRange(random, 1, 8)) * Math.PI/4.0;
    renderer.arc(radius * Math.sin(direction),
                 radius * Math.cos(direction),
                 0,
                 0,
                 angle,
                 false);
    this.last = 'arc';
  }

  this.doRotate = function(renderer, random) {
    renderer.rotate(Math.round(randomRange(random, 1, 7)) * Math.PI/4.0);
    this.last = 'rotate';
  }

  this.draw = function(renderer) {
    renderer.begin();

    var random = Math.seed(seed);

    this.last = 'rotate';

    var segments = randomRange(random, 4, 6);
    for (var i = 0; i < segments; ++i) {
      if (this.last === 'rotate' || this.last === 'arc') {
        this.doLine(renderer, random);
      } else if (this.last === 'line') {
        if (random() < 0.75)
          this.doArc(renderer, random);
        else {
          this.doRotate(renderer, random);
        }
      }
    }

    renderer.end();
  }

}

// This renders a Shape in 2 passes, once to measure, and again to draw,
// after applying a suitable transformation
function Glyph(context, seed) {
  this.context = context;
  this.measure = new Measure();
  this.renderer = new Renderer(context);
  this.shape = new Shape(seed);

  this.loop = function(t) {
    this.shape.draw(this.measure);
    this.renderer.maxLength = this.measure.length * t;

    var min = this.measure.bounds.min;
    var size = this.measure.bounds.size();
    var sx = size.x + 20;
    var sy = size.y + 20;
    var factor = Math.min(512.0/sx, 512.0/sy);

    this.renderer.preTransform.reset();
    this.renderer.preTransform.translate((512 - size.x*factor)/2, (512 - size.y*factor)/2);
    this.renderer.preTransform.scale(factor, factor);
    this.renderer.preTransform.translate(-min.x, -min.y);

    this.shape.draw(this.renderer);
  }
}

// Main entry point, optionally sets up the gif generator
function start() {
  var canvas = document.getElementById('bitmap');
  var context = canvas.getContext('2d');

 var encoder = doGif ? new GIF({
    workers: 4,
    quality: 10,
    width: 512,
    height: 512,
    dither: true
  }) : null;

  var randomSeed = inputSeed || Math.floor(Math.random()*1024);
  document.getElementById('randomSeed').textContent = randomSeed;

  glyph = new Glyph(context, randomSeed);
  draw(glyph, encoder, 0.0);
}

// If we are making a gif, encode it here
function finish(encoder) {
  if (!doGif)
    return;

  encoder.on('finished', function(blob) {
    window.open(URL.createObjectURL(blob));
  });

  encoder.render();
}

// This is the main loop
function draw(glyph, encoder, t) {
  glyph.loop(t);

  t += 1.0/240.0;

  if (doGif) {
    delay = 16;
    if (t >= 1.0)
      delay = 3000;

    encoder.addFrame(glyph.context, {delay: delay, copy: true});
  }

  if (t < 1.0) {
    requestAnimationFrame(function() { draw(glyph, encoder, t) });
  } else {
    finish(encoder);
  }
}
