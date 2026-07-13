const fs = require('fs');
const buf = fs.readFileSync('/expo-project/assets/images/amber-dot.png');
console.log('size:', buf.length);
console.log('PNG sig:', buf.slice(0, 8).toString('hex'));
// Expected: 89504e470d0a1a0a
console.log('IHDR chunk type:', buf.slice(12, 16).toString('ascii'));
console.log('Width:', buf.readUInt32BE(16));
console.log('Height:', buf.readUInt32BE(20));
console.log('Bit depth:', buf[24]);
console.log('Color type:', buf[25], '(6=RGBA)');
