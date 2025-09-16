import { useState } from "react";
import { apiLogin } from "../lib/api";
import { motion } from "framer-motion";
import "./Login.css";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!username || !password) {
        setError("Username & password required");
        return;
      }
      const data = await apiLogin({ username, password });
      const { token, user } = data || {};
      if (token) localStorage.setItem("auth_token", token);
      if (user) localStorage.setItem("auth_user", JSON.stringify(user));
      onLogin?.(user);
    } catch (err) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Background Circles */}
      <div className="circle circle1"></div>
      <div className="circle circle2"></div>
      <div className="circle circle3"></div>
      <div className="circle circle4"></div>

      <motion.div
        className="login-card"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
      >
        {/* Left side welcome message */}
        <div className="login-left">
          <h1>Welcome</h1>
          <p>
            Sign in to access your dashboard, manage your account,
            and explore all the features available to you.
          </p>
        </div>

        {/* Right side form */}
        <div className="login-right">
          <h2>Sign In</h2>
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />

            <div className="password-wrapper">
  <input
    type={showPassword ? "text" : "password"}
    placeholder="Password"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
  />
  <span
    className="eye-icon"
    onClick={() => setShowPassword(!showPassword)}
  >
    {showPassword ? "🙈" : "👁️"}
  </span>
</div>


            {error && <p className="error">{error}</p>}

            <motion.button
              type="submit"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={loading}
            >
              {loading ? "Logging in..." : "Sign In"}
            </motion.button>
          </form>
        </div>
      </motion.div>

      {/* Footer Credit */}
      <div className="login-footer">
        Design & Developed by{" "}
        <a href="https://zenbytetechnology.com" target="_blank" rel="noopener noreferrer">
          Zenbyte Technology
        </a>
      </div>
    </div>
  );
}
