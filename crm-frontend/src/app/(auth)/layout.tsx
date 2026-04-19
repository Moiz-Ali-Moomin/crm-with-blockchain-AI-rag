import Link from 'next/link';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-canvas flex flex-col items-center justify-center px-4">
      
      {/* Subtle top border accent */}
      <div className="fixed top-0 left-0 right-0 h-0.5 bg-blue-600" />

      <div className="w-full max-w-md">
        
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm group-hover:bg-blue-700 transition-colors duration-200">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>

            <span className="text-xl font-bold text-fg tracking-tight">
              CRM Platform
            </span>
          </Link>
        </div>

        {/* Auth Form */}
        {children}

        {/* Footer */}
        <p className="text-center text-xs text-fg-subtle mt-8">
          &copy; {new Date().getFullYear()} CRM Platform. All rights reserved.
        </p>
      </div>
    </div>
  );
}