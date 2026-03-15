import React, { useState, useEffect } from 'react';
import { Download, FileJson, ImageIcon, Loader2, CheckCircle2, XCircle, Trash2, Zap } from 'lucide-react';

/**
 * Sprite Extractor Pro
 * Aplicativo web para extrair sprites individuais de um atlas (.png) usando metadados (.plist).
 */

// --- Utilitários de Parsing de XML/Plist ---
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
    } else if (node.tagName === 'string') {
      return node.textContent;
    } else if (node.tagName === 'true') {
      return true;
    } else if (node.tagName === 'false') {
      return false;
    } else if (node.tagName === 'integer') {
      return parseInt(node.textContent, 10);
    }
    return null;
  };

  const rootDict = xmlDoc.getElementsByTagName('dict')[0];
  if (!rootDict) return null;
  return parseNode(rootDict);
};

const extractNumbers = (str) => {
  if (!str) return [0, 0, 0, 0];
  return str.match(/\d+/g).map(Number);
};

export default function App() {
  const [plistFile, setPlistFile] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle, processing, success, error
  const [errorMsg, setErrorMsg] = useState('');
  const [jsZipLoaded, setJsZipLoaded] = useState(false);

  // Carrega o JSZip dinamicamente via CDN para evitar erros de compilação
  useEffect(() => {
    if (window.JSZip) {
      setJsZipLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    script.async = true;
    script.onload = () => setJsZipLoaded(true);
    document.head.appendChild(script);
  }, []);

  const handleFileChange = (e, setter) => {
    const file = e.target.files[0];
    if (file) {
      setter(file);
      setStatus('idle');
    }
  };

  const processSprites = async () => {
    if (!jsZipLoaded) {
      setErrorMsg("Aguarde o carregamento dos componentes do sistema...");
      setStatus('error');
      return;
    }

    if (!plistFile || !imageFile) {
      setErrorMsg("Por favor, selecione ambos os arquivos (.plist e .png)");
      setStatus('error');
      return;
    }

    setIsProcessing(true);
    setStatus('processing');
    setProgress(0);

    try {
      const JSZip = window.JSZip;
      const zip = new JSZip();
      const plistText = await plistFile.text();
      const data = parsePlist(plistText);
      
      if (!data || !data.frames) {
        throw new Error("O arquivo .plist parece inválido ou não contém 'frames'.");
      }

      const frames = data.frames;
      const frameNames = Object.keys(frames);
      const total = frameNames.length;

      // Carregar imagem no Canvas
      const img = new Image();
      const imgUrl = URL.createObjectURL(imageFile);
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Não foi possível carregar o arquivo PNG."));
        img.src = imgUrl;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      for (let i = 0; i < total; i++) {
        const name = frameNames[i];
        const frameData = frames[name];
        
        // Suporta formatos 'frame' (TexturePacker v2/v3) ou 'textureRect'
        const rectStr = frameData.frame || frameData.textureRect;
        if (!rectStr) continue;

        const rect = extractNumbers(rectStr);
        const [x, y, w, h] = rect;
        const rotated = frameData.rotated || false;

        // No formato Cocos2d/TexturePacker, se 'rotated' é true, 
        // W e H no rect referem-se à imagem original, mas no atlas os eixos estão invertidos.
        const drawW = rotated ? h : w;
        const drawH = rotated ? w : h;
        
        canvas.width = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);

        if (rotated) {
          ctx.save();
          // Move para o centro do espaço do sprite no canvas final
          ctx.translate(w / 2, h / 2);
          // Rotaciona 90 graus anti-horário (formato padrão do TexturePacker)
          ctx.rotate(-Math.PI / 2);
          // Desenha a fatia da imagem
          ctx.drawImage(img, x, y, h, w, -h / 2, -w / 2, h, w);
          ctx.restore();
        } else {
          ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
        }

        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        const fileName = name.toLowerCase().endsWith('.png') ? name : `${name}.png`;
        zip.file(fileName, blob);
        
        setProgress(Math.round(((i + 1) / total) * 100));
      }

      const content = await zip.generateAsync({ type: "blob" });
      const downloadUrl = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${plistFile.name.replace('.plist', '')}_extraido.zip`;
      link.click();

      setStatus('success');
      URL.revokeObjectURL(imgUrl);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Erro no processamento.");
      setStatus('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setPlistFile(null);
    setImageFile(null);
    setStatus('idle');
    setProgress(0);
    setErrorMsg('');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30">
      {/* Elementos Visuais de Fundo */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-12 lg:py-20">
        {/* Cabeçalho */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-2xl mb-4 ring-1 ring-indigo-500/20">
            <Zap className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400 mb-4">
            Sprite Extractor Pro
          </h1>
          <p className="text-zinc-400 text-lg max-w-lg mx-auto leading-relaxed">
            Ferramenta web para desmembrar spritesheets <span className="text-indigo-400 font-mono">.plist</span> e <span className="text-indigo-400 font-mono">.png</span> de forma rápida e segura.
          </p>
        </div>

        {/* Área de Upload */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Input do Plist */}
          <label className={`relative group cursor-pointer flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-3xl transition-all duration-300 ${plistFile ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 hover:bg-zinc-900'}`}>
            <input type="file" accept=".plist" className="hidden" onChange={(e) => handleFileChange(e, setPlistFile)} />
            <div className={`p-4 rounded-xl mb-4 transition-transform group-hover:scale-110 ${plistFile ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700'}`}>
              <FileJson className="w-8 h-8" />
            </div>
            <span className="font-semibold text-sm mb-1">{plistFile ? 'Plist Carregado' : 'Selecionar .plist'}</span>
            <span className="text-xs text-zinc-500 truncate max-w-full px-4">
              {plistFile ? plistFile.name : 'Arquivo de coordenadas'}
            </span>
          </label>

          {/* Input do PNG */}
          <label className={`relative group cursor-pointer flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-3xl transition-all duration-300 ${imageFile ? 'border-purple-500/50 bg-purple-500/5' : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 hover:bg-zinc-900'}`}>
            <input type="file" accept="image/png" className="hidden" onChange={(e) => handleFileChange(e, setImageFile)} />
            <div className={`p-4 rounded-xl mb-4 transition-transform group-hover:scale-110 ${imageFile ? 'bg-purple-500 text-white' : 'bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700'}`}>
              <ImageIcon className="w-8 h-8" />
            </div>
            <span className="font-semibold text-sm mb-1">{imageFile ? 'Imagem PNG Carregada' : 'Selecionar .png'}</span>
            <span className="text-xs text-zinc-500 truncate max-w-full px-4">
              {imageFile ? imageFile.name : 'Spritesheet (Atlas)'}
            </span>
          </label>
        </div>

        {/* Painel de Ações e Status */}
        <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl shadow-2xl backdrop-blur-md">
          {status === 'idle' && (
            <button
              onClick={processSprites}
              disabled={!plistFile || !imageFile || !jsZipLoaded}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
            >
              {!jsZipLoaded ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              {jsZipLoaded ? "Extrair Sprites em ZIP" : "Carregando Módulos..."}
            </button>
          )}

          {status === 'processing' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                  <span className="font-medium">Recortando e compactando...</span>
                </span>
                <span className="font-mono text-indigo-400 font-bold">{progress}%</span>
              </div>
              <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden p-0.5">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 transition-all duration-300 rounded-full" 
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-6">
              <div className="flex items-center gap-3 text-emerald-400 bg-emerald-400/5 px-8 py-4 rounded-2xl border border-emerald-400/20 w-full justify-center">
                <CheckCircle2 className="w-6 h-6" />
                <span className="font-bold text-lg">Processamento Concluído!</span>
              </div>
              <button onClick={reset} className="text-zinc-500 hover:text-white flex items-center gap-2 text-sm transition-colors group">
                <Trash2 className="w-4 h-4 group-hover:text-red-400" /> 
                Limpar arquivos e começar de novo
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-6">
              <div className="flex items-center gap-3 text-red-400 bg-red-400/5 px-8 py-4 rounded-2xl border border-red-400/20 w-full justify-center">
                <XCircle className="w-6 h-6" />
                <span className="font-semibold">{errorMsg}</span>
              </div>
              <button onClick={() => setStatus('idle')} className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm transition-colors">
                Tentar novamente
              </button>
            </div>
          )}
        </div>

        {/* Rodapé Informativo */}
        <footer className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-[11px] text-zinc-500 border-t border-zinc-900 pt-10">
          <div className="space-y-2">
            <h4 className="text-zinc-300 font-bold uppercase tracking-widest text-[10px]">Funcionamento</h4>
            <p className="leading-relaxed">O app lê os metadados XML do .plist e recorta a imagem PNG usando Canvas API. Tudo acontece no seu computador.</p>
          </div>
          <div className="space-y-2">
            <h4 className="text-zinc-300 font-bold uppercase tracking-widest text-[10px]">Privacidade Total</h4>
            <p className="leading-relaxed">Nenhum dado é enviado para a nuvem. Suas imagens e arquivos permanecem privados no seu navegador.</p>
          </div>
          <div className="space-y-2">
            <h4 className="text-zinc-300 font-bold uppercase tracking-widest text-[10px]">Formatos Suportados</h4>
            <p className="leading-relaxed">Suporte a Plist v2/v3 gerados por TexturePacker, incluindo detecção automática de rotação (rotated: true).</p>
          </div>
        </footer>
      </main>
    </div>
  );
}