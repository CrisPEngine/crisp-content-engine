"use client";

import { motion } from "framer-motion";
import Image from "next/image";

/**
 * Premium 3D tilted product mockup component
 * Shows Content Approval Queue with browser frame and depth
 */
export function ProductMockup3D() {
  return (
    <motion.div
      className="relative w-full max-w-4xl mx-auto"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Floating animation wrapper */}
      <motion.div
        animate={{
          y: [0, -12, 0],
          rotateX: [2, 4, 2],
          rotateY: [-3, -5, -3],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="relative"
        style={{
          transformStyle: "preserve-3d",
          perspective: "1200px",
        }}
      >
        {/* Shadow layers for depth */}
        <div className="absolute inset-0 translate-y-12 blur-3xl opacity-40 bg-gradient-to-br from-sky-500/30 via-emerald-500/20 to-transparent rounded-3xl" />
        <div className="absolute inset-0 translate-y-8 blur-2xl opacity-30 bg-gradient-to-br from-sky-400/20 via-cyan-500/15 to-transparent rounded-3xl" />
        
        {/* Main mockup container with 3D tilt */}
        <div 
          className="relative"
          style={{
            transform: "rotateX(4deg) rotateY(-6deg) rotateZ(1deg)",
            transformStyle: "preserve-3d",
          }}
        >
          {/* Glow edge effect */}
          <div className="absolute -inset-0.5 bg-gradient-to-br from-sky-400/40 via-emerald-400/30 to-cyan-400/40 rounded-2xl blur-sm" />
          
          {/* Browser chrome frame */}
          <div className="relative bg-gradient-to-b from-neutral-900 to-neutral-950 rounded-t-2xl border border-neutral-800/50 overflow-hidden">
            {/* Browser top bar */}
            <div className="flex items-center gap-2 px-4 py-3 bg-neutral-900/90 backdrop-blur-sm border-b border-neutral-800/50">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="px-4 py-1 bg-neutral-800/40 rounded-md text-[10px] text-neutral-500 font-mono">
                  app.crispdigital.io
                </div>
              </div>
            </div>
            
            {/* Screenshot container */}
            <div className="relative bg-neutral-950 overflow-hidden">
              {/* Placeholder gradient (replace with actual screenshot) */}
              <div className="aspect-[16/10] bg-gradient-to-br from-neutral-900 via-neutral-950 to-black flex items-center justify-center">
                <div className="text-center space-y-4 px-8">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900/80 rounded-lg border border-neutral-800/50 backdrop-blur-sm">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-sm font-medium text-neutral-300">Content Approval Queue</span>
                  </div>
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-16 bg-neutral-900/60 rounded-lg border border-neutral-800/30 backdrop-blur-sm"
                        style={{ width: `${100 - i * 10}%`, margin: '0 auto' }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Reflection overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent pointer-events-none" />
              
              {/* Subtle scan line effect */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.01] to-transparent"
                animate={{ y: ["-100%", "200%"] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              />
            </div>
          </div>
          
          {/* Bottom edge highlight */}
          <div className="h-px bg-gradient-to-r from-transparent via-neutral-700/50 to-transparent" />
        </div>
      </motion.div>
    </motion.div>
  );
}
