import React, { useState, useEffect, useRef } from 'react';
import { Download, FileJson, Image as ImageIcon, Loader2, CheckCircle2, XCircle, Trash2, Zap, FileArchive, ArrowRight, Eye, RefreshCcw, Info, Youtube, Github, ShieldCheck, HelpCircle } from 'lucide-react';

/**
 * Sprite Pro Utility - Versão 2.8
 * - Motor de parsing de Plist (XML) mais robusto.
 * - Alteração do texto do cabeçalho solicitado pelo utilizador.
 * - Suporte a tags <real> e <array> no processamento de metadados.
 */

// --- Utilitários de Parsing de Plist (XML) ---
const parsePlist = (text) => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");
  
  const parseNode = (node) => {
    if (!node) return null;

    const tagName = node.tagName?.toLowerCase();

    if (tagName === 'dict') {
      const obj = {};
      let currentKey = null;
      // Itera apenas sobre os elementos filhos, ignorando nós de texto/espaços
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        if (child.nodeType !== 1) continue; // Ignora nós que não são elementos (texto, comentários)

        const childTag = child.tagName.toLowerCase();
        if (childTag === 'key') {
          currentKey = child.textContent.trim();
        } else if (currentKey !== null) {
          obj[currentKey] = parseNode(child);
          currentKey = null;
        }
      }
      return obj;
    } else if (tagName === 'string') {
      return node.textContent;
    } else if (tagName === 'true') {
      return true;
    } else if (tagName === 'false') {
      return false;
    } else if (tagName === 'integer' || tagName === 'real') {
      return parseFloat(node.textContent);
    } else if (tagName === 'array') {
      const arr = [];
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        if (child.nodeType === 1) {
          arr.push(parseNode(child));
        }
      }
      return arr;
    }
    return null;
  };

  const rootDict = xmlDoc.getElementsByTagName('dict')[0];
  return rootDict ? parseNode(rootDict) : null;
};

