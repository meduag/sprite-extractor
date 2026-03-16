import React, { useState, useEffect, useRef } from 'react';
import { Download, FileJson, Image as ImageIcon, Loader2, CheckCircle2, XCircle, Trash2, Zap, FileArchive, ArrowRight, Eye, RefreshCcw, Info } from 'lucide-react';

/**
 * Sprite Pro Utility - Versão 2.5
 * - Correção definitiva das cores para PVRv2 e v3.
 * - Ajuste dos IDs de formato (RGBA4444 vs RGBA5551).
 * - Melhoria na expansão de bits para cores de 16-bit.
 */

const parsePlist = (text) => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");
  const parseNode = (node) => {
    if (node.tagName === 'dict') {
      const obj = {};
      for (let i = 0; i < node.childNodes.length; i++) {
        if (node.childNodes[i].tagName === 'key') {
          const key = node.childNodes[i].textContent;
          let nextNode = node.childNodes[i].nextSibling;
          while (nextNode && nextNode.nodeType !== 1) nextNode = nextNode.nextSibling;
          obj[key] = parseNode(nextNode);
        }
      }
      return obj;
    } else if (node.tagName === 'string') return node.textContent;
    else if (node.tagName === 'true') return true;
    else if (node.tagName === 'false') return false;
    else if (node.tagName === 'integer') return parseInt(node.textContent, 10);
    return null;
  };
  const rootDict = xmlDoc.getElementsByTagName('dict')[0];
  return rootDict ? parseNode(rootDict) : null;
};

const extractNumbers = (str) => (str ? (str.match(/\d+/g) || []).map(Number) : [0, 0, 0, 0]);

