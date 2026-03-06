import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef(null);
    const listenersRef = useRef({});
    const reconnectTimeoutRef = useRef(null);

    const connect = useCallback(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('[WS] Connected');
            setIsConnected(true);
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                const { type, data } = message;

                // Notify all listeners for this event type
                const callbacks = listenersRef.current[type] || [];
                callbacks.forEach((cb) => cb(data));

                // Also notify wildcard listeners
                const wildcardCallbacks = listenersRef.current['*'] || [];
                wildcardCallbacks.forEach((cb) => cb(type, data));
            } catch (e) {
                console.error('[WS] Parse error:', e);
            }
        };

        ws.onclose = () => {
            console.log('[WS] Disconnected, reconnecting in 2s...');
            setIsConnected(false);
            reconnectTimeoutRef.current = setTimeout(connect, 2000);
        };

        ws.onerror = (err) => {
            console.error('[WS] Error:', err);
            ws.close();
        };

        wsRef.current = ws;
    }, []);

    useEffect(() => {
        connect();
        return () => {
            if (wsRef.current) wsRef.current.close();
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        };
    }, [connect]);

    const subscribe = useCallback((eventType, callback) => {
        if (!listenersRef.current[eventType]) {
            listenersRef.current[eventType] = [];
        }
        listenersRef.current[eventType].push(callback);

        // Return unsubscribe function
        return () => {
            listenersRef.current[eventType] = listenersRef.current[eventType].filter(
                (cb) => cb !== callback
            );
        };
    }, []);

    return (
        <WebSocketContext.Provider value={{ isConnected, subscribe }}>
            {children}
        </WebSocketContext.Provider>
    );
}

export function useWebSocket() {
    return useContext(WebSocketContext);
}
