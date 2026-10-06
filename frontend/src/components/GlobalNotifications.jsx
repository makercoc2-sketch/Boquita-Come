import { useEffect, useState, useContext } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { AuthContext } from '../contexts/AuthContext';

// Compartimos un único contexto de audio para toda la app
let sharedAudioCtx = null;

const getAudioContext = () => {
    if (!sharedAudioCtx) {
        sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return sharedAudioCtx;
};

// Desbloquear el audio en la primera interacción del usuario
const unlockAudio = () => {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
};
if (typeof window !== 'undefined') {
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
}

export default function GlobalNotifications() {
    const { user } = useContext(AuthContext);
    const { lastMessage: globalWs } = useWebSocket('global');
    const { lastMessage: waiterWs } = useWebSocket(user ? `waiter/${user.id}` : null);
    const lastMessage = globalWs || waiterWs;

    const [notifs, setNotifs] = useState([]);

    const playBeep = () => {
        try {
            const ctx = getAudioContext();
            if (ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }

            const playSingleTone = (freq, startTime, duration) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.6, startTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                osc.start(startTime);
                osc.stop(startTime + duration);
            };

            const now = ctx.currentTime;
            playSingleTone(800, now, 0.4);
            playSingleTone(1000, now + 0.3, 0.4);
            playSingleTone(1200, now + 0.6, 1.0);
        } catch (e) {
            console.warn('Audio no soportado o fallido', e);
        }
    };

    const playReadyTone = () => {
        try {
            const ctx = getAudioContext();
            if (ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }

            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate([200, 100, 200, 100, 300]);
            }

            const playSingleTone = (freq, startTime, duration) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.7, startTime + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                osc.start(startTime);
                osc.stop(startTime + duration);
            };

            const now = ctx.currentTime;
            playSingleTone(1400, now, 0.4);
            playSingleTone(1800, now + 0.15, 0.7);
        } catch (e) {
            console.warn('Audio no soportado o fallido', e);
        }
    };

    useEffect(() => {
        if (!lastMessage) return;

        if (lastMessage.event === 'new_ticket') {
            const items = lastMessage.ticket.items || [];
            if (items.length === 0) return;

            const destsArr = Array.from(new Set(items.map(i => i.destination)));
            const placesMap = { 'kitchen': 'COCINA', 'bar': 'BAR' };
            const places = destsArr.map(d => placesMap[d] || d.toUpperCase()).join(' y ');
            const tableNum = lastMessage.ticket.table_number || '?';

            const text = `🔔 Se ha recibido un pedido para ${places} (Mesa ${tableNum})`;

            playBeep();

            const id = Date.now() + Math.random();
            setNotifs(prev => [...prev, { id, text, type: 'new_ticket' }]);

            setTimeout(() => {
                setNotifs(prev => prev.filter(n => n.id !== id));
            }, 6000);
        }
        else if (lastMessage.event === 'item_status_changed' && lastMessage.status === 'COMPLETED') {
            // Si el pedido tiene un mozo asignado (waiter_id), notificar ÚNICAMENTE a ese mozo
            let isRelevant = false;
            if (lastMessage.waiter_id) {
                isRelevant = user && (user.id === lastMessage.waiter_id || ['Administrador', 'Caja'].includes(user.role));
            } else {
                isRelevant = user && ['Administrador', 'Mozo', 'Caja'].includes(user.role);
            }


            if (!isRelevant) return;

            const prodName = lastMessage.product_name || 'Pedido';
            const qty = lastMessage.quantity || 1;
            const tableNum = lastMessage.table_number || '?';

            const text = `🍳 ¡TU PEDIDO ESTÁ LISTO! Mesa ${tableNum}: ${qty}× ${prodName}`;


            playReadyTone();

            const id = Date.now() + Math.random();
            setNotifs(prev => [...prev, { id, text, type: 'item_ready' }]);

            setTimeout(() => {
                setNotifs(prev => prev.filter(n => n.id !== id));
            }, 8000);
        }
    }, [lastMessage, user]);

    if (notifs.length === 0) return null;

    return (
        <div className="fixed top-20 right-4 sm:right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
            {notifs.map(n => (
                <div
                    key={n.id}
                    className={`px-6 py-4 rounded-xl shadow-2xl border transform transition-all duration-300 animate-[bounce_0.5s_ease-out] pointer-events-auto
                        ${n.type === 'item_ready'
                            ? 'bg-emerald-600 text-white border-emerald-400/40 shadow-emerald-900/60 ring-2 ring-emerald-400'
                            : 'bg-brand-600 text-white border-brand-400/30 shadow-brand-900/50'
                        }`}
                >
                    <p className="font-extrabold text-sm sm:text-base leading-tight drop-shadow-sm">{n.text}</p>
                </div>
            ))}
        </div>
    );
}

