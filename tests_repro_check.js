const H = require('./tests/harness');
const C = H.loadPlatform();
const {Settings} = C;

console.log('--- case 1: muted valid, everything else garbage ---');
const out1 = Settings.sanitize({ version:1, muted:true, keybinds:'garbage', reducedMotion:{}, showMeter:null });
console.log('muted:', out1.muted, 'jump:', out1.keybinds.jump.join(','));
console.log('full out1:', JSON.stringify(out1));

console.log('--- case 2: muted corrupted, everything else valid ---');
const out2 = Settings.sanitize({ version:1, muted:{nested:true}, keybinds:{left:['KeyH'],right:['KeyL'],up:['KeyK'],down:['KeyJ'],jump:['KeyF'],roll:['KeyG'],attack:['KeyE']}, reducedMotion:true, showMeter:false });
console.log('muted:', out2.muted, 'jump:', out2.keybinds.jump.join(','));
console.log('full out2:', JSON.stringify(out2));

console.log('--- case 3: combined corruption + __proto__/constructor key payload ---');
const evil = JSON.parse('{"version":1,"muted":true,"keybinds":{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted2":true}},"jump":["KeyZ"]},"reducedMotion":"nope","showMeter":42}');
const out3 = Settings.sanitize(evil);
console.log('muted:', out3.muted, 'jump:', out3.keybinds.jump.join(','));
console.log('polluted on Object.prototype?', ({}).polluted, ({}).polluted2);
console.log('full out3:', JSON.stringify(out3));

console.log('--- case 4: reverse direction, keybinds valid but muted a function-like corrupted, and reducedMotion also holds boolean-looking string  ---');
const out4 = Settings.sanitize({version:1, muted:'true', keybinds:{jump:['KeyQ']}, reducedMotion:true, showMeter:true});
console.log('muted:', out4.muted, 'jump:', out4.keybinds.jump.join(','), 'reducedMotion:', out4.reducedMotion, 'showMeter:', out4.showMeter);
