/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Power, Globe, Sparkles, MessageCircle } from 'lucide-react';
import { AudioStreamer } from './lib/audio-streamer';
import { LiveSession, SessionState } from './lib/live-session';

export default function App() {
  const [state, setState] = useState<SessionState>(SessionState.DISCONNECTED);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const sessionRef = useRef<LiveSession | null>(null);

  // Initialize AudioStreamer and Session
  useEffect(() => {
    audioStreamerRef.current = new AudioStreamer();
    
    // In this environment, GEMINI_API_KEY is available via process.env
    //const apiKey = process.env.GEMINI_API_KEY || '';
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    
    sessionRef.current = new LiveSession(
      apiKey,
      (newState) => {
        setState(newState);
        if (newState === SessionState.CONNECTED || newState === SessionState.LISTENING) {
          setErrorMessage(null);
        }
      },
      audioStreamerRef.current
    );

    return () => {
      sessionRef.current?.disconnect();
    };
  }, []);

  const handleToggle = async () => {
    setErrorMessage(null);
    if (state === SessionState.DISCONNECTED) {
      try {
        await sessionRef.current?.connect();
      } catch (error: any) {
        console.error("Connection error:", error);
        setErrorMessage(error.message || "Failed to wake up Zoya.");
      }
    } else {
      await sessionRef.current?.disconnect();
    }
  };

  const getStatusColor = () => {
    switch (state) {
      case SessionState.CONNECTING: return 'text-yellow-400';
      case SessionState.CONNECTED: return 'text-blue-400';
      case SessionState.LISTENING: return 'text-green-400';
      case SessionState.SPEAKING: return 'text-pink-400';
      default: return 'text-gray-500';
    }
  };

  const getOrbGlow = () => {
    switch (state) {
      case SessionState.CONNECTING: return 'shadow-[0_0_50px_rgba(250,204,21,0.3)]';
      case SessionState.CONNECTED: return 'shadow-[0_0_50px_rgba(96,165,250,0.3)]';
      case SessionState.LISTENING: return 'shadow-[0_0_60px_rgba(74,222,128,0.5)]';
      case SessionState.SPEAKING: return 'shadow-[0_0_80px_rgba(244,114,182,0.6)]';
      default: return 'shadow-[0_0_20px_rgba(255,255,255,0.1)]';
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-between p-8 font-sans overflow-hidden">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-600 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="z-10 flex flex-col items-center gap-2">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md"
        >
          <Sparkles className="w-4 h-4 text-pink-400" />
          <span className="text-sm font-medium tracking-widest uppercase">Zoya AI • Live</span>
        </motion.div>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: 0.5 }}
          className="text-xs uppercase tracking-[0.3em] font-mono"
        >
          {state.toUpperCase()}
        </motion.p>
      </header>

      {/* Central Visualizer */}
      <main className="z-10 flex flex-col items-center gap-12 w-full max-w-md">
        <div className="relative group">
          {/* Animated Rings */}
          <AnimatePresence>
            {(state === SessionState.LISTENING || state === SessionState.SPEAKING) && (
              <>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.5, opacity: 0.1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                  className="absolute inset-0 border-2 border-pink-500 rounded-full"
                />
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.2, opacity: 0.2 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 2, delay: 0.5, ease: "easeOut" }}
                  className="absolute inset-0 border-2 border-blue-500 rounded-full"
                />
              </>
            )}
          </AnimatePresence>

          {/* Main Orb Button */}
          <motion.button
            id="mic-button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleToggle}
            className={`
              relative z-20 w-48 h-48 rounded-full flex items-center justify-center
              transition-all duration-700 ease-in-out
              ${state === SessionState.DISCONNECTED ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-800 border-zinc-700'}
              border-4 ${getOrbGlow()}
            `}
          >
            <div className="absolute inset-2 rounded-full bg-gradient-to-tr from-black/40 to-white/5 pointer-events-none" />
            
            {state === SessionState.DISCONNECTED ? (
              <Power className="w-16 h-16 text-zinc-600 transition-colors group-hover:text-pink-500" />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <motion.div
                  animate={state === SessionState.SPEAKING ? {
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 1, 0.5]
                  } : {}}
                  transition={{ repeat: Infinity, duration: 1 }}
                >
                  {state === SessionState.LISTENING ? 
                    <Mic className={`w-16 h-16 ${getStatusColor()}`} /> : 
                    <MessageCircle className={`w-16 h-16 ${getStatusColor()}`} />
                  }
                </motion.div>
              </div>
            )}
          </motion.button>

          {/* Waveform Visualization (Fake placeholder for mood) */}
          <AnimatePresence>
            {state === SessionState.SPEAKING && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute bottom-[-60px] left-1/2 -translate-x-1/2 flex items-center gap-1 h-8"
              >
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ height: [4, 16, 8, 20, 6] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                    className="w-1 bg-pink-400 rounded-full"
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="text-center space-y-4">
          <motion.h2 
            key={state}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-xl font-light tracking-tight ${getStatusColor()}`}
          >
            {state === SessionState.DISCONNECTED && "Ready to talk?"}
            {state === SessionState.CONNECTING && "Waking her up..."}
            {state === SessionState.CONNECTED && "She's here."}
            {state === SessionState.LISTENING && "Tell her anything..."}
            {state === SessionState.SPEAKING && "Zoya is teasing you..."}
          </motion.h2>

          <p className="text-zinc-500 text-sm max-w-[280px] mx-auto font-light leading-relaxed">
            {errorMessage ? (
              <span className="text-red-400 font-medium">{errorMessage}</span>
            ) : (
              state === SessionState.DISCONNECTED 
                ? "Zoya is a bit sassy. Tap that power button if you can handle her."
                : "Try asking her to open a website or just tell her about your day."
            )}
          </p>
        </div>
      </main>

      {/* Footer Info / Controls */}
      <footer className="z-10 w-full flex items-center justify-between opacity-40 hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-4">
          <Globe className="w-4 h-4" title="Browser Integration Active" />
          <span className="text-[10px] uppercase tracking-widest font-mono">Tools: Enabled</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] uppercase tracking-widest font-mono">v.3.1 LIVE</span>
        </div>
      </footer>

      {/* Mobile-first specific style overrides */}
      <style>{`
        body {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