const extractNumbers = (str) => {
  if (typeof str !== 'string') return [0, 0, 0, 0];
  const matches = str.match(/-?\d+(\.\d+)?/g);
  return matches ? matches.map(Number) : [0, 0, 0, 0];
};

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
    const RGBA8888 = isV3 ? 0 : 0x12; 
    const RGBA4444 = isV3 ? 5 : 0x10;
    const RGBA5551 = isV3 ? 4 : 0x11;
    const RGB565   = isV3 ? 3 : 0x13;

    let formatFound = true;
    if (pixelFormat === RGBA8888) {
      for (let i = 0; i < data.length; i++) data[i] = pixelData[i];
    } else if (pixelFormat === RGBA4444) {
      for (let i = 0, j = 0; i < pixelData.length && j < data.length; i += 2, j += 4) {
        const p = (pixelData[i + 1] << 8) | pixelData[i];
        const r = (p >> 12) & 0x0F; const g = (p >> 8)  & 0x0F; const b = (p >> 4)  & 0x0F; const a = p & 0x0F;
        data[j] = (r << 4) | r; data[j+1] = (g << 4) | g; data[j+2] = (b << 4) | b; data[j+3] = (a << 4) | a;
      }
    } else if (pixelFormat === RGBA5551) {
      for (let i = 0, j = 0; i < pixelData.length && j < data.length; i += 2, j += 4) {
        const p = (pixelData[i + 1] << 8) | pixelData[i];
        const r = (p >> 11) & 0x1F; const g = (p >> 6)  & 0x1F; const b = (p >> 1)  & 0x1F; const a = p & 0x01;
        data[j] = (r << 3) | (r >> 2); data[j+1] = (g << 3) | (g >> 2); data[j+2] = (b << 3) | (b >> 2); data[j+3] = a ? 255 : 0;
      }
    } else if (pixelFormat === RGB565) {
      for (let i = 0, j = 0; i < pixelData.length && j < data.length; i += 2, j += 4) {
        const p = (pixelData[i + 1] << 8) | pixelData[i];
        const r = (p >> 11) & 0x1F; const g = (p >> 5)  & 0x3F; const b = p & 0x1F;
        data[j] = (r << 3) | (r >> 2); data[j+1] = (g << 2) | (g >> 4); data[j+2] = (b << 3) | (b >> 2); data[j+3] = 255;
      }
    } else { formatFound = false; }

    if (!formatFound) throw new Error(`Formato ${pixelFormat} não suportado.`);
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  };

  const handleCczToPng = async () => {
    if (!cczFile || !window.pako) return;
    setStatus('processing'); setProgress(20);
    try {
      const buffer = await cczFile.arrayBuffer();
      const view = new Uint8Array(buffer);
      if (String.fromCharCode(...view.slice(0, 4)) !== 'CCZ!') throw new Error("Assinatura CCZ inválida.");
      setProgress(50);
      const decompressed = window.pako.inflate(view.slice(16));
      setProgress(80);
      const pngDataUrl = decodePvrToCanvas(decompressed.buffer);
      setConvertedPngUrl(pngDataUrl);
      const link = document.createElement('a'); link.href = pngDataUrl;
      link.download = cczFile.name.replace('.ccz', '').replace('.pvr', '') + '.png';
      link.click();
      setStatus('success');
    } catch (err) { setErrorMsg(err.message); setStatus('error'); }
  };

  const handleExtractSprites = async () => {
    if (!libsLoaded.jszip || !plistFile || !imageFile) return;
    setStatus('processing'); setProgress(0);
    try {
      const JSZip = window.JSZip;
      const zip = new JSZip();
      const plistContent = await plistFile.text();
      const data = parsePlist(plistContent);
      
      if (!data || !data.frames) {
        throw new Error("O ficheiro .plist não pôde ser processado ou não contém a chave 'frames'.");
      }

      const frames = data.frames;
      const frameNames = Object.keys(frames);
      const total = frameNames.length;

      const img = new Image();
      const imgUrl = URL.createObjectURL(imageFile);
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imgUrl; });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      for (let i = 0; i < total; i++) {
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
        setProgress(Math.round(((i + 1) / total) * 100));
      }

      const creditsHtml = `
      <!DOCTYPE html>
      <html lang="pt-br">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Meduag Maker Lab - Créditos</title>
          <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #09090b; color: #fafafa; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; }
              .card { background: #18181b; padding: 50px; border-radius: 32px; border: 1px solid #27272a; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6); max-width: 500px; width: 90%; }
              h1 { margin: 0; color: #6366f1; font-size: 2.5rem; letter-spacing: -1px; }
              p { color: #a1a1aa; margin: 24px 0; line-height: 1.6; }
              .brand { font-weight: 900; color: #fff; display: block; margin-top: 10px; font-size: 1.2rem; }
              a { display: inline-block; background: #ef4444; color: white; text-decoration: none; padding: 14px 28px; border-radius: 14px; font-weight: bold; transition: all 0.3s ease; box-shadow: 0 4px 14px 0 rgba(239, 68, 68, 0.3); }
              a:hover { transform: translateY(-2px); box-shadow: 0 6px 20px 0 rgba(239, 68, 68, 0.4); opacity: 0.9; }
          </style>
      </head>
      <body>
          <div class="card">
              <h1>Sprites Extraídos!</h1>
              <span class="brand">Meduag Maker Lab</span>
              <p>Obrigado por utilizar esta ferramenta. Seus recursos foram processados com sucesso.</p>
              <p>Para tutoriais, novidades e novos scripts, acompanhe o canal:</p>
              <a href="https://youtube.com/meduag" target="_blank">YouTube @meduag</a>
          </div>
      </body>
      </html>`;
      zip.file("Meduag Maker Lab.html", creditsHtml);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `extraido_${plistFile.name.replace('.plist', '')}.zip`;
      link.click();
      setStatus('success');
    } catch (err) { 
      setErrorMsg(err.message || "Erro na extração de sprites."); 
      setStatus('error'); 
    }
  };

  const useConvertedInExtractor = () => {
    if (!convertedPngUrl) return;
    fetch(convertedPngUrl).then(res => res.blob()).then(blob => {
      const file = new File([blob], cczFile.name.replace('.ccz', '.png').replace('.pvr', '.png'), { type: "image/png" });
      setImageFile(file); setStatus('idle');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 font-sans p-4 md:p-8 selection:bg-indigo-500/30">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-16 relative">
          <div className="absolute inset-0 bg-indigo-500/10 blur-[100px] rounded-full -z-10" />
          <Zap className="w-12 h-12 text-indigo-400 mx-auto mb-6" />
          <h1 className="text-5xl font-black text-white tracking-tight mb-3 italic">Sprite Pro Utility <span className="text-indigo-500 text-2xl not-italic">v2.8</span></h1>
          <p className="text-zinc-500 text-lg max-w-2xl mx-auto leading-relaxed italic underline decoration-indigo-500/30">
            Ferramenta de teste feita por <span className="text-white font-bold">Meduag Maker Lab</span>.
          </p>
        </header>

        <div className="grid lg:grid-cols-2 gap-8 mb-16 items-start">
          {/* SEÇÃO 1: EXTRATOR */}
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
                <span className="text-xs font-mono text-zinc-500 uppercase tracking-tighter text-center">{plistFile ? plistFile.name : "Arquivo .plist"}</span>
              </label>
              <label className="group/item border-2 border-dashed border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center hover:border-purple-500/50 hover:bg-zinc-900/50 transition-all cursor-pointer">
                <input type="file" accept="image/png" className="hidden" onChange={(e) => handleFileChange(e, setImageFile)} />
                <ImageIcon className="w-8 h-8 text-zinc-700 group-hover/item:text-purple-400 mb-2 transition-colors" />
                <span className="text-xs font-mono text-zinc-500 uppercase tracking-tighter text-center">{imageFile ? imageFile.name : "Arquivo .png"}</span>
              </label>
            </div>
            <button onClick={handleExtractSprites} disabled={!plistFile || !imageFile || status === 'processing'}
              className="mt-8 w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-20 text-white font-bold rounded-2xl transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" /> Iniciar Recorte (.zip)
            </button>
          </section>

          {/* SEÇÃO 2: CONVERSOR CCZ */}
          <section className="bg-zinc-900/40 border border-zinc-800 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 text-purple-500/10 group-hover:text-purple-500/20 transition-colors pointer-events-none">
              <FileArchive className="w-24 h-24" />
            </div>
            <div className="flex items-center gap-3 mb-8 relative text-white font-bold">
              <div className="p-2 bg-purple-500/20 rounded-xl text-purple-400"><FileArchive className="w-5 h-5" /></div>
              <h2 className="text-xl">2. CCZ para PNG</h2>
            </div>
            <div className="flex-grow relative">
              <label className="group/item border-2 border-dashed border-zinc-800 p-10 rounded-2xl flex flex-col items-center justify-center hover:border-purple-500/50 hover:bg-zinc-900/50 transition-all cursor-pointer h-40 text-center">
                <input type="file" accept=".ccz" className="hidden" onChange={(e) => handleFileChange(e, setCczFile)} />
                <FileArchive className="w-12 h-12 text-zinc-700 group-hover/item:text-purple-400 mb-3 transition-colors" />
                <span className="text-xs font-mono text-zinc-500 uppercase tracking-tighter">{cczFile ? cczFile.name : "Arraste o .pvr.ccz"}</span>
              </label>
              {convertedPngUrl && (
                <div className="mt-6 p-4 bg-zinc-950/50 rounded-2xl border border-zinc-800 space-y-4 animate-in fade-in duration-500">
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

        {/* FEEDBACK DE STATUS */}
        {status !== 'idle' && (
          <div className="max-w-3xl mx-auto mb-16 bg-zinc-900/90 border border-zinc-800 p-8 rounded-[2.5rem] shadow-2xl backdrop-blur-xl">
            {status === 'processing' && (
              <div className="space-y-6 text-white font-bold">
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                    <span className="uppercase tracking-widest">Processando...</span>
                  </div>
                  <span className="font-mono text-2xl text-indigo-500">{progress}%</span>
                </div>
                <div className="h-3 bg-zinc-800 rounded-full overflow-hidden p-0.5">
                  <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            {status === 'success' && (
              <div className="text-center py-4 space-y-6 text-white">
                <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                <h3 className="text-2xl font-black italic uppercase">Operação Concluída</h3>
                <button onClick={reset} className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-xs uppercase">Limpar</button>
              </div>
            )}
            {status === 'error' && (
              <div className="text-center py-4 space-y-4">
                <XCircle className="w-16 h-16 text-red-500 mx-auto opacity-50" />
                <p className="text-red-400 text-xs font-mono">{String(errorMsg)}</p>
                <button onClick={() => setStatus('idle')} className="text-zinc-500 underline text-xs">Tentar Novamente</button>
              </div>
            )}
          </div>
        )}

        {/* INFORMAÇÕES ADICIONAIS E LICENÇA */}
        <div className="grid md:grid-cols-2 gap-12 border-t border-zinc-900 pt-16 mb-16">
          <div>
            <h4 className="text-white font-bold flex items-center gap-2 mb-4">
              <HelpCircle className="w-5 h-5 text-indigo-400" /> Instruções de Uso
            </h4>
            <ul className="space-y-3 text-sm text-zinc-500">
              <li className="flex gap-2">
                <span className="text-indigo-500 font-bold">1.</span>
                Converta arquivos <code className="text-zinc-300">.pvr.ccz</code> para PNG usando o módulo à direita.
              </li>
              <li className="flex gap-2">
                <span className="text-indigo-500 font-bold">2.</span>
                Use a imagem PNG gerada junto com o arquivo <code className="text-zinc-300">.plist</code> no módulo à esquerda.
              </li>
              <li className="flex gap-2">
                <span className="text-indigo-500 font-bold">3.</span>
                Baixe o ZIP. Ele contém todos os sprites e o arquivo de créditos <span className="text-zinc-300 italic">Meduag Maker Lab</span>.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold flex items-center gap-2 mb-4">
              <ShieldCheck className="w-5 h-5 text-emerald-400" /> Licença e Privacidade
            </h4>
            <p className="text-sm text-zinc-500 leading-relaxed mb-4">
              Desenvolvido para a comunidade. Todo o processamento ocorre no navegador; sua privacidade é total. Arquivos não são enviados para nenhum servidor.
            </p>
            <div className="flex gap-4">
              <a href="https://youtube.com/meduag" target="_blank" className="flex items-center gap-2 px-4 py-2 bg-red-600/10 text-red-500 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition-all">
                <Youtube className="w-4 h-4" /> Visitar Canal
              </a>
              <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg text-[10px] font-bold">
                MIT License
              </div>
            </div>
          </div>
        </div>

        <footer className="text-center py-8 opacity-20 hover:opacity-100 transition-opacity">
          <div className="text-[10px] text-zinc-500 uppercase tracking-[0.5em] font-black">
            Sprite Pro Utility &bull; Desenvolvido por Meduag Maker Lab &bull; 2026
          </div>
        </footer>
      </div>
    </div>
  );
}