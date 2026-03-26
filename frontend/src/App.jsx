import { useState, useEffect } from "react";
import Auth from "./components/Auth";
import ChatLayout from "./components/ChatLayout";
import { authAPI } from "./utils/api";
import { disconnectSocket } from "./utils/socket";
import { clearKeys, hasKeyPair, generateKeyPair } from "./utils/crypto";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      authAPI
        .getMe()
        .then(async (data) => {
          // Ensure key pair exists (may have been cleared)
          if (!hasKeyPair() || !data.user.publicKey) {
            const pubKey = await generateKeyPair();
            await authAPI.updatePublicKey(pubKey);
            data.user.publicKey = pubKey;
          }
          setUser(data.user);
        })
        .catch(() => {
          localStorage.removeItem("token");
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = (userData) => setUser(userData);

  const handleLogout = () => {
    localStorage.removeItem("token");
    disconnectSocket();
    clearKeys();
    setUser(null);
  };

  if (loading) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b141a",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px", animation: "pulse 1.5s infinite" }}>💬</div>
          <div style={{ color: "#8696a0", fontSize: "14px" }}>Loading CryptChat...</div>
        </div>
      </div>
    );
  }

  if (!user) return <Auth onLogin={handleLogin} />;

  return <ChatLayout user={user} onLogout={handleLogout} />;
}

export default App;
