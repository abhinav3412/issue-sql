"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Theme = "success" | "error" | "info" | "warning";

interface Toast {
    id: number;
    message: string;
    theme: Theme;
}

interface Confirm {
    id: number;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

interface NotificationContextType {
    showToast: (message: string, theme?: Theme) => void;
    showConfirm: (message: string) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error("useNotification must be used within a NotificationProvider");
    }
    return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [confirm, setConfirm] = useState<Confirm | null>(null);

    const showToast = useCallback((message: string, theme: Theme = "info") => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message, theme }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    const showConfirm = useCallback((message: string) => {
        return new Promise<boolean>((resolve) => {
            setConfirm({
                id: Date.now(),
                message,
                onConfirm: () => {
                    setConfirm(null);
                    resolve(true);
                },
                onCancel: () => {
                    setConfirm(null);
                    resolve(false);
                },
            });
        });
    }, []);

    const getThemeStyles = (theme: Theme) => {
        switch (theme) {
            case "success":
                return {
                    background: "rgba(34, 197, 94, 0.95)",
                    border: "1px solid rgba(74, 222, 128, 0.5)",
                    boxShadow: "0 10px 30px -10px rgba(34, 197, 94, 0.5)",
                };
            case "error":
                return {
                    background: "rgba(239, 68, 68, 0.95)",
                    border: "1px solid rgba(248, 113, 113, 0.5)",
                    boxShadow: "0 10px 30px -10px rgba(239, 68, 68, 0.5)",
                };
            case "warning":
                return {
                    background: "rgba(245, 158, 11, 0.95)",
                    border: "1px solid rgba(251, 191, 36, 0.5)",
                    boxShadow: "0 10px 30px -10px rgba(245, 158, 11, 0.5)",
                };
            default:
                return {
                    background: "rgba(59, 130, 246, 0.95)",
                    border: "1px solid rgba(96, 165, 250, 0.5)",
                    boxShadow: "0 10px 30px -10px rgba(59, 130, 246, 0.5)",
                };
        }
    };

    return (
        <NotificationContext.Provider value={{ showToast, showConfirm }}>
            {children}

            {/* Toast Container */}
            <div style={{
                position: 'fixed',
                top: '24px',
                right: '24px',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                pointerEvents: 'none',
            }}>
                <AnimatePresence>
                    {toasts.map((toast) => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, x: 50, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            style={{
                                ...getThemeStyles(toast.theme),
                                padding: '16px 24px',
                                borderRadius: '16px',
                                color: 'white',
                                backdropFilter: 'blur(12px)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                minWidth: '320px',
                                pointerEvents: 'auto',
                                fontFamily: 'inherit',
                            }}
                        >
                            <div style={{ flex: 1, fontWeight: 600, fontSize: '15px' }}>{toast.message}</div>
                            <button
                                onClick={() => setToasts(p => p.filter(t => t.id !== toast.id))}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'white',
                                    opacity: 0.7,
                                    cursor: 'pointer',
                                    fontSize: '18px',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                ✕
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Confirm Modal */}
            <AnimatePresence>
                {confirm && (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 10000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                    }}>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(0, 0, 0, 0.7)',
                                backdropFilter: 'blur(8px)',
                            }}
                            onClick={confirm.onCancel}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            style={{
                                position: 'relative',
                                background: '#0f172a',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                padding: '32px',
                                borderRadius: '24px',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                                maxWidth: '440px',
                                width: '100%',
                                fontFamily: 'inherit',
                            }}
                        >
                            <h3 style={{
                                fontSize: '22px',
                                fontWeight: 700,
                                color: 'white',
                                marginBottom: '12px',
                                marginTop: 0,
                            }}>
                                Confirm Action
                            </h3>
                            <p style={{
                                color: '#94a3b8',
                                marginBottom: '32px',
                                lineHeight: '1.6',
                                fontSize: '16px',
                            }}>
                                {confirm.message}
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                <button
                                    onClick={confirm.onCancel}
                                    style={{
                                        padding: '12px 24px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        background: 'transparent',
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: '15px',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirm.onConfirm}
                                    style={{
                                        padding: '12px 24px',
                                        borderRadius: '12px',
                                        border: 'none',
                                        background: '#2563eb',
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: '15px',
                                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    Confirm
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </NotificationContext.Provider>
    );
};
