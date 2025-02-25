import React, { createContext, useEffect, useRef } from 'react';

// Create a WebSocket context to provide the WebSocket instance across the app
export const WebSocketContext = createContext(null);

const WebSocketProvider = ({ children }) => {
    const socketRef = useRef(null);

    useEffect(() => {
        // Use the WebSocket URL from the environment variable
        const wsUrl = process.env.REACT_APP_WEBSOCKET_URL;
        const authToken = process.env.REACT_APP_AUTH_TOKEN;
        

        // Initialize the WebSocket connection
        const ws = new WebSocket(`${wsUrl}?token=${authToken}`);
        socketRef.current = ws;

        // WebSocket event listeners
        ws.onopen = () => {
            console.log('WebSocket connected');
        };

        ws.onmessage = (event) => {
            console.log('WebSocket message received:', event.data);
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        ws.onclose = (event) => {
            console.log('WebSocket connection closed:', event);
        };

        // Cleanup WebSocket connection on component unmount
        return () => {
            ws.close();
        };
    }, []);

    return (
        <WebSocketContext.Provider value={socketRef.current}>
            {children}
        </WebSocketContext.Provider>
    );
};

export default WebSocketProvider;
