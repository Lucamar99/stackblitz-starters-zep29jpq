"use client";
const startAutoPilot = async () => {
    if (!file || !apiKey) return alert("Configura API Key e carica il PDF!");
    setLoading(true);
    setChapters([]);
    localStorage.setItem('study_buddy_api_key', apiKey);

    try {
      setLoadingStatus("Fase 1: Analisi dell'indice...");
      const form = new FormData();
      form.append('file', file);
      form.append('apiKey', apiKey);
      form.append('action', 'outline');

      const outlineRes = await fetch('/api/study', { method: 'POST', body: form });
      const outlineData = await outlineRes.json();
      
      // CONTROLLO DI SICUREZZA
      if (outlineData.error) throw new Error(outlineData.error);
      if (!outlineData.capitoli || !Array.isArray(outlineData.capitoli)) {
        throw new Error("L'IA non ha formattato correttamente l'indice. Riprova.");
      }

      const fileBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const totalPages = pdfDoc.getPageCount();

      let currentChapters = [];
      for (let i = 0; i < outlineData.capitoli.length; i++) {
        const cap = outlineData.capitoli[i];
        const nextCap = outlineData.capitoli[i+1];
        setLoadingStatus(`Fase 2: Generazione Dispensa - ${cap.titolo}`);

        let start = Math.max(0, parseInt(cap.paginaInizio) - 1);
        let end = nextCap ? parseInt(nextCap.paginaInizio) - 2 : totalPages - 1;
        if (isNaN(end) || end < start) end = totalPages - 1;

        const newPdf = await PDFDocument.create();
        const pages = await newPdf.copyPages(pdfDoc, Array.from({length: end - start + 1}, (_, k) => start + k));
        pages.forEach(p => newPdf.addPage(p));
        const blob = new Blob([await newPdf.save()], {type: 'application/pdf'});

        const formData = new FormData();
        formData.append('file', new File([blob], 'cap.pdf'));
        formData.append('apiKey', apiKey);
        formData.append('action', 'chapter');
        formData.append('focus', cap.titolo);
        formData.append('pdfName', file.name);

        const capRes = await fetch('/api/study', { method: 'POST', body: formData });
        const capData = await capRes.json();
        
        currentChapters.push({ 
          ...cap, 
          testo: capData.riassunto || "Errore nel contenuto.", 
          pdfBlob: blob, 
          flashcards: null, 
          quiz: null 
        });
        
        setChapters([...currentChapters]);
        await new Promise(r => setTimeout(r, 4000)); // Pausa per evitare blocchi Google
      }
    } catch (e: any) { 
      alert("ATTENZIONE: " + e.message); 
    }
    setLoading(false);
  };
