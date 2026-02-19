"use client";

import { motion } from "framer-motion";
import React from "react";

export default function BackgroundPaths() {
    return (
        <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            overflow: 'hidden',
            pointerEvents: 'none'
        }}>
            <svg
                style={{
                    width: '100%',
                    height: '100%',
                    opacity: 0.15
                }}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
            >
                <motion.path
                    d="M0 100 C 20 0 50 0 100 100"
                    stroke="#22c55e"
                    strokeWidth="0.5"
                    fill="none"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear", repeatType: "reverse" }}
                />
                <motion.path
                    d="M100 0 C 50 100 20 100 0 0"
                    stroke="#5227FF"
                    strokeWidth="0.5"
                    fill="none"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 7, repeat: Infinity, ease: "linear", repeatType: "reverse", delay: 1 }}
                />
                <motion.path
                    d="M100 50 C 0 50 0 50 100 50"
                    stroke="#FF9FFC"
                    strokeWidth="0.2"
                    fill="none"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear", repeatType: "reverse", delay: 2 }}
                />
            </svg>
            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to bottom, transparent, transparent, rgba(6, 0, 16, 0.8))'
            }} />
        </div>
    );
}
