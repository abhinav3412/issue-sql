"use client";
import React, { useRef } from "react";
import "./SpotlightCard.css";

interface SpotlightCardProps {
    children: React.ReactNode;
    className?: string;
    spotlightColor?: string;
}

export default function SpotlightCard({
    children,
    className = "",
    spotlightColor = "rgba(255, 255, 255, 0.15)",
}: SpotlightCardProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const { currentTarget, clientX, clientY } = e;
        const { left, top } = currentTarget.getBoundingClientRect();
        containerRef.current?.style.setProperty("--mouse-x", `${clientX - left}px`);
        containerRef.current?.style.setProperty("--mouse-y", `${clientY - top}px`);
    };

    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            className={`spotlight-card ${className}`}
            style={
                {
                    "--spotlight-color": spotlightColor,
                } as React.CSSProperties
            }
        >
            <div className="spotlight-overlay" />
            <div className="spotlight-content">{children}</div>
        </div>
    );
}
