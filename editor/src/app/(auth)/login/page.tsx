import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">E</span>
              </div>
              <span className="text-xl font-bold tracking-tight">EDITOR</span>
            </div>
            <p className="text-sm text-gray-500">AI-Powered PDF Editor</p>
          </div>

          <Suspense fallback={<div className="text-sm text-gray-400 text-center">Loading...</div>}>
            <LoginForm />
          </Suspense>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-gray-900 font-medium hover:underline">
              Sign up
            </Link>
          </p>

          <p className="mt-2 text-center text-sm">
            <Link href="/forgot-password" className="text-gray-400 hover:text-gray-600">
              Forgot password?
            </Link>
          </p>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          By signing in, you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
