"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

export default function PhoneWalkthrough() {
    const [step, setStep] = useState(0);

    useEffect(() => {
        const sequence = [
            { duration: 4000, step: 0 },  // Map 
            { duration: 4000, step: 1 },  // Request
            { duration: 4000, step: 2 },  // Payment
            { duration: 6000, step: 3 }, // Tracking
            { duration: 3000, step: 4 },  // Complete
        ];

        let current = 0;

        const runSequence = () => {
            setStep(sequence[current].step);
            setTimeout(() => {
                current = (current + 1) % sequence.length;
                runSequence();
            }, sequence[current].duration);
        };

        runSequence();

        // Safety cleanup
        return () => {
            let id = window.setTimeout(function () { }, 0);
            while (id--) window.clearTimeout(id);
        };
    }, []);

    return (
        <div className="phone-walkthrough-container" style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', borderRadius: 'inherit' }}>

            {/* Background Map - Always visible but dims during some steps */}
            <motion.div
                className="phone-map-bg"
                animate={{ filter: step === 1 || step === 2 ? 'brightness(0.3)' : 'brightness(1)' }}
                transition={{ duration: 0.5 }}
                style={{
                    position: 'absolute',
                    top: -20, left: -20, right: -20, bottom: -20,
                    background: 'radial-gradient(circle at 50% 50%, #1e293b 0%, #020617 100%)',
                    backgroundImage: 'radial-gradient(#334155 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                    opacity: 0.5
                }}
            />

            <AnimatePresence mode="wait">

                {/* Step 0: The Map & Location */}
                {step === 0 && (
                    <motion.div
                        key="step0"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
                    >
                        {/* User Dot */}
                        <motion.div
                            style={{
                                width: 16, height: 16, borderRadius: '50%', background: '#3b82f6',
                                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                boxShadow: '0 0 15px rgba(59, 130, 246, 0.8)'
                            }}
                        >
                            <motion.div
                                animate={{ scale: [1, 2.5, 1], opacity: [0.8, 0, 0.8] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.4)' }}
                            />
                        </motion.div>

                        {/* Simulated UI Top Bar */}
                        <div style={{ position: 'absolute', top: 20, left: 10, right: 10, background: 'rgba(15, 23, 42, 0.8)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                            <div style={{ fontSize: '10px', color: '#e2e8f0', fontWeight: 'bold' }}>Locating...</div>
                        </div>
                    </motion.div>
                )}

                {/* Step 1: Requesting Help Menu Slides Up */}
                {step === 1 && (
                    <motion.div
                        key="step1"
                        initial={{ y: '100%' }}
                        animate={{ y: '30%' }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                        style={{
                            width: '100%', height: '100%', position: 'absolute', bottom: 0,
                            background: '#0f172a', borderRadius: '24px 24px 0 0', padding: '20px',
                            borderTop: '1px solid rgba(255,255,255,0.1)',
                            boxShadow: '0 -10px 40px rgba(0,0,0,0.5)'
                        }}
                    >
                        <div style={{ width: 40, height: 4, background: '#334155', borderRadius: 2, margin: '0 auto 20px' }} />
                        <h3 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#fff' }}>Select Service</h3>

                        {/* Service Options */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <motion.div
                                whileHover={{ scale: 1.02 }}
                                style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}
                            >
                                <span style={{ fontSize: '18px' }}>⛽</span>
                                <span style={{ fontSize: '12px', color: '#fff', fontWeight: 600 }}>Emergency Fuel</span>
                            </motion.div>

                            <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '18px' }}>🔧</span>
                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Mechanic</span>
                            </div>
                        </div>

                        {/* Simulated Cursor clicking fuel */}
                        <motion.div
                            initial={{ x: 50, y: 150, opacity: 0 }}
                            animate={{ x: 120, y: 55, opacity: 1, scale: [1, 0.9, 1] }}
                            transition={{ duration: 1.2, times: [0, 0.7, 1] }}
                            style={{ position: 'absolute', top: 0, left: 0, zIndex: 10, fontSize: '24px' }}
                        >
                            👆
                        </motion.div>
                    </motion.div>
                )}

                {/* Step 2: Payment/Confirmation */}
                {step === 2 && (
                    <motion.div
                        key="step2"
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        style={{
                            position: 'absolute', top: '25%', left: '8%', right: '8%',
                            background: '#0f172a', borderRadius: '16px', padding: '15px',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
                        }}
                    >
                        <h4 style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>Bill Estimate</h4>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '8px', color: '#cbd5e1' }}>
                            <span>Fuel (5L)</span><span>₹500</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '15px', color: '#cbd5e1' }}>
                            <span>Delivery</span><span>₹30</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold', color: '#22c55e', marginBottom: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px' }}>
                            <span>Total</span><span>₹530</span>
                        </div>

                        {/* Confirm Button */}
                        <div
                            style={{ background: '#3b82f6', color: '#fff', textAlign: 'center', padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', position: 'relative', overflow: 'hidden' }}
                        >
                            Confirm Request
                            <motion.div
                                initial={{ left: '-100%' }}
                                animate={{ left: '100%' }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                                style={{ position: 'absolute', top: 0, bottom: 0, width: '30%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }}
                            />
                        </div>
                    </motion.div>
                )}

                {/* Step 3: Live Tracking */}
                {step === 3 && (
                    <motion.div
                        key="step3"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
                    >
                        {/* Path line */}
                        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1 }}>
                            <path d="M 50,50 Q 150,150 140,400" stroke="rgba(34, 197, 94, 0.4)" strokeWidth="4" strokeDasharray="6,6" fill="none" />
                        </svg>

                        {/* User Location */}
                        <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#3b82f6', position: 'absolute', bottom: '25%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 2, boxShadow: '0 0 15px rgba(59, 130, 246, 0.8)' }}>
                            <motion.div
                                animate={{ scale: [1, 2, 1], opacity: [0.8, 0, 0.8] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.4)' }}
                            />
                        </div>

                        {/* Worker moving */}
                        <motion.div
                            initial={{ top: '10%', left: '20%' }}
                            animate={{
                                top: ['10%', '30%', '55%', '70%'],
                                left: ['20%', '45%', '50%', '50%']
                            }}
                            transition={{ duration: 5, ease: "linear" }}
                            style={{ position: 'absolute', zIndex: 3, fontSize: '24px', transform: 'translate(-50%, -50%)', filter: 'drop-shadow(0 0 10px rgba(34, 197, 94, 0.5))' }}
                        >
                            🚚
                        </motion.div>

                        {/* ETA Panel */}
                        <motion.div
                            initial={{ y: -50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ type: 'spring' }}
                            style={{ position: 'absolute', top: 20, left: 10, right: 10, background: 'rgba(15, 23, 42, 0.9)', padding: '12px 15px', borderRadius: '12px', border: '1px solid rgba(34, 197, 94, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 4, backdropFilter: 'blur(5px)' }}
                        >
                            <div>
                                <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>Worker arriving in</div>
                                <motion.div
                                    initial={{ opacity: 1 }}
                                    animate={{ opacity: [1, 0.5, 1] }}
                                    transition={{ duration: 1, repeat: Infinity }}
                                    style={{ fontSize: '16px', color: '#22c55e', fontWeight: 'bold' }}
                                >
                                    3 mins
                                </motion.div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {/* Step 4: Completion */}
                {step === 4 && (
                    <motion.div
                        key="step4"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(2, 6, 23, 0.95)' }}
                    >
                        <motion.div
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: 'spring', damping: 12, stiffness: 100 }}
                            style={{ width: 70, height: 70, borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', boxShadow: '0 0 40px rgba(34, 197, 94, 0.6)' }}
                        >
                            <svg width="35" height="35" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </motion.div>
                        <motion.h2
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            style={{ color: '#fff', margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700 }}
                        >
                            Service Complete
                        </motion.h2>
                        <motion.p
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center', padding: '0 20px', margin: 0 }}
                        >
                            You're ready to get back on the road safely.
                        </motion.p>
                    </motion.div>
                )}

            </AnimatePresence>
        </div>
    );
}
