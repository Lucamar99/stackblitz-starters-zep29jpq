export const maxDuration = 60; 

import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file: File | null = data.get('file') as unknown as File;
    const apiKey = data.get('apiKey') as string;
    const action = data.get('action') as string;
    const focus = data.get('focus') as string;

    if (!file || !apiKey) {
      return NextResponse.json({ error: "File e API Key obbligatori." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = buffer.toString('base64');
    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const pdfPart = { inlineData: { data: base64Data, mimeType: "application/pdf" } };

    // FASE 1: Individuazione capitoli e PAGINE
    if (action === 'outline') {
      const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview", generationConfig: { responseMimeType: "application/json" } });
      const promptOutline = `
        Analizza questo documento tecnico. Identifica i capitoli o i moduli principali.
        Per ogni capitolo, restituisci il titolo e il numero di pagina esatto in cui inizia (basati sulla numerazione del PDF).
        Rispondi ESCLUSIVAMENTE con questo JSON:
        { "capitoli": [{ "titolo": "Nome Capitolo", "paginaInizio": 1 }, ...] }
      `;
      const res = await model.generateContent([promptOutline, pdfPart]);
      return NextResponse.json(JSON.parse(res.response.text()));
    }

// FASE 2: Riassunto del capitolo estratto
    if (action === 'chapter') {
      const modelTesto = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
      const modelJSON = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview", generationConfig: { responseMimeType: "application/json" } });

      const promptRiassunto = `
        Sei un tutor esperto. Analizza questo capitolo estratto: "${focus}".
        Scrivi un riassunto ESTREMAMENTE DETTAGLIATO e corposo. Includi formule, teoremi e spiegazioni approfondite.
        Usa Markdown per i titoli e LaTeX ($...$ e $$...$$) per le formule.
      `;
      const riassuntoPromise = modelTesto.generateContent([promptRiassunto, pdfPart]);

      const promptQuiz = `
        Crea 3 flashcards e 2 domande a risposta multipla su questo capitolo: "${focus}".
        Usa LaTeX per le formule matematiche.
        Rispondi ESCLUSIVAMENTE IN JSON:
        {
          "flashcards": [{"domanda": "...", "risposta": "..."}],
          "quiz": [{"domanda": "...", "opzioni": ["a","b","c","d"], "corretta": 0, "spiegazione": "..."}]
        }
      `;
      const quizPromise = modelJSON.generateContent([promptQuiz, pdfPart]);

      const [riassuntoResult, quizResult] = await Promise.all([riassuntoPromise, quizPromise]);
      
      // IL LAVA-JSON: Pulizia automatica dei backslash ribelli del LaTeX!
      let quizData;
      const rawJsonString = quizResult.response.text();
      try {
        quizData = JSON.parse(rawJsonString);
      } catch (e) {
        console.log("JSON sporco rilevato, avvio pulizia di emergenza...");
        // Questa espressione regolare aggiunge un doppio backslash a tutte le formule LaTeX sfuggite all'IA
        const cleanedString = rawJsonString.replace(/\\(?!["\\/bfnrt])/g, "\\\\");
        quizData = JSON.parse(cleanedString);
      }

      return NextResponse.json({
        riassunto: riassuntoResult.response.text(),
        flashcards: quizData.flashcards || [],
        quiz: quizData.quiz || []
      });
    }
    return NextResponse.json({ error: "Azione non valida" }, { status: 400 });

  } catch (error: any) {
    console.error("🚨 ERRORE API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
