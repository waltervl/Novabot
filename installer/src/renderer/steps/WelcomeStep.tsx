interface HardwareItem {
  title: string;
  detail: string;
  link: string;
}

const HARDWARE: HardwareItem[] = [
  {
    title: 'Raspberry Pi 4 or 5',
    detail: 'The small computer that runs your OpenNova server.',
    link: 'https://www.raspberrypi.com/products/',
  },
  {
    title: 'Official Raspberry Pi power supply',
    detail: 'Use the official adapter so the Pi gets stable power.',
    link: 'https://www.raspberrypi.com/products/',
  },
  {
    title: '64 GB or larger high-endurance microSD card',
    detail: 'High-endurance cards last longer under constant writes.',
    link: 'https://www.raspberrypi.com/products/',
  },
];

export function WelcomeStep() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Before you start</h2>
        <p className="text-sm text-slate-600">
          This tool prepares a microSD card with OpenNova. Make sure you have the
          following hardware ready.
        </p>
      </div>

      <ul className="space-y-3">
        {HARDWARE.map((item) => (
          <li
            key={item.title}
            className="flex items-start gap-3 p-3 rounded-lg border border-slate-200"
          >
            <span
              aria-hidden="true"
              className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs"
            >
              {'✓'}
            </span>
            <div className="flex-1">
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-slate-500">{item.detail}</p>
              <a
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-emerald-700 hover:underline"
              >
                Where to buy
              </a>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-sm text-slate-500">
        When you have everything, press Get started below.
      </p>
    </div>
  );
}
