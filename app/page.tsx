'use client';

import { useState, useEffect } from 'react';
import { UserButton, SignInButton, useUser } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BookOpen, UploadCloud, ChevronDown, FileText, Loader2, 
  Sparkles, BrainCircuit, History, ChevronLeft, ChevronRight, X, Download, Trash2, Layers
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { PDFDocument } from 'pdf-lib';
import 'katex/dist/katex.min.css';

import dynamic from 'next/dynamic';
const Document = dynamic(() => import('react-pdf').then((mod) => mod.Document), { ssr: false });
const Page = dynamic(() => import('react-pdf').then((mod) => mod.Page), { ssr: false });

const RenderMarkdown = ({ content }: { content: string }) => {
  if (!content) return <span className="text-gray-500 italic">Testo mancante...</span>;
  return (
    <div className="prose prose-invert max-w-none text-gray-200">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]} 
        rehypePlugins={[rehypeKatex]}
        components={{
          h2: ({node, ...props}) => <h2 className="text-2xl font-bold text-blue-300 mt-12 mb-6 border-l-4 border-blue-400/50 pl-4" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-xl font-bold text-white mt-8 mb-4" {...props} />,
          p: ({node, ...props}) => <p className="text-lg leading-relaxed mb-6 text-gray-300 text-justify" {...props} />,
          strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />,
          blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-white/20 pl-6 my-8 text-gray-400 italic bg-white/5 py-2 pr-4 rounded-r-xl" {...props} />,
          ul: ({node, ...props}) => <ul className="space-y-2 mb-6 ml-4 list-disc text-lg text-gray-300" {...props} />,
          ol: ({node, ...props}) => <ol className="space-y-2 mb-6 ml-4 list-decimal text-lg text-gray-300" {...props} />,
          div: ({node, ...props}) => <div className="my-4 overflow-x-auto custom-scrollbar" {...props} />,
        }}
      >
        {String(content)}
      </ReactMarkdown>
    </div>
  );
};

