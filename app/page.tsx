'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BookOpen, Layers, CheckSquare, UploadCloud, 
  ChevronRight, ChevronLeft, Sparkles, Moon, Sun, FileText, X, CheckCircle, XCircle, Loader2, ChevronDown, Download, BrainCircuit
} from 'lucide-react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

import { PDFDocument } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<Record<number, boolean>>({});
  
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [viewerWidth, setViewerWidth] = useState(0);
  const [generatingQA, setGeneratingQA] = useState<number | null>(null);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  useEffect(() => {
    const savedKey = localStorage.getItem('study_buddy_api_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  useEffect(() => {
    if (showPdfModal) {
      const updateWidth = () => setViewerWidth(window.innerWidth < 768 ? window.innerWidth - 48 : Math.min(window.innerWidth - 120, 900));
      updateWidth();
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
  }, [showPdfModal]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    if (selectedFile) setPdfUrl(URL.createObjectURL(selectedFile));
  };

  const startAutoPilot = async () => {
    if (!file || !apiKey) return alert("Configura API Key e PDF!");
    localStorage.setItem('study_buddy_api_key', apiKey);
    setLoading(true);
    setData(null);

    try {
      setLoadingStatus("Fase 1: Analisi dell'indice...");
      const formOutline = new FormData();
      formOutline.append('file', file);
      formOutline.append('apiKey', apiKey);
      formOutline.append('action', 'outline');

      const outlineRes = await fetch('/api/study', { method: 'POST', body: formOutline });
      const outlineData = await outlineRes.json();
      const capitoliRaw = outlineData.capitoli || [];

      const fileBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const totalPages = pdfDoc.getPageCount();

      let chaptersResult = [];

      for (let i = 0; i < capitoliRaw.length; i++) {
        const cap = capitoliRaw[i];
        const nextCap = capitoliRaw[i + 1];
        let startPage = parseInt(cap.paginaInizio) - 1 || 0;
        let endPage = nextCap ? (parseInt(nextCap.paginaInizio) - 2) : totalPages - 1;
        
        setLoadingStatus(`Analisi Dispensa: ${cap.titolo}`);

        const newPdf = await PDFDocument.create();
        const pagesToCopy = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index);
        const copiedPages = await newPdf.copyPages(pdfDoc, pagesToCopy);
        copiedPages.forEach((p) => newPdf.addPage(p));
        const pdfBytes = await newPdf.save();
        
        const chunkFile = new File([new Blob([pdfBytes])], `cap_${i}.pdf`, { type: 'application/pdf' });
        const formData = new FormData();
        formData.append('file', chunkFile);
        formData.append('apiKey', apiKey);
        formData.append('action', 'chapter');
        formData.append('focus', cap.titolo);

        const capRes = await fetch('/api/study', { method: 'POST', body: formData });
        const capData = await capRes.json();
        
        chaptersResult.push({ 
            titolo: cap.titolo, 
            testo: capData.riassunto, 
            pdfBlob: new Blob([pdfBytes], { type: 'application/pdf' }),
            flashcards: null,
            quiz: null 
        });

        setData({ chapters: [...chaptersResult] });
        if (i < capitoliRaw.length - 1) await new Promise(r => setTimeout(r, 4000));
      }

      setLoadingStatus("Finito!");
      setActiveTab('riassunto');
    } catch (error: any) {
      alert("Errore: " + error.message);
    }
    setLoading(false);
  };

  const generateQAForChapter = async (index: number) => {
    const chapter = data.chapters[index];
    setGeneratingQA(index);

    try {
        const formData = new FormData();
        const chunkFile = new File([chapter.pdfBlob], `qa_${index}.pdf`, { type: 'application/pdf' });
        formData.append('file', chunkFile);
        formData.append('apiKey', apiKey);
        formData.append('action', 'generate_qa');
        formData.append('focus', chapter.titolo);

        const res = await fetch('/api/study', { method: 'POST', body: formData });
        const qaData = await res.json();

        const updatedChapters = [...data.chapters];
        updatedChapters[index].flashcards = qaData.flashcards;
        updatedChapters[index].quiz = qaData.quiz;
        
        setData({ ...data, chapters: updatedChapters });
    } catch (e) {
        alert("Errore nella generazione dei test.");
    }
    setGeneratingQA(null);
  };

  const RenderMarkdown = ({ content }: { content: string }) => (
    <div className="w-full text-left">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]} 
        rehypePlugins={[rehypeKatex]}
        components={{
          h2: ({node, ...props}) => <h2 className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-12 mb-6 border-l-4 border-blue-600 pl-4" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-xl font-bold text-gray-800 dark:text-white mt-8 mb-4" {...props} />,
          p: ({node, ...props}) => <p className="text-lg leading-7 mb-6 text-gray-700 dark:text-gray-300 text-justify" {...props} />,
          strong: ({node, ...props}) => <strong className="font-bold text-gray-900 dark:text-white" {...props} />,
          blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-gray-300 dark:border-gray-700 pl-6 my-8 text-gray-600 dark:text-gray-400 italic" {...props} />,
          ul: ({node, ...props}) => <ul className="space-y-2 mb-6 ml-4 list-disc text-lg" {...props} />,
          div: ({node, ...props}) => <div className="my-4 overflow-x-auto" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );

  return (
    <div className={`min-h-screen transition-colors duration-700 ${darkMode ? 'bg-[#000000] text-white' : 'bg-[#F5F5F7] text-[#1D1D1F]'} font-sans pb-20`}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className={`absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full blur-[100px] opacity-40 ${darkMode ? 'bg-indigo-900/40' : 'bg-blue-200'}`} />
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 py-8 md:py-12">
        <header className="flex justify-between items-center mb-10 md:mb-16 gap-4">
          <div className="flex items-center gap-4">
            <motion.div whileHover={{ rotate: 10, scale: 1.05 }} className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg"><BookOpen className="text-white" /></motion.div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter lowercase">studdy<span className="text-blue-500">.</span></h1>
          </div>
          <div className="flex gap-3">
            {data && <button onClick={() => setShowPdfModal(true)} className="px-4 py-2 rounded-full text-sm font-bold bg-blue-600 text-white shadow-lg flex items-center gap-2"><FileText className="w-4 h-4" /> PDF</button>}
            <button onClick={() => setDarkMode(!darkMode)} className="p-3 rounded-full backdrop-blur-xl border border-white/10">{darkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-indigo-600" />}</button>
          </div>
        </header>

        {loading && (
           <div className="mb-8 p-8 rounded-[2.5rem] bg-blue-600/10 border border-blue-500/20 flex flex-col items-center justify-center text-center space-y-4 backdrop-blur-xl">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <p className="font-bold text-xl text-blue-500">{loadingStatus}</p>
           </div>
        )}

        {!data && !loading ? (
          <div className={`max-w-xl mx-auto p-8 rounded-[2.5rem] backdrop-blur-3xl border ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white/60 border-white/20 shadow-xl'}`}>
            <div className="space-y-6">
              <input type="password" value={apiKey} onChange={(e) => {setApiKey(e.target.value); localStorage.setItem('study_buddy_api_key', e.target.value);}} className="w-full p-4 rounded-2xl bg-black/20 border border-white/10 outline-none focus:border-blue-500 text-white" placeholder="Google Gemini API Key" />
              <label className="flex flex-col items-center justify-center w-full h-40 rounded-3xl border-2 border-dashed border-white/10 bg-white/5 cursor-pointer">
                <UploadCloud className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm font-medium">{file ? file.name : "Carica il PDF"}</p>
                <input type="file" className="hidden" accept=".pdf" onChange={handleFileChange} />
              </label>
              <button onClick={startAutoPilot} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex justify-center items-center gap-2 text-lg">Inizia a studiare <Sparkles className="w-5 h-5" /></button>
            </div>
          </div>
        ) : data && (
          <div className="max-w-4xl mx-auto space-y-6">
             {data.chapters.map((cap: any, idx: number) => (
                <div key={idx} className="rounded-[2rem] border border-white/10 bg-white/5 overflow-hidden backdrop-blur-xl">
                    <button onClick={() => setExpandedChapter(expandedChapter === idx ? null : idx)} className="w-full p-6 md:p-8 flex justify-between items-center text-left hover:bg-white/5 transition-colors">
                        <span className="text-xl md:text-2xl font-bold flex items-center gap-4">
                            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/20 text-blue-500 text-sm">{idx + 1}</span>
                            {cap.titolo}
                        </span>
                        <ChevronDown className={`transition-transform ${expandedChapter === idx ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <AnimatePresence>
                        {expandedChapter === idx && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-6 md:px-10 pb-10">
                                <div className="border-t border-white/10 pt-8">
                                    <RenderMarkdown content={cap.testo} />
                                    
                                    <div className="mt-12 p-8 rounded-[2rem] bg-indigo-500/10 border border-indigo-500/20 flex flex-col items-center text-center space-y-6">
                                        <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-500"><BrainCircuit className="w-8 h-8" /></div>
                                        <div>
                                            <h4 className="text-xl font-bold mb-2">Materiale di ripasso</h4>
                                            <p className="text-sm opacity-60">Genera 10 flashcards e un test da 10 domande per questo capitolo.</p>
                                        </div>
                                        
                                        {!cap.quiz ? (
                                            <button 
                                                disabled={generatingQA === idx}
                                                onClick={() => generateQAForChapter(idx)}
                                                className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                                            >
                                                {generatingQA === idx ? <Loader2 className="animate-spin w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                                                Genera Test e Flashcards
                                            </button>
                                        ) : (
                                            <div className="flex gap-4">
                                                <button onClick={() => { setData({...data, activeQA: {idx, type: 'flashcards'}}); setActiveTab('qa'); }} className="px-6 py-3 bg-white text-black rounded-xl font-bold text-sm">Vedi Flashcards</button>
                                                <button onClick={() => { setData({...data, activeQA: {idx, type: 'quiz'}}); setActiveTab('qa'); }} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm">Fai il Test</button>
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

        {/* MODALE Q&A (FLASHCARDS E QUIZ) */}
        <AnimatePresence>
            {activeTab === 'qa' && data.activeQA && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4">
                    <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-zinc-900 rounded-[3rem] border border-white/10 flex flex-col">
                        <div className="p-6 border-b border-white/10 flex justify-between items-center">
                            <h2 className="font-bold">{data.activeQA.type === 'flashcards' ? 'Flashcards' : 'Test Universitario'}</h2>
                            <button onClick={() => setActiveTab('riassunto')} className="p-2 rounded-full bg-white/10"><X /></button>
                        </div>
                        
                        <div className="p-8">
                            {data.activeQA.type === 'flashcards' ? (
                                <div className="flex flex-col items-center">
                                    <div onClick={() => setIsFlipped(!isFlipped)} className="w-full max-w-lg h-80 relative cursor-pointer perspective-2000">
                                        <motion.div animate={{ rotateY: isFlipped ? 180 : 0 }} className="w-full h-full preserve-3d transition-all duration-500">
                                            <div className="absolute inset-0 backface-hidden bg-white/5 border border-white/10 rounded-3xl p-10 flex flex-col justify-center items-center text-center">
                                                <span className="text-xs opacity-40 mb-4 uppercase font-black">Domanda</span>
                                                <div className="text-xl font-bold"><RenderMarkdown content={data.chapters[data.activeQA.idx].flashcards[cardIndex].domanda} /></div>
                                            </div>
                                            <div className="absolute inset-0 backface-hidden rotate-y-180 bg-blue-600 rounded-3xl p-10 flex flex-col justify-center items-center text-center">
                                                <span className="text-xs opacity-60 mb-4 uppercase font-black text-white">Risposta</span>
                                                <div className="text-lg font-medium text-white"><RenderMarkdown content={data.chapters[data.activeQA.idx].flashcards[cardIndex].risposta} /></div>
                                            </div>
                                        </motion.div>
                                    </div>
                                    <div className="flex gap-4 mt-8">
                                        <button onClick={() => {setCardIndex(Math.max(0, cardIndex - 1)); setIsFlipped(false)}} className="p-3 rounded-full bg-white/10"><ChevronLeft /></button>
                                        <span className="flex items-center font-bold">{cardIndex + 1} / 10</span>
                                        <button onClick={() => {setCardIndex(Math.min(9, cardIndex + 1)); setIsFlipped(false)}} className="p-3 rounded-full bg-white/10"><ChevronRight /></button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    {data.chapters[data.activeQA.idx].quiz.map((q: any, i: number) => (
                                        <div key={i} className="p-8 bg-white/5 border border-white/5 rounded-3xl space-y-6">
                                            <div className="text-xl font-bold flex gap-3"><span className="text-blue-500">{i+1}.</span><RenderMarkdown content={q.domanda} /></div>
                                            <div className="grid gap-3">
                                                {q.opzioni.map((opt: string, oi: number) => {
                                                    const qKey = `${data.activeQA.idx}-${i}`;
                                                    const isSelected = quizAnswers[qKey] === oi;
                                                    const submitted = quizSubmitted[data.activeQA.idx];
                                                    let btnClass = isSelected ? 'bg-blue-600/20 border-blue-500' : 'bg-white/5 border-transparent';
                                                    if (submitted) {
                                                        if (oi === q.corretta) btnClass = 'bg-green-500/20 border-green-500';
                                                        else if (isSelected) btnClass = 'bg-red-500/20 border-red-500';
                                                    }
                                                    return (
                                                        <button key={oi} onClick={() => !submitted && setQuizAnswers({...quizAnswers, [qKey]: oi})} className={`w-full p-4 rounded-xl text-left border transition-all ${btnClass}`}><RenderMarkdown content={opt} /></button>
                                                    );
                                                })}
                                            </div>
                                            {quizSubmitted[data.activeQA.idx] && <div className="p-4 bg-blue-500/10 rounded-xl text-sm italic"><RenderMarkdown content={q.spiegazione} /></div>}
                                        </div>
                                    ))}
                                    {!quizSubmitted[data.activeQA.idx] && <button onClick={() => setQuizSubmitted({...quizSubmitted, [data.activeQA.idx]: true})} className="w-full py-4 bg-green-600 rounded-2xl font-bold">Invia Risposte</button>}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </AnimatePresence>

        {/* MODALE PDF */}
        <AnimatePresence>
          {showPdfModal && pdfUrl && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-8 bg-black/90 backdrop-blur-xl">
              <div className="relative w-full h-full max-w-5xl md:rounded-[3rem] overflow-hidden bg-zinc-900 flex flex-col shadow-2xl">
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-zinc-900 z-10 shadow-md">
                  <span className="font-bold flex items-center gap-2 text-white"><FileText className="text-blue-500"/> PDF Originale</span>
                  <div className="flex items-center gap-2">
                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer" download={file?.name || "documento.pdf"} className="px-4 py-2 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center gap-2"><Download className="w-4 h-4" /> Scarica</a>
                    <button onClick={() => setShowPdfModal(false)} className="p-2 rounded-full bg-white/10 text-white"><X /></button>
                  </div>
                </div>
                <div className="flex-1 w-full bg-zinc-800 relative overflow-y-auto flex justify-center pb-24 pt-4">
                   {viewerWidth > 0 && (
                     <Document file={pdfUrl} onLoadSuccess={({ numPages }) => { setNumPages(numPages); setPageNumber(1); }} className="flex flex-col items-center">
                       <Page pageNumber={pageNumber} width={viewerWidth} renderTextLayer={false} renderAnnotationLayer={false} className="shadow-2xl rounded-md bg-white" />
                     </Document>
                   )}
                   {numPages && (
                     <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-xl px-6 py-3 rounded-full flex items-center gap-6 text-white border border-white/10 z-50">
                       <button disabled={pageNumber <= 1} onClick={() => setPageNumber(p => Math.max(1, p - 1))} className="p-2 disabled:opacity-30"><ChevronLeft /></button>
                       <span className="font-mono font-bold">{pageNumber} / {numPages}</span>
                       <button disabled={pageNumber >= numPages} onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} className="p-2 disabled:opacity-30"><ChevronRight /></button>
                     </div>
                   )}
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .perspective-2000 { perspective: 2000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}} />
    </div>
  );
}
