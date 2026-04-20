export const dynamic = 'force-dynamic';
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

    let publicUrl = data.get('pdfUrl') as string;

    // Salvataggio File
    if (file && !publicUrl && action === 'outline') {
      const fileName = `${userId}/${Date.now()}_${pdfName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from('pdfs').upload(fileName, file);
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('pdfs').getPublicUrl(fileName);
        publicUrl = urlData.publicUrl;
      } else {
        console.error("Storage upload fallito, procedo senza file:", uploadError);
      }
    }

    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const bytes = await file.arrayBuffer();
    const pdfPart = { inlineData: { data: Buffer.from(bytes).toString('base64'), mimeType: "application/pdf" } };

    // ================= FASE 1: INDICE =================
    if (action === 'outline') {
      const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview", generationConfig: { responseMimeType: "application/json" }});
      const prompt = `Analizza l'indice di questo PDF. Restituisci ESCLUSIVAMENTE un JSON: {"capitoli": [{"titolo": "Titolo", "paginaInizio": 1}]}`;
      
      const res = await model.generateContent([prompt, pdfPart]);
      let cleanJson = res.response.text().replace(/^```json\s*/gi, '').replace(/```\s*$/g, '').trim();

      let parsedData;
      try {
        parsedData = JSON.parse(cleanJson);
      } catch(e) {
        try { parsedData = JSON.parse(cleanJson.replace(/\\(?!["\\/bfnrt])/g, "\\\\")); } 
        catch(err) { parsedData = { capitoli: [] }; }
      }

      let capitoliNormalizzati = (parsedData.capitoli || parsedData.Capitoli || []).map((c: any) => ({
         titolo: c.titolo || c.Titolo || "Sezione Documento",
         paginaInizio: c.paginaInizio || c.PaginaInizio || c.pagina || c.Pagina || 1
      }));

      if (capitoliNormalizzati.length === 0) capitoliNormalizzati = [{ titolo: "Documento Completo", paginaInizio: 1 }];

      return NextResponse.json({ capitoli: capitoliNormalizzati, savedPdfUrl: publicUrl });
    }

    // ================= FASE 2: DISPENSA =================
    if (action === 'chapter') {
      const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
      const prompt = `Sei un professore. Scrivi una dispensa ESAUSTIVA su: ${focus}. 
      REGOLE: Markdown puro. Formule matematiche SOLO con il dollaro ($ formula $). NIENTE backtick (\`) per la matematica.`;
      
      const result = await model.generateContent([prompt, pdfPart]);
      const content = result.response.text();

      await supabase.from('study_data').insert([{ user_id: userId, pdf_name: pdfName, chapter_title: focus, content, type: 'summary', pdf_url: publicUrl }]).catch(e => console.error("DB Error:", e));
      
      return NextResponse.json({ riassunto: content });
    }

    // ================= FASE 3: TEST =================
    if (action === 'generate_qa') {
      const modelJSON = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview", generationConfig: { responseMimeType: "application/json" }});
      const prompt = `Crea 10 flashcards e 10 quiz per: ${focus}. REGOLE: 
      - CHIAVI SOLO IN MINUSCOLO. 
      - Matematica SOLO con ($ formula $). NIENTE backtick (\`).
      JSON: {"flashcards": [{"domanda": "...", "risposta": "..."}], "quiz": [{"domanda": "...", "opzioni": ["A", "B", "C", "D"], "corretta": 0, "spiegazione": "..."}]}`;
      
      const result = await modelJSON.generateContent([prompt, pdfPart]);
      const cleanQA = result.response.text().replace(/^```json\s*/gi, '').replace(/```\s*$/g, '').trim();
      
      let parsedQA;
      try { parsedQA = JSON.parse(cleanQA); } 
      catch (e) { parsedQA = JSON.parse(cleanQA.replace(/\\(?!["\\/bfnrt])/g, "\\\\")); }

      const normalizedData = {
        flashcards: (parsedQA.flashcards || parsedQA.Flashcards || []).map((f: any) => ({
          domanda: f.domanda || f.Domanda || f.question || "Domanda non trovata",
          risposta: f.risposta || f.Risposta || f.answer || "Risposta non trovata"
        })),
        quiz: (parsedQA.quiz || parsedQA.Quiz || []).map((q: any) => ({
          domanda: q.domanda || q.Domanda || q.question || "Domanda non trovata",
          opzioni: q.opzioni || q.Opzioni || q.options || ["A", "B", "C", "D"],
          corretta: q.corretta !== undefined ? q.corretta : (q.Corretta !== undefined ? q.Corretta : 0),
          spiegazione: q.spiegazione || q.Spiegazione || q.explanation || ""
        }))
      };

      await supabase.from('study_data').insert([{ user_id: userId, pdf_name: pdfName, chapter_title: focus, content: JSON.stringify(normalizedData), type: 'qa', pdf_url: publicUrl }]).catch(e => console.error("DB Error:", e));
      
      return NextResponse.json(normalizedData);
    }

    return NextResponse.json({ error: "Azione non valida" });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore API: " + error.message }, { status: 500 });
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

    const { data: records } = await supabase.from('study_data').select('pdf_url').eq('user_id', userId).eq('pdf_name', pdfName).limit(1);
    
    if (records?.[0]?.pdf_url) {
      const filePath = records[0].pdf_url.split('/pdfs/')[1];
      if (filePath) await supabase.storage.from('pdfs').remove([filePath]);
    }

    await supabase.from('study_data').delete().eq('user_id', userId).eq('pdf_name', pdfName);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
