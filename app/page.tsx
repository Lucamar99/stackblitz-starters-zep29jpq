'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BookOpen, Layers, CheckSquare, UploadCloud, 
  ChevronRight, ChevronLeft, Sparkles, Moon, Sun, FileText, X, CheckCircle, XCircle, Loader2 
} from 'lucide-react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

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

    let accumData = { riassunto: "", flashcards: [] as any[], quiz: [] as any[] };

    try {
      setLoadingStatus("Sto leggendo l'indice del documento...");
      const formOutline = new FormData();
      formOutline.append('file', file);
      formOutline.append('apiKey', apiKey);
      formOutline.append('action', 'outline');

      const outlineRes = await fetch('/api/study', { method: 'POST', body: formOutline });
      if (!outlineRes.ok) throw new Error("Errore lettura PDF: Vercel Timeout o Limite Google");
      const outlineData = await outlineRes.json();
      const capitoli = outlineData.capitoli || [];

      if (capitoli.length === 0) throw new Error("Nessun capitolo trovato.");

      for (let i = 0; i < capitoli.length; i++) {
        const cap = capitoli[i];
        setLoadingStatus(`Sto analizzando a fondo: ${cap} (${i+1}/${capitoli.length})`);
        
        const formChapter = new FormData();
        formChapter.append('file', file);
        formChapter.append('apiKey', apiKey);
        formChapter.append('action', 'chapter');
        formChapter.append('focus', cap);

        try {
          const capRes = await fetch('/api/study', { method: 'POST', body: formChapter });
          if (capRes.ok) {
            const capData = await capRes.json();
            accumData.riassunto += `\n\n---\n\n## 📖 ${cap}\n\n${capData.riassunto}`;
            accumData.flashcards.push(...capData.flashcards);
            accumData.quiz.push(...capData.quiz);
          } else {
            // Se Vercel taglia il tempo o Google blocca, lo scriviamo nel riassunto!
            accumData.riassunto += `\n\n---\n\n## 📖 ${cap}\n\n⚠️ *Generazione interrotta per questo capitolo (Limite di tempo server Vercel raggiunto).*`;
          }
        } catch (e) {
          accumData.riassunto += `\n\n---\n\n## 📖 ${cap}\n\n⚠️ *Errore di rete durante la generazione.*`;
        }
        
        setData({ ...accumData });

        // IL TRUCCO: Fai riposare Google per 4 secondi prima del prossimo capitolo!
        if (i < capitoli.length - 1) {
          setLoadingStatus(`Pausa di sicurezza... preparo il prossimo capitolo`);
          await new Promise(r => setTimeout(r, 4000));
        }
      }

      setLoadingStatus("Finito!");
      setActiveTab('riassunto');
      setQuizAnswers({});
      setQuizSubmitted(false);

    } catch (error: any) {
      alert("Errore durante l'analisi: " + error.message);
    }
    setLoading(false);
  };

  const handleQuizSelect = (qIndex: number, oIndex: number) => {
    if (quizSubmitted) return;
    setQuizAnswers(prev => ({ ...prev, [qIndex]: oIndex }));
  };

  const calculateScore = () => {
    let score = 0;
    data?.quiz.forEach((q: any, i: number) => { if (quizAnswers[i] === q.corretta) score++; });
    return score;
  };

  const RenderMarkdown = ({ content }: { content: string }) => (
    <div className={`prose prose-blue max-w-none ${darkMode ? 'prose-invert' : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{content}</ReactMarkdown>
    </div>
  );

  return (
    <div className={`min-h-screen transition-colors duration-700 ${darkMode ? 'bg-[#000000] text-white' : 'bg-[#F5F5F7] text-[#1D1D1F]'} font-sans pb-20`}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div animate={{ x: [0, 50, 0], y: [0, 30, 0] }} transition={{ duration: 20, repeat: Infinity }} className={`absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full blur-[100px] opacity-40 ${darkMode ? 'bg-indigo-900/40' : 'bg-blue-200'}`} />
        <motion.div animate={{ x: [0, -40, 0], y: [0, 60, 0] }} transition={{ duration: 15, repeat: Infinity }} className={`absolute bottom-[-10%] right-[-5%] w-[60vw] h-[60vw] rounded-full blur-[100px] opacity-30 ${darkMode ? 'bg-purple-900/30' : 'bg-purple-100'}`} />
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 py-8">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">Study Buddy <span className="text-blue-500">Auto</span></h1>
          <div className="flex gap-3">
            {data && pdfUrl && (
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowPdfModal(true)} className="px-4 py-2 rounded-full text-sm font-bold bg-blue-600 text-white shadow-lg flex items-center gap-2">
                <FileText className="w-4 h-4" /> <span className="hidden md:inline">PDF</span>
              </motion.button>
            )}
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => setDarkMode(!darkMode)} className={`p-3 rounded-full backdrop-blur-xl border ${darkMode ? 'bg-white/10 border-white/10' : 'bg-black/5 border-black/5 shadow-sm'}`}>
              {darkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-indigo-600" />}
            </motion.button>
          </div>
        </header>

        {loading && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8 p-6 rounded-3xl bg-blue-600/10 border border-blue-500/20 flex flex-col items-center justify-center text-center space-y-4">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <p className="font-bold text-lg text-blue-500 animate-pulse">{loadingStatus}</p>
              <p className="text-sm opacity-60">Quest'operazione richiederà qualche minuto per documenti lunghi. Non chiudere la pagina.</p>
           </motion.div>
        )}

        {!data && !loading ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`max-w-xl mx-auto p-6 md:p-8 rounded-[2.5rem] backdrop-blur-3xl border ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white/60 border-white/20 shadow-xl'}`}>
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest opacity-50 mb-2 ml-1">API Key</label>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className={`w-full p-4 rounded-2xl outline-none border transition-all ${darkMode ? 'bg-black/20 border-white/10 focus:border-blue-500' : 'bg-white/50 border-gray-200 focus:border-blue-500'}`} placeholder="gsk_..." />
              </div>
              <div className="relative group">
                <label className={`flex flex-col items-center justify-center w-full h-40 rounded-3xl border-2 border-dashed transition-all cursor-pointer ${darkMode ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-black/5 bg-black/5 hover:bg-black/10'}`}>
                  <UploadCloud className="w-10 h-10 mb-3 opacity-50" />
                  <p className="font-semibold opacity-70 text-sm text-center px-4">{file ? file.name : "Carica il PDF completo"}</p>
                  <input type="file" className="hidden" accept=".pdf" onChange={handleFileChange} />
                </label>
              </div>
              <motion.button onClick={startAutoPilot} disabled={loading} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex justify-center items-center gap-2">
                Esegui Analisi Automatica Completa <Sparkles className="w-5 h-5" />
              </motion.button>
            </div>
          </motion.div>
        ) : data && (
          <div className="flex flex-col gap-6 md:gap-8">
            <div className="w-full overflow-x-auto pb-2 -mb-2">
              <nav className={`w-max mx-auto p-1.5 rounded-full backdrop-blur-2xl border flex gap-1 ${darkMode ? 'bg-white/10 border-white/10' : 'bg-black/5 border-black/10 shadow-lg'}`}>
                {[ { id: 'riassunto', icon: BookOpen, label: 'Super Appunti' }, { id: 'flashcards', icon: Layers, label: 'Flashcards' }, { id: 'quiz', icon: CheckSquare, label: 'Test' } ].map((t) => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-4 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${activeTab === t.id ? (darkMode ? 'bg-white text-black' : 'bg-black text-white') : 'opacity-50 hover:opacity-100'}`}>
                    <t.icon className="w-4 h-4" /> <span>{t.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            <main className="w-full">
              <AnimatePresence mode="wait">
                <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`w-full min-h-[60vh] p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] backdrop-blur-3xl border ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white/80 border-white/20 shadow-2xl'}`}>
                  
                  {activeTab === 'riassunto' && (
                    <div className="max-w-4xl mx-auto">
                      <h2 className="text-2xl font-bold mb-6">Appunti Enciclopedici</h2>
                      <div className={`p-6 rounded-3xl border ${darkMode ? 'bg-white/5 border-white/5' : 'bg-white border-black/5 shadow-sm'}`}>
                        <RenderMarkdown content={data.riassunto} />
                      </div>
                    </div>
                  )}

                  {activeTab === 'flashcards' && data.flashcards.length > 0 && (
                    <div className="flex flex-col items-center py-4">
                      <div className="perspective-2000 w-full max-w-lg h-96 relative group" onClick={() => setIsFlipped(!isFlipped)}>
                        <motion.div animate={{ rotateY: isFlipped ? 180 : 0 }} transition={{ type: "spring", stiffness: 150, damping: 20 }} className="w-full h-full preserve-3d cursor-pointer">
                          <div className={`absolute inset-0 backface-hidden rounded-[2rem] p-8 flex flex-col justify-center items-center text-center border overflow-y-auto ${darkMode ? 'bg-white/10 border-white/20' : 'bg-white border-black/5 shadow-xl'}`}>
                            <span className="text-xs font-black uppercase opacity-40 mb-4">Domanda</span>
                            <div className="text-xl font-bold"><RenderMarkdown content={data.flashcards[cardIndex]?.domanda || ''} /></div>
                          </div>
                          <div className={`absolute inset-0 backface-hidden rotate-y-180 rounded-[2rem] p-8 flex flex-col justify-center items-center text-center border bg-blue-600 text-white border-blue-400 overflow-y-auto`}>
                            <span className="text-xs font-black uppercase opacity-60 mb-4 mt-auto">Risposta</span>
                            <div className="text-lg font-medium leading-tight mb-auto"><RenderMarkdown content={data.flashcards[cardIndex]?.risposta || ''} /></div>
                          </div>
                        </motion.div>
                      </div>
                      <div className="flex gap-4 mt-8">
                        <button onClick={() => {setCardIndex(Math.max(0, cardIndex - 1)); setIsFlipped(false)}} className="p-4 rounded-full bg-white/10 hover:bg-white/20"><ChevronLeft /></button>
                        <span className="flex items-center font-mono font-bold">{cardIndex + 1} / {data.flashcards.length}</span>
                        <button onClick={() => {setCardIndex(Math.min(data.flashcards.length - 1, cardIndex + 1)); setIsFlipped(false)}} className="p-4 rounded-full bg-white/10 hover:bg-white/20"><ChevronRight /></button>
                      </div>
                    </div>
                  )}

                  {activeTab === 'quiz' && data.quiz.length > 0 && (
                    <div className="max-w-3xl mx-auto space-y-8">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold">Mettiti alla prova</h2>
                        {quizSubmitted && <div className="px-4 py-2 rounded-full bg-green-500/20 text-green-500 font-bold border border-green-500/30">Punteggio: {calculateScore()} / {data.quiz.length}</div>}
                      </div>

                      {data.quiz.map((q: any, qIdx: number) => (
                        <div key={qIdx} className={`space-y-4 p-6 rounded-3xl border ${darkMode ? 'bg-white/5 border-white/5' : 'bg-black/5 border-black/5'}`}>
                          <div className="text-lg font-bold flex gap-2"><span>{qIdx+1}.</span> <RenderMarkdown content={q.domanda} /></div>
                          <div className="grid gap-2">
                            {q.opzioni.map((opt: string, oIdx: number) => {
                              const isSelected = quizAnswers[qIdx] === oIdx;
                              const isCorrect = q.corretta === oIdx;
                              let btnClass = darkMode ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white border-black/10 hover:bg-black/5 shadow-sm';
                              if (quizSubmitted) {
                                if (isCorrect) btnClass = 'bg-green-500/20 border-green-500/50 text-green-700 dark:text-green-300';
                                else if (isSelected && !isCorrect) btnClass = 'bg-red-500/20 border-red-500/50 text-red-700 dark:text-red-300';
                                else btnClass = darkMode ? 'bg-white/5 border-white/5 opacity-50' : 'bg-black/5 border-black/5 opacity-50';
                              } else if (isSelected) btnClass = 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/30';

                              return (
                                <button key={oIdx} onClick={() => handleQuizSelect(qIdx, oIdx)} className={`w-full p-4 rounded-2xl text-left border flex justify-between items-center ${btnClass}`}>
                                  <div className="max-w-[90%]"><RenderMarkdown content={opt} /></div>
                                  {quizSubmitted && isCorrect && <CheckCircle className="w-5 h-5 text-green-500" />}
                                  {quizSubmitted && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-red-500" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      {!quizSubmitted && Object.keys(quizAnswers).length > 0 && (
                        <motion.button onClick={() => setQuizSubmitted(true)} className="w-full py-4 mt-8 rounded-2xl bg-green-600 text-white font-bold text-lg shadow-lg hover:bg-green-500">
                          Consegna Test e Valuta
                        </motion.button>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showPdfModal && pdfUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl">
            <motion.div className={`relative w-full h-full max-w-5xl rounded-3xl overflow-hidden flex flex-col ${darkMode ? 'bg-zinc-900 border border-white/10' : 'bg-white border border-black/10'}`}>
              <div className="flex justify-between items-center p-4 border-b border-inherit">
                <div className="font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-blue-500"/> Documento Originale</div>
                <button onClick={() => setShowPdfModal(false)} className="p-2 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"><X className="w-5 h-5" /></button>
              </div>
              <iframe src={pdfUrl} className="w-full h-full flex-1" />
            </motion.div>
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
