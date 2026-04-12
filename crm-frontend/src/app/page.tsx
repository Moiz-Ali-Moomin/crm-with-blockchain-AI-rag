'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Zap, Brain, GitBranch, Mail, BarChart2, ShieldCheck, Users,
  ArrowRight, Check, Star, TrendingUp, LayoutDashboard,
  MousePointerClick, Settings2, Rocket, Quote,
  Twitter, Linkedin, BookOpen, Headphones, Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ── Static data ───────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Brain,
    title: 'AI Lead Scoring',
    description: 'Automatically rank leads by close probability using ML signals from email, calls, and deal history. Stop guessing — start prioritizing.',
  },
  {
    icon: GitBranch,
    title: 'Visual Pipeline',
    description: 'Drag-and-drop deal stages with real-time team visibility. Never lose track of where a deal stands or who owns the next step.',
  },
  {
    icon: Mail,
    title: 'Email Sequences',
    description: 'Automated follow-up workflows that trigger on lead behavior. Set it once, close deals on autopilot while your team focuses elsewhere.',
  },
  {
    icon: BarChart2,
    title: 'Revenue Analytics',
    description: 'Real-time forecasting with monthly and quarterly breakdowns. Know your number before month-end — not the morning after.',
  },
  {
    icon: ShieldCheck,
    title: 'Blockchain Audit',
    description: 'Immutable activity log — every deal action cryptographically recorded. Full compliance, zero effort, and complete peace of mind.',
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description: 'Shared inbox, activity feeds, and @mention notifications. Keep your whole team aligned on every deal, every day.',
  },
] as const;

const STATS = [
  { value: '2,400+', label: 'Teams using the platform' },
  { value: '38%',    label: 'Average increase in close rate' },
  { value: '$2.1B',  label: 'In pipeline managed' },
  { value: '4.9/5',  label: 'Average customer rating' },
] as const;

const LOGOS = ['Acme Corp', 'Vertex AI', 'TechStart', 'GlobalTech', 'NovaSales', 'PeakCRM'] as const;

const CHAT = [
  { role: 'user',      text: 'Which leads are most likely to close this quarter?' },
  { role: 'assistant', text: 'Based on engagement signals, 3 leads have a >80% close probability: Acme Corp ($24k), TechStart ($18k), and Vertex AI ($12k). I recommend reaching out to Acme first — their last email opened 4×.' },
  { role: 'user',      text: 'Draft a follow-up email for Acme Corp.' },
] as const;

const SIDEBAR_NAV = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Leads',     icon: Users },
  { label: 'Deals',     icon: TrendingUp },
  { label: 'Pipeline',  icon: GitBranch },
  { label: 'Analytics', icon: BarChart2 },
] as const;

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: MousePointerClick,
    title: 'Connect your tools in minutes',
    description: 'Import contacts from your existing spreadsheets, email, or any CRM. Our guided onboarding has most teams fully set up in under 30 minutes — no IT required.',
  },
  {
    step: '02',
    icon: Settings2,
    title: 'Let AI score and prioritize your pipeline',
    description: 'Our AI engine immediately gets to work, analyzing engagement patterns and deal signals to surface the leads most likely to close. You always know exactly where to focus.',
  },
  {
    step: '03',
    icon: Rocket,
    title: 'Close faster, forecast accurately, repeat',
    description: 'With your pipeline visible, automated sequences running, and real-time analytics in hand, your team spends less time on admin and more time on conversations that close.',
  },
] as const;

const TESTIMONIALS = [
  {
    quote: "We switched from Salesforce six months ago and our close rate is up 34%. The AI scoring alone saved our reps 2 hours a day — they're actually excited to open the CRM now.",
    name: 'Sarah Chen',
    title: 'VP of Sales, TechStart',
    initials: 'SC',
    color: 'bg-blue-600',
  },
  {
    quote: "The blockchain audit trail was the deciding factor for our compliance team. We can prove every interaction happened exactly when and how we say it did. It's a game-changer for our regulated industry.",
    name: 'Marcus Williams',
    title: 'Head of Revenue, GlobalTech',
    initials: 'MW',
    color: 'bg-emerald-600',
  },
  {
    quote: "I've evaluated 12 CRMs in my career. This is the first one where the AI actually feels useful rather than a marketing bullet point. The pipeline forecasting is eerily accurate.",
    name: 'Priya Anand',
    title: 'CRO, NovaSales',
    initials: 'PA',
    color: 'bg-violet-600',
  },
] as const;

