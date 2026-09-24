// Snapshot the existing procedural harbor, trees and game definitions unchanged.
import fs from 'node:fs';
import * as THREE from '../../assets/vendor/three.module.js';
import { createPortModel, createTree, disposeModel } from '../../trade-winds-models.mjs';
import { PORTS, GOODS, VESSELS, toWorld, pointInPolygon, prices } from '../../trade-winds-engine.mjs';
import { findHarborPosition } from '../../trade-winds-port-placement.mjs';
const out = new URL('../assets/', import.meta.url);
const coast = JSON.parse(fs.readFileSync(new URL('../../assets/trade-winds/coast.json',import.meta.url)));
const bounds = coast.map(ring => ({ring,minX:Math.min(...ring.map(p=>p[0])),maxX:Math.max(...ring.map(p=>p[0])),minY:Math.min(...ring.map(p=>p[1])),maxY:Math.max(...ring.map(p=>p[1]))}));
const cache=new Map();
const land=(ix,iz)=>{
  const key=`${ix},${iz}`;
  if(!cache.has(key)) {
    const lon=(ix+.5)*10/220-80,lat=22-(iz+.5)*10/220;
    cache.set(key,bounds.some(p=>lon>=p.minX&&lon<=p.maxX&&lat>=p.minY&&lat<=p.maxY&&pointInPolygon(lon,lat,p.ring)));
  }
  return cache.get(key);
};
function blocks(root) {
  root.updateMatrixWorld(true);
  const parts=[],matrix=new THREE.Matrix4(),color=new THREE.Color();
  root.traverse(node=>{
    if(!node.isInstancedMesh) return;
    for(let i=0;i<node.count;i++) {
      node.getMatrixAt(i,matrix);matrix.premultiply(node.matrixWorld);
      node.getColorAt(i,color);
      parts.push({matrix:matrix.toArray().map(v=>+v.toFixed(5)),color:color.toArray()});
    }
  });
  disposeModel(root);
  return parts;
}
const port=PORTS.find(p=>p.id==='royal');
const rum=GOODS.find(g=>g.id==='rum');
fs.writeFileSync(new URL('world.json',out),JSON.stringify({port,harbor:findHarborPosition(toWorld(port.lon,port.lat),land),vessel:VESSELS.trader,rum:{...rum,...prices(port,rum)},ports:PORTS,portBlocks:blocks(createPortModel('merchant')),palmBlocks:blocks(createTree('palm',1)),canopyBlocks:blocks(createTree('canopy',1))}));
console.log('Exported original Port Royal geometry and trading definitions.');