export default function App() {
  const [plistFile, setPlistFile] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [cczFile, setCczFile] = useState(null);
  const [convertedPngUrl, setConvertedPngUrl] = useState(null);
  const [pvrVersion, setPvrVersion] = useState(null);
  
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [libsLoaded, setLibsLoaded] = useState({ jszip: false, pako: false });

  useEffect(() => {
    const loadScript = (src, key) => {
      if (window[key]) { setLibsLoaded(p => ({ ...p, [key.toLowerCase()]: true })); return; }
      const script = document.createElement('script');
      script.src = src; script.async = true;
      script.onload = () => setLibsLoaded(p => ({ ...p, [key.toLowerCase()]: true }));
      document.head.appendChild(script);
    };
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", "JSZip");
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js", "pako");
  }, []);

  const reset = () => {
    setPlistFile(null);
    setImageFile(null);
    setCczFile(null);
    setConvertedPngUrl(null);
    setPvrVersion(null);
    setStatus('idle');
    setProgress(0);
    setErrorMsg('');
  };

  const handleFileChange = (e, setter) => {
    const file = e.target.files[0];
    if (file) {
      setter(file);
      setStatus('idle');
      setErrorMsg('');
      if (setter === setCczFile) {
        setConvertedPngUrl(null);
        setPvrVersion(null);
      }
    }
  };

  const decodePvrToCanvas = (arrayBuffer) => {
    const header = new DataView(arrayBuffer);
    let width, height, dataOffset, pixelFormat;
    
    const magicV3 = header.getUint32(0, true); 
    const magicV2Signature = header.getUint32(44, true); 

    if (magicV3 === 0x03525650) {
      setPvrVersion("PVR v3");
      pixelFormat = header.getUint32(8, true); 
      height = header.getUint32(24, true);
      width = header.getUint32(28, true);
      dataOffset = 52 + header.getUint32(48, true);
    } else if (magicV3 === 52 || magicV2Signature === 0x44345250) {
      setPvrVersion("PVR v2 (Legado)");
      dataOffset = header.getUint32(0, true);
      height = header.getUint32(4, true);
      width = header.getUint32(8, true);
      pixelFormat = header.getUint32(16, true) & 0xFF; 
    } else {
      throw new Error(`Ficheiro PVR não reconhecido (0x${magicV3.toString(16)}).`);
    }

    const pixelData = new Uint8Array(arrayBuffer, dataOffset);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    const isV3 = magicV3 === 0x03525650;
    let formatFound = true;

    // Correção dos IDs de formato para PVR v2
    const RGBA8888 = isV3 ? 0 : 0x12; 
    const RGBA4444 = isV3 ? 5 : 0x10; // Em v2, 0x10 é 4444
    const RGBA5551 = isV3 ? 4 : 0x11; // Em v2, 0x11 é 5551
    const RGB565   = isV3 ? 3 : 0x13;

    if (pixelFormat === RGBA8888) {
      for (let i = 0; i < data.length; i++) data[i] = pixelData[i];
    } else if (pixelFormat === RGBA4444) {
      for (let i = 0, j = 0; i < pixelData.length && j < data.length; i += 2, j += 4) {
        const p = (pixelData[i + 1] << 8) | pixelData[i];
        // RRRR GGGG BBBB AAAA (Big Endian logic em 16-bit word)
        const r = (p >> 12) & 0x0F;
        const g = (p >> 8)  & 0x0F;
        const b = (p >> 4)  & 0x0F;
        const a = p & 0x0F;
        data[j]     = (r << 4) | r;
        data[j + 1] = (g << 4) | g;
        data[j + 2] = (b << 4) | b;
        data[j + 3] = (a << 4) | a;
      }
    } else if (pixelFormat === RGBA5551) {
      for (let i = 0, j = 0; i < pixelData.length && j < data.length; i += 2, j += 4) {
        const p = (pixelData[i + 1] << 8) | pixelData[i];
        const r = (p >> 11) & 0x1F;
        const g = (p >> 6)  & 0x1F;
        const b = (p >> 1)  & 0x1F;
        const a = p & 0x01;
        data[j]     = (r << 3) | (r >> 2);
        data[j + 1] = (g << 3) | (g >> 2);
        data[j + 2] = (b << 3) | (b >> 2);
        data[j + 3] = a ? 255 : 0;
      }
    } else if (pixelFormat === RGB565) {
      for (let i = 0, j = 0; i < pixelData.length && j < data.length; i += 2, j += 4) {
        const p = (pixelData[i + 1] << 8) | pixelData[i];
        const r = (p >> 11) & 0x1F;
        const g = (p >> 5)  & 0x3F;
        const b = p & 0x1F;
        data[j]     = (r << 3) | (r >> 2);
        data[j + 1] = (g << 2) | (g >> 4);
        data[j + 2] = (b << 3) | (b >> 2);
        data[j + 3] = 255;
      }
    } else {
      formatFound = false;
    }

    if (!formatFound) {
      throw new Error(`Formato de cor ${pixelFormat} não suportado. Tente exportar como RGBA8888.`);
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  };

  const handleCczToPng = async () => {
    if (!cczFile || !window.pako) return;
    setStatus('processing');
    setProgress(20);
    try {
      const buffer = await cczFile.arrayBuffer();
      const view = new Uint8Array(buffer);
      if (String.fromCharCode(...view.slice(0, 4)) !== 'CCZ!') throw new Error("Assinatura CCZ inválida.");
      
      setProgress(50);
      const decompressed = window.pako.inflate(view.slice(16));
      setProgress(80);
      
      const pngDataUrl = decodePvrToCanvas(decompressed.buffer);
      setConvertedPngUrl(pngDataUrl);
      
      const link = document.createElement('a');
      link.href = pngDataUrl;
      link.download = cczFile.name.replace('.ccz', '.png').replace('.pvr', '');
      link.click();
      
      setStatus('success');
    } catch (err) {
      setErrorMsg(err.message || "Erro na conversão.");
      setStatus('error');
    }
  };

  const handleExtractSprites = async () => {
    if (!libsLoaded.jszip || !plistFile || !imageFile) return;
    setStatus('processing');
    setProgress(0);
    try {
      const JSZip = window.JSZip;
      const zip = new JSZip();
      const data = parsePlist(await plistFile.text());
      if (!data?.frames) throw new Error("Plist inválida.");
      const frames = data.frames;
      const frameNames = Object.keys(frames);

      const img = new Image();
      const imgUrl = URL.createObjectURL(imageFile);
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imgUrl; });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      for (let i = 0; i < frameNames.length; i++) {
        const name = frameNames[i];
        const f = frames[name];
        const rect = extractNumbers(f.frame || f.textureRect);
        const [x, y, w, h] = rect;
        const rotated = f.rotated || false;

        canvas.width = w; canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        if (rotated) {
          ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 2);
          ctx.drawImage(img, x, y, h, w, -h / 2, -w / 2, h, w); ctx.restore();
        } else {
          ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
        }
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        zip.file(name.endsWith('.png') ? name : `${name}.png`, blob);
        setProgress(Math.round(((i + 1) / frameNames.length) * 100));
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `sprites_${plistFile.name.replace('.plist', '')}.zip`;
      link.click();
      setStatus('success');
    } catch (err) { 
      setErrorMsg(err.message || "Erro na extração."); 
      setStatus('error'); 
    }
  };

  const useConvertedInExtractor = () => {
    if (!convertedPngUrl) return;
    fetch(convertedPngUrl)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], cczFile.name.replace('.ccz', '.png').replace('.pvr', '.png'), { type: "image/png" });
        setImageFile(file);
        setStatus('idle');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 font-sans p-4 md:p-8 selection:bg-indigo-500/30">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-16 relative">
          <div className="absolute inset-0 bg-indigo-500/10 blur-[100px] rounded-full -z-10" />
          <Zap className="w-12 h-12 text-indigo-400 mx-auto mb-6" />
          <h1 className="text-5xl font-black text-white tracking-tight mb-3 italic">Sprite Pro Utility <span className="text-indigo-500 text-2xl not-italic">v2.5</span></h1>
          <p className="text-zinc-500 text-lg max-w-2xl mx-auto leading-relaxed italic">Ferramenta avançada para recursos <span className="text-zinc-300 font-mono">PVR</span> e <span className="text-zinc-300 font-mono">Plist</span>.</p>
        </header>

        <div className="grid lg:grid-cols-2 gap-8 mb-12 items-start">
          <section className="bg-zinc-900/40 border border-zinc-800 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 text-indigo-500/10 group-hover:text-indigo-500/20 transition-colors pointer-events-none">
              <ImageIcon className="w-24 h-24" />
            </div>
            <div className="flex items-center gap-3 mb-8 relative text-white font-bold">
              <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400"><ImageIcon className="w-5 h-5" /></div>
              <h2 className="text-xl">1. Extrator de Atlas</h2>
            </div>
            <div className="space-y-4 relative">
              <label className="group/item border-2 border-dashed border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center hover:border-indigo-500/50 hover:bg-zinc-900/50 transition-all cursor-pointer">
                <input type="file" accept=".plist" className="hidden" onChange={(e) => handleFileChange(e, setPlistFile)} />
                <FileJson className="w-8 h-8 text-zinc-700 group-hover/item:text-indigo-400 mb-2 transition-colors" />
                <span className="text-xs font-mono text-zinc-500 uppercase tracking-tighter text-center">{plistFile ? plistFile.name : "Selecionar .plist"}</span>
              </label>
              <label className="group/item border-2 border-dashed border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center hover:border-purple-500/50 hover:bg-zinc-900/50 transition-all cursor-pointer">
                <input type="file" accept="image/png" className="hidden" onChange={(e) => handleFileChange(e, setImageFile)} />
                <ImageIcon className="w-8 h-8 text-zinc-700 group-hover/item:text-purple-400 mb-2 transition-colors" />
                <span className="text-xs font-mono text-zinc-500 uppercase tracking-tighter text-center">{imageFile ? imageFile.name : "Selecionar .png"}</span>
              </label>
              {imageFile && (
                <div className="mt-4 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800 flex items-center gap-4">
                  <div className="w-12 h-12 bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700 flex-shrink-0">
                    <img src={URL.createObjectURL(imageFile)} className="w-full h-full object-contain" alt="preview" />
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate uppercase tracking-widest font-bold">Spritesheet Carregada</div>
                </div>
              )}
            </div>
            <button onClick={handleExtractSprites} disabled={!plistFile || !imageFile || status === 'processing'}
              className="mt-8 w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-20 text-white font-bold rounded-2xl transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" /> Iniciar Recorte (.zip)
            </button>
          </section>

          <section className="bg-zinc-900/40 border border-zinc-800 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 text-purple-500/10 group-hover:text-purple-500/20 transition-colors pointer-events-none">
              <FileArchive className="w-24 h-24" />
            </div>
            <div className="flex items-center gap-3 mb-8 relative text-white font-bold">
              <div className="p-2 bg-purple-500/20 rounded-xl text-purple-400"><FileArchive className="w-5 h-5" /></div>
              <h2 className="text-xl">2. CCZ para PNG</h2>
            </div>
            <div className="flex-grow relative">
              <label className="group/item border-2 border-dashed border-zinc-800 p-10 rounded-2xl flex flex-col items-center justify-center hover:border-purple-500/50 hover:bg-zinc-900/50 transition-all cursor-pointer h-40">
                <input type="file" accept=".ccz" className="hidden" onChange={(e) => handleFileChange(e, setCczFile)} />
                <FileArchive className="w-12 h-12 text-zinc-700 group-hover/item:text-purple-400 mb-3 transition-colors" />
                <span className="text-xs font-mono text-zinc-500 uppercase tracking-tighter text-center">{cczFile ? cczFile.name : "Arraste o .pvr.ccz aqui"}</span>
              </label>
              {convertedPngUrl && (
                <div className="mt-6 p-4 bg-zinc-950/50 rounded-2xl border border-zinc-800 space-y-4 animate-in fade-in duration-500">
                  <div className="flex justify-between items-center px-2 text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                    <span><Info className="w-3 h-3 inline mr-1" /> {pvrVersion}</span>
                  </div>
                  <div className="aspect-video bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden flex items-center justify-center relative group/prev">
                    <img src={convertedPngUrl} className="max-w-full max-h-full object-contain" alt="spritesheet" />
                    <div className="absolute inset-0 bg-zinc-950/60 opacity-0 group-hover/prev:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                      <button onClick={useConvertedInExtractor} className="bg-white text-black text-[10px] font-black px-4 py-2 rounded-full flex items-center gap-2 hover:bg-indigo-400 transition-all shadow-lg">
                        <RefreshCcw className="w-3 h-3" /> USAR NO EXTRATOR
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {!convertedPngUrl && (
              <button onClick={handleCczToPng} disabled={!cczFile || status === 'processing'}
                className="mt-8 w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-20 text-white font-bold rounded-2xl transition-all shadow-xl shadow-purple-600/20 flex items-center justify-center gap-2"
              >
                <ArrowRight className="w-5 h-5" /> Converter para PNG
              </button>
            )}
          </section>
        </div>

        {status !== 'idle' && (
          <div className="max-w-3xl mx-auto bg-zinc-900/90 border border-zinc-800 p-8 rounded-[2.5rem] shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-300">
            {status === 'processing' && (
              <div className="space-y-6 text-white font-bold">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                    <span className="text-sm uppercase tracking-widest">A processar...</span>
                  </div>
                  <span className="font-mono text-2xl text-indigo-500">{progress}%</span>
                </div>
                <div className="h-3 bg-zinc-800 rounded-full overflow-hidden p-0.5 border border-zinc-700">
                  <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            {status === 'success' && (
              <div className="text-center py-4 space-y-6 text-white">
                <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                <h3 className="text-2xl font-black italic uppercase">Operação Concluída</h3>
                <button onClick={reset} className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-xs transition-all uppercase tracking-widest">Reiniciar</button>
              </div>
            )}
            {status === 'error' && (
              <div className="text-center py-4 space-y-6">
                <XCircle className="w-16 h-16 text-red-500 mx-auto opacity-50" />
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl">
                  <h3 className="text-lg font-bold text-white mb-2 uppercase tracking-widest">Erro Detetado</h3>
                  <p className="text-red-400 text-xs font-mono">{String(errorMsg)}</p>
                </div>
                <button onClick={() => setStatus('idle')} className="text-zinc-500 underline text-xs font-bold uppercase tracking-widest">Tentar Novamente</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}