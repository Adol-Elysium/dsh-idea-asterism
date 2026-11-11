import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';

const libraryModule={exports:{}};
runInNewContext(readFileSync(new URL('../assets/jszip.min.js',import.meta.url),'utf8'),{
 module:libraryModule,exports:libraryModule.exports,require:createRequire(import.meta.url),
 Buffer,Uint8Array,ArrayBuffer,Promise,setImmediate,setTimeout,clearTimeout
});
const JSZip=libraryModule.exports;
const readZipText=runInNewContext(
 readFileSync(new URL('../src/media.js',import.meta.url),'utf8')+'\nreadZipText',
 {TextDecoder,Uint8Array,Promise}
);

test('bounded archive reader counts UTF-8 bytes and preserves normal document text',async()=>{
 const text='你好，星图',bytes=new TextEncoder().encode(text).byteLength;
 const zip=new JSZip();zip.file('word/document.xml',text);
 const loaded=await JSZip.loadAsync(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}));
 assert.equal(await readZipText(loaded.file('word/document.xml'),bytes,'oversize'),text);
 await assert.rejects(readZipText(loaded.file('word/document.xml'),bytes-1,'oversize'),/oversize/);
});

test('forged ZIP size is rejected before stream completion and pauses decompression',async()=>{
 const zip=new JSZip();zip.file('star-sea.json','x'.repeat(256*1024));
 const data=Buffer.from(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}));
 const local=data.indexOf(Buffer.from([0x50,0x4b,0x03,0x04]));
 const central=data.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
 assert.ok(local>=0&&central>local);
 data.writeUInt32LE(1,local+22);data.writeUInt32LE(1,central+24);
 const loaded=await JSZip.loadAsync(new Uint8Array(data));
 const entry=loaded.file('star-sea.json'),internalStream=entry.internalStream.bind(entry);
 let pauses=0,ended=false;
 entry.internalStream=type=>{
  const stream=internalStream(type),pause=stream.pause.bind(stream);
  stream.on('end',()=>{ended=true;});
  stream.pause=()=>{pauses++;return pause();};
  return stream;
 };
 await assert.rejects(readZipText(entry,4096,'actual output limit'),/actual output limit/);
 assert.ok(pauses>0);assert.equal(ended,false);
});
