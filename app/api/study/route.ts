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

    // FASE 1: Individuazione capitoli
    if (action === 'outline') {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash-latest", 
        generationConfig: { responseMimeType: "application/json" } 
      });
      
      const promptOutline = `
        Analizza questo documento. Identifica i capitoli o i moduli principali.
        Per ogni capitolo, restituisci il titolo e il numero di pagina in cui inizia.
        Rispondi ESCLUSIVAMENTE con questo JSON:
        { "capitoli": [{ "titolo": "Nome Capitolo", "paginaInizio": 1 }, ...] }
      `;
      
      const res = await model.generateContent([promptOutline, pdfPart]);
      return NextResponse.json(JSON.parse(res.response.text()));
    }

    // FASE 2: Dispensa Esaustiva (Solo testo)
    if (action === 'chapter') {
      const modelTesto = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

      const promptRiassunto = `
        Sei un tutor accademico. Redigi una DISPENSA ESAUSTIVA e DETTAGLIATA di: "${focus}".
        - NON SINTETIZZARE: Espandi ogni concetto, teorema e dimostrazione.
        - PARAGRAFI CORPOSI: Scrivi paragrafi ampi e articolati.
        - FORMALISMO: Includi tutte le formule in LaTeX ($...$ e $$...$$).
        - FORMATTAZIONE: Usa titoli (##) e sottotitoli (###).
      `;
      
      const riassuntoResult = await modelTesto.generateContent([promptRiassunto, pdfPart]);
      return NextResponse.json({ riassunto: riassuntoResult.response.text() });
    }

    // FASE 3: Generazione Q&A su richiesta (10 Flashcards e 10 Quiz)
    if (action === 'generate_qa') {
        const modelJSON = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash-latest", 
            generationConfig: { responseMimeType: "application/json" } 
        });

        const promptQA = `
            Analizza questo capitolo: "${focus}".
            Crea 10 flashcards (domanda/risposta) e 10 domande a risposta multipla (quiz).
            Le domande devono essere di livello universitario, difficili e dettagliate.
            Usa LaTeX per le formule.
            Rispondi ESCLUSIVAMENTE IN JSON:
            {
              "flashcards": [{"domanda": "...", "risposta": "..."}],
              "quiz": [{"domanda": "...", "opzioni": ["a","b","c","d"], "corretta": 0, "spiegazione": "..."}]
            }
        `;

        const result = await modelJSON.generateContent([promptQA, pdfPart]);
        let qaData;
        const rawJsonString = result.response.text();
        try {
            qaData = JSON.parse(rawJsonString);
        } catch (e) {
            const cleanedString = rawJsonString.replace(/\\(?!["\\/bfnrt])/g, "\\\\");
            qaData = JSON.parse(cleanedString);
        }

        return NextResponse.json(qaData);
    }

    return NextResponse.json({ error: "Azione non valida" }, { status: 400 });

  } catch (error: any) {
    console.error("🚨 ERRORE API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
