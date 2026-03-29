import { useState, useRef, useCallback, useEffect } from 'react';

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unitSuffix?: string;
  showValueBubble?: boolean;
  showMinMaxLabels?: boolean;
  onChange: (value: number) => void;
  accentColor?: string;
  /** Override track background for dark themes */
  trackBg?: string;
  /** Override label color for dark themes */
  labelColor?: string;
  /** Override min/max label color for dark themes */
  minMaxColor?: string;
}

export default function SliderField({
  label,
  value,
  min,
  max,
  step,
  unitSuffix = '',
  showValueBubble = true,
  showMinMaxLabels = true,
  onChange,
  accentColor = '#0284C7',
  trackBg,
  labelColor,
  minMaxColor,
}: SliderFieldProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDragging) setLocalValue(value);
  }, [value, isDragging]);

  const emitChange = useCallback((v: number) => {
    setLocalValue(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), 50);
  }, [onChange]);

  const pct = Math.max(0, Math.min(100, ((localValue - min) / (max - min)) * 100));

  const displayValue = step < 1
    ? `${localValue.toFixed(step.toString().split('.')[1]?.length || 1)}${unitSuffix ? ` ${unitSuffix}` : ''}`
    : `${localValue}${unitSuffix ? ` ${unitSuffix}` : ''}`;

  const r = parseInt(accentColor.slice(1, 3), 16) || 2;
  const g = parseInt(accentColor.slice(3, 5), 16) || 132;
  const b = parseInt(accentColor.slice(5, 7), 16) || 199;

  return (
    <div data-testid={`slider-field-${label.toLowerCase().replace(/\s+/g, '-')}`} style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: labelColor || '#64748B' }}>{label}</span>
        <span data-testid={`slider-value-${label.toLowerCase().replace(/\s+/g, '-')}`} style={{
          fontSize: '15px', fontWeight: 700, color: accentColor,
          background: `rgba(${r},${g},${b},0.08)`,
          padding: '3px 10px', borderRadius: '8px',
        }}>
          {displayValue}
        </span>
      </div>
      <div style={{ position: 'relative', padding: '8px 0' }}>
        {showValueBubble && isDragging && (
          <div style={{
            position: 'absolute',
            left: `calc(${pct}% - 24px)`,
            top: '-32px',
            background: accentColor,
            color: '#fff',
            fontSize: '12px',
            fontWeight: 700,
            padding: '4px 8px',
            borderRadius: '6px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            transition: 'left 0.05s ease-out',
            boxShadow: `0 2px 8px rgba(${r},${g},${b},0.3)`,
          }}>
            {displayValue}
            <div style={{
              position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)',
              width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
              borderTop: `5px solid ${accentColor}`,
            }} />
          </div>
        )}
        <div ref={trackRef} style={{
          position: 'relative', height: '6px', borderRadius: '3px',
          background: trackBg || '#E2E8F0',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, height: '100%',
            width: `${pct}%`, borderRadius: '3px',
            background: `linear-gradient(90deg, ${accentColor}, ${accentColor}dd)`,
            transition: isDragging ? 'none' : 'width 0.15s ease',
          }} />
        </div>
        <input
          data-testid={`slider-input-${label.toLowerCase().replace(/\s+/g, '-')}`}
          type="range"
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={localValue}
          aria-valuetext={displayValue}
          min={min}
          max={max}
          step={step}
          value={localValue}
          onChange={(e) => emitChange(Number(e.target.value))}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            margin: 0,
            WebkitAppearance: 'none',
            touchAction: 'none',
          }}
        />
        <div style={{
          position: 'absolute',
          left: `calc(${pct}% - 10px)`,
          top: '50%',
          transform: 'translateY(-50%)',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: '#fff',
          border: `3px solid ${accentColor}`,
          boxShadow: isDragging
            ? `0 0 0 6px rgba(${r},${g},${b},0.15), 0 2px 6px rgba(0,0,0,0.1)`
            : `0 1px 4px rgba(0,0,0,0.12)`,
          transition: isDragging ? 'box-shadow 0.15s ease' : 'left 0.15s ease, box-shadow 0.15s ease',
          pointerEvents: 'none',
        }} />
      </div>
      {showMinMaxLabels && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <span style={{ fontSize: '11px', color: minMaxColor || '#94A3B8' }}>
            {min}{unitSuffix ? ` ${unitSuffix}` : ''}
          </span>
          <span style={{ fontSize: '11px', color: minMaxColor || '#94A3B8' }}>
            {max}{unitSuffix ? ` ${unitSuffix}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
