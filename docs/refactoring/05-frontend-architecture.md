# Phase 5 — Frontend Architecture

> **Duration**: 7–10 days
> **Priority**: 🟡 HIGH
> **Depends on**: Phase 1–3 complete

---

## Objective

Replace static HTML files with a proper single-page application (SPA) using a modern framework. Implement proper state management, routing, error handling, loading states, and responsive design.

---

## Decision: Framework Choice

Given the existing Express backend and the need for rapid development:
- **Option A**: React + Vite (most ecosystem support)
- **Option B**: Vue 3 + Vite (lighter, simpler)
- **Option C**: Continue with static HTML + Alpine.js (minimal change)

**Recommendation: React + Vite + TypeScript** — most hiring platforms use React, larger ecosystem, better tooling.

```bash
# Create React app in frontend directory
npm create vite@latest frontend -- --template react-ts
```

---

## Tasks

### 5.1 — Initialize Frontend Project

**`frontend/package.json`:**

```json
{
  "name": "careerpilot-frontend",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "lint": "eslint src/ --ext .ts,.tsx"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "react-query": "^3.39.0",
    "axios": "^1.7.0",
    "zustand": "^4.5.0",
    "react-hook-form": "^7.51.0",
    "@hookform/resolvers": "^3.3.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0",
    "@testing-library/react": "^15.0.0",
    "eslint": "^8.57.0",
    "tailwindcss": "^3.4.0"
  }
}
```

### 5.2 — Define Route Structure

| Path | Component | Auth Required |
|------|-----------|---------------|
| `/` | LandingPage | No |
| `/auth/login` | LoginPage | No |
| `/auth/signup` | SignupPage | No |
| `/auth/oauth/callback` | OAuthCallbackPage | No |
| `/resume` | ResumeDashboard | Yes |
| `/resume/upload` | ResumeUpload | Yes |
| `/resume/chat` | ResumeChat | Yes |
| `/resume/preview` | ResumePreview | Yes |
| `/jobs` | JobRecommendations | Yes |
| `/jobs/:id` | JobDetail | Yes |
| `/cover-letter` | CoverLetterList | Yes |
| `/upgrade` | UpgradePage | Yes |
| `/settings` | SettingsPage | Yes |

### 5.3 — Core Architecture Files

**`frontend/src/api/client.ts`:**

```typescript
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach access token
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401 with token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        localStorage.setItem('accessToken', data.accessToken);
        processQueue(null, data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('accessToken');
        window.location.href = '/auth/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
```

**`frontend/src/hooks/useAuth.ts`:**

```typescript
import { create } from 'zustand';
import apiClient from '../api/client';

interface User {
  id: string;
  name: string;
  email: string;
  premium?: { active: boolean };
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await apiClient.post('/auth/login', { email, password });
      localStorage.setItem('accessToken', data.accessToken);
      set({ user: data.user, isLoading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.message || 'Login failed',
        isLoading: false,
      });
      throw err;
    }
  },

  register: async (name, email, password) => {
    set({ isLoading: true, error: null });
    try {
      await apiClient.post('/auth/register', { name, email, password });
      set({ isLoading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.message || 'Registration failed',
        isLoading: false,
      });
      throw err;
    }
  },

  logout: async () => {
    await apiClient.post('/auth/logout');
    localStorage.removeItem('accessToken');
    set({ user: null });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const { data } = await apiClient.post('/auth/refresh');
      localStorage.setItem('accessToken', data.accessToken);
      // Re-fetch user data
      const userRes = await apiClient.get('/auth/me');
      set({ user: userRes.data.user, isLoading: false });
    } catch {
      set({ user: null, isLoading: false });
    }
  },
}));
```

### 5.4 — Auth Pages with Validation

**`frontend/src/pages/LoginPage.tsx`:**

