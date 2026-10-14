import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../desktop/assets');
await fs.mkdir(directory,{recursive:true});
const master = await fs.readFile(path.join(directory,'brand-mark.svg'),'utf8');
const svg = Buffer.from(master.replaceAll('currentColor','#10b981'));
const images = [];
for (const size of [256,128,64,48,32,24,20,16]) images.push({size,png:await sharp(svg,{density:384}).resize(size,size).png().toBuffer()});
await fs.writeFile(path.join(directory,'app.png'),await sharp(svg,{density:384}).resize(512,512).png().toBuffer());
await fs.writeFile(path.join(directory,'tray.png'),images.find(image=>image.size===32).png);
const header=Buffer.alloc(6+16*images.length);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);let offset=header.length;
images.forEach(({size,png},i)=>{const p=6+i*16;header[p]=size===256?0:size;header[p+1]=size===256?0:size;header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(png.length,p+8);header.writeUInt32LE(offset,p+12);offset+=png.length;});
await fs.writeFile(path.join(directory,'app.ico'),Buffer.concat([header,...images.map(i=>i.png)]));
const chunks=[];
for (const [type,size] of [['icp4',16],['icp5',32],['icp6',64],['ic07',128],['ic08',256],['ic09',512],['ic10',1024]]) {
  const png=await sharp(svg,{density:384}).resize(size,size).png().toBuffer();
  const chunk=Buffer.alloc(8);chunk.write(type,0,4,'ascii');chunk.writeUInt32BE(png.length+8,4);chunks.push(chunk,png);
}
const icns=Buffer.alloc(8);icns.write('icns',0,4,'ascii');icns.writeUInt32BE(8+chunks.reduce((total,chunk)=>total+chunk.length,0),4);
await fs.writeFile(path.join(directory,'app.icns'),Buffer.concat([icns,...chunks]));
console.log('Created PNG, Windows ICO and macOS ICNS from the approved ring master.');
