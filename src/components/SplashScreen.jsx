import React, { useEffect, useState } from 'react';
import './SplashScreen.css';

const ProfessionalEyes = ({ size = 200 }) => (
    <svg width={size} height={size * 0.5} viewBox="0 0 140 70" fill="none" xmlns="http://www.w3.org/2000/svg" className="splash-eyes-svg-natural">
        <defs>
            <radialGradient id="eyeShadow" cx="70" cy="35" r="60" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.15" />
                <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <linearGradient id="pupilNatural" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2D1A0A" /> {/* Café muy oscuro */}
                <stop offset="100%" stopColor="#0F0904" />
            </linearGradient>
            <clipPath id="eyeClip">
                <path d="M10 35C10 35 25 10 45 10C65 10 80 35 80 35C80 35 65 60 45 60C25 60 10 35 10 35Z" />
            </clipPath>
            <clipPath id="eyeClipRight">
                <path d="M60 35C60 35 75 10 95 10C115 10 130 35 130 35C130 35 115 60 95 60C75 60 60 35 60 35Z" />
            </clipPath>
        </defs>

        {/* Resplandor suave de fondo */}
        <ellipse cx="70" cy="35" rx="60" ry="30" fill="url(#eyeShadow)" />

        {/* OJO IZQUIERDO (Almendrado) */}
        <g className="eye-group-left">
            <path d="M15 35C15 35 28 12 48 12C68 12 81 35 81 35C81 35 68 58 48 58C28 58 15 35 15 35Z" fill="#F8FAFC" />
            <g clipPath="url(#eyeClip)">
                <g className="pupil-wrapper-left">
                    <circle cx="48" cy="35" r="11" fill="url(#pupilNatural)" />
                    <circle cx="45" cy="32" r="3" fill="white" fillOpacity="0.6" /> {/* Reflejo natural */}
                </g>
            </g>
            {/* Párpado superior sutil */}
            <path d="M15 35C15 35 28 12 48 12C68 12 81 35 81 35" stroke="#CBD5E1" strokeWidth="1" fill="none" opacity="0.5" />
        </g>

        {/* OJO DERECHO (Almendrado) */}
        <g className="eye-group-right">
            <path d="M65 35C65 35 78 12 98 12C118 12 131 35 131 35C131 35 118 58 98 58C78 58 65 35 65 35Z" fill="#F8FAFC" />
            <g clipPath="url(#eyeClipRight)">
                <g className="pupil-wrapper-right">
                    <circle cx="98" cy="35" r="11" fill="url(#pupilNatural)" />
                    <circle cx="95" cy="32" r="3" fill="white" fillOpacity="0.6" />
                </g>
            </g>
            <path d="M65 35C65 35 78 12 98 12C118 12 131 35 131 35" stroke="#CBD5E1" strokeWidth="1" fill="none" opacity="0.5" />
        </g>
    </svg>
);

const SplashScreen = ({ isFinished }) => {
    const [shouldRender, setShouldRender] = useState(true);

    useEffect(() => {
        if (isFinished) {
            const timer = setTimeout(() => {
                setShouldRender(false);
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [isFinished]);

    if (!shouldRender) return null;

    return (
        <div className={`splash-container ${isFinished ? 'fade-out' : ''}`}>
            <div className="splash-background-glow"></div>
            
            <div className="splash-content">
                <div className="splash-header">
                    <h1 className="splash-title-premium">AHORROS</h1>
                    <div className="title-underline"></div>
                </div>

                <div className="logo-section">
                    <div className="logo-aura"></div>
                    <ProfessionalEyes size={260} />
                </div>

                <div className="splash-footer-premium">
                    <p className="splash-tagline">Control visible</p>
                    <div className="premium-loader">
                        <div className="premium-loader-line"></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SplashScreen;