```typescript
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../hooks/useAuth';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login, isLoading, error, user } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  // Redirect if already logged in
  if (user) {
    navigate('/resume', { replace: true });
    return null;
  }

  const onSubmit = async (data: LoginForm) => {
    try {
      await login(data.email, data.password);
      navigate('/resume');
    } catch {
      // Error handled by store
    }
  };

  return (
    <div className="min-h-screen bg-[#08080E] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-[#0F0F18] border border-[rgba(201,151,58,0.28)] rounded-2xl p-8">
          <div className="text-center mb-8">
            <h1 className="font-['Cormorant_Garamond'] text-3xl text-[#F0EDE6] font-light">
              Welcome back
            </h1>
            <p className="text-[#8A8580] text-sm mt-2">Sign in to continue</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-6 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm text-[#8A8580] mb-2">Email</label>
              <input
                type="email"
                {...register('email')}
                className={`w-full bg-[#161628] border ${errors.email ? 'border-red-500' : 'border-[rgba(201,151,58,0.2)]'} rounded-lg px-4 py-3 text-[#F0EDE6] placeholder-[#484644] focus:outline-none focus:border-[#C9973A] transition-colors`}
                placeholder="you@example.com"
              />
              {errors.email && (
                <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-[#8A8580] mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                  className={`w-full bg-[#161628] border ${errors.password ? 'border-red-500' : 'border-[rgba(201,151,58,0.2)]'} rounded-lg px-4 py-3 text-[#F0EDE6] placeholder-[#484644] focus:outline-none focus:border-[#C9973A] transition-colors`}
                  placeholder="Your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#484644] hover:text-[#8A8580]"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#C9973A] text-[#08080E] font-medium py-3 rounded-lg hover:bg-[#E8B45A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#08080E] border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[rgba(201,151,58,0.1)]">
            <p className="text-center text-sm text-[#8A8580]">
              Don't have an account?{' '}
              <Link to="/auth/signup" className="text-[#C9973A] hover:text-[#E8B45A]">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 5.5 — Resume Chat Page (Core Feature)

**`frontend/src/pages/ResumeChat.tsx`:**

```typescript
import { useState, useRef, useEffect } from 'react';
import apiClient from '../api/client';
import { useAuth } from '../hooks/useAuth';

interface Message {
  role: 'user' | 'bot';
  content: string;
  timestamp: Date;
}

interface ConversationData {
  personalInfo?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
  };
  professionalSummary?: {
    currentRole?: string;
    experience?: string;
    summary?: string;
  };
  // ... other fields
}

export function ResumeChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Start conversation on mount
  useEffect(() => {
    startConversation();
  }, []);

  const startConversation = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.post('/chatbot/start');
      setSessionId(data.sessionId);
      setMessages([{ role: 'bot', content: data.response, timestamp: new Date() }]);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to start conversation');
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading || !sessionId) return;

    setInput('');
    setError(null);

    // Optimistic update
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date() }]);
    setIsLoading(true);

    try {
      const { data } = await apiClient.post('/chatbot/message', {
        message: text,
        sessionId,
      });

      setMessages(prev => [...prev, {
        role: 'bot',
        content: data.response,
        timestamp: new Date(),
      }]);

      if (data.progress) setProgress(data.progress);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send message');
      setMessages(prev => prev.slice(0, -1)); // Remove optimistic message
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[rgba(201,151,58,0.1)]">
        <div>
          <h2 className="font-['Cormorant_Garamond'] text-xl text-[#F0EDE6]">Resume Builder</h2>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-32 h-1.5 bg-[#161628] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#C9973A] rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-[#8A8580]">{progress}%</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[rgba(201,151,58,0.18)] text-[#F0EDE6] rounded-br-sm'
                  : 'bg-[#161628] text-[#8A8580] border border-[rgba(255,255,255,0.04)] rounded-bl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#161628] p-4 rounded-xl rounded-bl-sm border border-[rgba(255,255,255,0.04)]">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-[#8A8580] rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-[#8A8580] rounded-full animate-bounce [animation-delay:0.1s]" />
                <div className="w-2 h-2 bg-[#8A8580] rounded-full animate-bounce [animation-delay:0.2s]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="float-right text-red-400 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-[rgba(201,151,58,0.1)]">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            rows={1}
            disabled={isLoading || !sessionId}
            className="flex-1 bg-[#161628] border border-[rgba(201,151,58,0.2)] rounded-lg px-4 py-3 text-[#F0EDE6] placeholder-[#484644] resize-none focus:outline-none focus:border-[#C9973A] disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading || !sessionId}
            className="px-6 bg-[#C9973A] text-[#08080E] font-medium rounded-lg hover:bg-[#E8B45A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 5.6 — Protected Route Component

**`frontend/src/components/ProtectedRoute.tsx`:**

```typescript
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface Props {
  children: React.ReactNode;
  requirePremium?: boolean;
}

export function ProtectedRoute({ children, requirePremium = false }: Props) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#08080E] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C9973A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  if (requirePremium && !user.premium?.active) {
    return <Navigate to="/upgrade" replace />;
  }

  return <>{children}</>;
}
```

### 5.7 — Error Boundary

**`frontend/src/components/ErrorBoundary.tsx`:**

```typescript
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen bg-[#08080E] flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <h1 className="font-['Cormorant_Garamond'] text-3xl text-[#F0EDE6] mb-4">
              Something went wrong
            </h1>
            <p className="text-[#8A8580] mb-6">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-[#C9973A] text-[#08080E] px-6 py-3 rounded-lg font-medium hover:bg-[#E8B45A]"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### 5.8 — App Router

**`frontend/src/App.tsx`:**

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ResumeChat } from './pages/ResumeChat';
import { JobRecommendations } from './pages/JobRecommendations';
import { UpgradePage } from './pages/UpgradePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth/login" element={<LoginPage />} />
            <Route path="/auth/signup" element={<SignupPage />} />
            <Route
              path="/resume"
              element={
                <ProtectedRoute>
                  <ResumeChat />
                </ProtectedRoute>
              }
            />
            <Route
              path="/jobs"
              element={
                <ProtectedRoute>
                  <JobRecommendations />
                </ProtectedRoute>
              }
            />
            <Route path="/upgrade" element={<UpgradePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
```

### 5.9 — Vite Configuration

**`frontend/vite.config.ts`:**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['react-hook-form', 'zod'],
          data: ['react-query', 'axios'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### 5.10 — Performance Optimizations

```typescript
// 1. Lazy load routes
const ResumeChat = lazy(() => import('./pages/ResumeChat'));
const JobRecommendations = lazy(() => import('./pages/JobRecommendations'));

// 2. Image optimization
// Use next-gen formats (webp)
// Add srcSet for responsive images

// 3. Bundle analysis
// Add to package.json: "analyze": "vite-bundle-visualizer"

// 4. Service worker for offline support (optional PWA)
```

---

## Verification

```bash
# Start frontend
cd frontend
npm install
npm run dev

# Build for production
npm run build
# Verify output < 200KB gzipped for main bundle

# Lighthouse audit
npx lighthouse http://localhost:3000 --view

# Run tests
npm test
```

---

## Definition of Done

- [ ] Frontend app created with React + TypeScript + Vite
- [ ] All current pages migrated from static HTML to SPA
- [ ] Proper routing with React Router
- [ ] Auth flow (login, signup, OAuth callback) with validation
- [ ] API client with automatic token refresh
- [ ] Protected routes with redirect
- [ ] Error boundary covers entire app
- [ ] Loading states for all async operations
- [ ] Empty states for lists
- [ ] Responsive design (mobile-first)
- [ ] Build optimized (<200KB gzipped initial load)
- [ ] Test coverage for critical components
- [ ] Service worker or PWA configuration (optional)

---

## Next Phase

➡️ Proceed to [Phase 6 — Observability](./06-observability.md)
