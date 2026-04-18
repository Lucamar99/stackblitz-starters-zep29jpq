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

      setLoadingStatus("Fase 2: Analisi profonda (senza limiti di lunghezza)...");
      const fileBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const totalPages = pdfDoc.getPageCount();

      for (let i = 0; i < capitoliRaw.length; i++) {
        const cap = capitoliRaw[i];
        const nextCap = capitoliRaw[i + 1];

        let startPage = parseInt(cap.paginaInizio) - 1 || 0;
        startPage = Math.max(0, startPage);
        
        let endPage = nextCap ? (parseInt(nextCap.paginaInizio) - 2) : totalPages - 1;
        if (isNaN(endPage) || endPage < startPage) {
            endPage = Math.min(startPage + 20, totalPages - 1);
        }

        // LA CUCITURA INVISIBILE: Invece di tagliare il capitolo, lo dividiamo in "Sotto-blocchi" sicuri.
        // Vercel non andrà in timeout, e alla fine uniremo tutto in un solo capitolo!
        const CHUNK_LIMIT = 12; // 12 pagine per volta è il limite di sicurezza perfetto
        const totalChapterPages = endPage - startPage + 1;
        const subChunks = Math.ceil(totalChapterPages / CHUNK_LIMIT);

        let chapterTextCombinato = "";
        let chapterFlashcardsCombinate: any[] = [];
        let chapterQuizCombinati: any[] = [];

        for (let j = 0; j < subChunks; j++) {
            const subStart = startPage + (j * CHUNK_LIMIT);
            const subEnd = Math.min(subStart + CHUNK_LIMIT - 1, endPage);

            setLoadingStatus(`Analisi Capitolo: ${cap.titolo} (Parte ${j+1} di ${subChunks})`);

            const newPdf = await PDFDocument.create();
            const pagesToCopy = Array.from({ length: subEnd - subStart + 1 }, (_, index) => subStart + index);
            const copiedPages = await newPdf.copyPages(pdfDoc, pagesToCopy);
            copiedPages.forEach((page) => newPdf.addPage(page));
            const pdfBytes = await newPdf.save();
            
            const chunkBlob = new Blob([pdfBytes], { type: 'application/pdf' });
            const chunkFile = new File([chunkBlob], `chapter_${i}_part_${j}.pdf`, { type: 'application/pdf' });

            const formData = new FormData();
            formData.append('file', chunkFile);
            formData.append('apiKey', apiKey);
            formData.append('action', 'chapter');
            // Diciamo all'IA che sta analizzando una parte specifica per mantenere il contesto
            formData.append('focus', `${cap.titolo} (Parte ${j+1} di ${subChunks})`);

            try {
                const capRes = await fetch('/api/study', { method: 'POST', body: formData });
                if (capRes.ok) {
                    const capData = await capRes.json();
                    chapterTextCombinato += `\n\n${capData.riassunto}`;
                    chapterFlashcardsCombinate.push(...(capData.flashcards || []));
                    chapterQuizCombinati.push(...(capData.quiz || []));
                } else {
                    const errorText = await capRes.text();
                    let errorMessage = "Errore Server";
                    try { errorMessage = JSON.parse(errorText).error || errorMessage; } catch {}
                    chapterTextCombinato += `\n\n⚠️ *Generazione parte ${j+1} interrotta: ${errorMessage}*`;
                }
            } catch (e) {
                chapterTextCombinato += `\n\n⚠️ *La connessione è caduta per la parte ${j+1}.*`;
            }

            // Pausa vitale tra i sotto-blocchi per non bloccare le API
            if (j < subChunks - 1) {
                setLoadingStatus(`Pausa di raffreddamento...`);
                await new Promise(r => setTimeout(r, 4000));
            }
        }

        // Finito di analizzare tutte le parti, salviamo il capitolo intero e unito!
        accumData.riassunto.push({ titolo: cap.titolo, testo: chapterTextCombinato });
        accumData.flashcards.push(...chapterFlashcardsCombinate);
        accumData.quiz.push(...chapterQuizCombinati);
        setData({ ...accumData });

        // Pausa vitale tra i capitoli maggiori
        if (i < capitoliRaw.length - 1) {
          setLoadingStatus(`Passaggio al prossimo capitolo...`);
          await new Promise(r => setTimeout(r, 4000));
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
          h2: ({node, ...props}) => <h2 className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-12 mb-6 border-l-4 border-blue-600 pl-4" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-xl font-bold text-gray-800 dark:text-white mt-8 mb-4" {...props} />,
          p: ({node, ...props}) => <p className="text-lg leading-7 mb-6 text-gray-700 dark:text-gray-300 text-justify" {...props} />,
          strong: ({node, ...props}) => <strong className="font-bold text-gray-900 dark:text-white" {...props} />,
          blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-gray-300 dark:border-gray-700 pl-6 my-8 text-gray-600 dark:text-gray-400 italic" {...props} />,
          ul: ({node, ...props}) => <ul className="space-y-2 mb-6 ml-4 list-disc text-lg text-gray-700 dark:text-gray-300" {...props} />,
          ol: ({node, ...props}) => <ol className="space-y-2 mb-6 ml-4 list-decimal text-lg text-gray-700 dark:text-gray-300" {...props} />,
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
              <p className="text-sm opacity-60">L'IA sta elaborando la tua dispensa. I capitoli molto lunghi verranno analizzati in più parti per garantire la massima profondità.</p>
           </div>
        )}

        {!data && !loading ? (
          <div className={`max-w-xl mx-auto p-8 rounded-[2.5rem] backdrop-blur-3xl border ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white/60 border-white/20 shadow-xl'}`}>
            <div className="space-y-6">
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full p-4 rounded-2xl bg-black/20 border border-white/10 outline-none focus:border-blue-500" placeholder="API Key gsk_..." />
              <label className="flex flex-col items-center justify-center w-full h-40 rounded-3xl border-2 border-dashed border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                <UploadCloud className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm font-medium">{file ? file.name : "Carica il PDF per l'analisi senza limiti"}</p>
                <input type="file" className="hidden" accept=".pdf" onChange={handleFileChange} />
              </label>
              <button onClick={startAutoPilot} className="w-full py-4 bg-blue-600 hover:bg-blue-500 transition-colors text-white rounded-2xl font-bold flex justify-center items-center gap-2">Avvia Analisi Accademica <Sparkles className="w-5 h-5" /></button>
            </div>
          </div>
        ) : data && (
          <div className="space-y-8">
            <nav className="flex justify-center gap-2 p-1.5 rounded-full bg-white/10 backdrop-blur-2xl border border-white/10 w-max mx-auto overflow-x-auto">
              {['riassunto', 'flashcards', 'quiz'].map(t => (
                <button key={t} onClick={() => setActiveTab(t)} className={`px-6 py-2.5 rounded-full text-sm font-bold capitalize transition-all ${activeTab === t ? 'bg-white text-black shadow-md' : 'opacity-60 hover:opacity-100'}`}>{t === 'riassunto' ? 'Dispensa Completa' : t}</button>
              ))}
            </nav>

            <AnimatePresence mode="wait">
              {activeTab === 'riassunto' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto space-y-4">
                  {data.riassunto.map((cap: any, idx: number) => (
                    <div key={idx} className="rounded-[2rem] border border-white/10 bg-white/5 overflow-hidden backdrop-blur-xl">
                      <button onClick={() => setExpandedChapter(expandedChapter === idx ? null : idx)} className="w-full p-6 md:p-8 flex justify-between items-center text-left hover:bg-white/5 transition-colors">
                        <span className="text-xl md:text-2xl font-bold flex items-center gap-4">
                          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/20 text-blue-500 text-sm flex-shrink-0">{idx + 1}</span>
                          {cap.titolo}
                        </span>
                        <ChevronDown className={`w-6 h-6 opacity-50 transition-transform ${expandedChapter === idx ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence>
                        {expandedChapter === idx && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                            <div className="p-6 md:p-10 pt-0 border-t border-white/10">
                              <RenderMarkdown content={cap.testo} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </motion.div>
              )}

              {activeTab === 'flashcards' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-4">
                  {data.flashcards.length > 0 ? (
                    <>
                      <div className="perspective-2000 w-full max-w-lg h-96 relative group" onClick={() => setIsFlipped(!isFlipped)}>
                        <motion.div animate={{ rotateY: isFlipped ? 180 : 0 }} transition={{ type: "spring", stiffness: 150, damping: 20 }} className="w-full h-full preserve-3d cursor-pointer">
                          <div className={`absolute inset-0 backface-hidden rounded-[2.5rem] p-8 md:p-12 flex flex-col justify-center items-center text-center border overflow-y-auto ${darkMode ? 'bg-white/10 border-white/20' : 'bg-white border-black/5 shadow-xl'}`}>
                            <span className="text-xs font-black uppercase opacity-40 mb-6">Domanda</span>
                            <div className="text-2xl font-bold"><RenderMarkdown content={data.flashcards[cardIndex]?.domanda || ''} /></div>
                          </div>
                          <div className={`absolute inset-0 backface-hidden rotate-y-180 rounded-[2.5rem] p-8 md:p-12 flex flex-col justify-center items-center text-center border bg-blue-600 text-white border-blue-400 overflow-y-auto`}>
                            <span className="text-xs font-black uppercase opacity-60 mb-6 mt-auto">Risposta</span>
                            <div className="text-xl font-medium leading-relaxed mb-auto"><RenderMarkdown content={data.flashcards[cardIndex]?.risposta || ''} /></div>
                          </div>
                        </motion.div>
                      </div>
                      <div className="flex gap-4 mt-10">
                        <button onClick={() => {setCardIndex(Math.max(0, cardIndex - 1)); setIsFlipped(false)}} className="p-4 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 transition-all"><ChevronLeft /></button>
                        <span className="flex items-center font-mono font-bold px-4">{cardIndex + 1} / {data.flashcards.length}</span>
                        <button onClick={() => {setCardIndex(Math.min(data.flashcards.length - 1, cardIndex + 1)); setIsFlipped(false)}} className="p-4 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 transition-all"><ChevronRight /></button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center opacity-50 mt-10 text-xl font-bold">Nessuna flashcard generata.</div>
                  )}
                </motion.div>
              )}

              {activeTab === 'quiz' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto space-y-6">
                  {data.quiz.length > 0 ? (
                    <>
                      <div className="flex justify-between items-center mb-8">
                        <h2 className="text-3xl font-bold">Simulazione d'esame</h2>
                        {quizSubmitted && <div className="px-5 py-2 rounded-full bg-green-500/20 text-green-500 font-bold border border-green-500/30 shadow-sm">Punteggio: {calculateScore()} / {data.quiz.length}</div>}
                      </div>

                      {data.quiz.map((q: any, i: number) => (
                        <div key={i} className={`p-8 rounded-3xl border shadow-sm space-y-6 ${darkMode ? 'bg-white/5 border-white/5' : 'bg-white border-black/5'}`}>
                          <div className="text-xl font-bold flex gap-3"><span className="text-blue-500">{i+1}.</span> <RenderMarkdown content={q.domanda} /></div>
                          <div className="grid gap-3">
                            {q.opzioni.map((opt: string, oi: number) => {
                              const isSelected = quizAnswers[i] === oi;
                              const isCorrect = q.corretta === oi;
                              let btnClass = darkMode ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-black/5 border-black/5 hover:bg-black/10';
                              if (quizSubmitted) {
                                if (isCorrect) btnClass = 'bg-green-500/20 border-green-500/50 text-green-700 dark:text-green-300';
                                else if (isSelected && !isCorrect) btnClass = 'bg-red-500/20 border-red-500/50 text-red-700 dark:text-red-300';
                                else btnClass = darkMode ? 'bg-white/5 border-white/5 opacity-50' : 'bg-black/5 border-black/5 opacity-50';
                              } else if (isSelected) btnClass = 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/30';

                              return (
                                <button key={oi} onClick={() => handleQuizSelect(i, oi)} className={`w-full p-5 rounded-2xl text-left border flex justify-between items-center transition-all ${btnClass}`}>
                                  <div className="max-w-[90%] text-lg"><RenderMarkdown content={opt} /></div>
                                  {quizSubmitted && isCorrect && <CheckCircle className="w-6 h-6 text-green-500" />}
                                  {quizSubmitted && isSelected && !isCorrect && <XCircle className="w-6 h-6 text-red-500" />}
                                </button>
                              );
                            })}
                          </div>
                          {quizSubmitted && (
                            <div className="mt-4 p-5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-800 dark:text-blue-200">
                              <strong className="block mb-2">💡 Spiegazione:</strong>
                              <RenderMarkdown content={q.spiegazione} />
                            </div>
                          )}
                        </div>
                      ))}
                      {!quizSubmitted && <button onClick={() => setQuizSubmitted(true)} className="w-full py-5 mt-10 rounded-2xl bg-green-600 hover:bg-green-500 transition-colors text-white font-bold text-xl shadow-xl shadow-green-600/20">Consegna Test e Valuta</button>}
                    </>
                  ) : (
                    <div className="text-center opacity-50 mt-10 text-xl font-bold">Nessun quiz generato.</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showPdfModal && pdfUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/80 backdrop-blur-xl">
            <div className="relative w-full h-full max-w-5xl rounded-[3rem] overflow-hidden bg-zinc-900 border border-white/10 flex flex-col">
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-zinc-900 z-10">
                <span className="font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-blue-500"/> Documento Originale</span>
                <button onClick={() => setShowPdfModal(false)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <iframe src={pdfUrl} className="flex-1 w-full h-full bg-zinc-800" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{__html: `
        .perspective-2000 { perspective: 2000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        .prose p { margin-bottom: 0 !important; margin-top: 0 !important; }
      `}} />
    </div>
  );
}
