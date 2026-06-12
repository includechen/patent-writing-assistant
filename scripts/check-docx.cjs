const fs = require('fs');
const path = require('path');
const p = process.argv[2];
const buf = fs.readFileSync(p);
console.log('size', buf.length);
console.log('magic', buf.slice(0, 4).toString('hex'));
try {
  const AdmZip = null;
  const { execSync } = require('child_process');
  execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::OpenRead('${p.replace(/'/g, "''")}').Entries.Count"`, { stdio: 'inherit' });
} catch (e) {
  console.log('zip err', e.message);
}