export default function Home() {
  const { isSignedIn } = useUser();
  const [apiKey, setApiKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [chapters, setChapters] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(0);
  
  const [activeQA, setActiveQA] = useState<any>(null); 
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<Record<number, boolean>>({});
  const [generatingQA, setGeneratingQA] = useState<number | null>(null);

  const [showPdfModal, setShowPdfModal] = useState(false);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  
  const [viewerWidth, setViewerWidth] = useState(0);
  const [inlineViewerWidth, setInlineViewerWidth] = useState(0);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    import('react-pdf').then(({ pdfjs }) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    });
  }, []);

  useEffect(() => {
    if (isSignedIn) {
      loadHistory();
      const savedKey = localStorage.getItem('study_buddy_api_key');
      if (savedKey) setApiKey(savedKey);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const updateWidths = () => {
        setViewerWidth(window.innerWidth - 48);
        if (window.innerWidth >= 1280) {
          const container = Math.min(window.innerWidth, 1400); 
          setInlineViewerWidth((container - 64) * 0.45); 
        } else if (window.innerWidth >= 1024) {
          const container = Math.min(window.innerWidth, 1400);
          setInlineViewerWidth((container - 64) * 0.5); 
        }
      };
      updateWidths();
      window.addEventListener('resize', updateWidths);
      return () => window.removeEventListener('resize', updateWidths);
    }
  }, [chapters, pdfUrl]);

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/study');
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      setHistory([]);
    }
  };

  const loadFromHistory = async (pdfName: string) => {
    const fileChapters = history
        .filter(h => h.type === 'summary' && h.pdf_name === pdfName)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (fileChapters.length === 0) return;

    const savedUrl = fileChapters[0].pdf_url;
    if (savedUrl) {
      setPdfUrl(savedUrl);
      try {
        const response = await fetch(savedUrl);
        const blob = await response.blob();
        setFile(new File([blob], pdfName, { type: "application/pdf" }));
      } catch (e) {
        console.error("Impossibile recuperare il file PDF originale.");
      }
    }

    const loadedChapters = fileChapters.map(historicalChapter => {
      const associatedQA = history.find(item => 
        item.type === 'qa' && 
        item.chapter_title === historicalChapter.chapter_title && 
        item.pdf_name === historicalChapter.pdf_name
      );

      let parsedFlashcards = null;
      let parsedQuiz = null;

      if (associatedQA && associatedQA.content) {
        try {
          const parsed = JSON.parse(associatedQA.content);
          parsedFlashcards = parsed.flashcards;
          parsedQuiz = parsed.quiz;
        } catch (e) {}
      }

      return {
        titolo: historicalChapter.chapter_title,
        testo: historicalChapter.content,
        pdfBlob: null, 
        flashcards: parsedFlashcards,
        quiz: parsedQuiz
      };
    });

    setChapters(loadedChapters);
    setExpandedChapter(0);
  };

  const startAutoPilot = async () => {
    if (!file || !apiKey) return alert("Configura API Key e carica il PDF!");
    
    setLoading(true);
    setChapters([]);
    setPdfUrl(URL.createObjectURL(file));
    localStorage.setItem('study_buddy_api_key', apiKey);

    try {
      setLoadingStatus("Fase 1: Analisi dell'indice...");
      const form = new FormData();
      form.append('file', file);
      form.append('apiKey', apiKey);
      form.append('action', 'outline');
      form.append('pdfName', file.name);

      const outlineRes = await fetch('/api/study', { method: 'POST', body: form });
      const outlineData = await outlineRes.json();
      
      if (outlineData.error) throw new Error(outlineData.error);
      if (!outlineData.capitoli || !Array.isArray(outlineData.capitoli)) {
        throw new Error("Formato indice non valido.");
      }

      const currentPdfUrl = outlineData.savedPdfUrl;
      if (currentPdfUrl) setPdfUrl(currentPdfUrl);

      const fileBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const totalPages = pdfDoc.getPageCount();

      let currentChapters = [];
      for (let i = 0; i < outlineData.capitoli.length; i++) {
        const cap = outlineData.capitoli[i];
        const nextCap = outlineData.capitoli[i+1];
        setLoadingStatus(`Fase 2: Dispensa - ${cap.titolo}`);

        let start = Math.max(0, parseInt(cap.paginaInizio) - 1);
        let end = nextCap ? parseInt(nextCap.paginaInizio) - 2 : totalPages - 1;
        if (isNaN(end) || end < start) end = totalPages - 1;

        const newPdf = await PDFDocument.create();
        const pages = await newPdf.copyPages(pdfDoc, Array.from({length: end - start + 1}, (_, k) => start + k));
        pages.forEach(p => newPdf.addPage(p));
        const blob = new Blob([await newPdf.save()], {type: 'application/pdf'});

        const formData = new FormData();
        formData.append('file', new File([blob], 'cap.pdf'));
        formData.append('apiKey', apiKey);
        formData.append('action', 'chapter');
        formData.append('focus', cap.titolo);
        formData.append('pdfName', file.name);
        if (currentPdfUrl) formData.append('pdfUrl', currentPdfUrl);

        const capRes = await fetch('/api/study', { method: 'POST', body: formData });
        const capData = await capRes.json();
        
        currentChapters.push({ 
          ...cap, 
          testo: capData.riassunto || `Errore: ${capData.error || "Contenuto non disponibile"}`, 
          pdfBlob: blob, 
          flashcards: null, 
          quiz: null 
        });
        
        setChapters([...currentChapters]);
        await new Promise(r => setTimeout(r, 3500));
      }
      loadHistory();
    } catch (e: any) { 
      alert("ATTENZIONE: " + e.message); 
      setChapters([]); 
    }
    setLoading(false);
  };

  const generateQA = async (idx: number) => {
    if (!file) return alert("File non disponibile per generare i test.");
    const cap = chapters[idx];
    setGeneratingQA(idx);

    try {
      let blobToUse = cap.pdfBlob;
      if (!blobToUse) blobToUse = file;

      const formData = new FormData();
      formData.append('file', blobToUse);
      formData.append('apiKey', apiKey);
      formData.append('action', 'generate_qa');
      formData.append('focus', cap.titolo);
      formData.append('pdfName', file.name);
      if (pdfUrl) formData.append('pdfUrl', pdfUrl);

      const res = await fetch('/api/study', { method: 'POST', body: formData });
      const qa = await res.json();
      
      if (qa.error || !qa.flashcards || !qa.quiz) {
         alert("L'IA ha fallito la formattazione. Riprova.");
         setGeneratingQA(null);
         return;
      }

      const newChapters = [...chapters];
      newChapters[idx].flashcards = qa.flashcards;
      newChapters[idx].quiz = qa.quiz;
      setChapters(newChapters);
      loadHistory();
    } catch (e) { alert("Errore di connessione durante la generazione dei test."); }
    setGeneratingQA(null);
  };

  const deletePdf = async (pdfName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Vuoi eliminare definitivamente "${pdfName}"?`)) return;
    try {
      await fetch(`/api/study?pdfName=${encodeURIComponent(pdfName)}`, { method: 'DELETE' });
      loadHistory();
      setChapters([]);
    } catch (err) {
      alert("Errore durante l'eliminazione.");
    }
  };

  const groupedHistory = history.reduce((acc: any, curr: any) => {
    if (curr.type === 'summary') {
      if (!acc[curr.pdf_name]) acc[curr.pdf_name] = [];
      acc[curr.pdf_name].push(curr);
    }
    return acc;
  }, {});

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-[#000000] text-white flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full blur-[120px] opacity-30 bg-blue-600/40 pointer-events-none" />
        <div className="w-20 h-20 bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-3xl border-t border-l border-white/20 shadow-[0_8px_32px_0_rgba(37,99,235,0.3)] rounded-[2rem] mb-8 flex items-center justify-center">
          <BookOpen className="text-white w-10 h-10 drop-shadow-md" />
        </div>
        <h1 className="text-5xl font-extrabold mb-4 tracking-tighter lowercase">studdy<span className="text-blue-500">.</span></h1>
        <p className="text-gray-400 mb-10 max-w-sm text-lg font-medium">Il tuo archivio di studio intelligente, sincronizzato su ogni dispositivo.</p>
        <SignInButton mode="modal">
          <button className="px-10 py-4 bg-gradient-to-br from-white/20 to-white/5 hover:from-white/30 hover:to-white/10 backdrop-blur-3xl border-t border-l border-white/20 text-white font-bold rounded-[2rem] transition-all text-lg shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]">Accedi per iniziare</button>
        </SignInButton>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020205] text-white font-sans pb-20 relative">
      
      {/* Background Nebuloso Migliorato per far risaltare il vetro */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-30 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[80vw] h-[80vw] bg-blue-600 blur-[150px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-indigo-600 blur-[150px] rounded-full mix-blend-screen" />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-4 py-8 md:py-12">
        <header className="flex justify-between items-center mb-16">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => { setChapters([]); setPdfUrl(null); }}>
            {/* Logo in Liquid Glass */}
            <motion.div whileHover={{ rotate: 10, scale: 1.05 }} className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/40 to-indigo-600/10 backdrop-blur-3xl border-t border-l border-white/20 flex items-center justify-center shadow-[0_8px_32px_0_rgba(37,99,235,0.3)]">
              <BookOpen className="text-white w-6 h-6 drop-shadow-md" />
            </motion.div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter lowercase drop-shadow-xl">studdy<span className="text-blue-500">.</span></h1>
          </div>
          <div className="flex items-center gap-4">
            {pdfUrl && chapters.length > 0 && (
              <button onClick={() => setShowPdfModal(true)} className="flex lg:hidden px-4 py-2 rounded-full text-sm font-bold bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-2xl border-t border-l border-white/20 text-white hover:bg-white/20 transition-all items-center gap-2 shadow-lg"><Layers className="w-4 h-4" /> Vedi PDF</button>
            )}
            <div className="p-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full shadow-inner">
               <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: "w-9 h-9 rounded-full" } }} />
            </div>
          </div>
        </header>

        {/* CARICAMENTO (Liquid Glass) */}
        {loading && (
           <div className="mb-8 p-10 rounded-[3rem] bg-gradient-to-br from-blue-600/20 to-indigo-600/5 backdrop-blur-3xl border-t border-l border-white/20 flex flex-col items-center justify-center text-center space-y-6 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]">
              <div className="p-4 bg-white/10 rounded-full shadow-inner">
                 <Loader2 className="w-12 h-12 text-white animate-spin" />
              </div>
              <div>
                <p className="font-extrabold text-2xl text-white drop-shadow-md">{loadingStatus}</p>
                <p className="text-gray-300 text-sm mt-2">Attendere prego, elaborazione in corso...</p>
              </div>
           </div>
        )}

        {/* HOME */}
        {!loading && chapters.length === 0 && (
          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-3xl border-t border-l border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] space-y-6">
              <h3 className="text-2xl font-bold flex items-center gap-2 text-white"><Sparkles className="text-blue-400 drop-shadow-md" /> Nuovo Studio</h3>
              <input type="password" value={apiKey} onChange={e => {setApiKey(e.target.value); localStorage.setItem('study_buddy_api_key', e.target.value);}} className="w-full p-4 bg-black/20 rounded-2xl border border-white/10 outline-none focus:border-white/30 transition-all text-white placeholder-gray-400 shadow-inner" placeholder="Google Gemini API Key" />
              <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-white/20 rounded-3xl cursor-pointer hover:bg-white/5 transition-all bg-black/10 text-center px-4 shadow-inner group">
                <UploadCloud className="w-10 h-10 text-gray-400 mb-3 group-hover:text-blue-400 transition-colors" />
                <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">{file ? file.name : "Trascina o clicca per caricare il PDF"}</span>
                <input type="file" className="hidden" accept=".pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>
              <button onClick={startAutoPilot} className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition-all rounded-2xl font-bold text-lg shadow-[0_0_20px_rgba(37,99,235,0.4)] text-white border border-blue-400/50">Analizza Documento</button>
            </div>

            <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-3xl border-t border-l border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] flex flex-col">
              <h3 className="text-2xl font-bold flex items-center gap-2 mb-6 text-white"><History className="text-indigo-400 drop-shadow-md" /> Archivio Studi</h3>
              <div className="space-y-3 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                {Object.keys(groupedHistory).length === 0 ? (
                  <div className="flex items-center justify-center h-full opacity-40 italic">Nessun documento salvato.</div>
                ) : (
                  Object.entries(groupedHistory).map(([pdfName, caps]: [string, any], i) => (
                    <div key={i} onClick={() => loadFromHistory(pdfName)} className="p-6 rounded-2xl bg-black/20 border border-white/5 hover:bg-white/10 hover:border-white/20 cursor-pointer transition-all group flex flex-col gap-2 shadow-inner">
                      <div className="flex justify-between items-start w-full">
                        <div>
                          <div className="font-bold text-white group-hover:text-indigo-200 transition-colors line-clamp-2 leading-snug flex items-start gap-3">
                            <FileText className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5 opacity-70 group-hover:opacity-100" />
                            {pdfName}
                          </div>
                          <div className="text-xs opacity-60 uppercase tracking-widest pl-8 font-medium text-blue-200 mt-2">
                            {caps.length} Capitoli Analizzati
                          </div>
                        </div>
                        <button 
                          onClick={(e) => deletePdf(pdfName, e)} 
                          className="p-3 rounded-full hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0 ml-2"
                          title="Elimina PDF"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* RISULTATI: LAYOUT SPLIT-SCREEN LIQUID GLASS */}
        {!loading && chapters.length > 0 && (
          <div className="flex flex-col w-full">
             
             <button onClick={() => { setChapters([]); setPdfUrl(null); }} className="self-start mb-6 px-4 py-2 bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/10 rounded-full text-blue-300 font-bold transition-all flex items-center gap-2 shadow-sm">
                <ChevronLeft className="w-4 h-4"/> Torna all'Archivio
             </button>

             <div className="flex flex-col lg:flex-row gap-8 items-start w-full">
                 
                 {/* COLONNA SINISTRA: Visualizzatore PDF Liquid Glass */}
                 <div className="hidden lg:flex flex-col w-1/2 xl:w-[45%] sticky top-8 h-[calc(100vh-4rem)] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-[40px] border-t border-l border-white/20 rounded-[2.5rem] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] overflow-hidden">
                    
                    <div className="px-6 py-5 border-b border-white/10 flex justify-between items-center bg-black/10 shadow-inner">
                       <span className="font-bold flex items-center gap-3 text-white">
                          <div className="p-2 bg-blue-500/20 rounded-xl border border-white/10 shadow-sm"><FileText className="w-4 h-4 text-blue-300"/></div>
                          <span className="truncate max-w-[200px] xl:max-w-[300px] text-sm tracking-wide drop-shadow-md">{file?.name || "Documento"}</span>
                       </span>
                       {numPages && (
                         <div className="flex items-center gap-1 bg-black/20 rounded-xl p-1 border border-white/5 shadow-inner">
                            <button disabled={pageNumber <= 1} onClick={() => setPageNumber(p => Math.max(1, p - 1))} className="p-1.5 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-all text-gray-400 hover:text-white"><ChevronLeft className="w-4 h-4"/></button>
                            <span className="font-mono text-xs font-bold text-gray-300 px-2">{pageNumber} / {numPages}</span>
                            <button disabled={pageNumber >= numPages} onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} className="p-1.5 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-all text-gray-400 hover:text-white"><ChevronRight className="w-4 h-4"/></button>
                         </div>
                       )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar flex justify-center items-start pt-6 pb-6 bg-transparent">
                       {pdfUrl && inlineViewerWidth > 0 ? (
                          <Document file={pdfUrl} onLoadSuccess={({ numPages }) => { setNumPages(numPages); setPageNumber(1); }} loading={<Loader2 className="w-8 h-8 animate-spin text-white mt-32 opacity-50" />}>
                             <AnimatePresence mode="wait">
                               <motion.div 
                                  key={pageNumber} 
                                  initial={{ opacity: 0, scale: 0.98 }} 
                                  animate={{ opacity: 1, scale: 1 }} 
                                  exit={{ opacity: 0, scale: 0.98 }} 
                                  transition={{ duration: 0.15 }} 
                                  className="rounded-xl overflow-hidden shadow-[0_15px_35px_rgba(0,0,0,0.5)] border border-white/20"
                               >
                                  <Page pageNumber={pageNumber} width={inlineViewerWidth - 48} renderTextLayer={false} renderAnnotationLayer={false} />
                               </motion.div>
                             </AnimatePresence>
                          </Document>
                       ) : (
                          <div className="mt-32 text-white/50 text-sm font-medium">Preparazione lettore...</div>
                       )}
                    </div>
                 </div>

                 {/* COLONNA DESTRA: Area di Studio Liquid Glass */}
                 <div className="w-full lg:w-1/2 xl:w-[55%] space-y-6">
                     {chapters.map((cap: any, idx: number) => (
                        <div key={idx} className="rounded-[2.5rem] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-[40px] border-t border-l border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] overflow-hidden">
                            <button onClick={() => setExpandedChapter(expandedChapter === idx ? null : idx)} className="w-full p-6 md:p-8 flex justify-between items-center text-left hover:bg-white/5 transition-colors">
                                <span className="text-xl md:text-2xl font-bold flex items-center gap-4 drop-shadow-md">
                                    <span className="flex items-center justify-center w-12 h-12 rounded-full bg-white/10 border border-white/20 text-white text-lg shadow-inner flex-shrink-0 backdrop-blur-md">{idx + 1}</span>
                                    {cap.titolo}
                                </span>
                                <ChevronDown className={`w-6 h-6 text-white/50 transition-transform duration-300 ${expandedChapter === idx ? 'rotate-180' : ''}`} />
                            </button>
                            
                            <AnimatePresence>
                                {expandedChapter === idx && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-6 md:px-10 pb-10">
                                        <div className="border-t border-white/10 pt-8">
                                            <RenderMarkdown content={cap.testo} />
                                            
                                            <div className="mt-16 p-8 md:p-10 rounded-[2.5rem] bg-gradient-to-br from-blue-600/20 to-indigo-600/10 border-t border-l border-white/20 flex flex-col items-center text-center space-y-6 shadow-inner relative overflow-hidden backdrop-blur-xl">
                                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] mix-blend-overlay"></div>
                                                <div className="relative z-10 w-20 h-20 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center text-white shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] backdrop-blur-md"><BrainCircuit className="w-10 h-10 drop-shadow-md" /></div>
                                                <div className="relative z-10">
                                                    <h4 className="text-2xl font-extrabold mb-2 text-white drop-shadow-md">Area Ripasso Interattiva</h4>
                                                    <p className="text-blue-200/80 font-medium">10 Flashcards + Test Universitario</p>
                                                </div>
                                                
                                                {!cap.quiz ? (
                                                    <button 
                                                        disabled={generatingQA === idx}
                                                        onClick={() => generateQA(idx)}
                                                        className="relative z-10 px-8 py-4 bg-white/10 hover:bg-white/20 border-t border-l border-white/20 rounded-full font-bold flex items-center gap-3 transition-all disabled:opacity-50 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] backdrop-blur-md text-white"
                                                    >
                                                        {generatingQA === idx ? <Loader2 className="animate-spin w-5 h-5" /> : <Sparkles className="w-5 h-5 text-blue-300" />}
                                                        Genera Materiale di Studio
                                                    </button>
                                                ) : (
                                                    <div className="relative z-10 flex flex-wrap justify-center gap-4 w-full mt-4">
                                                        <button onClick={() => { setActiveQA({idx, type: 'flashcards'}); setCardIndex(0); }} className="px-8 py-4 bg-black/20 hover:bg-black/40 border border-white/10 text-white rounded-full font-bold transition-all shadow-inner backdrop-blur-md">Studia Flashcards</button>
                                                        <button onClick={() => { setActiveQA({idx, type: 'quiz'}); }} className="px-8 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white rounded-full font-bold transition-all shadow-[0_0_30px_rgba(37,99,235,0.4)] border border-blue-400/50">Inizia Simulazione</button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                     ))}
                 </div>
             </div>
          </div>
        )}

        {/* MODALE Q&A Liquid Glass */}
        <AnimatePresence>
            {activeQA && chapters[activeQA.idx] && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-[50px]" onClick={() => setActiveQA(null)} />
                    <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-[60px] rounded-[3rem] border-t border-l border-white/20 flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.8)] custom-scrollbar">
                        <div className="sticky top-0 p-6 md:p-8 border-b border-white/10 flex justify-between items-center bg-black/10 shadow-inner z-20">
                            <h2 className="text-2xl font-extrabold text-white drop-shadow-md">{activeQA.type === 'flashcards' ? 'Flashcards Interattive' : 'Simulazione d\'Esame'}</h2>
                            <button onClick={() => setActiveQA(null)} className="p-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-colors text-white shadow-sm"><X className="w-6 h-6" /></button>
                        </div>
                        
                        <div className="p-6 md:p-10">
                            {activeQA.type === 'flashcards' && chapters[activeQA.idx].flashcards ? (
                                <div className="flex flex-col items-center">
                                    <div onClick={() => setIsFlipped(!isFlipped)} className="w-full max-w-xl h-96 relative cursor-pointer perspective-2000 group">
                                        <motion.div animate={{ rotateY: isFlipped ? 180 : 0 }} transition={{ type: "spring", stiffness: 100, damping: 20 }} className="w-full h-full preserve-3d">
                                            {/* Fronte Carta */}
                                            <div className="absolute inset-0 backface-hidden bg-gradient-to-br from-white/10 to-white/5 border-t border-l border-white/20 rounded-[3rem] p-10 flex flex-col justify-center items-center text-center shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-3xl group-hover:bg-white/10 transition-colors">
                                                <span className="text-sm text-blue-300 font-black uppercase tracking-widest mb-6 drop-shadow-md">Fronte - Domanda</span>
                                                <div className="text-2xl font-bold text-white drop-shadow-lg"><RenderMarkdown content={chapters[activeQA.idx].flashcards[cardIndex]?.domanda || ""} /></div>
                                            </div>
                                            {/* Retro Carta */}
                                            <div className="absolute inset-0 backface-hidden rotate-y-180 bg-gradient-to-br from-blue-600/80 to-indigo-700/80 rounded-[3rem] p-10 flex flex-col justify-center items-center text-center shadow-[0_8px_32px_rgba(37,99,235,0.5)] border-t border-l border-white/30 backdrop-blur-3xl overflow-y-auto custom-scrollbar">
                                                <span className="text-sm text-white/60 font-black uppercase tracking-widest mb-6 mt-auto drop-shadow-md">Retro - Risposta</span>
                                                <div className="text-xl font-medium text-white mb-auto drop-shadow-lg"><RenderMarkdown content={chapters[activeQA.idx].flashcards[cardIndex]?.risposta || ""} /></div>
                                            </div>
                                        </motion.div>
                                    </div>
                                    <div className="flex items-center gap-6 mt-10">
                                        <button onClick={() => {setCardIndex(Math.max(0, cardIndex - 1)); setIsFlipped(false)}} className="p-4 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 shadow-sm transition-colors text-white"><ChevronLeft className="w-6 h-6" /></button>
                                        <span className="font-mono font-bold text-xl text-white px-5 bg-black/20 py-2 rounded-xl shadow-inner border border-white/5">{cardIndex + 1} / {chapters[activeQA.idx].flashcards.length}</span>
                                        <button onClick={() => {setCardIndex(Math.min(chapters[activeQA.idx].flashcards.length - 1, cardIndex + 1)); setIsFlipped(false)}} className="p-4 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 shadow-sm transition-colors text-white"><ChevronRight className="w-6 h-6" /></button>
                                    </div>
                                </div>
                            ) : activeQA.type === 'quiz' && chapters[activeQA.idx].quiz ? (
                                <div className="space-y-8">
                                    {chapters[activeQA.idx].quiz.map((q: any, i: number) => (
                                        <div key={i} className="p-8 bg-black/20 border-t border-l border-white/10 rounded-[2.5rem] space-y-6 shadow-inner backdrop-blur-xl">
                                            <div className="text-xl font-bold flex gap-4 text-white drop-shadow-md">
                                              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 border border-white/20 text-white text-sm flex-shrink-0">{i+1}</span>
                                              <RenderMarkdown content={q.domanda || ""} />
                                            </div>
                                            <div className="grid gap-4">
                                                {q.opzioni?.map((opt: string, oi: number) => {
                                                    const qKey = `${activeQA.idx}-${i}`;
                                                    const isSelected = quizAnswers[qKey] === oi;
                                                    const submitted = quizSubmitted[activeQA.idx];
                                                    let btnClass = isSelected ? 'bg-blue-500/30 border-blue-400 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/10 hover:border-white/20 shadow-sm';
                                                    if (submitted) {
                                                        if (oi === q.corretta) btnClass = 'bg-green-500/30 border-green-400 text-green-100 shadow-[0_0_15px_rgba(34,197,94,0.4)]';
                                                        else if (isSelected) btnClass = 'bg-red-500/30 border-red-400 text-red-100 shadow-[0_0_15px_rgba(239,68,68,0.4)]';
                                                        else btnClass = 'bg-white/5 border-white/10 opacity-50';
                                                    }
                                                    return (
                                                        <button key={oi} onClick={() => !submitted && setQuizAnswers({...quizAnswers, [qKey]: oi})} className={`w-full p-5 rounded-2xl text-left border backdrop-blur-md transition-all duration-300 ${btnClass}`}>
                                                          <RenderMarkdown content={opt || ""} />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            {quizSubmitted[activeQA.idx] && (
                                              <div className="p-6 bg-blue-900/20 border-t border-l border-blue-400/30 rounded-2xl mt-4 shadow-inner backdrop-blur-xl">
                                                <strong className="text-blue-300 mb-2 block uppercase text-xs tracking-widest drop-shadow-sm">Spiegazione</strong>
                                                <RenderMarkdown content={q.spiegazione || ""} />
                                              </div>
                                            )}
                                        </div>
                                    ))}
                                    {!quizSubmitted[activeQA.idx] && (
                                      <button onClick={() => setQuizSubmitted({...quizSubmitted, [activeQA.idx]: true})} className="w-full py-5 mt-10 bg-gradient-to-r from-emerald-500/80 to-teal-600/80 hover:from-emerald-400 hover:to-teal-500 border-t border-l border-white/30 backdrop-blur-2xl rounded-[2rem] text-white font-extrabold text-xl shadow-[0_8px_32px_rgba(16,185,129,0.4)] transition-all">
                                        Consegna ed Esamina Risultati
                                      </button>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center p-10 text-white/50">Dati non trovati.</div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        {/* MODALE PDF VIEWER MOBILE - Liquid Glass */}
        <AnimatePresence>
          {showPdfModal && pdfUrl && (
            <div className="fixed inset-0 z-[100] flex lg:hidden items-center justify-center p-4 bg-black/60 backdrop-blur-[50px]">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full h-full max-w-5xl rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-white/10 to-white/5 border-t border-l border-white/20 flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.8)] backdrop-blur-[60px]">
                <div className="p-5 border-b border-white/10 flex justify-between items-center bg-black/10 shadow-inner">
                  <span className="font-bold flex items-center gap-3 text-white">
                    <div className="p-2 bg-blue-500/20 rounded-lg border border-white/10 shadow-sm"><FileText className="w-4 h-4 text-blue-300"/></div>
                    <span className="drop-shadow-md">Lettore PDF</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer" download={file?.name || "documento.pdf"} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-colors flex items-center gap-2 font-bold text-sm text-white shadow-sm">
                      <Download className="w-4 h-4" /> <span className="hidden sm:inline">Scarica</span>
                    </a>
                    <button onClick={() => setShowPdfModal(false)} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-colors text-white shadow-sm">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 w-full bg-transparent relative overflow-y-auto flex justify-center pb-24 pt-6 custom-scrollbar">
                   {viewerWidth > 0 && (
                     <Document file={pdfUrl} onLoadSuccess={({ numPages }) => { setNumPages(numPages); setPageNumber(1); }} loading={<Loader2 className="w-10 h-10 animate-spin text-white mt-32 opacity-50" />} className="flex flex-col items-center">
                        <AnimatePresence mode="wait">
                           <motion.div key={pageNumber} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="rounded-xl border border-white/20 shadow-[0_15px_35px_rgba(0,0,0,0.5)] mb-8 overflow-hidden bg-white/5">
                              <Page pageNumber={pageNumber} width={viewerWidth - 32} renderTextLayer={false} renderAnnotationLayer={false} />
                           </motion.div>
                        </AnimatePresence>
                     </Document>
                   )}
                   {numPages && (
                     <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-[40px] border-t border-l border-white/20 px-2 py-2 rounded-full flex items-center gap-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50">
                       <button disabled={pageNumber <= 1} onClick={() => setPageNumber(p => Math.max(1, p - 1))} className="p-3 hover:bg-white/10 rounded-full disabled:opacity-30 transition-all text-white"><ChevronLeft className="w-5 h-5" /></button>
                       <span className="font-mono text-sm font-bold text-white px-4 drop-shadow-md">{pageNumber} <span className="text-white/50 font-normal">/</span> {numPages}</span>
                       <button disabled={pageNumber >= numPages} onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} className="p-3 hover:bg-white/10 rounded-full disabled:opacity-30 transition-all text-white"><ChevronRight className="w-5 h-5" /></button>
                     </div>
                   )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
      <style dangerouslySetInnerHTML={{__html: `
        .perspective-2000 { perspective: 2000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        .prose p { margin-bottom: 0 !important; margin-top: 0 !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 10px; border: 1px solid rgba(255,255,255,0.05); }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.25); }
      `}} />
    </div>
  );
}
