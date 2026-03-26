import { useState } from "react";
import { authAPI } from "../utils/api";
import { generateKeyPair } from "../utils/crypto";

export default function Auth({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let data;
      if (isRegister) {
        data = await authAPI.register(username, email, password);
      } else {
        data = await authAPI.login(email, password);
      }

      localStorage.setItem("token", data.token);

      // Generate ECDH key pair and upload public key (transparent to user)
      if (!data.user.publicKey) {
        const publicKey = await generateKeyPair();
        await authAPI.updatePublicKey(publicKey);
        data.user.publicKey = publicKey;
      }

      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-icon">💬</div>
          <h1>CryptChat</h1>
          <p>{isRegister ? "Create your account" : "Sign in to continue"}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-text">{error}</div>}

          {isRegister && (
            <div className="form-group" style={{ animation: "slideUp 0.3s ease" }}>
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                className="form-input"
                placeholder="Choose your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={isRegister ? "new-password" : "current-password"}
            />
          </div>

          <button
            id="auth-submit"
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : isRegister
              ? "Create Account"
              : "Sign In"}
          </button>
        </form>

        <div className="auth-switch">
          {isRegister
            ? "Already have an account? "
            : "Don't have an account? "}
          <button
            id="auth-toggle"
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
            }}
          >
            {isRegister ? "Sign In" : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
