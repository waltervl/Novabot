/**
 * CameraTile — floating live MJPEG camera card for the map.
 *
 * Renders an `<img>` pointed at the dashboard's camera proxy
 * (`/api/dashboard/camera/:sn/stream?topic=…`). The browser renders
 * multipart/x-mixed-replace (MJPEG) natively, so no player is needed.
 *
 * The stream holds an open HTTP connection for as long as the `<img>` is
 * mounted, so the `<img>` is only mounted while the tile is EXPANDED —
 * collapsing it unmounts the image and closes the connection.
 *
 * Mirrors the OpenNova app's CameraScreen topic list. Custom-firmware only
 * (the proxy 404s on stock firmware); the parent gates rendering on that.
 */
import { useState } from 'react';
import { Camera, ChevronDown, ChevronUp, X, RefreshCw, CameraOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface TopicOption {
  key: string;
  /** i18n key under `camera.*`, falls back to the raw label. */
  label: string;
}

// Mirrors CAMERA_TOPICS in app/src/screens/CameraScreen.tsx.
const DEFAULT_TOPICS: TopicOption[] = [
  { key: 'front', label: 'front' },
  { key: 'tof_gray', label: 'tofGray' },
  { key: 'tof_depth', label: 'tofDepth' },
  { key: 'aruco', label: 'aruco' },
];

interface Props {
  sn: string;
  topics?: TopicOption[];
  /** Close the whole tile (parent toggles `showCamera`). */
  onClose?: () => void;
}

export function CameraTile({ sn, topics = DEFAULT_TOPICS, onClose }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const [topic, setTopic] = useState(topics[0]?.key ?? 'front');
  const [streamKey, setStreamKey] = useState(0);
  const [error, setError] = useState(false);

  const streamUrl =
    `/api/dashboard/camera/${encodeURIComponent(sn)}/stream` +
    `?topic=${encodeURIComponent(topic)}&t=${streamKey}`;

  const retry = () => {
    setError(false);
    setStreamKey((k) => k + 1);
  };

  const selectTopic = (key: string) => {
    if (key === topic) return;
    setTopic(key);
    setError(false);
    setStreamKey((k) => k + 1);
  };

  return (
    <div className="bg-gray-900/95 backdrop-blur border border-gray-700 rounded-2xl shadow-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <Camera className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-xs font-semibold text-gray-200">
          {t('camera.camera', 'Camera')}
        </span>
        {expanded && topics.length > 1 && (
          <select
            value={topic}
            onChange={(e) => selectTopic(e.target.value)}
            className="ml-1 bg-gray-800 border border-gray-600 rounded text-[11px] text-gray-200 px-1.5 py-0.5 focus:outline-none focus:border-emerald-500"
            title={t('camera.camera', 'Camera')}
          >
            {topics.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {t(`camera.${opt.label}`, opt.label)}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700/60 transition-colors"
            title={expanded ? t('common.collapse', 'Collapse') : t('common.expand', 'Expand')}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-gray-700/60 transition-colors"
              title={t('common.close', 'Close')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Mount the <img> (open the MJPEG connection) only while expanded. */}
      {expanded && (
        <div className="relative bg-black aspect-video">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-3">
              <CameraOff className="w-7 h-7 text-gray-500" />
              <span className="text-xs text-gray-400">
                {t('camera.unavailable', 'Camera unavailable')}
              </span>
              <button
                onClick={retry}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-gray-700/60 text-gray-200 hover:bg-gray-600/60 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                {t('camera.retry', 'Retry')}
              </button>
            </div>
          ) : (
            <img
              key={streamKey}
              src={streamUrl}
              alt="Camera"
              className="w-full h-full object-contain"
              onError={() => setError(true)}
            />
          )}
        </div>
      )}
    </div>
  );
}
