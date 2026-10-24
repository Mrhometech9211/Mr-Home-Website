"use client";

import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";

export function WhatsAppFloat({ href }: { href: string }) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 1.5, type: "spring", stiffness: 260, damping: 20 }}
      whileHover={{ y: -3, scale: 1.04 }}
      whileTap={{ scale: 0.95 }}
      className="mrh-float pulse-ring fixed bottom-5 left-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(180deg,#31c85a,#1fa64a)] text-white shadow-[0_14px_30px_-10px_rgba(31,166,74,0.8)] transition-opacity duration-300"
    >
      <MessageCircle className="h-6 w-6" />
    </motion.a>
  );
}
