import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { authApi, type AuthUser } from "./api";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<{ verificationRequired?: boolean }>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
  verifyEmail: (code: string) => Promise<void>;
  resendCode: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "hsafa_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem(TOKEN_KEY),
    isLoading: true,
    isAuthenticated: false,
  });

  const setAuth = useCallback((token: string, user: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    setState({ token, user, isLoading: false, isAuthenticated: true });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setState({ token: null, user: null, isLoading: false, isAuthenticated: false });
  }, []);

  // Bootstrap: check if saved token is still valid
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }

    authApi
      .me()
      .then(({ user }) => {
        setState({ token, user, isLoading: false, isAuthenticated: true });
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setState({ token: null, user: null, isLoading: false, isAuthenticated: false });
      });
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await authApi.login(email, password);
      setAuth(data.token, data.user);
      return { verificationRequired: !data.user.emailVerified };
    },
    [setAuth]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const data = await authApi.register(name, email, password);
      setAuth(data.token, data.user);
    },
    [setAuth]
  );

  const loginWithToken = useCallback(
    async (token: string) => {
      localStorage.setItem(TOKEN_KEY, token);
      const { user } = await authApi.me();
      setAuth(token, user);
    },
    [setAuth]
  );

  const verifyEmail = useCallback(async (code: string) => {
    await authApi.verifyEmail(code);
    setState((s) => ({
      ...s,
      user: s.user ? { ...s.user, emailVerified: true } : null,
    }));
  }, []);

  const resendCode = useCallback(async () => {
    await authApi.resendCode();
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { user } = await authApi.me();
      setState((s) => ({ ...s, user }));
    } catch {
      // ignore
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        loginWithToken,
        logout,
        verifyEmail,
        resendCode,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
