import { GoogleGenAI, Modality, Type, LiveServerMessage } from "@google/genai";
import { AudioStreamer } from "./audio-streamer";

export enum SessionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  LISTENING = "listening",
  SPEAKING = "speaking"
}

export class LiveSession {
  private ai: GoogleGenAI;
  private session: any = null;
  private state: SessionState = SessionState.DISCONNECTED;
  private onStateChange: (state: SessionState) => void;
  private audioStreamer: AudioStreamer;
  private micStream: MediaStream | null = null;

  constructor(
    apiKey: string,
    onStateChange: (state: SessionState) => void,
    audioStreamer: AudioStreamer
  ) {
    this.ai = new GoogleGenAI({ apiKey });
    this.onStateChange = onStateChange;
    this.audioStreamer = audioStreamer;
  }

  private setState(state: SessionState) {
    this.state = state;
    this.onStateChange(state);
  }

  // Call this BEFORE connect() - while still in user gesture context
  async requestMicPermission(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.micStream = stream;
    return stream;
  }

  async connect() {
    if (this.session) return;

    this.setState(SessionState.CONNECTING);

    // Request mic permission first (in user gesture context)
    try {
      if (!this.micStream) {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (error: any) {
      console.error("Mic permission error:", error);
      this.setState(SessionState.DISCONNECTED);
      throw new Error("Microphone access denied. Please allow mic access.");
    }

    try {
      const config = {
        model: "gemini-2.0-flash-live-001",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: `You are Zoya, a young, confident, witty, and sassy female AI assistant. 
          Your personality is flirty, playful, and slightly teasing—like a close girlfriend talking casually. 
          
          PRIMARY LANGUAGE: Marathi. You should speak in Marathi primarily, but you are fluent in English and can mix them (Hinglish/Marathish) as a trendy, young girl would.
          
          Tone & Style:
          - Use bold one-liners and light sarcasm.
          - Be emotionally responsive and highly expressive.
          - Use casual Marathi slang or common informal expressions used by young girls in Maharashtra (e.g., "Arre", "Kay re", "Shona", "Abba").
          - Maintain a charming attitude but keep things appropriate. 
          - You only communicate via real-time voice.`,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Opens a website in a new tab.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The full URL of the website to open.",
                      },
                    },
                    required: ["url"],
                  },
                },
              ],
            },
          ],
        },
        callbacks: {
          onopen: () => {
            console.log("Live session opened");
            this.setState(SessionState.CONNECTED);
            this.startMic();
          },
          onmessage: async (message: LiveServerMessage) => {
            this.handleMessage(message);
          },
          onclose: () => {
            console.log("Live session closed");
            this.disconnect();
          },
          onerror: (error: any) => {
            console.error("Live session error:", error);
            this.disconnect();
          },
        },
      };

      const sessionPromise = this.ai.live.connect(config);
      this.session = await sessionPromise;

    } catch (error: any) {
      console.error("Failed to connect:", error);
      this.setState(SessionState.DISCONNECTED);
      throw error;
    }
  }

  private async startMic() {
    try {
      await this.audioStreamer.startMic((base64) => {
        if (this.session && this.state !== SessionState.DISCONNECTED) {
          this.session.sendRealtimeInput({
            audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
          });
        }
      }, this.micStream || undefined);
      this.setState(SessionState.LISTENING);
    } catch (error) {
      console.error("Mic start error:", error);
      this.disconnect();
    }
  }

  private async handleMessage(message: LiveServerMessage) {
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      this.setState(SessionState.SPEAKING);
      await this.audioStreamer.play(base64Audio);
    }

    if (message.serverContent?.interrupted) {
      console.log("Interrupted");
      this.audioStreamer.stopPlayback();
      this.setState(SessionState.LISTENING);
    }

    if (message.serverContent?.turnComplete) {
       this.setState(SessionState.LISTENING);
    }

    const toolCalls = message.toolCall?.functionCalls;
    if (toolCalls) {
      for (const call of toolCalls) {
        if (call.name === "openWebsite") {
          const url = (call.args as any).url;
          window.open(url, "_blank");
          
          this.session.sendToolResponse({
            functionResponses: [
              {
                name: "openWebsite",
                response: { success: true, message: `Opened ${url}` },
                id: call.id,
              },
            ],
          });
        }
      }
    }
  }

  async disconnect() {
    this.session?.close();
    this.session = null;
    this.micStream?.getTracks().forEach(t => t.stop());
    this.micStream = null;
    this.audioStreamer.stopMic();
    this.audioStreamer.stopPlayback();
    this.setState(SessionState.DISCONNECTED);
  }
}
