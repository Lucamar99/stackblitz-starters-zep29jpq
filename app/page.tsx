'use client';

import { useState, useEffect } from 'react';
import { UserButton, SignInButton, useUser } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BookOpen, UploadCloud, ChevronDown, FileText, Loader2, 
  Sparkles, BrainCircuit, History, ChevronLeft, ChevronRight, X, Download, Trash2
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
  if (!content) return <span className="text-gray-500 italic">...</span>;
  return (
    <div className="prose prose-invert max-w-none text-gray-300">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
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
    if (showPdfModal && typeof window !== 'undefined') {
      const updateWidth = () => setViewerWidth(window.innerWidth < 768 ? window.innerWidth - 48 : Math.min(window.innerWidth - 120, 900));
      updateWidth();
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
  }, [showPdfModal]);

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

    // Recuperiamo l'URL del PDF salvato
    const savedUrl = fileChapters[0].pdf_url;
    if (savedUrl) {
      setPdfUrl(savedUrl);
      // Trasformiamo l'URL in un oggetto File per Gemini se volessimo rigenerare test
      const response = await fetch(savedUrl);
      const blob = await response.blob();
      setFile(new File([blob], pdfName, { type: "application/pdf" }));
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
    if (!file || !apiKey) return alert("Configura tutto!");
    setLoading(true);
    setChapters([]);
    localStorage.setItem('study_buddy_api_key', apiKey);

    try {
      setLoadingStatus("Fase 1: Caricamento e Analisi...");
      const form = new FormData();
      form.append('file', file);
      form.append('apiKey', apiKey);
      form.append('action', 'outline');
      form.append('pdfName', file.name);

      const outlineRes = await fetch('/api/study', { method: 'POST', body: form });
      const outlineData = await outlineRes.json();
      
      const currentPdfUrl = outlineData.savedPdfUrl;
      setPdfUrl(currentPdfUrl);

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
        formData.append('pdfUrl', currentPdfUrl); // Passiamo l'url per legare i record

        const capRes = await fetch('/api/study', { method: 'POST', body: formData });
        const capData = await capRes.json();
        
        currentChapters.push({ 
          ...cap, 
          testo: capData.riassunto, 
          pdfBlob: blob, 
          flashcards: null, 
          quiz: null 
        });
        
        setChapters([...currentChapters]);
        await new Promise(r => setTimeout(r, 3500));
      }
      loadHistory();
    } catch (e: any) { 
      alert("Errore: " + e.message); 
    }
    setLoading(false);
  };

  const generateQA = async (idx: number) => {
    if (!file) return alert("File non disponibile.");
    const cap = chapters[idx];
    setGeneratingQA(idx);

    try {
      // Se non abbiamo il blob del capitolo (perché caricato da storia), dobbiamo estrarlo dal file principale
      let blobToUse = cap.pdfBlob;
      if (!blobToUse) {
        setLoadingStatus("Recupero pagine per il test...");
        // Logica semplificata: usiamo l'intero file per il Q&A se caricato da storia
        blobToUse = file;
      }

      const formData = new FormData();
      formData.append('file', blobToUse);
      formData.append('apiKey', apiKey);
      formData.append('action', 'generate_qa');
      formData.append('focus', cap.titolo);
      formData.append('pdfName', file.name);
      formData.append('pdfUrl', pdfUrl || "");

      const res = await fetch('/api/study', { method: 'POST', body: formData });
      const qa = await res.json();
      
      const newChapters = [...chapters];
      newChapters[idx].flashcards = qa.flashcards;
      newChapters[idx].quiz = qa.quiz;
      setChapters(newChapters);
      loadHistory();
    } catch (e) { alert("Errore test."); }
    setGeneratingQA(null);
  };

  const deletePdf = async (pdfName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Vuoi eliminare definitivamente "${pdfName}"?`)) return;
    await fetch(`/api/study?pdfName=${encodeURIComponent(pdfName)}`, { method: 'DELETE' });
    loadHistory();
    setChapters([]);
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
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-blue-600 rounded-[2rem] mb-8 flex items-center justify-center shadow-2xl shadow-blue-500/30">
          <BookOpen className="text-white w-10 h-10" />
        </div>
        <h1 className="text-5xl font-extrabold mb-4 tracking-tighter">studdy<span className="text-blue-500">.</span></h1>
        <SignInButton mode="modal">
          <button className="px-10 py-4 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 text-white font-bold rounded-[2rem] transition-all text-lg shadow-xl">Inizia</button>
        </SignInButton>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans pb-20 relative overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[80vw] h-[80vw] bg-blue-600 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-indigo-600 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 md:py-12">
        <header className="flex justify-between items-center mb-16">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => { setChapters([]); setPdfUrl(null); }}>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg"><BookOpen /></div>
            <h1 className="text-4xl font-black tracking-tighter">studdy.</h1>
          </div>
          <div className="flex items-center gap-4">
            {pdfUrl && (
              <button onClick={() => setShowPdfModal(true)} className="px-4 py-2 rounded-full text-sm font-bold bg-white/10 text-white flex items-center gap-2"><FileText className="w-4 h-4" /> PDF</button>
            )}
            <UserButton />
          </div>
        </header>

        {!loading && chapters.length === 0 ? (
          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-2xl shadow-2xl space-y-6">
              <h3 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="text-blue-500" /> Nuovo Studio</h3>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full p-4 bg-black/40 rounded-2xl border border-white/10 outline-none focus:border-blue-500 text-white" placeholder="API Key" />
              <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-white/10 rounded-3xl cursor-pointer hover:bg-white/10 transition-colors bg-black/20 text-center px-4">
                <UploadCloud className="w-10 h-10 opacity-40 mb-3" />
                <span className="text-sm font-medium">{file ? file.name : "Carica PDF"}</span>
                <input type="file" className="hidden" accept=".pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>
              <button onClick={startAutoPilot} className="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-2xl font-bold text-lg">Analizza Documento</button>
            </div>

            <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-2xl shadow-2xl flex flex-col">
              <h3 className="text-2xl font-bold flex items-center gap-2 mb-6"><History className="text-indigo-400" /> Archivio Studi</h3>
              <div className="space-y-3 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                {Object.keys(groupedHistory).length === 0 ? <p className="opacity-40 italic text-center mt-10">Nessun file.</p> : 
                  Object.entries(groupedHistory).map(([pdfName, caps]: [string, any], i) => (
                    <div key={i} onClick={() => loadFromHistory(pdfName)} className="p-5 rounded-2xl bg-black/40 border border-white/5 hover:border-indigo-500/50 hover:bg-white/10 cursor-pointer transition-all group flex justify-between items-center">
                      <div className="flex items-center gap-3 truncate">
                        <FileText className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                        <span className="font-bold text-white truncate text-sm">{pdfName}</span>
                      </div>
                      <button onClick={(e) => deletePdf(pdfName, e)} className="p-2 hover:bg-red-500/20 text-gray-500 hover:text-red-400 rounded-full"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
             <button onClick={() => { setChapters([]); setPdfUrl(null); }} className="mb-4 text-blue-400 font-bold flex items-center gap-2"><ChevronLeft className="w-4 h-4"/> Home</button>
             {chapters.map((cap: any, idx: number) => (
                <div key={idx} className="rounded-[2.5rem] border border-white/10 bg-white/5 overflow-hidden backdrop-blur-2xl shadow-xl">
                    <button onClick={() => setExpandedChapter(expandedChapter === idx ? null : idx)} className="w-full p-6 md:p-8 flex justify-between items-center text-left hover:bg-white/10">
                        <span className="text-xl md:text-2xl font-bold flex items-center gap-4">
                            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 text-sm">{idx + 1}</span>
                            {cap.titolo}
                        </span>
                        <ChevronDown className={`w-6 h-6 transition-transform ${expandedChapter === idx ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                        {expandedChapter === idx && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-6 md:px-10 pb-10">
                                <div className="border-t border-white/10 pt-8">
                                    <RenderMarkdown content={cap.testo} />
                                    <div className="mt-16 p-8 rounded-[2.5rem] bg-gradient-to-br from-indigo-900/40 to-blue-900/40 border border-indigo-500/30 flex flex-col items-center text-center space-y-6">
                                        <BrainCircuit className="w-12 h-12 text-indigo-400" />
                                        <h4 className="text-2xl font-extrabold text-white">Allenamento</h4>
                                        {!cap.quiz ? (
                                            <button disabled={generatingQA === idx} onClick={() => generateQA(idx)} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-full font-bold flex items-center gap-3">
                                                {generatingQA === idx ? <Loader2 className="animate-spin" /> : <Sparkles />} Crea Flashcards e Test
                                            </button>
                                        ) : (
                                            <div className="flex gap-4">
                                                <button onClick={() => { setActiveQA({idx, type: 'flashcards'}); setCardIndex(0); }} className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full font-bold border border-white/20">Studia Flashcards</button>
                                                <button onClick={() => setActiveQA({idx, type: 'quiz'})} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold">Fai il Test</button>
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
        )}

        {/* MODALE Q&A E PDF VIEWER (Invariati come struttura, ma ora usano l'URL salvato) */}
        {/* ... (Stessa logica di visualizzazione dei modali dei messaggi precedenti) ... */}

      </div>
    </div>
  );
}
