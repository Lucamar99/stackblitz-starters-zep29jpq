export const maxDuration = 60;
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Effettua il login" }, { status: 401 });

    const data = await request.formData();
    const apiKey = data.get('apiKey') as string;
    const action = data.get('action') as string;
    const focus = data.get('focus') as string;
    const pdfName = data.get('pdfName') as string;
    const file = data.get('file') as unknown as File;

    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const bytes = await file.arrayBuffer();
    const pdfPart = { inlineData: { data: Buffer.from(bytes).toString('base64'), mimeType: "application/pdf" } };

    if (action === 'outline') {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-3.1-flash-lite-preview",
        generationConfig: { responseMimeType: "application/json" }
      });
      const prompt = `Analizza l'indice di questo PDF. Restituisci ESCLUSIVAMENTE un JSON con questa struttura esatta (TUTTO MINUSCOLO): {"capitoli": [{"titolo": "Titolo", "paginaInizio": 1}]}`;
      const res = await model.generateContent([prompt, pdfPart]);
      let cleanJson = res.response.text().replace(/^```json\s*/gi, '').replace(/```\s*$/g, '').trim();

      let parsedData;
      try {
        parsedData = JSON.parse(cleanJson);
      } catch(e) {
        parsedData = JSON.parse(cleanJson.replace(/\\(?!["\\/bfnrt])/g, "\\\\"));
      }

      const capitoliNormalizzati = (parsedData.capitoli || parsedData.Capitoli || []).map((c: any) => ({
         titolo: c.titolo || c.Titolo || "Capitolo Senza Titolo",
         paginaInizio: c.paginaInizio || c.PaginaInizio || c.pagina || c.Pagina || 1
      }));

      return NextResponse.json({ capitoli: capitoliNormalizzati });
    }

    if (action === 'chapter') {
      const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
      
      // PROMPT AGGIORNATO: Regole matematiche severissime
      const prompt = `Sei un professore universitario. Scrivi una dispensa ESTREMAMENTE ESAUSTIVA su: ${focus}. 
      REGOLE DI FORMATTAZIONE TASSATIVE:
      1. Scrivi in Markdown puro.
      2. Usa ESCLUSIVAMENTE il simbolo del dollaro per le formule matematiche LaTeX: $ formula $ per le formule in linea e $$ formula $$ per quelle a blocco.
      3. ASSOLUTAMENTE VIETATO usare i backtick (\`) per racchiudere le formule matematiche o i simboli.
      4. NON creare documenti .tex raw.`;
      
      const result = await model.generateContent([prompt, pdfPart]);
      const content = result.response.text();

      await supabase.from('study_data').insert([{ user_id: userId, pdf_name: pdfName, chapter_title: focus, content, type: 'summary' }]);
      return NextResponse.json({ riassunto: content });
    }

    if (action === 'generate_qa') {
      const modelJSON = genAI.getGenerativeModel({ 
        model: "gemini-3.1-flash-lite-preview",
        generationConfig: { responseMimeType: "application/json" }
      });
      
      // PROMPT AGGIORNATO anche per i quiz
      const prompt = `Crea 10 flashcards e 10 quiz per: ${focus}. 
      REGOLE: 
      - Usa ESCLUSIVAMENTE chiavi in MINUSCOLO. 
      - Per la matematica usa SOLO i simboli del dollaro ($ formula $), MAI i backtick (\`).
      Struttura: {"flashcards": [{"domanda": "...", "risposta": "..."}], "quiz": [{"domanda": "...", "opzioni": ["A", "B", "C", "D"], "corretta": 0, "spiegazione": "..."}]}`;
      
      const result = await modelJSON.generateContent([prompt, pdfPart]);
      
      const rawText = result.response.text();
      const cleanQA = rawText.replace(/^```json\s*/gi, '').replace(/```\s*$/g, '').trim();
      
      let parsedQA;
      try {
         parsedQA = JSON.parse(cleanQA);
      } catch (e) {
         parsedQA = JSON.parse(cleanQA.replace(/\\(?!["\\/bfnrt])/g, "\\\\"));
      }

      const normalizedData = {
        flashcards: (parsedQA.flashcards || parsedQA.Flashcards || []).map((f: any) => ({
          domanda: f.domanda || f.Domanda || f.question || f.Question || "Domanda mancante dall'IA",
          risposta: f.risposta || f.Risposta || f.answer || f.Answer || "Risposta mancante dall'IA"
        })),
        quiz: (parsedQA.quiz || parsedQA.Quiz || []).map((q: any) => ({
          domanda: q.domanda || q.Domanda || q.question || "Domanda mancante dall'IA",
          opzioni: q.opzioni || q.Opzioni || q.options || ["A", "B", "C", "D"],
          corretta: q.corretta !== undefined ? q.corretta : (q.Corretta !== undefined ? q.Corretta : 0),
          spiegazione: q.spiegazione || q.Spiegazione || q.explanation || ""
        }))
      };

      await supabase.from('study_data').insert([{ user_id: userId, pdf_name: pdfName, chapter_title: focus, content: JSON.stringify(normalizedData), type: 'qa' }]);
      return NextResponse.json(normalizedData);
    }

    return NextResponse.json({ error: "Azione non valida" });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore AI: " + error.message }, { status: 500 });
  }
}

export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json([]);
  const { data } = await supabase.from('study_data').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  return NextResponse.json(data || []);
}

export async function DELETE(request: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const pdfName = searchParams.get('pdfName');

    if (!pdfName) return NextResponse.json({ error: "Nome PDF mancante" }, { status: 400 });

    const { error } = await supabase
      .from('study_data')
      .delete()
      .eq('user_id', userId)
      .eq('pdf_name', pdfName);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
