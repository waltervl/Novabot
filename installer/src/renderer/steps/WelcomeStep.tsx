import type { ReactNode } from 'react';

interface HardwareItem {
  title: string;
  detail: string;
  link: string;
  tone: 'g' | 'c';
  icon: ReactNode;
}

const PiIcon = (
  <svg viewBox="0 0 24 24" className="w-[21px] h-[21px]" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <rect x="8" y="8" width="8" height="8" rx="2" />
  </svg>
);
const PowerIcon = (
  <svg viewBox="0 0 24 24" className="w-[21px] h-[21px]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </svg>
);
const CardIcon = (
  <svg viewBox="0 0 24 24" className="w-[21px] h-[21px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
    <path d="M6 2h9l3 3v17H6z" />
    <path d="M10 2v5M14 2v5" />
  </svg>
);

const HARDWARE: HardwareItem[] = [
  {
    title: 'Raspberry Pi 4 or 5',
    detail: 'The little computer that runs your OpenNova.',
    link: 'https://www.raspberrypi.com/products/',
    tone: 'g',
    icon: PiIcon,
  },
  {
    title: 'Official power supply',
    detail: 'The official adapter gives a clean first boot.',
    link: 'https://www.raspberrypi.com/products/',
    tone: 'c',
    icon: PowerIcon,
  },
  {
    title: '64 GB microSD card',
    detail: 'High-endurance cards last longest.',
    link: 'https://www.raspberrypi.com/products/',
    tone: 'g',
    icon: CardIcon,
  },
];

export function WelcomeStep() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="display text-3xl text-ink">Let&apos;s get you set up! 🌱</h2>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-dim font-medium">
          We&apos;ll prepare a card so your mower runs all on its own, right here on your home
          network. No manufacturer cloud. Just grab these three things first:
        </p>
      </div>

      <div className="space-y-2.5">
        {HARDWARE.map((item) => (
          <div key={item.title} className="tile flex items-center gap-3.5 p-3.5">
            <span className={`icon-tile ${item.tone}`}>{item.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-ink leading-snug">{item.title}</p>
              <p className="text-sm text-ink-dim font-medium">{item.detail}</p>
            </div>
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-sm font-bold text-ink-faint hover:text-green transition-colors"
            >
              Buy ↗
            </a>
          </div>
        ))}
      </div>

      <p className="text-sm text-ink-faint font-semibold">
        Got everything? Tap <span className="text-green">Let&apos;s go!</span> below.
      </p>
    </div>
  );
}
