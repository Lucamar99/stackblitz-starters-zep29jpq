'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BookOpen, Layers, CheckSquare, UploadCloud, 
  ChevronRight, ChevronLeft, Sparkles, Moon, Sun, FileText, X, CheckCircle, XCircle, Loader2, ChevronDown 
} from 'lucide-react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

import { PDFDocument } from 'pdf-lib';

export default function Home() {
  const [apiKey, setApiKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('riassunto');
  const [darkMode, setDarkMode] = useState(true);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    if (selectedFile) setPdfUrl(URL.createObjectURL(selectedFile));
  };

  const startAutoPilot = async () => {
    if (!file || !apiKey) return alert("Configura API Key e PDF!");
    setLoading(true);
    setData(null);

    let accumData = { riassunto: [] as any[], flashcards: [] as any[], quiz: [] as any[] };

    try {
      setLoadingStatus("Fase 1: Individuazione dei capitoli nel documento...");
      
      const formOutline = new FormData();
      formOutline.append('file', file);
      formOutline.append('apiKey', apiKey);
      formOutline.append('action', 'outline');

      const outlineRes = await fetch('/api/study', { method: 'POST', body: formOutline });
      if (!outlineRes.ok) throw new Error("Errore durante l'analisi dell'indice.");
      const outlineData = await outlineRes.json();
      const capitoliRaw = outlineData.capitoli || [];

      if (capitoliRaw.length === 0) throw new Error("L'IA non ha trovato capitoli distinti.");

      setLoadingStatus("Fase 2: Taglio e analisi dei singoli capitoli...");
      const fileBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const totalPages = pdfDoc.getPageCount();

      for (let i = 0; i < capitoliRaw.length; i++) {
        const cap = capitoliRaw[i];
        const nextCap = capitoliRaw[i + 1];

        // Calcoliamo il range di pagine per questo capitolo
        // Nota: pdf-lib usa indici da 0, l'IA di solito conta da 1
        const startPage = Math.max(0, cap.paginaInizio - 1);
        let endPage = nextCap ? nextCap.paginaInizio - 2 : totalPages - 1;
        
        // Protezione se l'IA dà numeri errati
        if (endPage < startPage) endPage = Math.min(startPage + 20, totalPages - 1);

        setLoadingStatus(`Analisi Capitolo: ${cap.titolo} (Pag. ${startPage + 1} - ${endPage + 1})`);

        // Estrazione delle pagine specifiche
        const newPdf = await PDFDocument.create();
        const pagesToCopy = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index);
        const copiedPages = await newPdf.copyPages(pdfDoc, pagesToCopy);
        copiedPages.forEach((page) => newPdf.addPage(page));
        const pdfBytes = await newPdf.save();
        
        const chunkBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        const chunkFile = new File([chunkBlob], `chapter_${i}.pdf`, { type: 'application/pdf' });

        const formData = new FormData();
        formData.append('file', chunkFile);
        formData.append('apiKey', apiKey);
        formData.append('action', 'chapter');
        formData.append('focus', cap.titolo);

        const capRes = await fetch('/api/study', { method: 'POST', body: formData });
        if (capRes.ok) {
          const capData = await capRes.json();
          accumData.riassunto.push({ titolo: cap.titolo, testo: capData.riassunto });
          accumData.flashcards.push(...(capData.flashcards || []));
          accumData.quiz.push(...(capData.quiz || []));
        } else {
          accumData.riassunto.push({ titolo: cap.titolo, testo: "⚠️ *Errore durante la sintesi di questo capitolo.*" });
        }
        
        setData({ ...accumData });

        // Pausa per evitare blocchi API
        if (i < capitoliRaw.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      setLoadingStatus("Finito!");
      setActiveTab('riassunto');
      setExpandedChapter(0);

    } catch (error: any) {
      alert("Errore: " + error.message);
    }
    setLoading(false);
  };

  // ... (Resto del codice dell'interfaccia identico a prima)
  const calculateScore = () => {
    let score = 0;
    data?.quiz.forEach((q: any, i: number) => { if (quizAnswers[i] === q.corretta) score++; });
    return score;
  };
  const handleQuizSelect = (qIndex: number, oIndex: number) => {
    if (quizSubmitted) return;
    setQuizAnswers(prev => ({ ...prev, [qIndex]: oIndex }));
  };

  const RenderMarkdown = ({ content }: { content: string }) => (
    <div className="w-full text-left">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]} 
        rehypePlugins={[rehypeKatex]}
        components={{
          // Titoli più sobri per non rubare spazio al contenuto
          h2: ({node, ...props}) => <h2 className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-12 mb-6 border-l-4 border-blue-600 pl-4" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-xl font-bold text-gray-800 dark:text-white mt-8 mb-4" {...props} />,
        
          // Paragrafo: Interlinea "giusta" per testi lunghi (leading-7 invece di loose)
          p: ({node, ...props}) => (
            <p className="text-lg leading-7 mb-6 text-gray-700 dark:text-gray-300 text-justify" {...props} />
          ),
        
          // Grassetto pulito senza sfondi colorati (che distraggono in testi lunghi)
          strong: ({node, ...props}) => <strong className="font-bold text-gray-900 dark:text-white" {...props} />,
        
          // Citazioni per teoremi o leggi: più sottili
          blockquote: ({node, ...props}) => (
            <blockquote className="border-l-2 border-gray-300 dark:border-gray-700 pl-6 my-8 text-gray-600 dark:text-gray-400 italic" {...props} />
          ),
        
          // Equazioni LaTeX: aggiungiamo un po' di spazio sopra e sotto
          div: ({node, ...props}) => <div className="my-4 overflow-x-auto" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );

  return (
    <div className={`min-h-screen transition-colors duration-700 ${darkMode ? 'bg-[#000000] text-white' : 'bg-[#F5F5F7] text-[#1D1D1F]'} font-sans pb-20`}>
      {/* Background animato */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className={`absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full blur-[100px] opacity-40 ${darkMode ? 'bg-indigo-900/40' : 'bg-blue-200'}`} />
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 py-8 md:py-12">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">Study Buddy <span className="text-blue-500">Auto</span></h1>
          <div className="flex gap-3">
            {data && <button onClick={() => setShowPdfModal(true)} className="px-4 py-2 rounded-full text-sm font-bold bg-blue-600 text-white shadow-lg flex items-center gap-2"><FileText className="w-4 h-4" /> PDF</button>}
            <button onClick={() => setDarkMode(!darkMode)} className="p-3 rounded-full backdrop-blur-xl border border-white/10">{darkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-indigo-600" />}</button>
          </div>
        </header>

        {loading && (
           <div className="mb-8 p-8 rounded-[2.5rem] bg-blue-600/10 border border-blue-500/20 flex flex-col items-center justify-center text-center space-y-4 backdrop-blur-xl">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <p className="font-bold text-xl text-blue-500">{loadingStatus}</p>
              <p className="text-sm opacity-60">L'IA sta tagliando il PDF seguendo i capitoli reali. Non chiudere.</p>
           </div>
        )}

        {!data && !loading ? (
          <div className={`max-w-xl mx-auto p-8 rounded-[2.5rem] backdrop-blur-3xl border ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white/60 border-white/20 shadow-xl'}`}>
            <div className="space-y-6">
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full p-4 rounded-2xl bg-black/20 border border-white/10 outline-none focus:border-blue-500" placeholder="API Key gsk_..." />
              <label className="flex flex-col items-center justify-center w-full h-40 rounded-3xl border-2 border-dashed border-white/10 bg-white/5 cursor-pointer">
                <UploadCloud className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm">{file ? file.name : "Carica il PDF per dividerlo per capitoli"}</p>
                <input type="file" className="hidden" accept=".pdf" onChange={handleFileChange} />
              </label>
              <button onClick={startAutoPilot} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex justify-center items-center gap-2">Avvia Analisi per Capitoli <Sparkles className="w-5 h-5" /></button>
            </div>
          </div>
        ) : data && (
          <div className="space-y-8">
            <nav className="flex justify-center gap-2 p-1.5 rounded-full bg-white/10 backdrop-blur-2xl border border-white/10 w-max mx-auto">
              {['riassunto', 'flashcards', 'quiz'].map(t => (
                <button key={t} onClick={() => setActiveTab(t)} className={`px-6 py-2.5 rounded-full text-sm font-bold capitalize transition-all ${activeTab === t ? 'bg-white text-black' : 'opacity-50 hover:opacity-100'}`}>{t}</button>
              ))}
            </nav>

            <AnimatePresence mode="wait">
              {activeTab === 'riassunto' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto space-y-4">
                  {data.riassunto.map((cap: any, idx: number) => (
                    <div key={idx} className="rounded-[2rem] border border-white/10 bg-white/5 overflow-hidden">
                      <button onClick={() => setExpandedChapter(expandedChapter === idx ? null : idx)} className="w-full p-6 flex justify-between items-center text-left">
                        <span className="text-xl font-bold">{idx + 1}. {cap.titolo}</span>
                        <ChevronDown className={`transition-transform ${expandedChapter === idx ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedChapter === idx && <div className="p-8 pt-0 border-t border-white/10"><RenderMarkdown content={cap.testo} /></div>}
                    </div>
                  ))}
                </motion.div>
              )}
              {/* QUIZ e FLASHCARDS rimangono come nel codice precedente */}
              {activeTab === 'quiz' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto space-y-6">
                  {data.quiz.map((q: any, i: number) => (
                    <div key={i} className="p-8 rounded-3xl bg-white/5 border border-white/5 space-y-4">
                      <div className="text-xl font-bold flex gap-2"><span>{i+1}.</span> <RenderMarkdown content={q.domanda} /></div>
                      <div className="grid gap-2">
                        {q.opzioni.map((opt: string, oi: number) => (
                          <button key={oi} onClick={() => handleQuizSelect(i, oi)} className={`p-4 rounded-xl text-left border transition-all ${quizAnswers[i] === oi ? 'bg-blue-600/20 border-blue-500' : 'bg-white/5 border-white/5'}`}><RenderMarkdown content={opt} /></button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!quizSubmitted && <button onClick={() => setQuizSubmitted(true)} className="w-full py-4 bg-green-600 rounded-2xl font-bold">Consegna Test</button>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Modal PDF */}
      <AnimatePresence>
        {showPdfModal && pdfUrl && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/80 backdrop-blur-xl">
            <div className="relative w-full h-full max-w-5xl rounded-[3rem] overflow-hidden bg-zinc-900 border border-white/10 flex flex-col">
              <div className="p-4 border-b border-white/10 flex justify-between items-center">
                <span className="font-bold">Documento Originale</span>
                <button onClick={() => setShowPdfModal(false)} className="p-2 rounded-full bg-white/10"><X className="w-5 h-5" /></button>
              </div>
              <iframe src={pdfUrl} className="flex-1 w-full h-full" />
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
