// app/api/chat/route.ts
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { auth } from '@clerk/nextjs/server';

export async function POST(request: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { messages, apiKey } = await request.json();
    if (!apiKey) return NextResponse.json({ error: "API Key mancante" }, { status: 400 });

    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

    // Prepariamo lo storico della chat per Gemini (escludendo l'ultimo messaggio che è quello nuovo)
    const history = messages.slice(0, -1).map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    }));

    const currentMessage = messages[messages.length - 1].text;

    // Avviamo la chat passando lo storico
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(currentMessage);
    
    return NextResponse.json({ reply: result.response.text() });

  } catch (error: any) {
    return NextResponse.json({ error: "Errore AI: " + error.message }, { status: 500 });
  }
}
