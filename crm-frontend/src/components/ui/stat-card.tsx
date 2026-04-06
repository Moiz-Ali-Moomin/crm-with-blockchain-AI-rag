'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
export interface StatCardProps {
  title: string;
  value: string | number;
  /** Display value for the animated number (numeric string like "12,450" or "$4.2k") */
  displayValue?: string;
  sub?: string;
  icon: React.ReactNode;
  /** Framer stagger index — delay = index * 0.08s */
  index?: number;
  trend?: {
    direction: 'up' | 'down' | 'flat';
    value: string;
    label?: string;
  };
  /** One of 4 gradient presets — cycles automatically via index if omitted */
  gradient?: 1 | 2 | 3 | 4;
  iconColor?: string;
  className?: string;
}

const gradientClasses = [
  'from-violet-500/20 via-violet-600/10 to-transparent border-violet-400/20',
  'from-emerald-500/20 via-emerald-600/10 to-transparent border-emerald-400/20',
  'from-amber-500/20 via-amber-600/10 to-transparent border-amber-400/20',
  'from-rose-500/20 via-rose-600/10 to-transparent border-rose-400/20',
] as const;

const iconBgClasses = [
  'bg-violet-500/20 text-violet-300',
  'bg-emerald-500/20 text-emerald-300',
  'bg-amber-500/20 text-amber-300',
  'bg-rose-500/20 text-rose-300',
] as const;

const trendConfig = {
  up:   { icon: TrendingUp,   className: 'text-emerald-400' },
  down: { icon: TrendingDown, className: 'text-rose-400' },
  flat: { icon: Minus,        className: 'text-slate-400' },
};

const cardVariants = {
  hidden:  { opacity: 0, y: 20, scale: 0.97 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: index * 0.08,
      duration: 0.45,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
};

const valueVariants = {
  hidden:  { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { delay: 0.25, duration: 0.35, ease: 'easeOut' },
  },
};

/**
 * StatCard — animated KPI card with glassmorphism surface.
 *
 * - Staggered entrance animation driven by `index` prop
 * - Value animates in once the card enters the viewport
 * - Trend indicator with directional icon + colour coding
 * - Hover lift effect with intensified border glow
 */
export function StatCard({
  title,
  value,
  displayValue,
  sub,
  icon,
  index = 0,
  trend,
  gradient,
  className,
}: StatCardProps) {
  const ref                 = useRef<HTMLDivElement>(null);
  const isInView            = useInView(ref, { once: true, margin: '-40px' });
  const gradientIdx         = ((gradient ?? 1) - 1) % 4;
  const gradientClass       = gradientClasses[gradientIdx];
  const iconBgClass         = iconBgClasses[gradientIdx];
  const TrendIcon           = trend ? trendConfig[trend.direction].icon : null;
  const trendClassName      = trend ? trendConfig[trend.direction].className : '';

  return (
    <motion.div
      ref={ref}
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      whileHover={{
        y: -3,
        transition: { duration: 0.2, ease: 'easeOut' },
      }}
      className={cn(
        'relative overflow-hidden rounded-2xl',
        'bg-gradient-to-br backdrop-blur-xl',
        'border',
        'shadow-glass',
        'cursor-default',
        gradientClass,
        className,
      )}
    >
      {/* Ambient top-edge highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      {/* Inner noise texture overlay — renders depth */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
        }}
      />

      <div className="relative p-5">
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/50 leading-none pt-1">
            {title}
          </p>
          <div className={cn('p-2.5 rounded-xl', iconBgClass)}>
            {icon}
          </div>
        </div>

        {/* Value */}
        <motion.div
          variants={valueVariants}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
        >
          <p className="text-3xl font-bold text-white tracking-tight leading-none">
            {displayValue ?? value}
          </p>
        </motion.div>

        {/* Sub-text / trend */}
        <div className="mt-3 flex items-center gap-2 min-h-[18px]">
          {trend && TrendIcon ? (
            <>
              <TrendIcon size={13} className={trendClassName} strokeWidth={2.5} />
              <span className={cn('text-xs font-semibold', trendClassName)}>
                {trend.value}
              </span>
              {trend.label && (
                <span className="text-xs text-white/35">{trend.label}</span>
              )}
            </>
          ) : sub ? (
            <span className="text-xs text-white/45">{sub}</span>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
