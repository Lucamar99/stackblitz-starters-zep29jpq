'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Layers,
  CheckSquare,
  UploadCloud,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Moon,
  Sun,
  FileText,
  X,
  CheckCircle,
  XCircle,
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
  const [data, setData] = useState<any>(null);

  const [activeTab, setActiveTab] = useState('riassunto');
  const [darkMode, setDarkMode] = useState(true);
  const [showPdfModal, setShowPdfModal] = useState(false); // Nuovo stato per il PDF

  // Flashcard State
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Quiz State (Ripristinato!)
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

  const handleGenerate = async () => {
    if (!file || !apiKey) return alert('Configura API Key e PDF!');
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('apiKey', apiKey);

    try {
      const res = await fetch('/api/study', { method: 'POST', body: formData });
      const result = await res.json();
      if (res.ok) {
        setData(result);
        setActiveTab('riassunto');
        setQuizAnswers({});
        setQuizSubmitted(false);
      } else alert(`Errore: ${result.error}`);
    } catch (error) {
      alert('Errore di connessione.');
    }
    setLoading(false);
  };

  const handleQuizSelect = (qIndex: number, oIndex: number) => {
    if (quizSubmitted) return; // Se già consegnato, blocca i click
    setQuizAnswers((prev) => ({ ...prev, [qIndex]: oIndex }));
  };

  const calculateScore = () => {
    let score = 0;
    data.quiz.forEach((q: any, i: number) => {
      if (quizAnswers[i] === q.corretta) score++;
    });
    return score;
  };

  const hideScrollbar = {
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  } as any;

  const RenderMarkdown = ({ content }: { content: string }) => (
    <div
      className={`prose prose-blue max-w-none ${
        darkMode ? 'prose-invert' : ''
      }`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );

  return (
    <div
      className={`min-h-screen transition-colors duration-700 ${
        darkMode ? 'bg-[#000000] text-white' : 'bg-[#F5F5F7] text-[#1D1D1F]'
      } font-sans`}
    >
      {/* Sfondo Animato */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{ x: [0, 50, 0], y: [0, 30, 0] }}
          transition={{ duration: 20, repeat: Infinity }}
          className={`absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full blur-[100px] opacity-40 ${
            darkMode ? 'bg-indigo-900/40' : 'bg-blue-200'
          }`}
        />
        <motion.div
          animate={{ x: [0, -40, 0], y: [0, 60, 0] }}
          transition={{ duration: 15, repeat: Infinity }}
          className={`absolute bottom-[-10%] right-[-5%] w-[60vw] h-[60vw] rounded-full blur-[100px] opacity-30 ${
            darkMode ? 'bg-purple-900/30' : 'bg-purple-100'
          }`}
        />
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <header className="flex justify-between items-center mb-8 md:mb-12">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">
            Study Buddy <span className="text-blue-500">Pro</span>
          </h1>
          <div className="flex gap-3">
            {data && pdfUrl && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowPdfModal(true)}
                className="px-4 py-2 rounded-full text-sm font-bold bg-blue-600 text-white shadow-lg flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />{' '}
                <span className="hidden md:inline">Visualizza PDF</span>
              </motion.button>
            )}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setDarkMode(!darkMode)}
              className={`p-3 rounded-full backdrop-blur-xl border ${
                darkMode
                  ? 'bg-white/10 border-white/10'
                  : 'bg-black/5 border-black/5 shadow-sm'
              }`}
            >
              {darkMode ? (
                <Sun className="w-5 h-5 text-yellow-400" />
              ) : (
                <Moon className="w-5 h-5 text-indigo-600" />
              )}
            </motion.button>
          </div>
        </header>

        {!data ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`max-w-xl mx-auto p-6 md:p-8 rounded-[2.5rem] backdrop-blur-3xl border ${
              darkMode
                ? 'bg-white/5 border-white/10'
                : 'bg-white/60 border-white/20 shadow-xl'
            }`}
          >
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest opacity-50 mb-2 ml-1">
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className={`w-full p-4 rounded-2xl outline-none border transition-all ${
                    darkMode
                      ? 'bg-black/20 border-white/10 focus:border-blue-500'
                      : 'bg-white/50 border-gray-200 focus:border-blue-500'
                  }`}
                  placeholder="Incolla la tua chiave..."
                />
              </div>
              <div className="relative group">
                <label
                  className={`flex flex-col items-center justify-center w-full h-40 md:h-48 rounded-3xl border-2 border-dashed transition-all cursor-pointer ${
                    darkMode
                      ? 'border-white/10 bg-white/5 hover:bg-white/10'
                      : 'border-black/5 bg-black/5 hover:bg-black/10'
                  }`}
                >
                  <UploadCloud className="w-8 h-8 md:w-10 md:h-10 mb-3 opacity-50" />
                  <p className="font-semibold opacity-70 text-sm md:text-base text-center px-4">
                    {file ? file.name : 'Tocca per caricare il PDF'}
                  </p>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleGenerate}
                disabled={loading}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex justify-center items-center gap-2 disabled:opacity-50 text-sm md:text-base"
              >
                {loading ? 'Generazione...' : 'Inizia Studio Digitale'}{' '}
                <Sparkles className="w-5 h-5" />
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-6 md:gap-8">
            <div
              className="w-full overflow-x-auto pb-2 -mb-2"
              style={hideScrollbar}
            >
              <nav
                className={`w-max mx-auto p-1.5 rounded-full backdrop-blur-2xl border flex gap-1 ${
                  darkMode
                    ? 'bg-white/10 border-white/10'
                    : 'bg-black/5 border-black/10 shadow-lg'
                }`}
              >
                {[
                  {
                    id: 'riassunto',
                    icon: BookOpen,
                    label: 'Appunti Dettagliati',
                  },
                  { id: 'flashcards', icon: Layers, label: 'Flashcards' },
                  { id: 'quiz', icon: CheckSquare, label: 'Test Interattivo' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`px-4 md:px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${
                      activeTab === t.id
                        ? darkMode
                          ? 'bg-white text-black'
                          : 'bg-black text-white'
                        : 'opacity-50 hover:opacity-100'
                    }`}
                  >
                    <t.icon className="w-4 h-4 md:w-5 md:h-5" />{' '}
                    <span>{t.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            <main className="w-full">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`w-full min-h-[60vh] p-6 md:p-10 lg:p-12 rounded-[2rem] md:rounded-[3rem] backdrop-blur-3xl border ${
                    darkMode
                      ? 'bg-white/5 border-white/10'
                      : 'bg-white/80 border-white/20 shadow-2xl'
                  }`}
                >
                  {activeTab === 'riassunto' && (
                    <div className="max-w-4xl mx-auto">
                      <h2 className="text-2xl md:text-3xl font-bold mb-6 md:mb-8">
                        Appunti Intelligenti
                      </h2>
                      <div
                        className={`p-6 md:p-10 rounded-3xl border ${
                          darkMode
                            ? 'bg-white/5 border-white/5'
                            : 'bg-white border-black/5 shadow-sm'
                        }`}
                      >
                        <RenderMarkdown content={data.riassunto} />
                      </div>
                    </div>
                  )}

                  {activeTab === 'flashcards' && (
                    <div className="flex flex-col items-center py-4 md:py-10">
                      <div
                        className="perspective-2000 w-full max-w-lg h-80 md:h-96 relative group"
                        onClick={() => setIsFlipped(!isFlipped)}
                      >
                        <motion.div
                          animate={{ rotateY: isFlipped ? 180 : 0 }}
                          transition={{
                            type: 'spring',
                            stiffness: 150,
                            damping: 20,
                          }}
                          className="w-full h-full preserve-3d cursor-pointer"
                        >
                          <div
                            className={`absolute inset-0 backface-hidden rounded-[2rem] md:rounded-[3rem] p-6 md:p-10 flex flex-col justify-center items-center text-center border overflow-y-auto ${
                              darkMode
                                ? 'bg-white/10 border-white/20'
                                : 'bg-white border-black/5 shadow-xl'
                            }`}
                          >
                            <span className="text-[10px] md:text-xs font-black uppercase tracking-tighter opacity-40 mb-2 md:mb-4">
                              Domanda
                            </span>
                            <div className="text-xl md:text-2xl font-bold">
                              <RenderMarkdown
                                content={data.flashcards[cardIndex].domanda}
                              />
                            </div>
                          </div>
                          <div
                            className={`absolute inset-0 backface-hidden rotate-y-180 rounded-[2rem] md:rounded-[3rem] p-6 md:p-10 flex flex-col justify-center items-center text-center border bg-blue-600 text-white border-blue-400 overflow-y-auto`}
                          >
                            <span className="text-[10px] md:text-xs font-black uppercase tracking-tighter opacity-60 mb-2 md:mb-4 mt-auto">
                              Risposta
                            </span>
                            <div className="text-lg md:text-xl font-medium leading-tight mb-auto">
                              <RenderMarkdown
                                content={data.flashcards[cardIndex].risposta}
                              />
                            </div>
                          </div>
                        </motion.div>
                      </div>
                      <div className="flex gap-4 mt-8 md:mt-12">
                        <button
                          onClick={() => {
                            setCardIndex(Math.max(0, cardIndex - 1));
                            setIsFlipped(false);
                          }}
                          className="p-4 rounded-full bg-white/10 hover:bg-white/20 transition-all"
                        >
                          <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
                        </button>
                        <span className="flex items-center font-mono font-bold text-sm md:text-base">
                          {cardIndex + 1} / {data.flashcards.length}
                        </span>
                        <button
                          onClick={() => {
                            setCardIndex(
                              Math.min(
                                data.flashcards.length - 1,
                                cardIndex + 1
                              )
                            );
                            setIsFlipped(false);
                          }}
                          className="p-4 rounded-full bg-white/10 hover:bg-white/20 transition-all"
                        >
                          <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
                        </button>
                      </div>
                    </div>
                  )}

                  {activeTab === 'quiz' && (
                    <div className="max-w-3xl mx-auto space-y-8 md:space-y-10">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl md:text-3xl font-bold">
                          Mettiti alla prova
                        </h2>
                        {quizSubmitted && (
                          <div className="px-4 py-2 rounded-full bg-green-500/20 text-green-500 font-bold border border-green-500/30">
                            Punteggio: {calculateScore()} / {data.quiz.length}
                          </div>
                        )}
                      </div>

                      {data.quiz.map((q: any, qIdx: number) => (
                        <div
                          key={qIdx}
                          className={`space-y-3 md:space-y-4 p-6 rounded-3xl border transition-all ${
                            darkMode
                              ? 'bg-white/5 border-white/5'
                              : 'bg-black/5 border-black/5'
                          }`}
                        >
                          <div className="text-lg md:text-xl font-bold flex gap-2">
                            <span>{qIdx + 1}.</span>{' '}
                            <RenderMarkdown content={q.domanda} />
                          </div>
                          <div className="grid gap-2 md:gap-3">
                            {q.opzioni.map((opt: string, oIdx: number) => {
                              const isSelected = quizAnswers[qIdx] === oIdx;
                              const isCorrect = q.corretta === oIdx;

                              // Logica colori bottoni
                              let btnClass = darkMode
                                ? 'bg-white/5 border-white/10 hover:bg-white/10'
                                : 'bg-white border-black/10 hover:bg-black/5 shadow-sm';
                              if (quizSubmitted) {
                                if (isCorrect)
                                  btnClass =
                                    'bg-green-500/20 border-green-500/50 text-green-700 dark:text-green-300';
                                else if (isSelected && !isCorrect)
                                  btnClass =
                                    'bg-red-500/20 border-red-500/50 text-red-700 dark:text-red-300';
                                else
                                  btnClass = darkMode
                                    ? 'bg-white/5 border-white/5 opacity-50'
                                    : 'bg-black/5 border-black/5 opacity-50';
                              } else if (isSelected) {
                                btnClass =
                                  'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/30';
                              }

                              return (
                                <button
                                  key={oIdx}
                                  onClick={() => handleQuizSelect(qIdx, oIdx)}
                                  className={`w-full p-4 md:p-5 rounded-2xl text-left border transition-all flex justify-between items-center ${btnClass}`}
                                >
                                  <div className="max-w-[90%]">
                                    <RenderMarkdown content={opt} />
                                  </div>
                                  {quizSubmitted && isCorrect && (
                                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                                  )}
                                  {quizSubmitted &&
                                    isSelected &&
                                    !isCorrect && (
                                      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                    )}
                                </button>
                              );
                            })}
                          </div>

                          {/* Spiegazione post-consegna */}
                          <AnimatePresence>
                            {quizSubmitted && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="mt-4 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-800 dark:text-blue-200 text-sm md:text-base"
                              >
                                <strong className="block mb-1">
                                  💡 Spiegazione:
                                </strong>
                                <RenderMarkdown content={q.spiegazione} />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}

                      {!quizSubmitted &&
                        Object.keys(quizAnswers).length > 0 && (
                          <motion.button
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            onClick={() => setQuizSubmitted(true)}
                            className="w-full py-4 mt-8 rounded-2xl bg-green-600 text-white font-bold text-lg shadow-lg shadow-green-600/30 hover:bg-green-500 transition-all"
                          >
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

      {/* Modal Quick Look per il PDF */}
      <AnimatePresence>
        {showPdfModal && pdfUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-12 bg-black/60 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className={`relative w-full h-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col ${
                darkMode
                  ? 'bg-zinc-900 border border-white/10'
                  : 'bg-white border border-black/10'
              }`}
            >
              <div className="flex justify-between items-center p-4 border-b border-inherit">
                <div className="font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" /> Documento
                  Originale
                </div>
                <button
                  onClick={() => setShowPdfModal(false)}
                  className="p-2 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 w-full bg-zinc-100 dark:bg-zinc-800">
                <iframe
                  src={pdfUrl}
                  className="w-full h-full"
                  title="PDF Viewer"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .perspective-2000 { perspective: 2000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        ::-webkit-scrollbar { width: 0px; height: 0px; background: transparent; }
        .prose p { margin-bottom: 0 !important; margin-top: 0 !important; }
      `,
        }}
      />
    </div>
  );
}
