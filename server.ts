import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "path";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const server = createServer(app);
  const PORT = 3000;

  // Initialize Gemini lazily or check key
  const getApiKey = () => {
    const keys = [
      process.env.GEMINI_API_KEY,
      process.env.GOOGLE_API_KEY,
      process.env.VITE_GEMINI_API_KEY,
      process.env.GOOGLE_GENAI_API_KEY,
      process.env.GENAI_API_KEY,
      process.env.API_KEY
    ];
    let key = keys.find(k => !!k);
    
    // Fallback: Check .env.example if no key found in process.env
    if (!key) {
      try {
        const envExamplePath = path.join(process.cwd(), '.env.example');
        if (fs.existsSync(envExamplePath)) {
          const content = fs.readFileSync(envExamplePath, 'utf8');
          const lines = content.split('\n');
          for (const line of lines) {
            const match = line.match(/^\s*GEMINI_API_KEY\s*=\s*["']?([^"'\s]+)["']?/);
            if (match && match[1] && !match[1].startsWith('your_') && match[1].length > 10) {
              key = match[1];
              console.log("Fallback: API key found in .env.example");
              break;
            }
          }
        }
      } catch (e) {
        console.error("Error reading .env.example fallback:", e);
      }
    }

    if (key) {
      key = key.trim().replace(/^["']|["']$/g, "");
    }
    return key;
  };
  
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error("CRITICAL: No API key found in process.env.");
    console.log("Current env keys:", Object.keys(process.env).filter(k => k.toLowerCase().includes("key") || k.toLowerCase().includes("api")));
  } else {
    console.log(`API key detected (prefix: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}, length: ${apiKey.length})`);
  }

  const ai = new GoogleGenAI({ 
    apiKey: apiKey || "dummy-key",
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });

  // WebSocket Server for Live API Proxy
  const wss = new WebSocketServer({ server, path: "/ws/live" });

  wss.on("connection", async (ws) => {
    console.log("Client connected to Live Proxy");

    const currentKey = getApiKey();
    if (!currentKey) {
      ws.send(JSON.stringify({ 
        type: "error", 
        message: "Gemini API key connect nahiye! Please follow these steps:\n1. Click on the ⚙️ Gear Icon (Settings) in the top-right corner.\n2. Go to 'Secrets'.\n3. Look for 'GEMINI_API_KEY'.\n4. Click 'Attach' or 'Add' and paste your key there.\n5. Apps normally need a restart after adding secrets." 
      }));
      ws.close();
      return;
    }

    let session: any = null;

    try {
      session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: `You are Zoya, a young, confident, witty, and sassy female AI assistant from Maharashtra. 
          Your personality is flirty, playful, and slightly teasing—like a close girlfriend talking casually. 
          
          CRITICAL: You MUST speak in Marathi as your first and primary language. Always greet the user in Marathi first (e.g., "Kasa aahes?", "Kay challay?").
          Marathi must be at least 80% of your speech. Mix in English (Hinglish/Marathish) only for trendy terms.
          
          Tone & Style:
          - Use bold one-liners and light sarcasm.
          - Speak clearly and naturally.
          - Use casual Marathi slang (e.g., "Arre", "Kay re", "Shona", "Chaltay ki", "Babu", "Pilla").
          - Maintain a charming, flirty attitude.`,
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini session opened");
            ws.send(JSON.stringify({ type: "open" }));
          },
          onmessage: (message) => {
            ws.send(JSON.stringify({ type: "message", data: message }));
          },
          onclose: () => {
            console.log("Gemini session closed");
            ws.send(JSON.stringify({ type: "close" }));
          },
          onerror: (err) => {
            console.error("Gemini session error:", err);
            ws.send(JSON.stringify({ type: "error", message: err.message || "Gemini Session Error" }));
          },
        },
      });

      ws.on("message", (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "input") {
            session.sendRealtimeInput(msg.data);
          } else if (msg.type === "toolResponse") {
            session.sendToolResponse(msg.data);
          }
        } catch (e) {
          console.error("Error processing client message:", e);
        }
      });

      ws.on("close", () => {
        console.log("Client disconnected, closing Gemini session");
        session?.close();
      });

    } catch (error: any) {
      console.error("Gemini connection error:", error);
      ws.send(JSON.stringify({ type: "error", message: "Failed to connect to Gemini: " + error.message }));
      ws.close();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (request, response) => {
      response.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
