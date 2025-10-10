'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Lock } from 'lucide-react';
import { verifyShowroomPassword, checkShowroomAccess } from '@/app/dashboard/showroom/actions';

export function ShowroomPasswordGate({ children }: { children: React.ReactNode }) {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if user already has access
    checkShowroomAccess().then(setHasAccess);
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsVerifying(true);

    try {
      const result = await verifyShowroomPassword(password);
      if (result.success) {
        setHasAccess(true);
      } else {
        setError('Incorrect password');
        setPassword('');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error('Password verification error:', err);
    } finally {
      setIsVerifying(false);
    }
  };

  // Loading state
  if (hasAccess === null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  // Password overlay
  if (!hasAccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm">
        <div className="w-full max-w-md space-y-6 rounded-lg border border-white/10 bg-black/80 p-8 shadow-xl">
          <div className="flex flex-col items-center space-y-2 text-center">
            <div className="rounded-full bg-white/10 p-3">
              <Lock className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">Showroom Access</h2>
            <p className="text-sm text-white/60">Enter the password to access the showroom</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isVerifying}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                autoFocus
              />
              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isVerifying || !password}
              className="w-full"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Access Showroom'
              )}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // Access granted, show the actual content
  return <>{children}</>;
}

