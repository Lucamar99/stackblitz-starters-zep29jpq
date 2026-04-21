export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { auth } from '@clerk/nextjs/server';

export async function POST(request: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { messages, apiKey, context } = await request.json();
    if (!apiKey) return NextResponse.json({ error: "API Key mancante" }, { status: 400 });

    const genAI = new GoogleGenerativeAI(apiKey.trim());

    // ISTRUZIONI DI SISTEMA: Diciamo all'IA chi è e cosa sta leggendo l'utente
    const systemPrompt = `Sei un Tutor IA esperto, amichevole e super chiaro. L'utente sta studiando un documento tramite un'app. 
    Rispondi alle sue domande aiutandolo a capire i concetti.
    
    CONTESTO ATTUALE DELLO STUDENTE:
    ${context || "L'utente non ha nessun documento specifico aperto al momento."}
    
    Regola d'oro: Usa il contesto per rispondere in modo preciso, ma se l'utente fa una domanda generale, rispondi comunque normalmente.`;

    const model = genAI.getGenerativeModel({ 
      model: "gemini-3.1-flash-lite-preview",
      systemInstruction: systemPrompt
    });

    // Prepariamo lo storico della chat
    const history = messages.slice(0, -1).map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    }));

    const currentMessage = messages[messages.length - 1].text;

    // Avviamo la chat
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(currentMessage);
    
    return NextResponse.json({ reply: result.response.text() });

  } catch (error: any) {
    return NextResponse.json({ error: "Errore AI: " + error.message }, { status: 500 });
  }
}
