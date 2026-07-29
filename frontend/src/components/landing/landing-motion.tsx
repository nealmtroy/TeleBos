"use client";

import type { HTMLMotionProps } from "framer-motion";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const revealHidden = { opacity: 0, y: 16 };
const revealVisible = { opacity: 1, y: 0 };
const revealTransition = { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const };

export function LandingReveal({
  children,
  className,
  delay = 0,
  immediate = false,
  ...props
}: HTMLMotionProps<"div"> & {
  children: ReactNode;
  delay?: number;
  immediate?: boolean;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className={cn(className)}
      initial={reducedMotion ? false : revealHidden}
      animate={!reducedMotion && immediate ? revealVisible : undefined}
      whileInView={!reducedMotion && !immediate ? revealVisible : undefined}
      viewport={!reducedMotion && !immediate ? { once: true, margin: "-80px" } : undefined}
      transition={reducedMotion ? undefined : { ...revealTransition, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function LandingRevealGroup({
  children,
  className,
  immediate = false,
  stagger = 0.045,
  ...props
}: HTMLMotionProps<"div"> & {
  children: ReactNode;
  immediate?: boolean;
  stagger?: number;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className={cn(className)}
      initial={reducedMotion ? false : "hidden"}
      animate={!reducedMotion && immediate ? "visible" : undefined}
      whileInView={!reducedMotion && !immediate ? "visible" : undefined}
      viewport={!reducedMotion && !immediate ? { once: true, margin: "-80px" } : undefined}
      variants={{
        hidden: {},
        visible: {
          transition: reducedMotion ? undefined : { staggerChildren: stagger },
        },
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export const landingRevealVariants = {
  hidden: revealHidden,
  visible: {
    ...revealVisible,
    transition: revealTransition,
  },
};
