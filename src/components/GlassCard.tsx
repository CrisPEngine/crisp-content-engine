"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

/**
 * Premium glass morphism card with hover effects
 */
export function GlassCard({ children, delay = 0, className = "" }: GlassCardProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? {} : { opacity: 0, y: 30 }}
      whileInView={shouldReduceMotion ? {} : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{
        duration: 0.4,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={
        shouldReduceMotion
          ? {}
          : {
              y: -6,
              transition: { duration: 0.2, ease: "easeOut" },
            }
      }
      className={`group relative ${className}`}
    >
      {/* Glow effect on hover */}
      <div className="absolute -inset-0.5 bg-gradient-to-br from-sky-400/0 via-emerald-400/0 to-cyan-400/0 group-hover:from-sky-400/20 group-hover:via-emerald-400/10 group-hover:to-cyan-400/20 rounded-[21px] blur-sm transition-all duration-500 opacity-0 group-hover:opacity-100" />
      
      {/* Main glass card */}
      <div className="relative h-full bg-white/[0.04] backdrop-blur-xl rounded-[20px] border border-white/[0.08] shadow-[0_20px_40px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-300 group-hover:border-white/[0.12] group-hover:bg-white/[0.06]">
        {/* Inner highlight gradient */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        <div className="absolute top-0 left-0 bottom-0 w-px bg-gradient-to-b from-white/[0.06] via-transparent to-transparent" />
        
        {/* Content */}
        <div className="relative z-10">{children}</div>
      </div>
    </motion.div>
  );
}