const PRICING = [
  {
    name: 'Starter',
    price: '$0',
    period: 'Free forever',
    description: 'Perfect for solo founders and small teams just getting started with a structured sales process.',
    highlight: false,
    cta: 'Get started free',
    href: '/register',
    features: [
      'Up to 3 users',
      '500 contacts',
      'Visual pipeline (1 board)',
      'Email integration',
      'Basic analytics',
      'Community support',
    ],
  },
  {
    name: 'Pro',
    price: '$49',
    period: 'per user / month',
    description: 'For growing sales teams that need AI, automation, and serious forecasting power.',
    highlight: true,
    cta: 'Start free 14-day trial',
    href: '/register',
    features: [
      'Unlimited users',
      'Unlimited contacts',
      'AI lead scoring',
      'Email sequences & automation',
      'Revenue forecasting',
      'Blockchain audit log',
      'Priority support',
      'Custom deal stages',
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'tailored to your team',
    description: 'For large organizations that need SSO, advanced permissions, dedicated onboarding, and SLAs.',
    highlight: false,
    cta: 'Talk to sales',
    href: '/login',
    features: [
      'Everything in Pro',
      'SSO & SAML',
      'Custom roles & permissions',
      'Dedicated CSM',
      'Custom SLA',
      'On-premise deployment option',
      'Advanced compliance reporting',
      'API & webhooks access',
    ],
  },
] as const;

const FOOTER_LINKS = {
  Product: ['Features', 'AI Copilot', 'Pipeline', 'Analytics', 'Integrations', "What's new"],
  Company:  ['About', 'Blog', 'Careers', 'Press', 'Partners'],
  Resources: ['Documentation', 'API Reference', 'Status', 'Community', 'Changelog'],
  Legal:    ['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'GDPR'],
} as const;

// ── LandingNav ────────────────────────────────────────────────────────────────

function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <header
      className={cn(
        'fixed top-0 inset-x-0 z-50 bg-white transition-all duration-200',
        scrolled ? 'shadow-sm border-b border-slate-200' : 'border-b border-transparent',
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Zap size={16} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="text-slate-900 font-bold text-[17px] tracking-tight">CRM Platform</span>
        </Link>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-8">
          {[
            { label: 'Features',     href: '#features' },
            { label: 'How it works', href: '#how-it-works' },
            { label: 'AI Copilot',   href: '#ai' },
            { label: 'Pricing',      href: '#pricing' },
          ].map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors duration-150"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" asChild>
            <Link href="/register">Start free trial</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

// ── HeroSection ───────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="pt-32 pb-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:gap-16 xl:gap-24">

          {/* Left: copy */}
          <div className="lg:w-[480px] shrink-0">
            {/* Badge */}
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full mb-7">
              <Star size={12} strokeWidth={2.5} fill="currentColor" />
              Trusted by 2,400+ sales teams worldwide
            </div>

            {/* Headline */}
            <h1 className="text-5xl lg:text-[3.5rem] xl:text-6xl font-bold text-slate-900 tracking-tight leading-[1.08] mb-6">
              Close more deals with AI&#8209;powered CRM
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-slate-600 leading-relaxed max-w-md mb-8">
              Stop losing deals to slow follow-up and scattered data. CRM Platform brings AI lead scoring,
              visual pipeline management, and real&#8209;time analytics into one place — so your team
              always knows the right move.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row items-start gap-3 mb-6">
              <Button
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                asChild
              >
                <Link href="/register">
                  Start free trial
                  <ArrowRight size={16} />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50" asChild>
                <Link href="#how-it-works">See how it works</Link>
              </Button>
            </div>

            {/* Trust line */}
            <p className="text-xs text-slate-400">
              No credit card required · Free 14&#8209;day trial · Cancel anytime
            </p>
          </div>

          {/* Right: mock dashboard */}
          <div className="flex-1 mt-14 lg:mt-0 min-w-0">
            <div className="rounded-2xl border border-slate-200 shadow-2xl overflow-hidden bg-white ring-1 ring-slate-900/5">

              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div className="flex gap-1.5 shrink-0">
                  <span className="w-3 h-3 rounded-full bg-red-400" />
                  <span className="w-3 h-3 rounded-full bg-amber-400" />
                  <span className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
                <div className="flex-1 mx-3 bg-white border border-slate-200 rounded px-3 py-1 text-[11px] text-slate-400 truncate">
                  app.crmplatform.io/dashboard
                </div>
              </div>

              {/* App shell */}
              <div className="flex h-[380px]">

                {/* Mini sidebar */}
                <div className="w-[140px] shrink-0 bg-slate-900 flex flex-col py-4 px-3 gap-0.5">
                  <div className="flex items-center gap-2 px-2 mb-5">
                    <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center shrink-0">
                      <Zap size={11} className="text-white" strokeWidth={2.5} />
                    </div>
                    <span className="text-white text-xs font-bold tracking-tight">CRM</span>
                  </div>
                  {SIDEBAR_NAV.map(({ label, icon: Icon }, i) => (
                    <div
                      key={label}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium',
                        i === 0
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-500 hover:text-slate-300',
                      )}
                    >
                      <Icon size={13} strokeWidth={1.8} />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>

                {/* Main content */}
                <div className="flex-1 bg-slate-50 p-4 overflow-hidden min-w-0">
                  {/* KPI row */}
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {[
                      { label: 'Leads',   value: '1,204', color: 'text-blue-600' },
                      { label: 'Deals',   value: '86',    color: 'text-emerald-600' },
                      { label: 'Revenue', value: '$32k',  color: 'text-violet-600' },
                      { label: 'Conv.',   value: '12.4%', color: 'text-amber-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-white rounded-lg p-2.5 border border-slate-200 min-w-0">
                        <p className="text-[9px] text-slate-400 mb-0.5 truncate">{label}</p>
                        <p className={cn('text-sm font-bold leading-none', color)}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Charts row */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Area chart mock */}
                    <div className="bg-white rounded-xl border border-slate-200 p-3">
                      <p className="text-[10px] font-semibold text-slate-600 mb-3">Revenue trend</p>
                      <div className="flex items-end gap-0.5 h-[76px]">
                        {[40, 55, 35, 70, 60, 80, 65, 90, 75, 95, 85, 100].map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 bg-blue-500/15 rounded-t-[2px] relative overflow-hidden"
                            style={{ height: `${h}%` }}
                          >
                            <div className="absolute top-0 inset-x-0 h-[2px] bg-blue-500 rounded-full" />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pipeline funnel */}
                    <div className="bg-white rounded-xl border border-slate-200 p-3">
                      <p className="text-[10px] font-semibold text-slate-600 mb-2.5">Pipeline</p>
                      <div className="space-y-2">
                        {[
                          { stage: 'Prospect', pct: 100, bar: 'bg-blue-500' },
                          { stage: 'Qualify',  pct: 72,  bar: 'bg-indigo-500' },
                          { stage: 'Propose',  pct: 48,  bar: 'bg-violet-500' },
                          { stage: 'Close',    pct: 28,  bar: 'bg-emerald-500' },
                        ].map(({ stage, pct, bar }) => (
                          <div key={stage}>
                            <div className="flex justify-between text-[9px] text-slate-400 mb-1">
                              <span>{stage}</span>
                              <span>{pct}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={cn('h-full rounded-full', bar)}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

// ── LogoBar ───────────────────────────────────────────────────────────────────

function LogoBar() {
  return (
    <section className="py-12 bg-slate-50 border-y border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-[11px] font-semibold text-slate-400 uppercase tracking-[0.14em] mb-8">
          Trusted by fast-growing sales teams at
        </p>
        <div className="flex flex-wrap justify-center items-center gap-x-10 gap-y-4">
          {LOGOS.map((name) => (
            <span key={name} className="text-slate-400 font-semibold text-sm tracking-wide">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── HowItWorksSection ─────────────────────────────────────────────────────────

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600 mb-4">
            How it works
          </p>
          <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
            From chaos to closed — in three steps
          </h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            Most CRMs take weeks to set up and months to get value from.
            CRM Platform is different — you'll see results on day one.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connector line — desktop only */}
          <div className="hidden md:block absolute top-10 left-[calc(16.67%+20px)] right-[calc(16.67%+20px)] h-px bg-slate-200 z-0" />

          {HOW_IT_WORKS.map(({ step, icon: Icon, title, description }) => (
            <div key={step} className="relative z-10 flex flex-col items-start">
              {/* Step number + icon */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
                  <Icon size={22} className="text-blue-600" strokeWidth={1.8} />
                </div>
                <span className="text-3xl font-bold text-slate-100 select-none">{step}</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-3">{title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>

        {/* Bottom CTA nudge */}
        <div className="mt-14 text-center">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors duration-150"
          >
            Get started for free
            <ArrowRight size={15} strokeWidth={2.5} />
          </Link>
        </div>

      </div>
    </section>
  );
}

// ── FeaturesSection ───────────────────────────────────────────────────────────

function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600 mb-4">
            Everything you need
          </p>
          <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
            Built for the way modern sales teams work
          </h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            From first touch to closed-won — manage your entire revenue motion
            without switching tabs or updating spreadsheets.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className={cn(
                'group p-6 rounded-xl border border-slate-200 bg-white cursor-default',
                'hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5',
                'transition-all duration-200',
              )}
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-5',
                  'group-hover:bg-blue-600 transition-colors duration-200',
                )}
              >
                <Icon
                  size={20}
                  strokeWidth={1.8}
                  className="text-blue-600 group-hover:text-white transition-colors duration-200"
                />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

// ── AiSection ─────────────────────────────────────────────────────────────────

function AiSection() {
  return (
    <section id="ai" className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:gap-20 xl:gap-28">

          {/* Left: copy */}
          <div className="lg:w-[420px] shrink-0 mb-14 lg:mb-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full mb-6">
              <Brain size={12} strokeWidth={2.5} />
              AI&#8209;Powered
            </div>

            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-5 leading-tight">
              Your AI sales assistant,<br />always on — never tired
            </h2>

            <p className="text-lg text-slate-600 leading-relaxed mb-6">
              Stop digging through activity logs to figure out what happened on a deal.
              Just ask. Our AI Copilot reads your entire CRM history and surfaces exactly
              what you need — in plain English.
            </p>

            <p className="text-base text-slate-600 leading-relaxed mb-8">
              Whether you need a deal summary before a call, a drafted follow-up email,
              or a forecast roll-up for your board, Copilot handles it in seconds.
            </p>

            <ul className="space-y-3.5">
              {[
                'Ask questions in plain English about any deal or contact',
                'AI-generated follow-up suggestions based on engagement signals',
                'Draft personalized emails from deal history in one click',
                'Forecast roll-ups and win/loss explanations on demand',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                    <Check size={11} strokeWidth={3} className="text-white" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Right: chat mock */}
          <div className="flex-1 max-w-lg w-full">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 bg-slate-50">
                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                  <Brain size={15} className="text-white" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 leading-none mb-0.5">AI Copilot</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    Online · Powered by GPT-4o
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div className="p-4 space-y-3">
                {CHAT.map((msg, i) => (
                  <div
                    key={i}
                    className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[82%] px-4 py-2.5 text-sm leading-relaxed',
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm'
                          : 'bg-slate-100 text-slate-800 rounded-2xl rounded-bl-sm',
                      )}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}

                {/* Typing indicator */}
                <div className="flex justify-start">
                  <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>

              {/* Input */}
              <div className="px-4 pb-4">
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3.5 py-2.5 bg-slate-50">
                  <span className="flex-1 text-xs text-slate-400">Ask about your pipeline…</span>
                  <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
                    <ArrowRight size={13} className="text-white" strokeWidth={2.5} />
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

// ── StatsSection ──────────────────────────────────────────────────────────────

function StatsSection() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600 mb-4">
            Real results
          </p>
          <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
            The numbers don't lie
          </h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            Over 2,400 sales teams use CRM Platform to manage their pipeline, hit quota,
            and grow revenue year over year.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {STATS.map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-4xl lg:text-5xl font-bold text-blue-600 mb-2 tabular-nums">
                {value}
              </p>
              <p className="text-sm text-slate-600 leading-relaxed">{label}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

// ── TestimonialsSection ───────────────────────────────────────────────────────

function TestimonialsSection() {
  return (
    <section className="py-24 bg-slate-50 border-y border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600 mb-4">
            Customer stories
          </p>
          <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
            Don't take our word for it
          </h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            Here's what sales leaders say after switching to CRM Platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map(({ quote, name, title, initials, color }) => (
            <div
              key={name}
              className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col hover:border-slate-300 hover:shadow-sm transition-all duration-200"
            >
              <Quote size={24} className="text-blue-100 mb-4 shrink-0" strokeWidth={2} />
              <p className="text-sm text-slate-700 leading-relaxed flex-1 mb-6">
                "{quote}"
              </p>
              <div className="flex items-center gap-3">
                <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0', color)}>
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 leading-none mb-0.5">{name}</p>
                  <p className="text-xs text-slate-500">{title}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Star rating strip */}
        <div className="mt-12 flex flex-col items-center gap-2">
          <div className="flex items-center gap-1">
            {[0,1,2,3,4].map((i) => (
              <Star key={i} size={18} className="text-amber-400 fill-amber-400" strokeWidth={1.5} />
            ))}
          </div>
          <p className="text-sm text-slate-500">4.9 / 5 average · based on 840+ reviews</p>
        </div>

      </div>
    </section>
  );
}

// ── PricingSection ────────────────────────────────────────────────────────────

function PricingSection() {
  return (
    <section id="pricing" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600 mb-4">
            Simple pricing
          </p>
          <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
            Transparent pricing, no surprises
          </h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            Start free. Upgrade when your team is ready.
            Every plan includes unlimited deals and all core pipeline tools.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {PRICING.map(({ name, price, period, description, highlight, cta, href, features }) => (
            <div
              key={name}
              className={cn(
                'rounded-xl border p-8 flex flex-col',
                highlight
                  ? 'border-blue-600 bg-blue-600 shadow-xl shadow-blue-600/20 relative'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all duration-200',
              )}
            >
              {highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-amber-400 text-amber-900 text-[11px] font-bold uppercase tracking-wide px-3 py-1 rounded-full">
                    Most popular
                  </span>
                </div>
              )}

              {/* Plan header */}
              <div className="mb-6">
                <p className={cn('text-sm font-semibold mb-1', highlight ? 'text-blue-200' : 'text-slate-500')}>
                  {name}
                </p>
                <div className="flex items-end gap-1.5 mb-2">
                  <span className={cn('text-4xl font-bold', highlight ? 'text-white' : 'text-slate-900')}>
                    {price}
                  </span>
                  {price !== 'Custom' && (
                    <span className={cn('text-sm mb-1.5', highlight ? 'text-blue-200' : 'text-slate-500')}>
                      / {period}
                    </span>
                  )}
                </div>
                {price === 'Custom' && (
                  <p className={cn('text-sm', highlight ? 'text-blue-200' : 'text-slate-500')}>{period}</p>
                )}
                <p className={cn('text-sm leading-relaxed', highlight ? 'text-blue-100' : 'text-slate-600')}>
                  {description}
                </p>
              </div>

              {/* CTA */}
              <Link
                href={href}
                className={cn(
                  'w-full text-center py-2.5 px-4 rounded-lg text-sm font-semibold mb-8 transition-colors duration-150',
                  highlight
                    ? 'bg-white text-blue-600 hover:bg-blue-50'
                    : 'bg-blue-600 text-white hover:bg-blue-700',
                )}
              >
                {cta}
              </Link>

              {/* Features */}
              <ul className="space-y-3">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span className={cn(
                      'mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0',
                      highlight ? 'bg-white/20' : 'bg-blue-50',
                    )}>
                      <Check size={9} strokeWidth={3} className={highlight ? 'text-white' : 'text-blue-600'} />
                    </span>
                    <span className={cn('text-sm', highlight ? 'text-blue-100' : 'text-slate-600')}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Enterprise nudge */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-2 text-sm text-slate-500">
          <Building2 size={16} className="text-slate-400" />
          <span>Need a custom contract, volume pricing, or procurement support?</span>
          <Link href="/login" className="text-blue-600 font-semibold hover:text-blue-700 transition-colors duration-150">
            Talk to our sales team →
          </Link>
        </div>

      </div>
    </section>
  );
}

// ── CtaSection ────────────────────────────────────────────────────────────────

function CtaSection() {
  return (
    <section className="py-28 bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">

        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 bg-blue-950 border border-blue-900 px-3 py-1.5 rounded-full mb-8">
          <Rocket size={12} strokeWidth={2.5} />
          Join 2,400+ teams already hitting quota
        </div>

        <h2 className="text-4xl lg:text-5xl font-bold text-white mb-5 leading-tight max-w-3xl mx-auto">
          Your pipeline isn't going to manage itself
        </h2>

        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Every day without a real CRM is a day your best leads are going cold,
          your reps are spending hours on admin, and your forecast is a guess.
          Start your free trial today — no credit card, no commitments.
        </p>

        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-10">
          <Button
            size="lg"
            className="bg-blue-600 hover:bg-blue-500 text-white gap-2 transition-colors"
            asChild
          >
            <Link href="/register">
              Start free 14-day trial
              <ArrowRight size={16} />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-600 hover:text-white transition-colors"
            asChild
          >
            <Link href="#how-it-works">See how it works</Link>
          </Button>
        </div>

        <p className="text-xs text-slate-600">
          Free 14-day trial · No credit card · Cancel anytime · Setup in under 30 minutes
        </p>

      </div>
    </section>
  );
}

// ── LandingFooter ─────────────────────────────────────────────────────────────

function LandingFooter() {
  return (
    <footer className="bg-slate-900 border-t border-slate-800">
      {/* Main footer grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8">

          {/* Brand col */}
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
                <Zap size={14} className="text-white" strokeWidth={2.5} />
              </div>
              <span className="text-white font-semibold text-sm">CRM Platform</span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed max-w-[220px] mb-6">
              The AI-powered CRM that helps modern sales teams close more deals, faster.
            </p>
            {/* Social icons */}
            <div className="flex items-center gap-3">
              {[
                { icon: Twitter,  label: 'Twitter' },
                { icon: Linkedin, label: 'LinkedIn' },
              ].map(({ icon: Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-600 transition-colors duration-150"
                >
                  <Icon size={14} strokeWidth={1.8} />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {(Object.entries(FOOTER_LINKS) as [string, readonly string[]][]).map(([heading, links]) => (
            <div key={heading}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-4">
                {heading}
              </p>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-slate-500 hover:text-slate-300 transition-colors duration-150"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-600">
            © {new Date().getFullYear()} CRM Platform, Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <a href="#" className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors duration-150">
              <BookOpen size={12} />
              Documentation
            </a>
            <a href="#" className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors duration-150">
              <Headphones size={12} />
              Support
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="relative bg-white text-slate-900 overflow-x-hidden">
      <LandingNav />
      <main>
        <HeroSection />
        <LogoBar />
        <HowItWorksSection />
        <FeaturesSection />
        <AiSection />
        <StatsSection />
        <TestimonialsSection />
        <PricingSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
