import './App.css';
import { ChatProvider, useChat } from './state/ChatContext';
import Topbar from './components/Topbar';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import MediaViewer from './components/MediaViewer';
import Login from './components/Login';
import './components/Login.css';
import { useEffect, useState } from 'react';

function MainApp() {
  const { activeChatId } = useChat();

  return (
    <div className={`app ${activeChatId ? 'chat-active' : 'chat-list-active'}`}>
      <Topbar />
      <div className="layout">
        <Sidebar />
        <ChatWindow />
      </div>
      <MediaViewer />
    </div>
  );
}

function AppContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('auth_token'));
  const { fetchChatsFromAPI } = useChat();

  useEffect(() => {
    // Keep state in sync with localStorage (in case of manual clear or logout elsewhere)
    const onStorage = () => setIsLoggedIn(!!localStorage.getItem('auth_token'))
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const handleLogin = async (user) => {
    setIsLoggedIn(true);
    // Fetch chats immediately after login
    try {
      await fetchChatsFromAPI();
    } catch (err) {
      console.error('Failed to fetch chats after login:', err);
    }
  };

  return (
    <>
      {isLoggedIn ? (
        <MainApp />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </>
  );
}

export default function AppWithProviders() {
  return (
    <ChatProvider>
      <AppContent />
    </ChatProvider>
  );
}
